#!/usr/bin/env -S npx tsx
// Validates pack JSON files against their cited source texts.
// Usage: travel-entry-packs <dir-with-packs> [--sources <dir>] [--reference-date YYYY-MM-DD]
// Each pack file XX.json needs sources/XX.json: a map of source id to plain text.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validatePack } from "../src/validate.ts";

const args = process.argv.slice(2);
const dir = resolve(args[0] ?? "examples");
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const sourcesDir = resolve(flag("--sources") ?? join(dir, "sources-text"));
const referenceDate = flag("--reference-date") ?? new Date().toISOString().slice(0, 10);

let failed = 0;
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && /^[A-Z]{2}\.json$/.test(f));
for (const file of files) {
  const pack = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const texts = JSON.parse(readFileSync(join(sourcesDir, file), "utf8"));
  const res = validatePack(pack, texts, { referenceDate, maxAgeDays: 90 });
  if (res.ok) console.log(`ok    ${file} (${pack.localRules.length} rules)`);
  else {
    failed++;
    console.log(`FAIL  ${file}`);
    for (const i of res.issues) console.log(`      ${i.rule ? `${i.rule}: ` : ""}${i.message}`);
  }
}
console.log(`${files.length - failed}/${files.length} packs valid (reference date ${referenceDate})`);
process.exit(failed || files.length === 0 ? 1 : 0);
