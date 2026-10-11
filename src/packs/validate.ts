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
