import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { firstSentence } from "../../scripts/apply-grounding.ts";
import { HighlightPack } from "../../src/services/highlights.ts";

const root = join(import.meta.dirname, "../..");

test("first sentence: stops at the first full stop and keeps abbreviations of one sentence", () => {
  assert.equal(firstSentence("The Pergamon Museum is a museum on Museum Island in Berlin. It has more rooms."), "The Pergamon Museum is a museum on Museum Island in Berlin.");
  assert.equal(firstSentence("   Short text without a stop   "), "Short text without a stop");
  const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ") + ".";
  assert.equal(firstSentence(long).split(" ").length, 30);
});

test("every place described from Wikipedia links to its article, and every place has text in both languages", () => {
  const curated = join(root, "highlights");
  if (!existsSync(curated)) return;
  for (const f of readdirSync(curated)) {
    if (!/^[A-Z]{2}\.json$/.test(f)) continue;
    const pack = HighlightPack.parse(JSON.parse(readFileSync(join(curated, f), "utf8")));
    for (const p of pack.places) {
      assert.ok(p.desc.en.length > 5 && p.desc.es.length > 5, `${f}: ${p.id} needs both descriptions`);
      if (p.descBy?.en === "wikipedia") assert.ok(p.ground?.en?.url, `${f}: ${p.id} says Wikipedia but has no article link`);
      if (p.descBy?.es === "wikipedia") assert.ok(p.ground?.es?.url, `${f}: ${p.id} says Wikipedia (es) but has no article link`);
    }
  }
});

test("the Wikipedia attribution is listed as a source wherever a place uses it", () => {
  for (const f of readdirSync(join(root, "highlights"))) {
    if (!/^[A-Z]{2}\.json$/.test(f)) continue;
    const pack = HighlightPack.parse(JSON.parse(readFileSync(join(root, "highlights", f), "utf8")));
    if (pack.places.some((p) => p.ground)) assert.ok(pack.sources.wikipedia, `${f} uses Wikipedia without the attribution`);
  }
});
