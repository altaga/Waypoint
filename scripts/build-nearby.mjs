// Places near every city of the world list, from public data only (no model writes any fact):
//   Wikidata (CC0)      the places around each city: tourist-worthy types, ranked by how many Wikipedias have them
//   Wikipedia (CC BY-SA) the first sentence of the article, in English and Spanish, with the article link
//   Wikimedia Commons   one photo, only when its license is free (CC BY, CC BY-SA, CC0, public domain), with author and license
// Stages (each saves to data/raw/nearby/ and can be stopped and run again):
//   node scripts/build-nearby.mjs classes   the Wikidata types that count as tourist-worthy
//   node scripts/build-nearby.mjs places    the places around each city (set ONLY=VN to run one country)
//   node scripts/build-nearby.mjs country  the best-known places of each country (towns the world list does not have)
//   node scripts/build-nearby.mjs text      names, links, descriptions, coordinates, websites, phones, photo files
//   node scripts/build-nearby.mjs commons   photo author and license
//   node scripts/build-nearby.mjs write     merge into highlights/<ISO>.json (new places go after the curated ones)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const RAW = ROOT + "data/raw/nearby/";
mkdirSync(RAW, { recursive: true });
const UA = "Waypoint-hackathon/1.0 (https://github.com/altaga/waypoint)";
const TODAY = new Date().toISOString().slice(0, 10);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const load = (f, d) => (existsSync(RAW + f) ? JSON.parse(readFileSync(RAW + f, "utf8")) : d);
const save = (f, v) => writeFileSync(RAW + f, JSON.stringify(v));

