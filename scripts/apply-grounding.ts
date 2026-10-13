// Applies data/grounding/places.json to the curated highlights. A description is replaced by
// the first sentence of the Wikipedia article in the same language, and the place keeps the
// article link (ground) so the source can be shown. Places without an article keep the curated
// text and are marked descBy: "curated". Run after scripts/build-grounding.mjs.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
type Article = { title: string; extract: string; url: string };
type GroundEntry = { placeId: string; en: Article | null; es: Article | null; retrieved: string };
const grounding: Record<string, GroundEntry> = JSON.parse(readFileSync(join(ROOT, "data/grounding/places.json"), "utf8"));
const WIKI_SOURCE = {
  title: "Wikipedia (text under CC BY-SA 4.0; each place links to its article)",
  url: "https://www.wikipedia.org/",
  license: "CC BY-SA 4.0",
  retrieved: new Date().toISOString().slice(0, 10),
};

// The first sentence, shortened to 30 words at most.
export function firstSentence(extract: string): string {
  const text = extract.replace(/\s+/g, " ").trim();
  const m = text.match(/^(.+?[.!?])(\s|$)/);
  const sentence = (m ? m[1] : text).trim();
  const words = sentence.split(" ");
  return words.length > 30 ? `${words.slice(0, 30).join(" ")}…` : sentence;
}

const grounded = { en: 0, es: 0 };
let total = 0;
export function applyAll(): void {
for (const f of readdirSync(join(ROOT, "highlights"))) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue;
  const path = join(ROOT, "highlights", f);
  const pack = JSON.parse(readFileSync(path, "utf8"));
  let touched = false;
  for (const p of pack.places) {
    total++;
    const m = /^[a-z]{2}-(q\d+)$/.exec(p.id);
    const g = m ? grounding[m[1].toUpperCase()] : null;
    if (!g) {
      p.descBy = { en: "curated", es: "curated" };
      touched = true;
      continue;
    }
    p.descBy = { en: "curated", es: "curated" };
    p.ground = { retrieved: g.retrieved };
    for (const lang of ["en", "es"] as const) {
      const art = g[lang];
      if (art && art.extract) {
        p.desc[lang] = firstSentence(art.extract);
        p.descBy[lang] = "wikipedia";
        p.ground[lang] = { title: art.title, url: art.url };
        grounded[lang]++;
      }
    }
    touched = true;
  }
  if (touched) {
    pack.sources = { ...pack.sources, wikipedia: WIKI_SOURCE };
    pack.review.note = "Places picked by Waypoint from the Wikidata list. Descriptions come from the first sentence of each place's Wikipedia article (descBy: wikipedia, with the article link in ground) and otherwise from Waypoint's own text (descBy: curated). Not checked against official tourism sites. Hours, prices and closures change: verify on the official source before you go.";
    writeFileSync(path, JSON.stringify(pack, null, 2) + "\n");
  }
}
console.log(`places: ${total}; English from Wikipedia: ${grounded.en}; Spanish from Wikipedia: ${grounded.es}`);
}
if (process.argv[1] && process.argv[1].endsWith("apply-grounding.ts")) applyAll();
