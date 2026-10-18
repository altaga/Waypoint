import { test } from "node:test";
import assert from "node:assert/strict";
import { dayRanges } from "../web/cards.js";

test("free days are shown as ranges", () => {
  assert.equal(dayRanges([5, 6, 7, 8]), "5–8");
  assert.equal(dayRanges([2, 4, 5]), "2, 4–5");
  assert.equal(dayRanges([7]), "7");
  assert.equal(dayRanges([8, 6, 7]), "6–8");
});
