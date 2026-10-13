// Builds the worldwide catalogs from Wikidata (CC0): countries with ISO 3166-1 alpha-2
// codes, cities with at least 300,000 people or a capital, and each country's most
// referenced tourist attractions. Run once with network access and commit the output;
// the server never calls Wikidata at runtime.
//   npm run build-world
// Ranking is by Wikipedia sitelinks (how many language editions describe the item). It is
// a popularity signal, not a quality review, and the output says so.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "data/world");
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "Waypoint/0.1 (https://github.com/altaga/Waypoint; travel concierge data build)";
const DATE = new Date().toISOString().slice(0, 10);
const TOP_PER_COUNTRY = Number(process.env.TOP_PER_COUNTRY ?? 12);

type Row = Record<string, { value: string } | undefined>;

// The public endpoint answers 504 under load; retry with growing pauses.
async function sparql(query: string): Promise<Row[]> {
  const ATTEMPTS = 8;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ query }).toString(),
    });
    if (res.ok) return (await res.json()).results.bindings as Row[];
    if (attempt === ATTEMPTS) throw new Error(`Wikidata ${res.status}`);
    console.warn(`  Wikidata ${res.status}, retry ${attempt}`);
    await new Promise((r) => setTimeout(r, 10000 * attempt));
  }
  throw new Error("unreachable");
}

const qid = (uri: string) => uri.split("/").pop() as string;
const val = (r: Row, k: string) => r[k]?.value ?? "";
const LABELS = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es" }';

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function countries() {
  const rows = await sparql(`SELECT ?c ?iso ?en ?es ?cap ?capEn ?capEs WHERE {
    ?c wdt:P31 wd:Q3624078; wdt:P297 ?iso.
    OPTIONAL { ?c rdfs:label ?en FILTER(lang(?en)="en") }
    OPTIONAL { ?c rdfs:label ?es FILTER(lang(?es)="es") }
    OPTIONAL { ?c wdt:P36 ?cap. OPTIONAL { ?cap rdfs:label ?capEn FILTER(lang(?capEn)="en") } OPTIONAL { ?cap rdfs:label ?capEs FILTER(lang(?capEs)="es") } }
  }`);
  const byIso = new Map<string, { iso: string; name: { en: string; es: string }; capital: { en: string; es: string } | null; wikidata: string }>();
  for (const r of rows) {
    const iso = val(r, "iso");
    if (!/^[A-Z]{2}$/.test(iso)) continue;
    const cur = byIso.get(iso) ?? { iso, name: { en: "", es: "" }, capital: null, wikidata: qid(val(r, "c")) };
    cur.name.en ||= val(r, "en");
    cur.name.es ||= val(r, "es") || val(r, "en");
    if (val(r, "cap") && !cur.capital) cur.capital = { en: val(r, "capEn") || val(r, "capEs"), es: val(r, "capEs") || val(r, "capEn") };
    byIso.set(iso, cur);
  }
  return [...byIso.values()].filter((c) => c.name.en).sort((a, b) => a.iso.localeCompare(b.iso));
}

