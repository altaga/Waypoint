import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readFileSync } from "node:fs";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";

// Country-level transit status: one status per country that has no city entry in transit.json.
// A country here has an https source and bilingual notes; a country whose only evidence has no source is left out.
const countries = new Set((JSON.parse(readFileSync("data/world/countries.json", "utf8")) as { countries: { iso: string }[] }).countries.map((c) => c.iso));
const cityData = JSON.parse(readFileSync("data/world/transit.json", "utf8")) as { systems: Record<string, { country: string }> };
const cityCountries = new Set(Object.values(cityData.systems).map((s) => s.country));
const data = JSON.parse(readFileSync("data/world/transit-countries.json", "utf8")) as {
  source: { retrieved: string; method: string };
  countries: Record<string, { tier: string; bankCard: string; bankCardNote: { en: string; es: string }; source: { title: string; url: string } }>;
};
const ctx = createContext({ offline: true, store: createMemoryStore(), clock: () => new Date("2026-10-17T12:00:00Z") });

async function session(user: string, locale = "en-US") {
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

test("every country-level entry is a real country, cites https, is bilingual, and has a tier and a status", () => {
  const entries = Object.entries(data.countries);
  assert.ok(entries.length >= 150, `expected the sweep to cover at least 150 countries, found ${entries.length}`);
  for (const [iso, c] of entries) {
    assert.ok(countries.has(iso), `${iso} is not in the country catalogue`);
    assert.match(c.source.url, /^https:\/\//, iso);
    assert.ok(c.source.title.length > 0, iso);
    assert.ok(["oficial", "reportado"].includes(c.tier), iso);
    assert.ok(["yes", "partial", "no", "unverified"].includes(c.bankCard), iso);
    for (const field of [c.bankCardNote]) {
      assert.ok(field.en.trim().length > 0, `${iso} has an empty English field`);
      assert.ok(field.es.trim().length > 0, `${iso} has an empty Spanish field`);
    }
  }
});

test("a country with a city system is never repeated at country level", () => {
  for (const iso of Object.keys(data.countries)) {
    assert.ok(!cityCountries.has(iso), `${iso} has a city system and must not also have a country entry`);
  }
});

test("Germany, a country-level report: the answer is in Spanish, cites its source, and says cities were not checked", async () => {
  const s = await session("transit-de-es", "es-MX");
  const r = await s.call("get_transit_payment", { destination: "DE" });
  assert.equal(r.data.country, "DE");
  assert.match(r.voice, /En Alemania/);
  assert.match(r.voice, /no revisé ciudad por ciudad/);
  assert.equal(r.card.rows.length, 1);
  assert.equal(r.sources.length, 1);
  assert.equal(r.confidence, "low", "press and guides only");
});

test("Burkina Faso: a bank card does not work, and the answer says to use cash or the local card", async () => {
  const s = await session("transit-bf");
  const r = await s.call("get_transit_payment", { destination: "BF" });
  assert.match(r.voice, /does not work on transit/);
  assert.equal(r.card.rows[0].status, "warn");
});

test("Luxembourg: no bank-card status is confirmed, so the answer says so instead of guessing", async () => {
  const s = await session("transit-lu");
  const r = await s.call("get_transit_payment", { destination: "LU" });
  assert.match(r.voice, /not confirmed for transit/);
});

test("Finland: an operator's own page supports the answer, so the confidence is medium", async () => {
  const s = await session("transit-fi");
  const r = await s.call("get_transit_payment", { destination: "FI" });
  assert.match(r.voice, /operator's own page says so/);
  assert.equal(r.confidence, "medium");
  assert.equal(r.sources[0].license, "Operator's own page");
});

test("a country whose only evidence has no source has no transit entry, and cites nothing", async () => {
  const s = await session("transit-sv");
  const r = await s.call("get_transit_payment", { destination: "SV" });
  assert.match(r.voice, /don't have verified transit payment information/);
  assert.deepEqual(r.sources, []);
});
