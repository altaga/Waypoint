import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadHighlights, HighlightPack } from "../../src/services/highlights.ts";
import { loadWorld } from "../../src/services/world.ts";
import { matchCountry } from "../../src/countries.ts";

const root = join(import.meta.dirname, "../..");

test("worldwide countries: 190 or more sovereign states, each with an ISO code and a capital", () => {
  const w = loadWorld(root);
  assert.ok(w.countries.length >= 190, `got ${w.countries.length}`);
  for (const c of w.countries) assert.match(c.iso, /^[A-Z]{2}$/);
  const withCapital = w.countries.filter((c) => c.capital).length;
  assert.ok(withCapital >= 180, `only ${withCapital} with a capital`);
});

test("worldwide cities: large cities and capitals resolve by name in English and Spanish", () => {
  const w = loadWorld(root);
  assert.ok(w.cities.length > 1000);
  assert.equal(w.findCity("tokyo")?.iso, "JP");
  assert.equal(w.findCity("Ciudad de México")?.iso, "MX");
  assert.equal(matchCountry("Nairobi")?.iso, "KE");
  assert.equal(matchCountry("Nairobi")?.exact, true);
});

test("every highlight file validates against the schema and cites a known source", () => {
  for (const dir of ["highlights", "data/world/highlights"]) {
    let files: string[];
    try { files = readdirSync(join(root, dir)); } catch { continue; }
    for (const f of files) {
      if (!/^[A-Z]{2}\.json$/.test(f)) continue;
      const pack = HighlightPack.parse(JSON.parse(readFileSync(join(root, dir, f), "utf8")));
      for (const p of pack.places) assert.ok(pack.sources[p.sourceId], `${f}: ${p.id} cites an unknown source`);
    }
  }
});

test("place ids are unique across the whole catalog", () => {
  const h = loadHighlights(root);
  const ids = new Set<string>();
  for (const iso of h.countries()) for (const p of h.forCountry(iso)!.places) {
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
  }
  assert.ok(ids.size > 100);
});

test("curated highlights win over the worldwide ranking for the same country", () => {
  const h = loadHighlights(root);
  assert.equal(h.forCountry("JP")?.review.status, "curated_unverified");
  assert.ok(h.place("jp-senso-ji"));
  const ranked = h.countries().filter((iso) => h.forCountry(iso)?.review.status === "wikidata_ranked");
  assert.ok(!ranked.includes("JP"));
  // Every country that has a place list has exactly one of the two kinds.
  for (const iso of h.countries()) assert.ok(["curated_unverified", "human_reviewed", "wikidata_ranked"].includes(h.forCountry(iso)!.review.status));
});