async function getJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(70000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      await sleep(2000 * (i + 1) * (res.status === 429 ? 4 : 1));
    } catch {
      await sleep(2000 * (i + 1));
    }
  }
  return null;
}
const sparql = (q) => getJson("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));

// Roots of the types a traveler goes to see, and what each means for the list.
const ROOTS = {
  Q1370598: ["sight", ["temples"]], Q16970: ["sight", ["temples", "architecture"]], Q44539: ["sight", ["temples"]], Q32815: ["sight", ["temples", "architecture"]], Q34627: ["sight", ["temples", "history"]],
  Q570116: ["sight", ["sights"]], Q33506: ["museum", ["museums"]], Q24398: ["sight", ["temples"]], Q22698: ["nature", ["nature"]],
  Q23413: ["sight", ["history", "architecture"]], Q16560: ["sight", ["history", "architecture"]], Q4989906: ["sight", ["history"]],
  Q5003624: ["sight", ["history"]], Q12280: ["sight", ["architecture"]], Q12518: ["sight", ["architecture"]], Q40080: ["beach", ["beaches"]],
  Q34038: ["nature", ["nature"]], Q23397: ["nature", ["nature"]], Q8502: ["nature", ["nature"]], Q23442: ["nature", ["nature"]],
  Q35509: ["nature", ["nature"]], Q839954: ["sight", ["history"]], Q43501: ["experience", ["family", "nature"]], Q167346: ["nature", ["nature"]],
  Q330284: ["shopping", ["markets", "shopping"]], Q174782: ["sight", ["sights"]], Q39715: ["sight", ["architecture"]], Q11303: ["sight", ["architecture"]],
  Q1440476: ["sight", ["architecture"]], Q2281788: ["experience", ["family"]], Q194195: ["experience", ["family"]], Q46169: ["nature", ["nature"]],
  Q179049: ["nature", ["nature"]], Q177380: ["experience", ["nature"]], Q1107656: ["nature", ["nature"]], Q1007870: ["museum", ["art", "museums"]],
  Q24354: ["experience", ["art"]], Q1060829: ["experience", ["art"]], Q153562: ["experience", ["art"]], Q9259: ["sight", ["history"]],
  Q1081138: ["sight", ["history"]], Q2065736: ["sight", ["history"]],
};

async function classes() {
  const out = load("classes.json", {});
  for (const root of Object.keys(ROOTS)) {
    if (out[root]) continue;
    const r = await sparql(`SELECT ?c WHERE { ?c wdt:P279* wd:${root} }`);
    if (!r) { console.log("failed", root); continue; }
    out[root] = r.results.bindings.map((b) => b.c.value.split("/").pop());
    console.log(root, out[root].length);
    save("classes.json", out);
    await sleep(1200);
  }
}

// ---- places around each city ----
async function places() {
  const cls = load("classes.json", {});
  const rootOf = new Map();
  for (const [root, ids] of Object.entries(cls)) for (const id of ids) if (!rootOf.has(id)) rootOf.set(id, root);
  const cities = JSON.parse(readFileSync(ROOT + "data/world/cities.json", "utf8")).cities.filter((c) => !ONLY || ONLY.includes(c.iso));
  const done = load("places.json", {});
  let n = 0;
  for (const c of cities) {
    if (done[c.id]) continue;
    const radius = c.population >= 1_000_000 ? 14 : 22;
    const q = `SELECT ?item ?itemLabel ?sl ?cls WHERE {
      SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${c.lon} ${c.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radius}" . }
      ?item wikibase:sitelinks ?sl . FILTER(?sl >= 3) ?item wdt:P31 ?cls .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?sl) LIMIT 400`;
    const r = await sparql(q);
    if (!r) { console.log("failed", c.name.en); continue; }
    const by = new Map();
    for (const b of r.results.bindings) {
      const id = b.item.value.split("/").pop();
      if (id === c.id || /^Q\d+$/.test(b.itemLabel.value)) continue;
      const root = rootOf.get(b.cls.value.split("/").pop());
      if (!root) continue;
      const cur = by.get(id) ?? { id, name: b.itemLabel.value, sl: Number(b.sl.value), root };
      by.set(id, cur);
    }
    done[c.id] = { iso: c.iso, city: c.name.en, items: [...by.values()].sort((a, b) => b.sl - a.sl).slice(0, 12) };
    if (++n % 25 === 0) { save("places.json", done); console.log(n, "/", cities.length, c.name.en); }
    await sleep(900);
  }
  save("places.json", done);
}

// ---- the best-known places of each country, wherever they are (towns the world list does not have: Hoi An, Ha Long Bay) ----
async function country() {
  const cls = load("classes.json", {});
  const rootOf = new Map();
  for (const [root, ids] of Object.entries(cls)) for (const id of ids) if (!rootOf.has(id)) rootOf.set(id, root);
  const countries = JSON.parse(readFileSync(ROOT + "data/world/countries.json", "utf8")).countries.filter((c) => !ONLY || ONLY.includes(c.iso));
  const done = load("places.json", {});
  let n = 0;
  for (const c of countries) {
    const key = "country:" + c.iso;
    if (done[key]) continue;
    const q = `SELECT ?item ?itemLabel ?sl ?cls ?admLabel WHERE {
      ?item wdt:P17 wd:${c.wikidata} ; wikibase:sitelinks ?sl ; wdt:P625 ?coord ; wdt:P31 ?cls . FILTER(?sl >= 8)
      OPTIONAL { ?item wdt:P131 ?adm . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY DESC(?sl) LIMIT ${process.env.COUNTRY_LIMIT || 1500}`;
    const r = await sparql(q);
    if (!r) { console.log("failed", c.iso); continue; }
    const by = new Map();
    for (const b of r.results.bindings) {
      const id = b.item.value.split("/").pop();
      if (/^Q\d+$/.test(b.itemLabel.value)) continue;
      const root = rootOf.get(b.cls.value.split("/").pop());
      if (!root) continue;
      const cur = by.get(id) ?? { id, name: b.itemLabel.value, sl: Number(b.sl.value), root, area: b.admLabel?.value };
      if (!cur.area && b.admLabel) cur.area = b.admLabel.value;
      by.set(id, cur);
    }
    done[key] = { iso: c.iso, city: "", countrywide: true, items: [...by.values()].sort((a, b) => b.sl - a.sl).slice(0, 60) };
    if (++n % 10 === 0) { save("places.json", done); console.log("countries", n, "/", countries.length); }
    await sleep(1200);
  }
  save("places.json", done);
}

// ---- World Heritage sites and US national parks: cheap direct queries that also cover the countries whose countrywide query timed out ----
async function heritage() {
  const countries = JSON.parse(readFileSync(ROOT + "data/world/countries.json", "utf8")).countries;
  const isoOf = new Map(countries.map((c) => [c.wikidata, c.iso]));
  const done = load("places.json", {});
  const queries = [
    ["Q9259", `SELECT ?item ?itemLabel ?sl ?c WHERE { ?item wdt:P1435 wd:Q9259 ; wikibase:sitelinks ?sl ; wdt:P625 ?coord . OPTIONAL { ?item wdt:P17 ?c } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 3000`],
    ["Q46169", `SELECT ?item ?itemLabel ?sl ?c WHERE { ?item wdt:P31 wd:Q46169 ; wdt:P17 ?c ; wikibase:sitelinks ?sl ; wdt:P625 ?coord . FILTER(?c IN (wd:Q30, wd:Q142)) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 200`],
  ];
  for (const [root, q] of queries) {
    const r = await sparql(q);
    if (!r) { console.log("failed", root); continue; }
    const byIso = new Map();
    for (const b of r.results.bindings) {
      const id = b.item.value.split("/").pop();
      const iso = isoOf.get(b.c?.value.split("/").pop());
      if (!iso || /^Q\d+$/.test(b.itemLabel.value)) continue;
      if (!byIso.has(iso)) byIso.set(iso, new Map());
      byIso.get(iso).set(id, { id, name: b.itemLabel.value, sl: Number(b.sl.value), root });
    }
    for (const [iso, items] of byIso) {
      const key = `heritage:${root}:${iso}`;
      done[key] = { iso, city: "", countrywide: true, items: [...items.values()].sort((a, b) => b.sl - a.sl) };
    }
    console.log(root, [...byIso.values()].reduce((n, m) => n + m.size, 0), "places in", byIso.size, "countries");
    await sleep(1500);
  }
  save("places.json", done);
}

// ---- facts and Wikipedia text ----
const clean = (s) => s.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
function firstSentence(s) {
  const t = clean(s);
  const m = t.match(/^(.{40,}?[.!?])(\s|$)/);
  const out = (m ? m[1] : t).trim();
  return out.length > 220 ? out.slice(0, 217).replace(/\s+\S*$/, "") + "…" : out;
}
async function text() {
  const placesBy = load("places.json", {});
  const ids = [...new Set(Object.values(placesBy).flatMap((c) => c.items.map((i) => i.id)))];
  const facts = load("facts.json", {});
  const todo = ids.filter((id) => !facts[id]);
  console.log("to read:", todo.length);
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const j = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${batch.join("|")}&props=sitelinks|labels|claims&sitefilter=enwiki|eswiki&languages=en|es`);
    for (const id of batch) {
      const e = j?.entities?.[id];
      if (!e) continue;
      const c = e.claims ?? {};
      const val = (p) => c[p]?.[0]?.mainsnak?.datavalue?.value;
      const coord = val("P625");
      facts[id] = {
        en: e.labels?.en?.value, es: e.labels?.es?.value,
        enwiki: e.sitelinks?.enwiki?.title, eswiki: e.sitelinks?.eswiki?.title,
        lat: coord?.latitude, lon: coord?.longitude,
        website: typeof val("P856") === "string" ? val("P856") : undefined,
        phone: typeof val("P1329") === "string" ? val("P1329") : undefined,
        image: typeof val("P18") === "string" ? val("P18") : undefined,
      };
    }
    save("facts.json", facts);
    await sleep(500);
    if ((i / 50) % 20 === 0) console.log("facts", i, "/", todo.length);
  }
  const wiki = load("wiki.json", {});
  const withText = ids.filter((id) => facts[id]?.enwiki && !wiki[id]);
  console.log("articles to read:", withText.length);
  let n = 0;
  const queue = [...withText];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      const f = facts[id];
      const get = async (lang, title) => {
        if (!title) return null;
        const j = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, 3);
        return j?.extract && j.type === "standard" ? { text: firstSentence(j.extract), title: j.titles?.canonical?.replace(/_/g, " ") ?? title, url: j.content_urls?.desktop?.page } : null;
      };
      wiki[id] = { en: await get("en", f.enwiki), es: await get("es", f.eswiki) };
      if (++n % 200 === 0) { save("wiki.json", wiki); console.log("articles", n, "/", withText.length); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  save("wiki.json", wiki);
}

// ---- photo license and author ----
async function commons() {
  const facts = load("facts.json", {});
  const files = [...new Set(Object.values(facts).map((f) => f.image).filter(Boolean))];
  const out = load("commons.json", {});
  const todo = files.filter((f) => !(f in out));
  console.log("photos to check:", todo.length);
  const strip = (h) => String(h ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
  for (let i = 0; i < todo.length; i += 40) {
    const batch = todo.slice(i, i + 40);
    const j = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=LicenseShortName|Artist|NonFree|Restrictions&titles=${encodeURIComponent(batch.map((f) => "File:" + f).join("|"))}`);
    const byTitle = new Map(Object.values(j?.query?.pages ?? {}).map((p) => [p.title?.replace(/^File:/, ""), p]));
    // The API normalizes titles (underscores to spaces): match on that.
    for (const f of batch) {
      const p = byTitle.get(f.replace(/_/g, " "));
      const m = p?.imageinfo?.[0]?.extmetadata;
      const lic = strip(m?.LicenseShortName?.value);
      const free = /^(CC BY(-SA)? [\d.]+|CC BY(-SA)? [\d.]+ [A-Za-z]+|CC0.*|Public domain|PD.*)$/i.test(lic) && m?.NonFree?.value !== "true";
      out[f] = free ? { author: strip(m?.Artist?.value).slice(0, 80) || "Unknown", license: lic, pageUrl: "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(f.replace(/ /g, "_")) } : null;
    }
    if ((i / 40) % 20 === 0) { save("commons.json", out); console.log("photos", i, "/", todo.length); }
    await sleep(400);
  }
  save("commons.json", out);
}

