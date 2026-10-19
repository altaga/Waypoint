// Adds to every place in highlights/*.json what public data has about it: official website, coordinates and phone
// (Wikidata, CC0) and, where OpenStreetMap has them, opening hours (ODbL). Nothing is guessed: a field is written
// only when a source gave it, and each source and its date are recorded in the pack.
//
//   node scripts/enrich-places.mjs wikidata   # stage 1: website, coordinates, phone by Wikidata id (fast)
//   node scripts/enrich-places.mjs osm        # stage 2: opening hours by place (Nominatim, 1 request a second; resumable)
//   node scripts/enrich-places.mjs write      # stage 3: write the results into highlights/*.json
//
// Results are cached in data/raw/enrich/ so a stage can be stopped and run again.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = join(ROOT, "data/raw/enrich");
mkdirSync(CACHE, { recursive: true });
const UA = "Waypoint-hackathon/1.0 (open-source travel readiness; https://github.com/altaga/Waypoint)";
const TODAY = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fallback);

function packs() {
  return readdirSync(join(ROOT, "highlights")).filter((f) => /^[A-Z]{2}\.json$/.test(f)).map((f) => ({ file: f, path: join(ROOT, "highlights", f), pack: JSON.parse(readFileSync(join(ROOT, "highlights", f), "utf8")) }));
}
const qidOf = (p) => (p.wikidata || (/^[a-z]{2}-q(\d+)$/.exec(p.id) ? `Q${/^[a-z]{2}-q(\d+)$/.exec(p.id)[1]}` : null));

// ---- stage 1: Wikidata ----
function pickWebsite(urls) {
  const ok = urls.filter((u) => /^https?:\/\//.test(u));
  const english = ok.find((u) => /^https?:\/\/en\./.test(u) || /\/en(\/|$)/.test(u));
  if (english) return english;
  const generic = ok.filter((u) => !/^https?:\/\/[a-z]{2}\./.test(u) && !/\/(ja|zh|ko|fr|de|es|it|id|pt|ru|ar|th|vi)(\/|$)/.test(u));
  return (generic.length ? generic : ok).sort((a, b) => a.length - b.length)[0] ?? null;
}

async function wikidata() {
  const out = readJson(join(CACHE, "wikidata.json"), {});
  const qids = [...new Set(packs().flatMap(({ pack }) => pack.places.map(qidOf).filter(Boolean)))].filter((q) => !(q in out));
  console.log(`wikidata: ${qids.length} to fetch`);
  for (let i = 0; i < qids.length; i += 80) {
    const batch = qids.slice(i, i + 80);
    const query = `SELECT ?item ?web ?coord ?phone WHERE { VALUES ?item { ${batch.map((q) => `wd:${q}`).join(" ")} } OPTIONAL { ?item wdt:P856 ?web } OPTIONAL { ?item wdt:P625 ?coord } OPTIONAL { ?item wdt:P1329 ?phone } }`;
    let rows = null;
    for (let attempt = 0; attempt < 4 && !rows; attempt++) {
      const res = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query), { headers: { "user-agent": UA, accept: "application/sparql-results+json" } });
      if (res.ok) rows = (await res.json()).results.bindings;
      else await sleep(3000 * (attempt + 1));
    }
    if (!rows) { console.log("batch failed", i); continue; }
    const by = {};
    for (const r of rows) {
      const q = r.item.value.split("/").pop();
      by[q] ??= { webs: new Set(), coord: null, phones: new Set() };
      if (r.web) by[q].webs.add(r.web.value);
      if (r.coord) by[q].coord = r.coord.value;
      if (r.phone) by[q].phones.add(r.phone.value);
    }
    for (const q of batch) {
      const e = by[q];
      const m = e?.coord ? /Point\(([-\d.]+) ([-\d.]+)\)/.exec(e.coord) : null;
      out[q] = { website: e ? pickWebsite([...e.webs]) : null, lon: m ? Number(Number(m[1]).toFixed(5)) : null, lat: m ? Number(Number(m[2]).toFixed(5)) : null, phone: e ? [...e.phones][0] ?? null : null };
    }
    writeFileSync(join(CACHE, "wikidata.json"), JSON.stringify(out));
    console.log(`  ${Math.min(i + 80, qids.length)}/${qids.length}`);
    await sleep(1200);
  }
}

