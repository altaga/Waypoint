import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readFileSync } from "node:fs";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";

// What a visitor can pay with when a foreign card does not work: the options come from data/world/what-works.json.
// Crypto is never listed; placeholder entries are removed; every option cites https sources.
const countries = new Set((JSON.parse(readFileSync("data/world/countries.json", "utf8")) as { countries: { iso: string }[] }).countries.map((c) => c.iso));
const data = JSON.parse(readFileSync("data/world/what-works.json", "utf8")) as {
  source: { retrieved: string };
  countries: Record<
    string,
    {
      viable_count: number;
      options: { kind: string; name: string; usable_by_tourist: boolean; detail: string; sources: { url: string }[] }[];
      sources: { url: string }[];
    }
  >;
};
const KINDS = new Set(["domestic_network", "local_app", "merchant_qr", "in_app_qr", "local_scheme", "global_wallet", "cash"]);
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

test("every entry is a catalogue country, has only known kinds, and its viable count matches its usable options", () => {
  const entries = Object.entries(data.countries);
  assert.ok(entries.length >= 190, `expected the catalogue to be covered, found ${entries.length}`);
  for (const [iso, c] of entries) {
    assert.ok(countries.has(iso), `${iso} is not in the country catalogue`);
    assert.equal(c.viable_count, c.options.filter((o) => o.usable_by_tourist).length, `${iso} viable count`);
    for (const o of c.options) {
      assert.ok(KINDS.has(o.kind), `${iso} has an unknown kind ${o.kind}`);
      assert.ok(o.name.trim().length > 0, `${iso} has an unnamed option`);
      assert.ok(!/^Sin /.test(o.name), `${iso} shows a placeholder: ${o.name}`);
      // Cash often has no detail in the data: its row still says what it is and whether a visitor can use it.
      if (o.kind !== "cash") assert.ok(o.detail.trim().length > 0, `${iso} ${o.name} has no detail`);
      for (const s of o.sources) assert.match(s.url, /^https:\/\//, `${iso} ${o.name}`);
    }
    for (const s of c.sources) assert.match(s.url, /^https:\/\//, iso);
  }
});

test("crypto is never listed as an option, in any country", () => {
  for (const [iso, c] of Object.entries(data.countries)) {
    assert.ok(c.options.every((o) => !/cripto|crypto/i.test(o.kind + " " + o.name)), `${iso} lists crypto`);
  }
});

test("China: the answer counts the usable options and names the local apps, in English", async () => {
  const s = await session("whatworks-cn");
  const r = await s.call("get_what_works", { destination: "CN" });
  assert.equal(r.data.verified, true);
  assert.equal(r.data.viable, data.countries.CN!.viable_count);
  assert.match(r.voice, new RegExp(`^In China: ${data.countries.CN!.viable_count} ways a visitor can pay with`));
  assert.match(r.voice, /Alipay/);
  assert.equal(r.card.rows.length, data.countries.CN!.options.length);
  assert.ok(r.sources.length >= 1 && r.sources.every((x: { url: string }) => x.url.startsWith("https://")));
});

test("Afghanistan: cash is the one option open to a visitor, and the answer is in Spanish", async () => {
  const s = await session("whatworks-af", "es-MX");
  const r = await s.call("get_what_works", { destination: "AF" });
  assert.match(r.voice, /En Afghanistan: una vía que un turista puede usar sin tarjeta local: Efectivo\./);
  const cash = (r.card.rows as { label: string; status: string }[]).find((x) => x.label === "Efectivo");
  assert.equal(cash?.status, "info");
});

test("a country where no option is open to a visitor says so, and marks every row as not usable", async () => {
  const s = await session("whatworks-bb");
  const r = await s.call("get_what_works", { destination: "BB" });
  assert.equal(data.countries.BB!.viable_count, 0);
  assert.match(r.voice, /no way a visitor can pay with a foreign card or wallet/);
  assert.equal(r.data.viable, 0);
  assert.ok((r.card.rows as { status: string }[]).every((x) => x.status === "warn"));
});

test("a country with no entry says so and cites nothing", async () => {
  const s = await session("whatworks-aq");
  const r = await s.call("get_what_works", { destination: "AQ" });
  assert.match(r.voice, /don't have verified information/);
  assert.deepEqual(r.sources, []);
  assert.deepEqual(r.card.rows, []);
});
