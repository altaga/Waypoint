// The country guide: what a traveler needs that the rest of Waypoint does not cover (getting in and around, safety, health,
// money and tipping, etiquette, connectivity, phrases). Public sources only; no fact is written without a quote from them.
//   FCDO foreign travel advice (UK Government, Open Government Licence v3.0): entry requirements, safety, health, getting help
//   Wikivoyage (CC BY-SA 4.0): getting around, money, respect, connect, talk, eat
// Stages (each saves to data/raw/guide/ and can be stopped and run again):
//   node scripts/build-guide.mjs fetch     download both sources for every country (ONLY=VN,JP runs some)
//   node scripts/build-guide.mjs phrasebook  download the Wikivoyage phrasebook of each country's main language
//   node scripts/build-guide.mjs verify    check every quote the agents wrote to data/raw/guide/out/<ISO>.json against the downloaded text;
//                                           write only the verified facts to data/guide/<ISO>.json
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const RAW = ROOT + "data/raw/guide/";
mkdirSync(RAW + "fcdo", { recursive: true });
mkdirSync(RAW + "wikivoyage", { recursive: true });
const UA = "Waypoint-hackathon/1.0 (https://github.com/altaga/waypoint)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const countries = JSON.parse(readFileSync(ROOT + "data/world/countries.json", "utf8")).countries.filter((c) => !ONLY || ONLY.includes(c.iso));

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(60000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      await sleep(2000 * (i + 1));
    } catch {
      await sleep(2000 * (i + 1));
    }
  }
  return null;
}

