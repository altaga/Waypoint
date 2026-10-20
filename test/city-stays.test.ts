import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadWorld } from "../src/services/world.ts";
import { STYLES } from "../src/pace.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const world = loadWorld(root);

test("every city of the world list has a minimum stay at each pace, never under the pace's floor", () => {
  assert.ok(world.cities.length > 1000);
  for (const c of world.cities) {
    const row = world.stays.get(c.id);
    assert.ok(row, `${c.name.en} has no row in data/world/city-stays.json`);
    assert.equal(row.iso, c.iso);
    assert.ok(row.minDays.express >= STYLES.packed.floor, c.name.en);
    assert.ok(row.minDays.classic >= STYLES.balanced.floor, c.name.en);
    assert.ok(row.minDays.slow >= STYLES.relaxed.floor, c.name.en);
  }
});

test("a bigger city needs at least as many days as a small one at the same pace", () => {
  const big = [...world.cities].sort((a, b) => b.population - a.population)[0];
  const small = [...world.cities].sort((a, b) => a.population - b.population)[0];
  for (const k of ["express", "classic", "slow"] as const) assert.ok(world.stays.get(big.id)!.minDays[k] >= world.stays.get(small.id)!.minDays[k]);
});

test("the table says how it was made and that it is an estimate", () => {
  const raw = JSON.parse(readFileSync(root + "data/world/city-stays.json", "utf8"));
  assert.match(raw.note, /estimate/i);
  for (const r of Object.values(raw.cities) as any[]) assert.ok(r.basis === "places" || r.basis === "population");
});
