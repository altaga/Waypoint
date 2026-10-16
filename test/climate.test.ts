import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";
import { tripClimate, type ClimateEntry } from "../src/services/climate.ts";

// Climate for the trip's dates: vendored NASA POWER normals for every capital, said aloud as the
// usual weather (not a forecast), and turned into what goes in the bag.
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
  return { call };
}

test("climate data covers every country with twelve plausible months", () => {
  const countries = (JSON.parse(readFileSync("data/world/countries.json", "utf8")) as { countries: { iso: string }[] }).countries;
  for (const { iso } of countries) {
    const entry = ctx.climate.get(iso);
    assert.ok(entry, `climate for ${iso}`);
    assert.equal(entry.months.length, 12, iso);
    for (const m of entry.months) {
      assert.ok(m.hi >= m.lo && m.hi < 50 && m.lo > -50 && m.rain >= 0, `${iso} ${JSON.stringify(m)}`);
    }
  }
  assert.match(ctx.climate.source.url, /power\.larc\.nasa\.gov/);
});

test("a trip across two months is weighted by its days in each", () => {
  const months = Array.from({ length: 12 }, () => ({ hi: 0, lo: 0, rain: 0 }));
  months[11] = { hi: 10, lo: 2, rain: 1 };
  months[0] = { hi: 4, lo: -4, rain: 5 };
  const entry: ClimateEntry = { city: { en: "X", es: "X" }, lat: 0, lon: 0, months };
  // Four days in December, four in January.
  const c = tripClimate(entry, "2026-12-28", "2027-01-04");
  assert.deepEqual(c.months, [12, 1]);
  assert.equal(c.hi, 7);
  assert.equal(c.lo, -1);
  assert.equal(c.rain, 3);
  assert.ok(c.cold && !c.hot && !c.wet);
});

test("the trip's climate is said as the usual weather and names the source", async () => {
  const s = await session("climate-es");
  await s.call("update_traveler_profile", { homeCurrency: "MXN", travelers: [{ displayName: "Victor", passports: ["MX"], role: "self", ageBand: "adult" }] });
  await s.call("plan_trip", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  const r = await s.call("get_trip_climate");
  assert.equal(r.data.destination, "JP");
  assert.equal(r.data.city, "Tokio");
  assert.ok(r.data.cold, "Tokyo in December is cold at night");
  assert.match(r.voice, /^En Tokio del 3 al 10 de diciembre, las máximas suelen rondar los \d+ grados/);
  assert.match(r.voice, /abrigo/);
  assert.match(r.disclaimer, /no un pronóstico/);
  assert.equal(r.sources[0].id, "nasa-power");
});

test("the packing list adds what the climate calls for", async () => {
  const s = await session("climate-pack", "en-US");
  await s.call("update_traveler_profile", { homeCurrency: "USD", travelers: [{ displayName: "Sam", passports: ["US"], role: "self", ageBand: "adult" }] });
  await s.call("plan_trip", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  const cold = await s.call("packing_checklist");
  assert.ok(cold.data.items.some((i: { id: string }) => i.id === "warm"), "a warm coat for Tokyo in December");
  const sg = await s.call("plan_trip", { destination: "SG", startDate: "2026-12-03", endDate: "2026-12-10" });
  const wet = await s.call("packing_checklist", { tripId: sg.data.trip.tripId });
  const ids = wet.data.items.map((i: { id: string }) => i.id);
  assert.ok(ids.includes("rain") && !ids.includes("warm"), `Singapore in December: ${ids.join(", ")}`);
});

test("the trip brief carries the climate and where the group flies from", async () => {
  const s = await session("climate-brief", "en-US");
  await s.call("update_traveler_profile", {
    homeCurrency: "MXN",
    travelers: [
      { displayName: "Ana", passports: ["MX"], role: "self", ageBand: "adult" },
      { displayName: "Priya", passports: ["IN"], role: "friend", ageBand: "adult" },
    ],
  });
  await s.call("plan_trip", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  const b = await s.call("trip_brief");
  assert.equal(b.data.climate.city, "Tokyo");
  assert.equal(b.data.geo.destination.iso, "JP");
  assert.deepEqual(b.data.geo.origins.map((o: { iso: string }) => o.iso).sort(), ["IN", "MX"]);
});
