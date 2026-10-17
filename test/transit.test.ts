import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readFileSync } from "node:fs";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";
import { routeUtterance } from "../web/router.js";

// How a visitor pays for city transit: whether a contactless bank card works at the gates, and the local card.
// Operator pages are official; press and guides are reported. A country without an entry says so.
const data = JSON.parse(readFileSync("data/world/transit.json", "utf8")) as {
  source: { retrieved: string };
  systems: Record<string, { country: string; tier: string; bankCard: string; source: { url: string } }>;
};
const countries = new Set((JSON.parse(readFileSync("data/world/countries.json", "utf8")) as { countries: { iso: string }[] }).countries.map((c) => c.iso));
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

test("every transit system cites an https source, sits in a known country, and has a tier and a bank-card status", () => {
  const values = Object.values(data.systems);
  assert.equal(values.length, 13);
  for (const [id, s] of Object.entries(data.systems)) {
    assert.match(s.source.url, /^https:\/\//, id);
    assert.ok(countries.has(s.country), `${id} has an unknown country ${s.country}`);
    assert.ok(["oficial", "reportado"].includes(s.tier), id);
    assert.ok(["yes", "partial", "no", "unverified"].includes(s.bankCard), id);
  }
  assert.equal(data.systems.london!.tier, "oficial", "London's rules come from TfL's own page");
  assert.equal(data.systems.seoul!.bankCard, "no", "a foreign bank card is not accepted at Seoul's gates");
});

test("London: a contactless bank card works at the gates, and the answer is official", async () => {
  const s = await session("transit-gb");
  const r = await s.call("get_transit_payment", { destination: "GB" });
  assert.match(r.voice, /bank card works at the gates in London/);
  const london = (r.card.rows as { label: string; value: string; status: string }[]).find((x) => x.label === "London");
  assert.match(london!.value, /Bank card works at the gates/);
  assert.match(london!.value, /Visitor Oyster/);
  assert.equal(r.confidence, "medium", "an operator page supports the answer");
  assert.ok(r.sources.some((x: { license: string }) => x.license === "Operator's own page"));
});

test("Japan and Korea: the answer says when a bank card is not confirmed or does not work", async () => {
  const s = await session("transit-jp-kr");
  const jp = await s.call("get_transit_payment", { destination: "JP" });
  assert.match(jp.voice, /only partly in Tokyo/);
  assert.equal(jp.confidence, "low", "press and guides only");
  const kr = await s.call("get_transit_payment", { destination: "KR" });
  assert.match(kr.voice, /not with a bank card in Seoul/);
  const seoulRow = (kr.card.rows as { label: string; status: string }[]).find((x) => x.label === "Seoul");
  assert.equal(seoulRow?.status, "warn");
});

test("Mexico City: the Metro takes a contactless bank card, and Metrobús only on some lines", async () => {
  const s = await session("transit-mx");
  const r = await s.call("get_transit_payment", { destination: "MX" });
  assert.match(r.voice, /bank card works at the gates in Mexico City/);
  assert.match(r.voice, /only partly in Mexico City \(Metrobús\)/);
  assert.equal(r.confidence, "low", "press reports only");
});

test("a country with no transit entry says so, and cites nothing", async () => {
  const s = await session("transit-none");
  const r = await s.call("get_transit_payment", { destination: "AQ" });
  assert.match(r.voice, /don't have verified transit payment information/);
  assert.deepEqual(r.sources, []);
  assert.deepEqual(r.card.rows, []);
});

test("a question about the metro, bus or a transit card is routed to the trip's country", () => {
  assert.deepEqual(routeUtterance("Can I tap my card on the metro?", { destination: "GB" }), { tool: "get_transit_payment", args: { destination: "GB" } });
  assert.deepEqual(routeUtterance("¿Qué tarjeta de transporte uso?", { destination: "JP" }), { tool: "get_transit_payment", args: { destination: "JP" } });
  assert.deepEqual(routeUtterance("¿Pago con tarjeta en el metro?", { destination: "NL" }), { tool: "get_transit_payment", args: { destination: "NL" } });
});