async function cities() {
  // Two small queries: a single UNION over every city timed out on the public endpoint.
  const bySize = await sparql(`SELECT ?city ?iso ?pop ?lat ?lon ?en ?es WHERE {
    ?city wdt:P31/wdt:P279* wd:Q515; wdt:P1082 ?pop.
    FILTER(?pop >= 300000)
    ?city wdt:P17 ?country. ?country wdt:P297 ?iso. ?city wdt:P625 ?coord.
    BIND(geof:longitude(?coord) AS ?lon) BIND(geof:latitude(?coord) AS ?lat)
    OPTIONAL { ?city rdfs:label ?en FILTER(lang(?en)="en") }
    OPTIONAL { ?city rdfs:label ?es FILTER(lang(?es)="es") }
  }`);
  const capitals = await sparql(`SELECT ?city ?iso ?pop ?lat ?lon ?en ?es WHERE {
    ?country wdt:P31 wd:Q3624078; wdt:P297 ?iso; wdt:P36 ?city.
    ?city wdt:P625 ?coord.
    BIND(geof:longitude(?coord) AS ?lon) BIND(geof:latitude(?coord) AS ?lat)
    OPTIONAL { ?city wdt:P1082 ?pop }
    OPTIONAL { ?city rdfs:label ?en FILTER(lang(?en)="en") }
    OPTIONAL { ?city rdfs:label ?es FILTER(lang(?es)="es") }
  }`);
  const seen = new Map<string, { id: string; iso: string; name: { en: string; es: string }; population: number; lat: number; lon: number }>();
  for (const r of [...bySize, ...capitals]) {
    const id = qid(val(r, "city"));
    const iso = val(r, "iso");
    if (!/^[A-Z]{2}$/.test(iso) || seen.has(id)) continue;
    const en = val(r, "en");
    if (!en) continue;
    seen.set(id, {
      id, iso,
      name: { en, es: val(r, "es") || en },
      population: Number(val(r, "pop") || 0),
      lat: Number(val(r, "lat")), lon: Number(val(r, "lon")),
    });
  }
  return [...seen.values()].sort((a, b) => a.iso.localeCompare(b.iso) || b.population - a.population);
}

// Types that make a place worth visiting. Direct instance-of only: the subclass path (P279*)
// times out on the public endpoint. Museums and attractions are the first build's types;
// monuments, archaeological sites, castles, parks and gardens are added here.
const TOURIST_TYPES = ["wd:Q570116", "wd:Q33506", "wd:Q4989906", "wd:Q839954", "wd:Q23413", "wd:Q1107656", "wd:Q15284"];
const MUSEUM_URI = "http://www.wikidata.org/entity/Q33506";

