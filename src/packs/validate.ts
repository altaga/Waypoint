import { Pack, type Rule } from "./schema.ts";
import { normalizeForMatch } from "./text.ts";

export interface ValidationIssue {
  rule?: string;
  message: string;
}

/**
 * Validates a pack against its cached source texts (context doc §4.5):
 * schema, literal quotes, referenced sources exist, and lastVerified is at most
 * `maxAgeDays` old. Tier A packs must have a named human reviewer.
 */
export function validatePack(
  input: unknown,
  sourceTexts: Record<string, string>,
  opts: { referenceDate: string; maxAgeDays: number },
): { ok: boolean; issues: ValidationIssue[]; pack?: Pack } {
  const parsed = Pack.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ message: `${i.path.join(".")}: ${i.message}` })),
    };
  }
  const pack = parsed.data;
  const issues: ValidationIssue[] = [];

  if (pack.tier === "A" && (pack.review.status !== "human_reviewed" || !pack.review.reviewedBy)) {
    issues.push({ message: "tier A requires a human review with reviewedBy" });
  }

  if (pack.review.status === "curated") checkCurated(pack, issues);

  const refMs = Date.parse(opts.referenceDate);
  const ageDays = (iso: string) => (refMs - Date.parse(iso)) / 86_400_000;

  for (const rule of pack.localRules) {
    checkRule(rule, pack, sourceTexts, issues);
    if (ageDays(rule.lastVerified) > opts.maxAgeDays) {
      issues.push({ rule: rule.id, message: `lastVerified is older than ${opts.maxAgeDays} days` });
    }
  }
  for (const [id, src] of Object.entries(pack.sources)) {
    if (ageDays(src.retrieved) > opts.maxAgeDays) {
      issues.push({ message: `source ${id} retrieved more than ${opts.maxAgeDays} days ago` });
    }
  }

  return { ok: issues.length === 0, issues, pack };
}

function checkRule(rule: Rule, pack: Pack, sourceTexts: Record<string, string>, issues: ValidationIssue[]) {
  for (const srcId of rule.sources) {
    if (!pack.sources[srcId]) {
      issues.push({ rule: rule.id, message: `unknown source ${srcId}` });
    }
  }
  const needle = normalizeForMatch(rule.quote);
  const found = rule.sources.some((id) => {
    const text = sourceTexts[id];
    return text !== undefined && normalizeForMatch(text).includes(needle);
  });
  if (!found) {
    issues.push({ rule: rule.id, message: "quote is not found verbatim in its cited source text" });
  }
}

/** Words a curated summary may not exceed (short enough to speak). */
export const MAX_SUMMARY_WORDS = 30;
// Summaries are for any foreign visitor, not for a single nationality.
const NATIONAL_ONLY = /\b(UK|British|England|GOV\.UK|FCDO|GHIC|EHIC)\b/;

/**
 * A curated pack is concierge-ready: every rule is bilingual, short and free of
 * UK-only wording, rule ids are unique, and the essentials are readable (dialable
 * emergency numbers, IEC plug letters, language names in both languages).
 */
function checkCurated(pack: Pack, issues: ValidationIssue[]) {
  if (!pack.review.reviewedBy || !pack.review.reviewedAt) {
    issues.push({ message: "curated packs need reviewedBy and reviewedAt" });
  }
  const ids = new Set<string>();
  const quotes = new Set<string>();
  for (const rule of pack.localRules) {
    if (ids.has(rule.id)) issues.push({ rule: rule.id, message: "duplicate rule id" });
    ids.add(rule.id);
    const q = normalizeForMatch(rule.quote);
    if (quotes.has(q)) issues.push({ rule: rule.id, message: "duplicate quote" });
    quotes.add(q);
    for (const lang of ["en", "es"] as const) {
      const text = rule.summary[lang];
      if (!text?.trim()) {
        issues.push({ rule: rule.id, message: `curated rule needs summary.${lang}` });
        continue;
      }
      const words = text.trim().split(/\s+/).length;
      if (words > MAX_SUMMARY_WORDS) issues.push({ rule: rule.id, message: `summary.${lang} has ${words} words (max ${MAX_SUMMARY_WORDS})` });
      if (NATIONAL_ONLY.test(text)) issues.push({ rule: rule.id, message: `summary.${lang} has UK-specific wording` });
    }
  }
  const { emergency, plugTypes, languages, languageNames } = pack.essentials;
  if (!Object.keys(emergency).length) issues.push({ message: "curated packs need emergency numbers" });
  for (const [service, number] of Object.entries(emergency)) {
    if (!/^\d{2,4}$/.test(number)) issues.push({ message: `emergency.${service} is not a dialable number: ${number}` });
  }
  if (!plugTypes.length) issues.push({ message: "curated packs need plug types" });
  for (const p of plugTypes) {
    if (!/^[A-O]$/.test(p)) issues.push({ message: `plug type is not an IEC letter: ${p}` });
  }
  if (!languageNames || languageNames.en.length !== languages.length || languageNames.es.length !== languages.length) {
    issues.push({ message: "curated packs need languageNames.en/es for every language code" });
  }
}
