import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";

// The concierge features the agent drives: a packing list that remembers what was packed,
// an itinerary the agent writes and the server keeps, and money said the way people say it.
const ctx = createContext({ offline: true, store: createMemoryStore(), clock: () => new Date("2026-10-13T12:00:00Z") });

async function session(user: string, locale = "es-MX") {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createWaypointMcpServer(ctx, user, locale).connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent: any; content: { text: string }[] };
    assert.ok(!r.isError, `${name} failed: ${r.content?.[0]?.text}`);
    return r.structuredContent;
  };
  return { call, close: () => client.close() };
}

async function withTrip(user: string, locale = "es-MX") {
  const s = await session(user, locale);
  await s.call("update_traveler_profile", { homeCurrency: "MXN", travelers: [{ displayName: "Victor", passports: ["MX"], role: "self", ageBand: "adult" }] });
  await s.call("plan_trip", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  return s;
}

test("packing: ticked items are remembered across sessions", async () => {
  const s1 = await withTrip("pack-user");
  const first = await s1.call("packing_checklist");
  assert.equal(first.data.packed, 0);
  assert.match(first.voice, /Tu lista tiene \d+ cosas y llevas 0/);
  const adapter = first.data.items.find((i: { id: string }) => i.id === "adapter");
  assert.ok(adapter, "a plug adapter is suggested for Japan");
  const after = await s1.call("packing_checklist", { markPacked: ["adapter", "zapatos"] });
  assert.equal(after.data.packed, 2);
  await s1.close();

  const s2 = await session("pack-user");
  const again = await s2.call("packing_checklist");
  assert.equal(again.data.packed, 2, "packed items survive a new session");
  const undone = await s2.call("packing_checklist", { unmarkPacked: ["adapter"] });
  assert.equal(undone.data.packed, 1);
  await s2.close();
});

test("packing: banned items are listed apart and never counted as packable", async () => {
  const s = await withTrip("pack-ban");
  const list = await s.call("packing_checklist", { markPacked: ["no-anything"] });
  const banned = list.data.items.filter((i: { group: string }) => i.group === "do-not-pack");
  assert.ok(list.data.total > 0);
  assert.equal(list.data.total, list.data.items.length - banned.length);
  await s.close();
});

test("itinerary: a plan made of catalog ids is saved, checked, and returned later", async () => {
  const s1 = await withTrip("plan-user");
  const empty = await s1.call("build_itinerary");
  assert.equal(empty.data.planned, 0);
  assert.equal(empty.data.days[0].date, "2026-12-03");

  // Ids come from get_highlights; an invented name is refused and nothing is saved.
  const hl = await s1.call("get_highlights", { destination: "JP", interests: ["temples"] });
  const ids = hl.data.places.map((p: { id: string }) => p.id);
  assert.ok(ids.includes("jp-senso-ji"), "the curated catalog lists Senso-ji for temples");
  const refused = await s1.call("build_itinerary", { plan: [{ day: 1, stops: ["jp-tokyo-tower-invented"] }] });
  assert.equal(refused.data.saved, false);
  assert.equal(refused.data.violations[0].code, "unknown_place");
  assert.equal((await s1.call("build_itinerary")).data.planned, 0, "a refused plan leaves nothing behind");

  const saved = await s1.call("build_itinerary", {
    plan: [
      { day: 1, title: "Asakusa", stops: ["jp-senso-ji", "jp-tsukiji-outer"] },
      { day: 2, title: "Tokio clásico", stops: ["jp-meiji-jingu"] },
      { day: 99, stops: ["jp-senso-ji"] },
    ],
  });
  assert.equal(saved.data.saved, false, "day 99 is outside the trip, so the whole plan waits for a fix");
  const fixed = await s1.call("build_itinerary", {
    plan: [
      { day: 1, title: "Asakusa", stops: ["jp-senso-ji", "jp-tsukiji-outer"] },
      { day: 2, title: "Tokio clásico", stops: ["jp-meiji-jingu"] },
    ],
  });
  assert.equal(fixed.data.saved, true);
  assert.equal(fixed.data.planned, 2);
  assert.match(fixed.voice, /Guardé el plan de 2 de 8 días/);
  await s1.close();

  const s2 = await session("plan-user");
  const day2 = await s2.call("build_itinerary", { day: 2 });
  assert.equal(day2.data.days.length, 1);
  assert.equal(day2.data.days[0].date, "2026-12-04");
  assert.equal(day2.data.days[0].stops[0].name, "Meiji Jingu");
  await s2.close();
});

test("constraints: an avoided interest blocks a plan, and the spending limit warns", async () => {
  const s = await withTrip("rules-plan");
  await s.call("set_trip_constraints", { avoid: ["nightlife"], maxBudget: { amount: 1000, currency: "MXN" } });
  const hl = await s.call("get_highlights", { destination: "JP" });
  assert.ok(hl.data.places.length > 0);
  const blocked = await s.call("build_itinerary", { plan: [{ day: 1, stops: ["jp-omoide-yokocho"] }] });
  assert.equal(blocked.data.saved, false);
  assert.equal(blocked.data.violations[0].code, "avoided_interest");

  const first = await s.call("log_expense", { amount: 600, currency: "MXN", category: "food" });
  assert.equal(first.data.overBudget, false);
  const second = await s.call("log_expense", { amount: 600, currency: "MXN", category: "taxi" });
  assert.equal(second.data.overBudget, true);
  assert.match(second.voice, /pasaste el tope/);
  await s.close();
});

test("budget: amounts are formatted for the locale, not raw floats", async () => {
  const s = await withTrip("money-user");
  const r = await s.call("convert_budget", { amount: 20000, from: "MXN", to: "JPY" });
  assert.doesNotMatch(r.voice, /\d{6,}\.\d/, "no raw float like 172945.67");
  assert.match(r.voice, /MXN\s?20,000|20,000\s?MXN/);
  await s.close();
});

test("local rules: labels are human, not snake_case", async () => {
  const s = await withTrip("rules-user");
  const r = await s.call("get_local_rules", { destination: "JP" });
  for (const row of r.card.rows) assert.doesNotMatch(row.label, /_|\barrest\b|\bsevere\b/);
  await s.close();
});
