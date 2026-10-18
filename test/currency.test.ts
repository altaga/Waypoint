import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";
import { currencyCode } from "../src/currency.ts";

const known = new Set<string>(Intl.supportedValuesOf("currency"));

test("a currency name or a code becomes the ISO code", () => {
  assert.equal(currencyCode("MXN", known), "MXN");
  assert.equal(currencyCode("mxn", known), "MXN");
  assert.equal(currencyCode("Mexican peso", known), "MXN");
  assert.equal(currencyCode("US dollar", known), "USD");
  assert.equal(currencyCode("Singapore dollar", known), "SGD");
  assert.equal(currencyCode("dólar de Singapur", known), "SGD");
  assert.equal(currencyCode("Narnian crown", known), null);
});

test("the tools take a currency name where they take a code", async () => {
  const ctx = createContext({ offline: true, store: createMemoryStore(), clock: () => new Date("2026-10-13T12:00:00Z") });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createWaypointMcpServer(ctx, "names", "en-US").connect(s);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(c);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent: any; content: { text: string }[] };
    assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`);
    return r.structuredContent;
  };
  await call("update_traveler_profile", { homeCurrency: "Mexican peso", travelers: [{ displayName: "Ana", passports: ["MX"], role: "self", ageBand: "adult" }] });
  const r = await call("convert_budget", { amount: 500, from: "Singapore dollar", to: "US dollar" });
  assert.match(r.voice, /SGD\s?500(\.00)? is about USD/);
});
