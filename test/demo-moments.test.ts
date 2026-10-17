import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";

// The four demonstration moments, run against the real MCP server in memory. Fictional travelers only.
// Moment 2 (the Autopilot) runs in the browser; its tool sequence is covered by test/web-mission.test.ts.
const store = createMemoryStore();
const ctx = createContext({ offline: true, store, clock: () => new Date("2026-10-17T12:00:00Z") });

async function session(user: string, locale = "en-US") {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createWaypointMcpServer(ctx, user, locale).connect(s);
  const client = new Client({ name: "demo", version: "1" });
  await client.connect(c);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent: any; content: { text: string }[] };
    assert.ok(!r.isError, `${name} failed: ${r.content?.[0]?.text}`);
    return r.structuredContent;
  };
  // Raw call for the case where an error is the expected answer (a user with no trip).
  const raw = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
  return { call, raw, close: () => client.close() };
}

test("moment 1: two travelers with different passports get their own entry answer, and a missing passport is named", async () => {
  const s = await session("demo-m1");
  await s.call("update_traveler_profile", {
    homeCurrency: "USD",
    travelers: [
      { displayName: "Ana", passports: ["MX"], role: "self", ageBand: "adult" },
      { displayName: "Ravi", passports: ["IN"], role: "partner", ageBand: "adult" },
      { displayName: "Lea", passports: ["DE", "US"], role: "friend", ageBand: "adult" },
    ],
  });
  const entry = await s.call("check_entry_requirements", { destination: "JP" });
  const byName = Object.fromEntries((entry.data.results as { traveler: string; status: string }[]).map((r) => [r.traveler, r.status]));
  assert.equal(byName.Ana, "visa_free");
  assert.equal(byName.Ravi, "e_visa", "Ravi's Indian passport needs an e-visa, so the answer differs from Ana's");
  assert.equal(byName.Lea, "visa_free");
  assert.match(entry.voice, /Ravi needs an e-visa/);

  await s.call("update_traveler_profile", { travelers: [{ displayName: "Tom", role: "friend", ageBand: "adult" }] });
  const missing = await s.call("check_entry_requirements", { destination: "JP" });
  assert.ok(missing.missingFields?.includes("passport:Tom"), "a traveler with no passport is named, not guessed");
  await s.close();
});

test("moment 3: an answer carries its sources, dates and confidence, and a curated pack says it was not reviewed by a person", async () => {
  const s = await session("demo-m3");
  await s.call("update_traveler_profile", { travelers: [{ displayName: "Ana", passports: ["MX"], role: "self", ageBand: "adult" }] });
  const entry = await s.call("check_entry_requirements", { destination: "JP" });
  assert.ok(entry.sources.length >= 1, "the entry answer cites its sources");
  assert.ok(entry.sources.every((x: { url: string; license: string }) => x.url.startsWith("https://") && typeof x.license === "string"));
  assert.ok(entry.lastVerified, "the answer says when its data was dated");
  assert.ok(["low", "medium", "high"].includes(entry.confidence), "the answer says how confident it is");

  const rules = await s.call("get_local_rules", { destination: "JP" });
  assert.equal(rules.review, "curated", "Japan's pack is compiled by us and has no human sign-off yet");

  const highlights = await s.call("get_highlights", { destination: "JP", limit: 3 });
  assert.match(highlights.card.subtitle, /not reviewed by a person/, "the highlight list does not pass as human-reviewed");

  const reported = await s.call("get_payment_methods", { destination: "AF" });
  assert.equal(reported.data.tier, "reportado");
  assert.equal(reported.confidence, "low", "a reported answer is never presented with high confidence");
  await s.close();
});

test("moment 4: a new session restores the trip, the travelers and the outstanding tasks without re-entry", async () => {
  const first = await session("demo-m4");
  await first.call("update_traveler_profile", {
    homeCurrency: "USD",
    travelers: [
      { displayName: "Ana", passports: ["MX"], role: "self", ageBand: "adult" },
      { displayName: "Ravi", passports: ["IN"], role: "partner", ageBand: "adult" },
    ],
  });
  await first.call("plan_trip", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  await first.call("add_booking", { kind: "hotel", title: "Hotel Shinjuku", date: "2026-12-03", cancelBy: "2026-11-28", status: "to_confirm" });
  await first.close();

  // A second conversation: a new server instance, same user, same store.
  const second = await session("demo-m4");
  const brief = await second.call("trip_brief", {});
  const text = JSON.stringify(brief);
  assert.match(text, /JP/, "the destination is restored");
  assert.match(text, /Ravi/, "the travelers are restored");
  assert.match(text, /e-Visa/i, "Ravi's outstanding entry task is listed");
  assert.match(text, /Hotel Shinjuku/, "the booking that still needs confirming is listed");
  await second.close();

  const stranger = await session("demo-m4-other");
  const none = JSON.stringify(await stranger.raw("trip_brief", {}));
  assert.doesNotMatch(none, /Hotel Shinjuku/, "another user sees nothing from this trip");
  await stranger.close();
});
