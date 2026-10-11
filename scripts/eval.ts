// Accuracy eval over a golden set of cited facts (context doc §5.8).
// Visa facts are checked against the vendored passport matrix; rule facts against
// the built packs. Exit code 1 when accuracy falls below the threshold.
// Run: npm run eval
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseVisaCsv, lookupVisa } from "../src/services/visa.ts";
import { loadPacks } from "../src/services/packs.ts";

const ROOT = join(import.meta.dirname, "..");
const THRESHOLD = 0.95;

interface Fact {
  id: string;
  type: "visa" | "rule";
  source: string;
  passport?: string;
  destination: string;
  expect?: { status: string; maxStayDays?: number };
  category?: string;
  quoteContains?: string;
}

const golden = JSON.parse(readFileSync(join(ROOT, "test/eval/golden.json"), "utf8")) as { facts: Fact[] };
const matrix = parseVisaCsv(readFileSync(join(ROOT, "data/vendor/passport-index/passport-index-tidy-iso2.csv"), "utf8"));
const packs = loadPacks(ROOT);

const failures: string[] = [];
for (const f of golden.facts) {
  if (f.type === "visa" && f.expect && f.passport) {
    const got = lookupVisa(matrix, f.passport, f.destination);
    const okStatus = got.status === f.expect.status;
    const okDays = f.expect.maxStayDays === undefined || got.maxStayDays === f.expect.maxStayDays;
    if (!(okStatus && okDays)) failures.push(`${f.id} ${f.passport}->${f.destination}: expected ${f.expect.status}${f.expect.maxStayDays ? ` ${f.expect.maxStayDays}d` : ""}, got ${got.status}${got.maxStayDays ? ` ${got.maxStayDays}d` : ""}`);
  }
  if (f.type === "rule") {
    const pack = packs.get(f.destination);
    const hit = pack?.localRules.some((r) => r.category === f.category && r.quote.includes(f.quoteContains ?? ""));
    if (!hit) failures.push(`${f.id} ${f.destination}: no ${f.category} rule quoting "${f.quoteContains}"`);
  }
}

const accuracy = (golden.facts.length - failures.length) / golden.facts.length;
console.log(`golden facts: ${golden.facts.length}`);
console.log(`correct: ${golden.facts.length - failures.length}`);
console.log(`accuracy: ${(accuracy * 100).toFixed(1)}% (threshold ${THRESHOLD * 100}%)`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(accuracy >= THRESHOLD ? 0 : 1);
