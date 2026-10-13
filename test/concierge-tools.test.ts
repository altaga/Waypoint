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

test("itinerary: the agent's plan is saved with dates and returned later", async () => {
  const s1 = await withTrip("plan-user");
  const empty = await s1.call("build_itinerary");
  assert.equal(empty.data.planned, 0);
  assert.equal(empty.data.days[0].date, "2026-12-03");
  const saved = await s1.call("build_itinerary", {
    plan: [
      { day: 1, title: "Llegada a Tokio", afternoon: "Paseo por Asakusa y el templo Senso-ji", evening: "Ramen en Shinjuku" },
      { day: 2, title: "Tokio clásico", morning: "Mercado exterior de Tsukiji", afternoon: "Jardines del Palacio Imperial" },
      { day: 99, morning: "fuera del viaje" },
    ],
  });
  assert.equal(saved.data.planned, 2, "days outside the trip are ignored");
  assert.match(saved.voice, /Guardado: plan para 2 de 8 días/);
  await s1.close();

  const s2 = await session("plan-user");
  const day2 = await s2.call("build_itinerary", { day: 2 });
  assert.equal(day2.data.days.length, 1);
  assert.equal(day2.data.days[0].date, "2026-12-04");
  assert.match(day2.card.rows[0].value, /Tsukiji/);
  await s2.close();
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