// ---- stage 2: OpenStreetMap through Nominatim (extratags), matched by Wikidata id or by place ----
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function km(a, b, c, d) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
async function osm() {
  const wd = readJson(join(CACHE, "wikidata.json"), {});
  const out = readJson(join(CACHE, "osm.json"), {});
  const todo = [];
  for (const { pack } of packs()) for (const p of pack.places) if (!(p.id in out)) todo.push({ p, country: pack.names.en });
  console.log(`osm: ${todo.length} to look up (about ${Math.round(todo.length * 1.3 / 60)} minutes)`);
  let n = 0;
  for (const { p, country } of todo) {
    const q = qidOf(p);
    const here = q && wd[q]?.lat != null ? wd[q] : p.lat != null ? { lat: p.lat, lon: p.lon } : null;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&extratags=1&limit=5&q=${encodeURIComponent(`${p.name}, ${p.city}, ${country}`)}`;
    let rows = null;
    for (let attempt = 0; attempt < 3 && !rows; attempt++) {
      try {
        const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" } });
        if (res.ok) rows = await res.json();
        else await sleep(5000 * (attempt + 1));
      } catch { await sleep(5000); }
    }
    let hit = null;
    for (const r of rows ?? []) {
      const tags = r.extratags ?? {};
      const sameQ = q && tags.wikidata === q;
      const near = here && km(here.lat, here.lon, Number(r.lat), Number(r.lon)) < 0.35 && (norm(r.display_name).includes(norm(p.name)) || norm(p.name).includes(norm(r.name ?? "")));
      if (sameQ || near) { hit = { osm: `${r.osm_type}/${r.osm_id}`, hours: tags.opening_hours ?? null, website: tags.website ?? tags["contact:website"] ?? null, phone: tags.phone ?? tags["contact:phone"] ?? null, lat: Number(r.lat), lon: Number(r.lon), by: sameQ ? "wikidata" : "position" }; break; }
    }
    out[p.id] = hit ?? { osm: null };
    if (++n % 25 === 0) { writeFileSync(join(CACHE, "osm.json"), JSON.stringify(out)); console.log(`  ${n}/${todo.length}`); }
    await sleep(1100);
  }
  writeFileSync(join(CACHE, "osm.json"), JSON.stringify(out));
}

// ---- stage 3: write ----
function write() {
  const wd = readJson(join(CACHE, "wikidata.json"), {});
  const osmData = readJson(join(CACHE, "osm.json"), {});
  const hand = readJson(join(ROOT, "data/curation/place-facts.json"), {}); // facts researched for places with no Wikidata id (website, coordinates, hours, each with its source)
  const stats = { places: 0, website: 0, coords: 0, hours: 0 };
  for (const { path, pack } of packs()) {
    for (const p of pack.places) {
      stats.places++;
      const q = qidOf(p);
      const w = q ? wd[q] : null;
      const o = osmData[p.id];
      const h = hand[p.id];
      if (q) p.wikidata = q;
      const website = h?.website ?? w?.website ?? o?.website ?? p.website ?? null;
      if (website) { p.website = website; stats.website++; } else delete p.website;
      const lat = h?.lat ?? w?.lat ?? o?.lat ?? p.lat ?? null, lon = h?.lon ?? w?.lon ?? o?.lon ?? p.lon ?? null;
      if (lat != null && lon != null) { p.lat = lat; p.lon = lon; stats.coords++; } else { delete p.lat; delete p.lon; }
      const phone = h?.phone ?? w?.phone ?? o?.phone ?? p.phone ?? null;
      if (phone) p.phone = phone; else delete p.phone;
      const hours = h?.hours ?? o?.hours ?? null;
      if (!hours && p.hours) { stats.hours++; } else if (hours) { p.hours = { text: hours, source: h?.hours ? (h.hoursSource ?? "official") : "osm", retrieved: h?.hours ? (h.retrieved ?? TODAY) : TODAY }; stats.hours++; } else delete p.hours;
    }
    pack.sources.wikidata = { title: "Wikidata (CC0 1.0): official website, coordinates, phone", url: "https://www.wikidata.org/", license: "CC0 1.0", retrieved: TODAY };
    pack.sources.osm = { title: "OpenStreetMap contributors (ODbL): opening hours", url: "https://www.openstreetmap.org/copyright", license: "ODbL 1.0", retrieved: TODAY };
    writeFileSync(path, JSON.stringify(pack, null, 2) + "\n");
  }
  console.log(stats);
}

const stage = process.argv[2];
if (stage === "wikidata") await wikidata();
else if (stage === "osm") await osm();
else if (stage === "write") write();
else console.log("usage: node scripts/enrich-places.mjs wikidata|osm|write");