// ---- merge ----
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "place";
const MINUTES = { museum: 90, beach: 120, nature: 90, sight: 45, shopping: 60, experience: 120, food: 60, neighborhood: 90 };
const D = Math.PI / 180;
const km = (aLat, aLon, bLat, bLon) => 12742 * Math.asin(Math.sqrt(Math.sin(((bLat - aLat) * D) / 2) ** 2 + Math.cos(aLat * D) * Math.cos(bLat * D) * Math.sin(((bLon - aLon) * D) / 2) ** 2));
function write() {
  const worldCities = JSON.parse(readFileSync(ROOT + "data/world/cities.json", "utf8")).cities;
  const placesBy = load("places.json", {});
  const facts = load("facts.json", {});
  const wiki = load("wiki.json", {});
  const commons = load("commons.json", {});
  const byIso = new Map();
  for (const [cityId, c] of Object.entries(placesBy)) {
    if (!byIso.has(c.iso)) byIso.set(c.iso, []);
    byIso.get(c.iso).push({ cityId, ...c });
  }
  let added = 0, photos = 0;
  for (const [iso, cityList] of byIso) {
    if (ONLY && !ONLY.includes(iso)) continue;
    const file = `${ROOT}highlights/${iso}.json`;
    if (!existsSync(file)) continue;
    const pack = JSON.parse(readFileSync(file, "utf8"));
    const wikidataIds = new Set(pack.places.map((p) => p.wikidata).filter(Boolean));
    const ids = new Set(pack.places.map((p) => p.id));
    const nearBy = (lat, lon) => pack.places.some((p) => p.lat != null && Math.abs(p.lat - lat) < 0.0006 && Math.abs(p.lon - lon) < 0.0006);
    const fresh = [];
    for (const c of cityList) {
      for (const it of c.items) {
        const f = facts[it.id];
        const w = wiki[it.id];
        if (!f || f.lat == null || !w?.en?.text || w.en.text.length < 20 || wikidataIds.has(it.id)) continue;
        if (nearBy(f.lat, f.lon)) continue; // already in the list under another id
        // A countrywide place is filed under the nearest city (within 40 km), else under where Wikidata says it is; one far from every city of the country (a disputed rock far offshore) is left out.
        let where = c.city;
        if (c.countrywide) {
          let best = null, bestKm = Infinity;
          for (const w2 of worldCities) if (w2.iso === iso) { const d = km(f.lat, f.lon, w2.lat, w2.lon); if (d < bestKm) { best = w2; bestKm = d; } }
          if (!best || bestKm > 300) continue;
          where = bestKm <= 40 ? best.name.en : it.area || best.name.en;
        }
        wikidataIds.add(it.id);
        const [category, interests] = ROOTS[it.root];
        const name = f.en || it.name;
        let id = `${iso.toLowerCase()}-${slug(name)}`;
        if (ids.has(id)) id += "-" + it.id.toLowerCase();
        ids.add(id);
        const photo = f.image && commons[f.image] ? { file: f.image.replace(/ /g, "_"), pageUrl: commons[f.image].pageUrl, author: commons[f.image].author, license: commons[f.image].license } : null;
        if (photo) photos++;
        const es = w.es?.text && w.es.text.length >= 20 ? w.es.text : null;
        fresh.push({
          id, name, ...(f.es && f.es !== name ? { nameLocal: undefined } : {}), area: where, city: where, wikidata: it.id,
          ...(f.website && /^https:\/\//.test(f.website) ? { website: f.website } : {}),
          lat: Math.round(f.lat * 1e6) / 1e6, lon: Math.round(f.lon * 1e6) / 1e6,
          ...(f.phone ? { phone: f.phone } : {}),
          category, interests, durationMinutes: MINUTES[category] ?? 45,
          desc: { en: w.en.text, es: es || w.en.text }, sourceId: "wikipedia",
          descBy: { en: "wikipedia", es: "wikipedia" },
          ground: { retrieved: TODAY, en: { title: w.en.title, url: w.en.url }, es: w.es?.url ? { title: w.es.title, url: w.es.url } : { title: w.en.title, url: w.en.url } }, // no Spanish article: the sentence is English and the link is the English article
          ...(photo ? { image: photo } : {}),
          // Tokyo is big: a part of the city (east, center, west) lets a day stay in one part.
          ...(where === "Tokyo" ? { zone: f.lon < 139.7 ? "west" : f.lon > 139.77 ? "east" : "center" } : {}),
        });
      }
    }
    for (const p of fresh) {
      if ("nameLocal" in p) delete p.nameLocal;
      if (!p.ground.en?.url) delete p.ground.en;
    }
    if (!fresh.length) continue;
    pack.places.push(...fresh.filter((p) => p.ground.en));
    pack.sources.commons ??= { title: "Wikimedia Commons photos (each file has its own free license; author and license shown on the photo)", url: "https://commons.wikimedia.org/", license: "CC BY, CC BY-SA, CC0 or public domain, per file", retrieved: TODAY };
    pack.sources.wikidata ??= { title: "Wikidata", url: "https://www.wikidata.org/", license: "CC0 1.0", retrieved: TODAY };
    pack.sources.wikipedia ??= { title: "Wikipedia", url: "https://www.wikipedia.org/", license: "CC BY-SA 4.0", retrieved: TODAY };
    writeFileSync(file, JSON.stringify(pack, null, 2) + "\n");
    added += fresh.length;
  }
  console.log({ countries: byIso.size, added, photos });
}

const stage = process.argv[2];
if (stage === "classes") await classes();
else if (stage === "places") await places();
else if (stage === "country") await country();
else if (stage === "heritage") await heritage();
else if (stage === "text") await text();
else if (stage === "commons") await commons();
else if (stage === "write") write();
else console.log("stages: classes places text commons write");
