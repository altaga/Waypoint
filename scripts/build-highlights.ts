// Rebuilds each country's highlights from Wikidata, with a type for every place: museum, statue or
// monument, historic site, or tourist attraction. The type is the place's Wikidata class (instance of,
// or World Heritage designation), so the list does not depend on a model's memory. Each country keeps
// up to TOTAL_PER_COUNTRY places, ranked by Wikipedia sitelinks, with quotas per type so museums,
// statues and historic sites are not crowded out by attractions. The city is the nearest city in
// cities.json when the place has coordinates. Existing place ids are kept (curated packs refer to
// them): their type and city are corrected, and new places are added.
//   npx tsx scripts/build-highlights.ts               all countries
//   ONLY=JP,FR npx tsx scripts/build-highlights.ts    some countries
// The status stays "wikidata_ranked": these lists are ranked by popularity and classified by type, not curated.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "data/world");
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "Waypoint/0.1 (https://github.com/altaga/Waypoint; travel concierge data build)";
const DATE = new Date().toISOString().slice(0, 10);
const TOTAL = Number(process.env.TOTAL_PER_COUNTRY ?? 22);
const MIN_SITELINKS = 5;
const NEAR_KM = 30;
const AUDIT = process.env.AUDIT ?? join(ROOT, "scratchpad-highlights-audit.json");

type Kind = "museum" | "statue" | "historic" | "sight";
const RANK: Record<Kind, number> = { museum: 4, statue: 3, historic: 2, sight: 1 };
// Wikidata classes, checked against their labels: museum Q33506, art gallery Q1007870, natural history
// museum Q1970365; statue Q179700, sculpture Q860861, monument Q4989906, memorial Q5003624; historic
// site Q1081138, archaeological site Q839954, castle Q23413; tourist attraction Q570116, garden Q1107656,
// park Q15284. Heritage designation: World Heritage Site Q9259 (property P1435), counted as historic.
const KIND_TYPES: Record<Kind, string[]> = {
  museum: ["Q33506", "Q1007870", "Q1970365"],
  statue: ["Q179700", "Q860861", "Q4989906", "Q5003624"],
  historic: ["Q1081138", "Q839954", "Q23413"],
  sight: ["Q570116", "Q1107656", "Q15284"],
};
const QUOTA: Record<Kind, number> = { museum: 6, statue: 4, historic: 6, sight: TOTAL };
const INTERESTS: Record<Kind, string[]> = { museum: ["museums"], statue: ["sights"], historic: ["history"], sight: ["sights"] };
const DURATION: Record<Kind, number> = { museum: 120, statue: 20, historic: 90, sight: 90 };
const LABEL: Record<Kind, { en: string; es: string }> = {
  museum: { en: "museum", es: "museo" },
  statue: { en: "statue or monument", es: "estatua o monumento" },
  historic: { en: "historic site", es: "sitio histórico" },
  sight: { en: "tourist attraction", es: "atractivo turístico" },
};

type Row = Record<string, { value: string } | undefined>;

// The public endpoint answers 504 under load; retry with growing pauses.
async function sparql(query: string): Promise<Row[]> {
  const ATTEMPTS = 6;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ query }).toString(),
    });
    if (res.ok) return ((await res.json()) as { results: { bindings: Row[] } }).results.bindings;
    if (attempt === ATTEMPTS) throw new Error(`Wikidata ${res.status}`);
    console.warn(`  Wikidata ${res.status}, retry ${attempt}`);
    await new Promise((r) => setTimeout(r, 8000 * attempt));
  }
  throw new Error("unreachable");
}

const qid = (uri: string) => uri.split("/").pop() as string;
const val = (r: Row, k: string) => r[k]?.value ?? "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Candidate = { kind: Kind; sl: number };

