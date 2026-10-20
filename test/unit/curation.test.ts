import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { HighlightPack } from "../../src/services/highlights.ts";

// A curated place must be a place Wikidata already lists for that country. Curation may
// select, rename and describe, but it may not add a place that is not in the ranked list.
const root = join(import.meta.dirname, "../..");

test("every curated place exists in the Wikidata list for its country", () => {
  for (const f of readdirSync(join(root, "data/highlights"))) {
    if (!/^[A-Z]{2}\.json$/.test(f)) continue;
    const iso = f.slice(0, 2);
    const worldFile = join(root, "data/world/highlights", f);
    const pack = HighlightPack.parse(JSON.parse(readFileSync(join(root, "data/highlights", f), "utf8")));
    if (!existsSync(worldFile)) continue; // hand-curated countries with no Wikidata list
    const world = HighlightPack.parse(JSON.parse(readFileSync(worldFile, "utf8")));
    const worldIds = new Set(world.places.map((p) => p.id));
    for (const p of pack.places) {
      if (/^[a-z]{2}-q\d+$/.test(p.id)) assert.ok(worldIds.has(p.id), `${iso}: ${p.id} is not in the Wikidata list`);
    }
  }
});

test("curated descriptions are present in both languages", () => {
  for (const f of readdirSync(join(root, "data/highlights"))) {
    if (!/^[A-Z]{2}\.json$/.test(f)) continue;
    const pack = HighlightPack.parse(JSON.parse(readFileSync(join(root, "data/highlights", f), "utf8")));
    for (const p of pack.places) {
      assert.ok(p.desc.en.length > 5 && p.desc.es.length > 5, `${f}: ${p.id} needs both descriptions`);
    }
  }
});

// Tokyo is big: each of its places says which part (east, center, west) so a day plan can stay in one part.
test("every Tokyo place in the Japan list has a part of the city", () => {
  const pack = HighlightPack.parse(JSON.parse(readFileSync(join(root, "data/highlights", "JP.json"), "utf8")));
  const tokyo = pack.places.filter((p) => p.city === "Tokyo");
  assert.ok(tokyo.length >= 24, "enough places for a week and more in Tokyo");
  for (const p of tokyo) assert.ok(["east", "center", "west"].includes(p.zone ?? ""), `${p.id} has no zone`);
  assert.equal(new Set(pack.places.map((p) => p.id)).size, pack.places.length, "no repeated ids");
});
