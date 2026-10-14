import { test } from "node:test";
import assert from "node:assert/strict";
import { genericCard } from "../web/cards.js";

// Long lists stay readable on the screen: eight rows, a count for the rest, and the full width.
test("a long list shows eight rows, a count for the rest, and spans the grid", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ label: `Item ${i}`, value: "x" }));
  const html = genericCard({ title: "List", rows }, {}, "en");
  assert.equal((html.match(/class="row /g) || []).length, 8);
  assert.match(html, /and 4 more/);
  assert.match(html, /class="card wide"/);
});

test("a short card keeps its place in the grid, and a long value is stacked under its label", () => {
  const html = genericCard({ title: "Short", rows: [{ label: "A", value: "B" }] }, {}, "es");
  assert.doesNotMatch(html, /card wide/);
  const long = genericCard({ title: "Long", rows: [{ label: "Desc", value: "x".repeat(60) }] }, {}, "es");
  assert.match(long, /class="row  long"|class="row long"/);
});