// One query per Wikidata class (no ORDER BY, so large countries do not time out); the ranking is done here.
// The country is matched by its Wikidata item (wd:Q17 for Japan), not by its ISO code: the code forces
// the endpoint to scan every country, and the query takes about twelve times longer.
async function candidates(countryQid: string): Promise<Map<string, Candidate>> {
  const best = new Map<string, Candidate>();
  const add = (id: string, kind: Kind, sl: number) => {
    const cur = best.get(id);
    if (!cur) return void best.set(id, { kind, sl });
    best.set(id, { kind: RANK[kind] > RANK[cur.kind] ? kind : cur.kind, sl: Math.max(sl, cur.sl) });
  };
  for (const kind of Object.keys(KIND_TYPES) as Kind[]) {
    for (const type of KIND_TYPES[kind]) {
      const rows = await sparql(`SELECT ?p ?sl WHERE {
        ?p wdt:P31 wd:${type}; wdt:P17 wd:${countryQid}.
        ?p wikibase:sitelinks ?sl. FILTER(?sl >= ${MIN_SITELINKS})
      } LIMIT 400`);
      for (const r of rows) add(qid(val(r, "p")), kind, Number(val(r, "sl")));
    }
  }
  const heritage = await sparql(`SELECT ?p ?sl WHERE {
    ?p wdt:P1435 wd:Q9259; wdt:P17 wd:${countryQid}.
    ?p wikibase:sitelinks ?sl. FILTER(?sl >= ${MIN_SITELINKS})
  } LIMIT 400`);
  for (const r of heritage) add(qid(val(r, "p")), "historic", Number(val(r, "sl")));
  return best;
}

type Info = { en: string; es: string; coord: { lat: number; lon: number } | null; cityEn: string | null };

async function info(ids: string[]): Promise<Map<string, Info>> {
  const out = new Map<string, Info>();
  if (!ids.length) return out;
  const values = ids.map((i) => `wd:${i}`).join(" ");
  const rows = await sparql(`SELECT ?p ?en ?es ?coord ?cityEn WHERE { VALUES ?p { ${values} }
    OPTIONAL { ?p rdfs:label ?en FILTER(lang(?en)="en") }
    OPTIONAL { ?p rdfs:label ?es FILTER(lang(?es)="es") }
    OPTIONAL { ?p wdt:P625 ?coord }
    OPTIONAL { ?p wdt:P131 ?city. ?city rdfs:label ?cityEn FILTER(lang(?cityEn)="en") } }`);
  for (const r of rows) {
    const id = qid(val(r, "p"));
    const cur = out.get(id) ?? { en: "", es: "", coord: null, cityEn: null };
    cur.en ||= val(r, "en");
    cur.es ||= val(r, "es");
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(val(r, "coord"));
    if (m && !cur.coord) cur.coord = { lon: Number(m[1]), lat: Number(m[2]) };
    cur.cityEn ||= val(r, "cityEn") || null;
    out.set(id, cur);
  }
  return out;
}

type City = { iso: string; name: { en: string; es: string }; population: number; lat: number; lon: number };

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// The nearest catalog city within NEAR_KM, else the Wikidata district/city label, else the place's own name.
function cityOf(coord: Info["coord"], cities: City[], fallback: string) {
  if (coord && cities.length) {
    let best: City | null = null;
    let bestKm = Infinity;
    for (const c of cities) {
      const d = km(coord, { lat: c.lat, lon: c.lon });
      if (d < bestKm) ((best = c), (bestKm = d));
    }
    if (best && bestKm <= NEAR_KM) return best.name.en;
  }
  return fallback;
}

type Place = {
  id: string; name: string; area: string; city: string; category: string; interests: string[];
  durationMinutes: number; desc: { en: string; es: string }; sourceId: string;
};

