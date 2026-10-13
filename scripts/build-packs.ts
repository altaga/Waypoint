// Builds country packs from cached official sources (context doc §4.7, offline
// deterministic path). Each local rule carries a verbatim quote from a cited
// source; packs that fail validation are not written.
//
// Curation overlay: when data/curation/XX.json exists, its rules (bilingual
// summaries paraphrased from verbatim quotes), essentials and review block replace
// the machine-extracted ones, so a rebuild keeps the curation. Curated quotes are
// still checked verbatim against the freshly built source text; if a source page
// changed and a quote is gone, the pack fails validation and must be re-curated.
//
// Bedrock extraction (Strands + Converse) is documented in docs/AWS.md and is not
// run here because the build environment has no AWS access. Packs produced by this
// script are tier B and stay machine_extracted until a human reviewer signs off.
//
// Run: npm run build-packs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TIER_A_DESTINATIONS, PACK_REFERENCE_DATE, MAX_VERIFIED_AGE_DAYS } from "./config.ts";
import { countryName, currencyOf } from "../src/countries.ts";
import { htmlToText, sentences } from "../src/packs/text.ts";
import { validatePack } from "../src/packs/validate.ts";
import { DISCLAIMER, type Rule, type RuleCategory } from "../src/packs/schema.ts";
import { countries as countryData } from "countries-list";

const ROOT = join(import.meta.dirname, "..");
const MAX_RULES = 16;

// The State Dept feeds key countries by FIPS 10-4 codes, not ISO 3166 ("KR" there is
// Kiribati, "CN" Comoros, "ES" El Salvador, "SG" Senegal). Codes not listed match ISO.
const STATE_CODE: Record<string, string> = { JP: "JA", SG: "SN", VN: "VM", KR: "KS", CN: "CH", TR: "TU", ES: "SP" };
const stateCode = (iso: string) => STATE_CODE[iso] ?? iso;

// Wikidata plug standard names to IEC 60083 letters.
const PLUG_LETTER: Record<string, string> = {
  "NEMA 1-15": "A", "NEMA 5-15": "B", Europlug: "C", "Type D": "D", "Type E": "E", Schuko: "F",
  "BS 1363": "G", "Type H": "H", "AS/NZS 3112": "I", "Type J": "J", "Type K": "K", "Type L": "L",
  "Type M": "M", "Type N": "N",
};

interface CurationRule {
  id: string;
  category: RuleCategory;
  severity: Rule["severity"];
  summary: { en: string; es: string };
  items?: string[];
  quote: string;
  sources: string[];
}
interface Curation {
  country: string;
  review: { reviewedBy: string; reviewedAt: string; note: string };
  essentials: {
    plugTypes: string[];
    emergency: Record<string, string>;
    languages: string[];
    languageNames: { en: string[]; es: string[] };
  };
  rules: CurationRule[];
}

const CATEGORY_PATTERNS: [RuleCategory, RegExp][] = [
  ["drugs", /narcotic|cannabis|marijuana|\bdrugs?\b|controlled substance/i],
  ["medications", /medicine|medication|prescription|pseudoephedrine|painkiller/i],
  [
    "prohibited_items",
    /(vape|e-cigarette|chewing gum|firearm|weapon)|((import|bring|carry|take|pack|sell)\w*[^.]*(prohibit|banned|illegal|not allowed|forbidden|restricted))|((prohibit|banned|illegal|forbidden)[^.]*(import|bring|carry|sell|possess))/i,
  ],
  ["lgbtq", /lgbt|same-sex|transgender/i],
  ["alcohol", /alcohol|liquor/i],
  ["photography", /photograph|drone|filming/i],
  ["dress", /dress|clothing|attire|modest/i],
  ["driving", /driving licen|drink[- ]driving|driving permit/i],
  ["conduct", /offen[cs]e|insult|disrespect|protest|public display/i],
];

const SIGNAL = /prohibit|banned|illegal|not allowed|forbidden|restricted|penalt|fines?\b|imprison|arrest|jail|death penalty|confiscat|must not|offen[cs]e|prescription/i;

function categorize(sentence: string): RuleCategory | null {
  if (!SIGNAL.test(sentence)) return null;
  for (const [cat, re] of CATEGORY_PATTERNS) if (re.test(sentence)) return cat;
  return null;
}

function categorizeItem(item: string): RuleCategory | null {
  for (const [cat, re] of CATEGORY_PATTERNS) if (re.test(item)) return cat;
  return null;
}

