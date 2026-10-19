import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";
import { createWeatherService } from "../src/services/weather.ts";

async function call(ctx: ReturnType<typeof createContext>, name: string, args: Record<string, unknown>, locale = "en-US") {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createWaypointMcpServer(ctx, "cal-" + locale, locale).connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent: any; content: { text: string }[] };
  assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`);
  return r.structuredContent;
}
const clock = () => new Date("2026-10-19T12:00:00Z");

test("the calendar lists the public holidays inside the trip's dates and the best months, without live data offline", async () => {
  const ctx = createContext({ offline: true, store: createMemoryStore(), clock });
  const r = await call(ctx, "get_trip_calendar", { destination: "JP", startDate: "2026-11-01", endDate: "2026-11-30" });
  const names = (r.data.holidays as { name: string }[]).map((h) => h.name);
  assert.ok(names.includes("Culture Day") && names.includes("Labour Thanksgiving Day"), names.join(", "));
  assert.equal(r.data.bestMonths.length, 3);
  assert.match(r.voice, /Public holidays on your dates: Culture Day/);
  assert.match(r.voice, /our estimate, not an official figure/);
  assert.ok(r.sources.some((s: any) => s.id === "src:nager-date"));
  assert.ok(!r.data.weather, "offline: no live weather");
});

test("a country the holiday dataset does not cover says there is no verified data", async () => {
  const ctx = createContext({ offline: true, store: createMemoryStore(), clock });
  const r = await call(ctx, "get_trip_calendar", { destination: "KP", startDate: "2026-11-01", endDate: "2026-11-05" });
  assert.equal(r.data.holidays, null);
  assert.ok(r.card.rows.some((x: any) => /No verified data/.test(x.value)));
});

test("within 16 days the live forecast is used: it is asked for the capital and shown day by day", async () => {
  const asked: string[] = [];
  const fakeFetch = (async (url: string) => {
    asked.push(url);
    return { ok: true, json: async () => ({ timezone: "Asia/Tokyo", daily: { time: ["2026-10-25", "2026-10-26"], temperature_2m_max: [21.4, 19.2], temperature_2m_min: [14.1, 12.8], precipitation_probability_max: [10, 70], weathercode: [0, 61], sunrise: ["2026-10-25T05:58"], sunset: ["2026-10-25T16:52"] } }) };
  }) as unknown as typeof fetch;
  const ctx = createContext({ offline: true, store: createMemoryStore(), clock });
  ctx.weather = createWeatherService({ fetchImpl: fakeFetch, now: () => clock().getTime() });
  const r = await call(ctx, "get_trip_calendar", { destination: "JP", startDate: "2026-10-25", endDate: "2026-10-26" });
  assert.match(asked[0], /api\.open-meteo\.com\/v1\/forecast/);
  assert.match(asked[0], /latitude=35\.\d+&longitude=139\.\d+/);
  assert.match(r.voice, /Live forecast for Tokyo/);
  const rows = r.card.rows.map((x: any) => `${x.label}|${x.value}`).join("\n");
  assert.match(rows, /21° \/ 14° · Clear · 10%/);
  assert.match(rows, /19° \/ 13° · Rain · 70%/);
  assert.match(rows, /05:58 \/ 16:52/);
  assert.ok(r.sources.some((s: any) => s.id === "src:open-meteo"));
});

test("beyond 16 days only the sun times are asked for, from the same dates a year earlier, and said to be typical", async () => {
  const asked: string[] = [];
  const fakeFetch = (async (url: string) => {
    asked.push(url);
    return { ok: true, json: async () => ({ timezone: "Asia/Tokyo", daily: { time: ["2025-12-03"], sunrise: ["2025-12-03T06:27"], sunset: ["2025-12-03T16:30"] } }) };
  }) as unknown as typeof fetch;
  const ctx = createContext({ offline: true, store: createMemoryStore(), clock });
  ctx.weather = createWeatherService({ fetchImpl: fakeFetch, now: () => clock().getTime() });
  const r = await call(ctx, "get_trip_calendar", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-03" });
  assert.match(asked[0], /archive-api\.open-meteo\.com/);
  assert.match(asked[0], /start_date=2025-12-03/);
  assert.match(r.voice, /forecast does not reach those dates yet/);
  assert.ok(r.card.rows.some((x: any) => /06:27 \/ 16:30/.test(x.value) && /typical/.test(x.value)));
});