const text = (html) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, "")
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol)>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<li[^>]*>/g, "- ")
    .replace(/<h([1-6])[^>]*>/g, (_, n) => "\n" + "#".repeat(Number(n)) + " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
// Names that differ between Wikidata and the FCDO list.
const FCDO_ALIAS = { US: "usa", CZ: "czechia", MM: "myanmar-burma", CD: "democratic-republic-of-the-congo", CG: "congo", CI: "cote-d-ivoire", TL: "timor-leste", SZ: "eswatini", CN: "china", NL: "netherlands", MK: "north-macedonia", KP: "north-korea", KR: "south-korea", RU: "russia", SY: "syria", LA: "laos", VN: "vietnam", IR: "iran", BN: "brunei", CV: "cape-verde", FM: "micronesia", VA: "the-holy-see", PS: "the-occupied-palestinian-territories", GB: "united-kingdom", MD: "moldova", TZ: "tanzania", BO: "bolivia", VE: "venezuela", GM: "the-gambia", BS: "bahamas", AE: "united-arab-emirates", KN: "st-kitts-and-nevis", LC: "st-lucia", VC: "st-vincent-and-the-grenadines", ST: "sao-tome-and-principe" };

async function fcdo() {
  const index = await getJson("https://www.gov.uk/api/content/foreign-travel-advice");
  const slugs = new Map((index?.links?.children ?? []).map((c) => [c.base_path.split("/").pop(), c.title]));
  const byName = new Map([...slugs].map(([slug, title]) => [fold(title.replace(/ travel advice$/, "")), slug]));
  let ok = 0, missing = [];
  for (const c of countries) {
    const file = RAW + `fcdo/${c.iso}.json`;
    if (existsSync(file)) { ok++; continue; }
    const slug = FCDO_ALIAS[c.iso] && slugs.has(FCDO_ALIAS[c.iso]) ? FCDO_ALIAS[c.iso] : byName.get(fold(c.name.en)) ?? [...slugs.keys()].find((s) => fold(s.replace(/-/g, " ")) === fold(c.name.en));
    if (!slug) { missing.push(c.iso + " " + c.name.en); continue; }
    const d = await getJson(`https://www.gov.uk/api/content/foreign-travel-advice/${slug}`);
    if (!d) { missing.push(c.iso + " (fetch) " + slug); continue; }
    const parts = (d.details?.parts ?? []).map((p) => ({ slug: p.slug, title: p.title, text: text(p.body ?? "") }));
    writeFileSync(file, JSON.stringify({ iso: c.iso, slug, url: `https://www.gov.uk/foreign-travel-advice/${slug}`, title: d.title, updated: d.public_updated_at, reviewed: d.details?.reviewed_at, alert: d.details?.alert_status ?? [], parts }));
    ok++;
    await sleep(400);
  }
  console.log(`fcdo: ${ok} countries; no advice page for: ${missing.join(", ") || "none"}`);
}

// Countries whose Wikidata item has no Wikivoyage sitelink of that name.
const WV_ALIAS = { NL: "Netherlands" };
const WV_SECTIONS = ["Understand", "Talk", "Get in", "Get around", "Buy", "Eat", "Drink", "Stay safe", "Stay healthy", "Respect", "Connect", "Cope"];
async function wikivoyage() {
  // The article title of each country comes from its Wikidata sitelink.
  const titles = new Map();
  for (let i = 0; i < countries.length; i += 50) {
    const batch = countries.slice(i, i + 50);
    const j = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&sitefilter=enwikivoyage&ids=${batch.map((c) => c.wikidata).join("|")}`);
    for (const c of batch) { const t = j?.entities?.[c.wikidata]?.sitelinks?.enwikivoyage?.title; if (t) titles.set(c.iso, t); }
    await sleep(500);
  }
  let ok = 0, missing = [];
  for (const c of countries) {
    const file = RAW + `wikivoyage/${c.iso}.json`;
    if (existsSync(file)) { ok++; continue; }
    const title = titles.get(c.iso) ?? WV_ALIAS[c.iso];
    if (!title) { missing.push(c.iso + " " + c.name.en); continue; }
    const j = await getJson(`https://en.wikivoyage.org/w/api.php?action=query&format=json&prop=extracts|revisions&explaintext=1&rvprop=ids|timestamp&titles=${encodeURIComponent(title)}&redirects=1`);
    const page = Object.values(j?.query?.pages ?? {})[0];
    if (!page?.extract) { missing.push(c.iso + " (empty) " + title); continue; }
    // Split the article on its "== Section ==" headings (level 2 only) and keep the sections a traveler needs.
    const parts = page.extract.split(/\n(?===\s[^=])/);
    const sections = {};
    for (const p of parts) {
      const m = p.match(/^==\s*(.+?)\s*==\s*\n?([\s\S]*)$/);
      if (m && WV_SECTIONS.includes(m[1])) sections[m[1]] = m[2].replace(/\n={3,}[^\n]*={3,}\n/g, "\n").trim();
    }
    writeFileSync(file, JSON.stringify({ iso: c.iso, title, url: "https://en.wikivoyage.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_")), revision: page.revisions?.[0]?.timestamp, sections }));
    ok++;
    await sleep(500);
  }
  console.log(`wikivoyage: ${ok} countries; none for: ${missing.join(", ") || "none"}`);
}

// ---- phrasebooks: the main language of each country, from its Wikidata official-language statement ----
async function phrasebook() {
  mkdirSync(RAW + "phrasebook", { recursive: true });
  let ok = 0, none = [];
  for (let i = 0; i < countries.length; i += 50) {
    const batch = countries.slice(i, i + 50);
    const j = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${batch.map((c) => c.wikidata).join("|")}`);
    const langIds = new Map();
    for (const c of batch) langIds.set(c.iso, (j?.entities?.[c.wikidata]?.claims?.P37 ?? []).map((x) => x.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0, 3));
    const all = [...new Set([...langIds.values()].flat())];
    const labels = new Map();
    for (let k = 0; k < all.length; k += 50) {
      const l = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=${all.slice(k, k + 50).join("|")}`);
      for (const id of all.slice(k, k + 50)) labels.set(id, l?.entities?.[id]?.labels?.en?.value);
    }
    for (const c of batch) {
      const file = RAW + `phrasebook/${c.iso}.json`;
      if (existsSync(file)) { ok++; continue; }
      const found = [];
      for (const id of langIds.get(c.iso)) {
        const label = labels.get(id);
        if (!label) continue;
        const title = `${label} phrasebook`;
        const r = await getJson(`https://en.wikivoyage.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&exchars=9000&titles=${encodeURIComponent(title)}&redirects=1`);
        const page = Object.values(r?.query?.pages ?? {})[0];
        if (page?.extract && page.extract.length > 400) found.push({ language: label, title: page.title, url: "https://en.wikivoyage.org/wiki/" + encodeURIComponent(page.title.replace(/ /g, "_")), text: page.extract });
        await sleep(400);
      }
      if (found.length) { writeFileSync(file, JSON.stringify({ iso: c.iso, phrasebooks: found })); ok++; } else none.push(c.iso);
    }
  }
  console.log(`phrasebook: ${ok} countries; none for ${none.length}: ${none.join(", ")}`);
}

