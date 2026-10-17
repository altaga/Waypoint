import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readFileSync } from "node:fs";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";

// How a visitor pays: every country with an entry cites official sources and a date, and a country
// without one is said so, not guessed. Crypto is never presented as accepted without a source.
const data = JSON.parse(readFileSync("data/world/payments.json", "utf8")) as {
  countries: Record<string, { retrieved: string; sources: { url: string; title: string }[]; crypto?: string | null }>;
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

test("every verified country cites official https sources with a retrieval date", () => {
  const entries = Object.entries(data.countries);
  assert.ok(entries.length >= 18, "the curated and most-visited countries are covered");
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

test("a verified country answers with its methods and a warning on crypto", async () => {
  const s = await session("payments-jp");
  const r = await s.call("get_payment_methods", { destination: "JP" });
  assert.equal(r.data.verified, true);
  assert.equal(r.data.destination, "JP");
  const rows = r.card.rows as { label: string; status: string }[];
  assert.ok(rows.some((x) => x.label === "Cash") && rows.some((x) => x.label === "Cards"));
  const crypto = rows.find((x) => x.label === "Cryptocurrency");
  assert.equal(crypto?.status, "warn");
  assert.ok(r.sources.length >= 1 && r.sources.every((x: { url: string }) => x.url.startsWith("https://")));
  assert.equal(r.lastVerified, data.countries.JP!.retrieved);
});

test("a country without a verified entry says so and cites nothing", async () => {
  const s = await session("payments-none");
  const r = await s.call("get_payment_methods", { destination: "PE" });
  assert.equal(r.data.verified, false);
  assert.deepEqual(r.sources, []);
  assert.deepEqual(r.card.rows, []);
  assert.match(r.voice, /don't have verified payment information/);
});
