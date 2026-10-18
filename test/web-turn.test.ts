import { test } from "node:test";
import assert from "node:assert/strict";
import { freshCalls, callKey } from "../web/turn.js";
import { systemPrompt } from "../src/brain.ts";

// After the traveler changes topic, the screen does not draw the earlier topic's cards again.
test("a call repeated from an earlier turn is not fresh; a new one is", () => {
  const seen = new Set<string>();
  const first = freshCalls([{ tool: "get_local_rules", args: { destination: "SG" } }, { tool: "convert_budget", args: { amount: 1000, to: "JPY" } }], seen);
  assert.equal(first.length, 2);
  const second = freshCalls([
    { tool: "get_local_rules", args: { destination: "SG" } },
    { tool: "check_entry_requirements", args: { destination: "JP" } },
    { tool: "convert_budget", args: { to: "JPY", amount: 1000 } },
  ], seen);
  assert.deepEqual(second.map((c) => c.tool), ["check_entry_requirements"]);
});

test("the same tool with other arguments is a different call, and argument order does not matter", () => {
  assert.notEqual(callKey({ tool: "get_local_rules", args: { destination: "SG" } }), callKey({ tool: "get_local_rules", args: { destination: "JP" } }));
  assert.equal(callKey({ tool: "t", args: { a: 1, b: 2 } }), callKey({ tool: "t", args: { b: 2, a: 1 } }));
});

test("arguments that differ only deep inside are different calls", () => {
  const a = { tool: "build_itinerary", args: { plan: [{ day: 1, stops: ["a"] }] } };
  const b = { tool: "build_itinerary", args: { plan: [{ day: 1, stops: ["b"] }] } };
  assert.notEqual(callKey(a), callKey(b));
});

test("the concierge is told to leave an earlier topic when the traveler moves on", () => {
  const p = systemPrompt("2026-10-18", "en-US");
  assert.match(p, /changes topic or country/);
  assert.match(p, /do not call tools again for the earlier topic/);
  assert.match(p, /Never say you saved, checked or corrected something unless a tool result in this turn shows it/);
});