// ---- verify: a fact stays only if its quote is in the source text it names ----
const squash = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const TOPICS = ["entry", "safety", "health", "help", "getting_in", "getting_around", "money", "etiquette", "connectivity", "phrases"];
function verify() {
  mkdirSync(ROOT + "data/guide", { recursive: true });
  const stats = { countries: 0, facts: 0, rejected: 0, noQuote: 0 };
  const rejects = [];
  for (const c of countries) {
    const out = RAW + `out/${c.iso}.json`;
    if (!existsSync(out)) continue;
    const given = JSON.parse(readFileSync(out, "utf8"));
    const fc = existsSync(RAW + `fcdo/${c.iso}.json`) ? JSON.parse(readFileSync(RAW + `fcdo/${c.iso}.json`, "utf8")) : null;
    const wv = existsSync(RAW + `wikivoyage/${c.iso}.json`) ? JSON.parse(readFileSync(RAW + `wikivoyage/${c.iso}.json`, "utf8")) : null;
    const pb = existsSync(RAW + `phrasebook/${c.iso}.json`) ? JSON.parse(readFileSync(RAW + `phrasebook/${c.iso}.json`, "utf8")) : null;
    const haystack = {
      fcdo: squash((fc?.parts ?? []).map((p) => p.text).join(" ")),
      wikivoyage: squash(Object.values(wv?.sections ?? {}).join(" ")),
      phrasebook: squash((pb?.phrasebooks ?? []).map((p) => p.text).join(" ")),
    };
    const topics = {};
    for (const t of TOPICS) {
      const kept = [];
      for (const f of given.topics?.[t] ?? []) {
        stats.facts++;
        const q = squash(String(f.quote ?? ""));
        if (!f.en || !f.es || q.length < 20) { stats.noQuote++; stats.rejected++; continue; }
        if (!haystack[f.source]?.includes(q)) { stats.rejected++; rejects.push(`${c.iso} ${t}: ${String(f.quote).slice(0, 80)}`); continue; }
        kept.push({ en: String(f.en).trim(), es: String(f.es).trim(), quote: String(f.quote).trim().slice(0, 400), source: f.source, ...(f.local ? { local: String(f.local) } : {}), ...(f.say ? { say: String(f.say) } : {}) });
      }
      if (kept.length) topics[t] = kept;
    }
    const sources = {};
    if (fc) sources.fcdo = { title: "UK Government foreign travel advice (Open Government Licence v3.0)", url: fc.url, updated: fc.updated, license: "OGL v3.0" };
    if (wv) sources.wikivoyage = { title: "Wikivoyage contributors (CC BY-SA 4.0)", url: wv.url, revision: wv.revision, license: "CC BY-SA 4.0" };
    if (pb) sources.phrasebook = { title: "Wikivoyage phrasebook (CC BY-SA 4.0)", url: pb.phrasebooks[0].url, license: "CC BY-SA 4.0" };
    writeFileSync(ROOT + `data/guide/${c.iso}.json`, JSON.stringify({ country: c.iso, retrieved: new Date().toISOString().slice(0, 10), alert: fc?.alert ?? [], sources, topics }, null, 1) + "\n");
    stats.countries++;
  }
  console.log(stats);
  if (rejects.length) console.log("rejected quotes (first 15):\n" + rejects.slice(0, 15).join("\n"));
}

const stage = process.argv[2];
if (stage === "verify") verify();
else if (stage === "phrasebook") await phrasebook();
else if (stage === "fetch") { await fcdo(); await wikivoyage(); }
else if (stage === "fcdo") await fcdo();
else if (stage === "wikivoyage") await wikivoyage();
else console.log("stages: fetch batches verify");
