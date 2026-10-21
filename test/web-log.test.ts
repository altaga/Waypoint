import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOL_COLOR, colorFor, describeEntry, inkOn, toolColor } from "../web/tool-color.js";

const TOOLS = [
  "get_traveler_profile", "update_traveler_profile", "plan_trip", "check_entry_requirements",
  "get_local_rules", "get_destination_essentials", "convert_budget", "packing_checklist",
  "get_highlights", "get_travel_guide", "get_trip_calendar", "set_trip_constraints",
  "build_itinerary", "get_payment_methods", "get_local_apps", "get_transit_payment",
  "get_what_works", "get_trip_climate", "trip_brief", "log_expense", "add_booking",
  "confirm_booking", "settle_up", "plan_fairness", "export_trip", "forget_me",
];

function lin(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function contrast(a: string, b: string) {
  const hi = Math.max(lum(a), lum(b));
  const lo = Math.min(lum(a), lum(b));
  return (hi + 0.05) / (lo + 0.05);
}

test("every tool has its own color, light enough to read on the device card", () => {
  assert.deepEqual(Object.keys(TOOL_COLOR).sort(), [...TOOLS].sort());
  const colors = Object.values(TOOL_COLOR);
  assert.equal(new Set(colors).size, colors.length);
  for (const [name, color] of Object.entries(TOOL_COLOR)) {
    assert.ok(contrast(color, "#101114") >= 4.5, `${name} ${color} is too dim on the card`);
    assert.ok(contrast(inkOn(color), color) >= 4.5, `${name} ink fails on its own color`);
    const n = parseInt(color.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    assert.ok(h >= 28 && h <= 300, `${name} ${color} reads as an error red`);
  }
});

test("a tool call and its answer share that tool's color", () => {
  const pending = new Map();
  const call = describeEntry("→", { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "convert_budget", arguments: { amount: 1000 } } }, pending);
  assert.equal(call.kind, "call");
  assert.equal(call.tool, "convert_budget");
  assert.equal(colorFor(call), toolColor("convert_budget"));
  const answer = describeEntry("←", { jsonrpc: "2.0", id: 4, result: { content: [] } }, pending);
  assert.equal(answer.kind, "answer");
  assert.equal(answer.tool, "convert_budget");
  assert.equal(colorFor(answer), colorFor(call));
  assert.equal(pending.size, 0);
});

test("the brain request and a server-side tool call are labeled as calls", () => {
  const pending = new Map();
  const brain = describeEntry("→", { method: "POST /api/brain (Strands agent → MCP tools/call)", params: { utterance: "1000 dollars in yen" } }, pending);
  assert.equal(brain.key, "brain");
  assert.equal(brain.name, "POST /api/brain");
  assert.equal(colorFor(brain), "#ffe14a");
  const tool = describeEntry("⇄", { method: "tools/call convert_budget (server-side agent)", params: { amount: 1000 }, result: { isError: false } }, pending);
  assert.equal(tool.kind, "call");
  assert.equal(tool.tool, "convert_budget");
  const failed = describeEntry("⇄", { method: "tools/call plan_trip (server-side agent)", result: { isError: true } }, pending);
  assert.equal(failed.kind, "error");
  assert.equal(colorFor(failed), toolColor("plan_trip"));
});

test("a failed call with no tool is the error color, and session lines stay neutral", () => {
  const pending = new Map();
  const err = describeEntry("!", { error: { code: 0, message: "offline" } }, pending);
  assert.equal(err.kind, "error");
  assert.equal(colorFor(err), "#ff6961");
  const open = describeEntry("→", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, pending);
  assert.equal(open.kind, "call");
  assert.equal(colorFor(open), "#d1d1d6");
  const ready = describeEntry("←", { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-11-25" } }, pending);
  assert.equal(ready.name, "initialize");
  assert.equal(ready.kind, "answer");
});
