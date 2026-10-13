// Grounds curated places in Wikipedia. For each place whose id is a Wikidata item (xx-qNNN),
// it reads the English and Spanish Wikipedia titles from Wikidata, then the REST summary of
// each article. Output: data/grounding/places.json, keyed by the Wikidata id.
// Wikipedia text is CC BY-SA 4.0: keep the article URL and the attribution wherever it is shown.
//   node scripts/build-grounding.mjs            (full run, about 35 minutes)
//   node scripts/build-grounding.mjs --dry      (count the ids only)
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data/grounding/places.json");
const UA = "Waypoint/0.1 (https://github.com/altaga/Waypoint; travel concierge; grounding curated places)";
const DRY = process.argv.includes("--dry");
const RETRIED = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    if (attempt === 6) throw new Error(`${res.status} ${url.slice(0, 80)}`);
    await sleep(attempt * 8000); // back off on 429 and 5xx
  }
  return null;
}

// 1. The curated places that are Wikidata items.
const ids = new Map(); // qid -> place id
for (const f of readdirSync(join(ROOT, "highlights"))) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  for (const p of JSON.parse(readFileSync(join(ROOT, "highlights", f), "utf8")).places) {
    const m = /^[a-z]{2}-(q\d+)$/.exec(p.id);
    if (m) ids.set(m[1].toUpperCase(), p.id);
  }
}
console.log(`${ids.size} curated places are Wikidata items`);
if (DRY) process.exit(0);

// 2. Wikipedia titles for those items, 50 per request.
const titles = new Map(); // qid -> { en, es }
const qids = [...ids.keys()];
for (let i = 0; i < qids.length; i += 50) {
  const batch = qids.slice(i, i + 50).join("|");
  const data = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch}&props=sitelinks&sitefilter=enwiki|eswiki&format=json`);
  for (const [qid, ent] of Object.entries(data?.entities ?? {})) {
    titles.set(qid, { en: ent.sitelinks?.enwiki?.title ?? null, es: ent.sitelinks?.eswiki?.title ?? null });
  }
  await sleep(500);
}
console.log(`titles resolved for ${titles.size} items`);

// 3. The REST summary of each article, one request at a time.
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const retrieved = new Date().toISOString().slice(0, 10);
let done = 0;
for (const qid of qids) {
  if (out[qid]) { done++; continue; }
  const t = titles.get(qid) ?? { en: null, es: null };
  const entry = { placeId: ids.get(qid), en: null, es: null, retrieved };
  for (const lang of ["en", "es"]) {
    const title = t[lang];
    if (!title) continue;
    const slug = encodeURIComponent(title.replace(/ /g, "_"));
    const s = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`);
    // Only real articles: not disambiguation pages, redirects or missing pages.
    if (s && s.type === "standard" && s.extract) {
      entry[lang] = {
        title: s.title,
        extract: s.extract,
        url: s.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${slug}`,
      };
    }
    await sleep(1000);
  }
  out[qid] = entry;
  done++;
  if (done % 25 === 0) {
    writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
    console.log(`  ${done}/${qids.length}`);
  }
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const withEn = Object.values(out).filter((e) => e.en).length;
const withEs = Object.values(out).filter((e) => e.es).length;
console.log(`done: ${Object.keys(out).length} items; English article for ${withEn}, Spanish for ${withEs}`);
