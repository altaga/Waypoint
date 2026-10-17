import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readFileSync } from "node:fs";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";

// How a visitor pays: every country with an entry cites https sources and a date, and is labelled either
// official ("oficial") or reported ("reportado": guides and traveler reports, never presented as official).
// A country without an entry is said so, not guessed. Crypto is never presented as accepted without a source.
const data = JSON.parse(readFileSync("data/world/payments.json", "utf8")) as {
  countries: Record<string, { tier: string; retrieved: string; sources: { url: string; title: string }[]; crypto?: string | null }>;
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

test("every country cites https sources with a retrieval date, and each entry has a tier", () => {
  const entries = Object.entries(data.countries);
  assert.ok(entries.length >= 180, "most of the world is covered");
  const tiers = new Set(entries.map(([, e]) => e.tier));
  assert.deepEqual([...tiers].sort(), ["oficial", "reportado"]);
  assert.ok(entries.filter(([, e]) => e.tier === "oficial").length >= 18, "the official entries are kept");
  for (const [iso, e] of entries) {
    assert.match(e.retrieved, /^\d{4}-\d{2}-\d{2}$/, iso);
    assert.ok(e.sources.length > 0, `${iso} has sources`);
    for (const s of e.sources) assert.match(s.url, /^https:\/\//, `${iso} ${s.url}`);
  }
});

test("no country is shown as accepting cryptocurrency without an official source", () => {
  for (const [iso, e] of Object.entries(data.countries)) {
    assert.ok(e.crypto === null || e.crypto === undefined, `${iso} crypto is not verified`);
  }
});

test("an official country answers with its methods, its source date and a warning on crypto", async () => {
  const s = await session("payments-jp");
  const r = await s.call("get_payment_methods", { destination: "JP" });
  assert.equal(r.data.tier, "oficial");
  assert.equal(r.data.verified, true);
  assert.equal(r.data.destination, "JP");
  assert.match(r.card.subtitle, /Official sources/);
  const rows = r.card.rows as { label: string; status: string }[];
  assert.ok(rows.some((x) => x.label === "Cash") && rows.some((x) => x.label === "Cards"));
  const crypto = rows.find((x) => x.label === "Cryptocurrency");
  assert.equal(crypto?.status, "warn");
  assert.ok(r.sources.length >= 1 && r.sources.every((x: { url: string; license: string }) => x.url.startsWith("https://") && x.license === "Official public information"));
  assert.equal(r.lastVerified, data.countries.JP!.retrieved);
});

test("a reported country says it is not officially confirmed, is low confidence and cites its guides", async () => {
  const s = await session("payments-pe");
  const r = await s.call("get_payment_methods", { destination: "PE" });
  assert.equal(r.data.tier, "reportado");
  assert.equal(r.data.verified, false);
  assert.equal(r.confidence, "low");
  assert.match(r.voice, /not confirmed by an official source/);
  assert.match(r.card.subtitle, /not official/);
  const rows = r.card.rows as { label: string }[];
  assert.ok(rows.some((x) => x.label === "Cash"));
  assert.ok(r.sources.length >= 1 && r.sources.every((x: { url: string; license: string }) => x.url.startsWith("https://") && x.license !== "Official public information"));
});

test("a country with no entry at all says so and cites nothing", async () => {
  const s = await session("payments-none");
  const r = await s.call("get_payment_methods", { destination: "AQ" });
  assert.equal(r.data.verified, false);
  assert.deepEqual(r.sources, []);
  assert.deepEqual(r.card.rows, []);
  assert.match(r.voice, /don't have payment information/);
});