// Three light queries instead of one heavy one: candidates by popularity, then names, then cities.
async function attractions(iso: string) {
  // One query per type, with no ORDER BY: large countries (Germany, the US) time out when the
  // endpoint has to sort every monument first. Popularity is sorted here instead.
  const candidates: Row[] = [];
  for (const type of TOURIST_TYPES) {
    const rows = await sparql(`SELECT ?p ?sl WHERE {
      ?p wdt:P31 ${type}; wdt:P17 ?c. ?c wdt:P297 "${iso}".
      ?p wikibase:sitelinks ?sl.
      FILTER(?sl >= 5)
    } LIMIT 400`);
    for (const r of rows) candidates.push({ ...r, type: { value: type.replace("wd:", "http://www.wikidata.org/entity/") } });
  }
  candidates.sort((a, b) => Number(val(b, "sl")) - Number(val(a, "sl")));
  const bestById = new Map<string, { sl: number; museum: boolean }>();
  for (const r of candidates) {
    const id = qid(val(r, "p"));
    const cur = bestById.get(id) ?? { sl: Number(val(r, "sl")), museum: false };
    cur.museum ||= val(r, "type") === MUSEUM_URI;
    bestById.set(id, cur);
  }
  const ids = [...bestById.keys()];
  if (!ids.length) return [];
  const values = ids.map((i) => `wd:${i}`).join(" ");
  const names = await sparql(`SELECT ?p ?en ?es WHERE { VALUES ?p { ${values} }
    OPTIONAL { ?p rdfs:label ?en FILTER(lang(?en)="en") }
    OPTIONAL { ?p rdfs:label ?es FILTER(lang(?es)="es") } }`);
  const cities = await sparql(`SELECT ?p ?cityEn WHERE { VALUES ?p { ${values} }
    ?p wdt:P131 ?city. ?city rdfs:label ?cityEn FILTER(lang(?cityEn)="en") }`);
  const nameOf = new Map<string, { en: string; es: string }>();
  for (const r of names) {
    const id = qid(val(r, "p"));
    const en = val(r, "en");
    if (en && !nameOf.has(id)) nameOf.set(id, { en, es: val(r, "es") || en });
  }
  const cityOf = new Map<string, string>();
  for (const r of cities) {
    const id = qid(val(r, "p"));
    if (!cityOf.has(id)) cityOf.set(id, val(r, "cityEn"));
  }
  const ranked = ids
    .map((id) => ({ id, ...bestById.get(id)!, name: nameOf.get(id) }))
    .filter((x): x is typeof x & { name: { en: string; es: string } } => Boolean(x.name))
    .sort((a, b) => b.sl - a.sl);
  const out: { id: string; name: { en: string; es: string }; city: string; sitelinks: number; museum: boolean }[] = [];
  // Same landmark under two items (e.g. CN Tower): keep the more referenced one.
  const seenNames = new Set<string>();
  for (const x of ranked) {
    const key = `${x.name.en.toLowerCase()}|${(cityOf.get(x.id) ?? "").toLowerCase()}`;
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    out.push({ id: x.id, name: x.name, city: cityOf.get(x.id) || x.name.en, sitelinks: x.sl, museum: x.museum });
    if (out.length >= TOP_PER_COUNTRY) break;
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(join(OUT, "highlights"), { recursive: true });
  // ONLY=DE,FR retries just those countries (the full run skips those that time out).
  const only = process.env.ONLY?.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  let cs: Awaited<ReturnType<typeof countries>>;
  if (only) {
    cs = (await countries()).filter((c) => only.includes(c.iso));
    console.log(`retrying ${cs.map((c) => c.iso).join(", ")}`);
  } else {
    console.log("countries...");
    cs = await countries();
    writeFileSync(join(OUT, "countries.json"), JSON.stringify({ generatedAt: DATE, source: "Wikidata (CC0)", countries: cs }, null, 1) + "\n");
    console.log(`  ${cs.length} countries`);

    console.log("cities...");
    const cts = await cities();
    writeFileSync(join(OUT, "cities.json"), JSON.stringify({
      generatedAt: DATE,
      source: "Wikidata (CC0): cities with population >= 300,000, plus every capital",
      cities: cts,
    }, null, 1) + "\n");
    console.log(`  ${cts.length} cities`);
  }

  const source = { wikidata: { title: "Wikidata (CC0 1.0)", url: "https://www.wikidata.org/", license: "CC0 1.0", retrieved: DATE } };
  let done = 0;
  for (const c of cs) {
    try {
      const top = await attractions(c.iso);
      const places = top.map((p) => ({
        id: `${c.iso.toLowerCase()}-${p.id.toLowerCase()}`,
        name: p.name.en,
        area: p.city,
        city: p.city,
        category: p.museum ? "museum" : "sight",
        interests: p.museum ? ["museums"] : ["sights"],
        durationMinutes: p.museum ? 120 : 90,
        desc: {
          en: `Ranked by Wikipedia popularity (${p.sitelinks} language editions). Details not curated.`,
          es: `Ordenado por popularidad en Wikipedia (${p.sitelinks} ediciones de idioma). Detalles sin curación.`,
        },
        sourceId: "wikidata",
      }));
      // Merge: keep every place already in the file (curated ids must stay valid), then add new ones.
      const file = join(OUT, "highlights", `${c.iso}.json`);
      const existing = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).places as typeof places) : [];
      const have = new Set(existing.map((p) => p.id));
      const merged = [...existing, ...places.filter((p) => !have.has(p.id))];
      if (merged.length) {
        writeFileSync(file, JSON.stringify({
          schemaVersion: "1.0.0",
          country: c.iso,
          names: c.name,
          review: {
            status: "wikidata_ranked",
            reviewedBy: null,
            reviewedAt: null,
            note: "Ranked by Wikipedia popularity, not curated. Names may repeat or be non-touristic (routes, sites under restoration). Check every place and its hours on the official source.",
          },
          sources: source,
          places: merged,
        }, null, 1) + "\n");
      }
      done++;
      if (done % 20 === 0) console.log(`  highlights ${done}/${cs.length}`);
    } catch (err) {
      console.warn(`  ${c.iso} skipped: ${(err as Error).message}`);
    }
    await sleep(1200); // be polite to the public endpoint
  }
  console.log(`done: ${done} countries with highlights`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