async function buildCountry(iso: string, countryQid: string, countryName: { en: string; es: string }, cities: City[]) {
  const file = join(OUT, "highlights", `${iso}.json`);
  const existing: Place[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).places : [];
  const byId = new Map(existing.map((p) => [p.id, p]));

  const pool = [...(await candidates(countryQid)).entries()]
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => b.sl - a.sl)
    .slice(0, 150);
  const details = await info(pool.map((p) => p.id));

  const picked: { id: string; kind: Kind; sl: number; info: Info; city: string }[] = [];
  const count: Record<Kind, number> = { museum: 0, statue: 0, historic: 0, sight: 0 };
  const names = new Set<string>();
  for (const c of pool) {
    if (picked.length >= TOTAL) break;
    if (count[c.kind] >= QUOTA[c.kind]) continue;
    const d = details.get(c.id);
    if (!d?.en) continue;
    const city = cityOf(d.coord, cities.filter((x) => x.iso === iso), d.cityEn ?? d.en);
    const key = `${d.en.toLowerCase()}|${city.toLowerCase()}`;
    if (names.has(key)) continue;
    names.add(key);
    count[c.kind]++;
    picked.push({ id: c.id, kind: c.kind, sl: c.sl, info: d, city });
  }

  for (const p of picked) {
    const id = `${iso.toLowerCase()}-${p.id.toLowerCase()}`;
    const kindCategory = p.kind === "museum" ? "museum" : "sight";
    const old = byId.get(id);
    if (old) {
      // Keep the name and the description already there; correct the type and the city.
      old.category = kindCategory;
      old.interests = INTERESTS[p.kind];
      old.durationMinutes = DURATION[p.kind];
      old.city = p.city;
      old.area = p.city;
    } else {
      const label = LABEL[p.kind];
      byId.set(id, {
        id,
        name: p.info.en,
        area: p.city,
        city: p.city,
        category: kindCategory,
        interests: INTERESTS[p.kind],
        durationMinutes: DURATION[p.kind],
        desc: {
          en: `Classified in Wikidata as a ${label.en}; ranked by Wikipedia popularity (${p.sl} language editions). Details not curated.`,
          es: `Clasificado en Wikidata como ${label.es}; ordenado por popularidad en Wikipedia (${p.sl} ediciones de idioma). Detalles sin curación.`,
        },
        sourceId: "wikidata",
      });
    }
  }

  const merged = [...byId.values()];
  const source = { wikidata: { title: "Wikidata (CC0 1.0)", url: "https://www.wikidata.org/", license: "CC0 1.0", retrieved: DATE } };
  // HIGHLIGHTS_OUT writes the result somewhere else (a work folder) so it can be checked before it replaces the repo's files.
  const outDir = process.env.HIGHLIGHTS_OUT ?? join(OUT, "highlights");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${iso}.json`), JSON.stringify({
    schemaVersion: "1.0.0",
    country: iso,
    names: countryName,
    review: {
      status: "wikidata_ranked",
      reviewedBy: null,
      reviewedAt: null,
      note: "Ranked by Wikipedia popularity, not curated. Each place's type is its Wikidata class (museum, statue or monument, historic site, tourist attraction); its city is the nearest city in the catalog. Names may repeat or be non-touristic. Check every place and its hours on the official source.",
    },
    sources: source,
    places: merged,
  }, null, 1) + "\n");

  const top3 = cities.filter((x) => x.iso === iso).sort((a, b) => b.population - a.population).slice(0, 3);
  return {
    iso,
    places: merged.length,
    picked: { museum: count.museum, statue: count.statue, historic: count.historic, sight: count.sight },
    topCities: top3.map((c) => ({ city: c.name.en, covered: picked.some((p) => p.city === c.name.en && p.kind !== "sight") })),
  };
}

async function main() {
  const countries = (JSON.parse(readFileSync(join(OUT, "countries.json"), "utf8")) as { countries: { iso: string; wikidata: string; name: { en: string; es: string } }[] }).countries;
  const cities = (JSON.parse(readFileSync(join(OUT, "cities.json"), "utf8")) as { cities: City[] }).cities;
  const only = process.env.ONLY?.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  const todo = only ? countries.filter((c) => only.includes(c.iso)) : countries;
  console.log(`countries: ${todo.length}, total per country: ${TOTAL}`);

  const audit: unknown[] = [];
  const failed: string[] = [];
  let done = 0;
  for (const c of todo) {
    try {
      const row = await buildCountry(c.iso, c.wikidata, c.name, cities);
      audit.push(row);
      done++;
      console.log(`  ${c.iso} ${row.places} places (museum ${row.picked.museum}, statue ${row.picked.statue}, historic ${row.picked.historic})`);
    } catch (err) {
      failed.push(c.iso);
      console.warn(`  ${c.iso} skipped: ${(err as Error).message}`);
    }
    await sleep(1200); // be polite to the public endpoint
    if (done && done % 25 === 0) writeFileSync(AUDIT, JSON.stringify({ generatedAt: DATE, countries: audit, failed }, null, 1));
  }
  writeFileSync(AUDIT, JSON.stringify({ generatedAt: DATE, countries: audit, failed }, null, 1));
  console.log(`done: ${done} countries, failed: ${failed.join(", ") || "none"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
