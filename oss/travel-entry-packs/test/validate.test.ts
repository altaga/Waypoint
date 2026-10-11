import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validatePack } from "../src/validate.ts";

const dir = join(import.meta.dirname, "..", "examples");
const load = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));

test("example packs validate against their sources", () => {
  for (const iso of ["SG", "JP"]) {
    const res = validatePack(load(`${iso}.json`), load(`sources-text/${iso}.json`), { referenceDate: "2026-10-11", maxAgeDays: 90 });
    assert.equal(res.ok, true, res.issues.map((i) => i.message).join("; "));
  }
});

test("a quote that is not in the source fails", () => {
  const pack = load("SG.json");
  pack.localRules[0].quote = "This quote is invented and not in the source text at all.";
  const res = validatePack(pack, load("sources-text/SG.json"), { referenceDate: "2026-10-11", maxAgeDays: 90 });
  assert.equal(res.ok, false);
});