function severityOf(sentence: string): Rule["severity"] {
  if (/death penalty|executed|capital punishment/i.test(sentence)) return "severe";
  if (/arrest|imprison|jail|prison|criminal/i.test(sentence)) return "arrest";
  if (/fine|penalt/i.test(sentence)) return "fine";
  return "info";
}

const SEVERITY_RANK = { severe: 0, arrest: 1, fine: 2, info: 3 } as const;

async function readJson<T = any>(rel: string): Promise<T> {
  return JSON.parse(await readFile(join(ROOT, rel), "utf8"));
}

async function main() {
  const manifest = await readJson("data/raw/manifest.json");
  const stateCountries = await readJson("data/raw/state/CountryTravelInformation.json");
  const advisories = await readJson("data/raw/state/TravelAdvisories.json");
  const plugsFile = await readJson("data/vendor/wikidata-plugs-emergency.json").catch(() => null);
  const ppp = await readJson("data/vendor/ppp.json").catch(() => null);
  void ppp; // PPP is consumed by the runtime service; kept here to show lineage.

  await mkdir(join(ROOT, "packs"), { recursive: true });
  await mkdir(join(ROOT, "data/sources-text"), { recursive: true });
  const built: string[] = [];
  const failures: string[] = [];

  for (const dest of TIER_A_DESTINATIONS) {
    const iso = dest.iso;
    const sources: Record<string, { title: string; url: string; license: string; retrieved: string }> = {};
    const sourceTexts: Record<string, string> = {};
    const candidates: { sentence: string; sourceId: string; listItem?: boolean }[] = [];

    // FCDO (GOV.UK) pages
    if (dest.govuk) {
      for (const part of ["entry-requirements", "safety-and-security", "health"]) {
        const rel = `data/raw/gov-uk/${dest.govuk}.json`;
        let page: any;
        try {
          page = await readJson(rel);
        } catch {
          continue;
        }
        const p = page.details?.parts?.find((x: any) => x.slug === part);
        if (!p) continue;
        const id = `src:fcdo-${iso.toLowerCase()}-${part}`;
        const text = htmlToText(p.body);
        sourceTexts[id] = text;
        const url = `https://www.gov.uk/foreign-travel-advice/${dest.govuk}/${part}`;
        sources[id] = {
          title: `FCDO travel advice: ${countryName(iso)} - ${p.title}`,
          url,
          license: "OGL v3.0",
          retrieved: manifest[rel]?.retrieved ?? PACK_REFERENCE_DATE,
        };
        for (const s of sentences(text)) candidates.push({ sentence: s, sourceId: id });
        // Short list items under a prohibition heading (e.g. "chewing gum to sell").
        const lines = text.split("\n");
        lines.forEach((line, idx) => {
          if (line.length < 10 || line.length > 200) return;
          const context = lines.slice(Math.max(0, idx - 4), idx).join(" ");
          if (/prohibit|banned|illegal|not allowed|forbidden/i.test(context)) {
            candidates.push({ sentence: line, sourceId: id, listItem: true });
          }
        });
      }
    }

    // US State Dept country information
    const stateEntry = stateCountries.find((c: any) => c.tag === stateCode(iso));
    const adv = advisories.find((a: any) => (a.Category as string[]).includes(stateCode(iso)));
    if (stateEntry) {
      for (const field of ["local_laws_and_special_circumstances", "entry_exit_requirements", "health"]) {
        const id = `src:state-${iso.toLowerCase()}-${field.replace(/_/g, "-")}`;
        const text = htmlToText(stateEntry[field] ?? "");
        if (!text) continue;
        sourceTexts[id] = text;
        sources[id] = {
          title: `US State Dept: ${countryName(iso)} - ${field.replace(/_/g, " ")}`,
          url: adv?.Link ?? "https://travel.state.gov/",
          license: "US Government work (public domain)",
          retrieved: manifest["data/raw/state/CountryTravelInformation.json"]?.retrieved ?? PACK_REFERENCE_DATE,
        };
        for (const s of sentences(text)) candidates.push({ sentence: s, sourceId: id });
      }
    }

    // Rule selection: signal + category, de-duplicated, most severe first, max MAX_RULES.
    const seen = new Set<string>();
    const picked: { sentence: string; sourceId: string; category: RuleCategory }[] = [];
    for (const c of candidates) {
      const category = c.listItem ? categorizeItem(c.sentence) : categorize(c.sentence);
      if (!category) continue;
      const key = c.sentence.toLowerCase().replace(/\s+([.,;:])/g, "$1").replace(/\s+/g, " ");
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push({ ...c, category });
    }
    picked.sort((a, b) => SEVERITY_RANK[severityOf(a.sentence)] - SEVERITY_RANK[severityOf(b.sentence)]);
    const perCategory = new Map<RuleCategory, number>();
    const diverse = picked.filter((p) => {
      const n = perCategory.get(p.category) ?? 0;
      perCategory.set(p.category, n + 1);
      return n < 4;
    });
    let rules: Rule[] = diverse.slice(0, MAX_RULES).map((p, i) => ({
      id: `${iso.toLowerCase()}-${p.category.replace(/_/g, "-")}-${i + 1}`,
      category: p.category,
      severity: severityOf(p.sentence),
      summary: { en: p.sentence },
      quote: p.sentence,
      sources: [p.sourceId],
      lastVerified: sources[p.sourceId].retrieved,
      confidence: "medium",
    }));

    const c = countryData[iso as keyof typeof countryData];
    const plugs = [
      ...new Set<string>(plugsFile?.plugs.filter((x: any) => x.iso2 === iso).map((x: any) => PLUG_LETTER[x.plug]).filter(Boolean) ?? []),
    ].sort();
    // Wikidata often gives an entity URL instead of a number; keep only dialable numbers.
    const emergency: Record<string, string> = {};
    for (const e of plugsFile?.emergency.filter((x: any) => x.iso2 === iso) ?? []) {
      if (/^\d{2,4}$/.test(String(e.number))) emergency[`number${Object.keys(emergency).length + 1}`] = e.number;
    }
    let essentials: Record<string, unknown> = {
      currency: currencyOf(iso),
      plugTypes: plugs,
      emergency,
      languages: (c?.languages ?? []) as string[],
    };
    let review: Record<string, unknown> = { status: "machine_extracted", reviewedBy: null, reviewedAt: null };

    const curation = await readJson<Curation>(`data/curation/${iso}.json`).catch((e) => {
      if (e?.code === "ENOENT") return null;
      throw e;
    });
    if (curation) {
      const missing = curation.rules.flatMap((r) => r.sources.filter((id) => !sources[id]).map((id) => `${r.id} -> ${id}`));
      if (missing.length) {
        failures.push(`${iso}: curation cites sources not in this build: ${missing.join(", ")}`);
        continue;
      }
      rules = curation.rules.map((r) => ({
        id: r.id,
        category: r.category,
        severity: r.severity,
        summary: { en: r.summary.en, es: r.summary.es },
        ...(r.items?.length ? { items: r.items } : {}),
        quote: r.quote,
        sources: r.sources,
        lastVerified: r.sources.map((id) => sources[id].retrieved).sort()[0],
        confidence: "high" as const,
      }));
      rules.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
      essentials = { currency: currencyOf(iso), ...curation.essentials };
      review = { status: "curated", ...curation.review };
    }
    const levelMatch = adv ? /Level (\d)/.exec(adv.Title) : null;

    const pack = {
      schemaVersion: "1.0.0" as const,
      country: iso,
      names: { en: countryName(iso), es: countryName(iso, "es") },
      generatedAt: PACK_REFERENCE_DATE,
      tier: "B" as const,
      review,
      localRules: rules,
      essentials,
      advisory: levelMatch && adv
        ? { us: { level: Number(levelMatch[1]), title: adv.Title, date: String(adv.Updated).slice(0, 10) } }
        : {},
      sources,
      disclaimer: DISCLAIMER,
    };

    const result = validatePack(pack, sourceTexts, {
      referenceDate: PACK_REFERENCE_DATE,
      maxAgeDays: MAX_VERIFIED_AGE_DAYS,
    });
    if (!result.ok) {
      failures.push(`${iso}: ${result.issues.map((i) => i.message).join("; ")}`);
      continue;
    }
    await writeFile(join(ROOT, `packs/${iso}.json`), JSON.stringify(pack, null, 2) + "\n");
    await writeFile(join(ROOT, `data/sources-text/${iso}.json`), JSON.stringify(sourceTexts, null, 2) + "\n");
    built.push(`${iso} (${rules.length} rules${curation ? ", curated" : ""})`);
  }

  await writeFile(
    join(ROOT, "packs/index.json"),
    JSON.stringify({ generatedAt: PACK_REFERENCE_DATE, countries: built }, null, 2) + "\n",
  );
  console.log(`built: ${built.join(", ")}`);
  if (failures.length) {
    console.error(`validation failed:\n${failures.join("\n")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
