// Validates every committed pack against its committed source text, with no network
// and no raw downloads. This is the check CI runs. Exits 1 on any failure.
// Run: npm run validate-packs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validatePack } from "../src/packs/validate.ts";
import { PACK_REFERENCE_DATE, MAX_VERIFIED_AGE_DAYS } from "./config.ts";

const ROOT = join(import.meta.dirname, "..");
const files = readdirSync(join(ROOT, "packs")).filter((f) => /^[A-Z]{2}\.json$/.test(f));
let failed = 0;
for (const file of files) {
  const iso = file.slice(0, 2);
  const pack = JSON.parse(readFileSync(join(ROOT, "packs", file), "utf8"));
  const texts = JSON.parse(readFileSync(join(ROOT, "data/sources-text", `${iso}.json`), "utf8"));
  const res = validatePack(pack, texts, { referenceDate: PACK_REFERENCE_DATE, maxAgeDays: MAX_VERIFIED_AGE_DAYS });
  if (!res.ok) {
    failed++;
    console.error(`FAIL ${iso}: ${res.issues.map((i) => `${i.rule ? `${i.rule}: ` : ""}${i.message}`).join("; ")}`);
  } else {
    console.log(`ok   ${iso} (${pack.localRules.length} rules, tier ${pack.tier}, review ${pack.review.status})`);
  }
}
console.log(`${files.length - failed}/${files.length} packs valid`);
process.exit(failed ? 1 : 0);
