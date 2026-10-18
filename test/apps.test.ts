import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { readFileSync } from "node:fs";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";
import { routeUtterance } from "../web/router.js";

// Which travel apps work for a visitor. A company's own list is official; press and guides are reported and never
// presented as confirmed. A country missing from an incomplete list is unverified, not "not listed".
const data = JSON.parse(readFileSync("data/world/apps.json", "utf8")) as {
  source: { retrieved: string };
  apps: Record<string, { name: string; tier: string; complete: boolean; source: { url: string } }>;
  listings: Record<string, string[]>;
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

test("every app cites an https source, lists only known countries, and says whether its list is complete", () => {
  for (const [id, app] of Object.entries(data.apps)) {
    assert.match(app.source.url, /^https:\/\//, id);
    assert.ok(["oficial", "reportado"].includes(app.tier), id);
    assert.equal(typeof app.complete, "boolean", id);
    for (const iso of data.listings[id] ?? []) assert.ok(countries.has(iso), `${id} lists unknown country ${iso}`);
  }
  assert.equal(data.listings.grab!.length, 8, "Grab lists eight Southeast Asian markets");
  assert.equal(data.listings.mercadolibre!.length, 18, "Mercado Libre's 2026 filing counts eighteen countries");
  assert.equal(data.apps.rappi!.tier, "reportado", "Rappi's list comes from a travel guide, not the company");
});

test("a country on a company list shows it as official; a country missing from a complete list is not listed", async () => {
  const s = await session("apps-mx");
  const r = await s.call("get_local_apps", { destination: "MX" });
  const byLabel = Object.fromEntries((r.card.rows as { label: string; value: string; status: string }[]).map((x) => [x.label, x]));
  assert.equal(byLabel["Mercado Libre"]!.value, "On the company's list");
  assert.match(byLabel["Uber"]!.value, /company's list/);
  assert.equal(byLabel["Grab"], undefined, "an app that is not on the company's list is not a row");
  assert.ok(r.data.notListed.includes("grab"), "it is still in the data");
  assert.match(r.card.subtitle, /\d+ other apps not listed or unverified/);
  assert.equal(r.confidence, "medium", "an official list supports the answer");
  assert.match(r.voice, /Mercado Libre/);
});

test("a country missing from an incomplete list has no verified data, and reported entries are not called confirmed", async () => {
  const s = await session("apps-jp");
  const r = await s.call("get_local_apps", { destination: "JP" });
  const rows = r.card.rows as { label: string; value: string; status: string }[];
  const amazon = rows.find((x) => x.label === "Amazon");
  assert.equal(amazon?.value, "On the company's list");
  const didi = rows.find((x) => x.label === "DiDi");
  assert.match(didi!.value, /not confirmed/);
  assert.equal(rows.find((x) => x.label === "Rappi"), undefined, "Rappi has no verified data for Japan, so it is not a row");
  assert.ok(r.data.unverified.includes("rappi"), "but it is kept in the data as unverified, never as unavailable");
  assert.ok(rows.every((x) => x.status === "info"), "every row is an app that is listed");
  assert.match(r.voice, /no listing or no verified data/);
  assert.ok(r.sources.every((x: { url: string }) => x.url.startsWith("https://")));
  assert.equal(r.lastVerified, data.source.retrieved);
});

test("a country with no entry in any list says so, and names the apps with no verified data", async () => {
  const s = await session("apps-none");
  const r = await s.call("get_local_apps", { destination: "AQ" });
  assert.match(r.voice, /no company list includes it/);
  assert.match(r.voice, /for the other \d+ apps there is no listing or no verified data/);
  assert.equal((r.card.rows as unknown[]).length, 0);
  assert.equal(r.data.listed.length, 0);
  assert.equal(r.confidence, "low");
});

test("a question naming an app is routed to the trip's country", () => {
  assert.deepEqual(routeUtterance("¿Funciona Uber aquí?", { destination: "JP" }), { tool: "get_local_apps", args: { destination: "JP" } });
  assert.deepEqual(routeUtterance("Does Grab work there?", { destination: "VN" }), { tool: "get_local_apps", args: { destination: "VN" } });
  assert.deepEqual(routeUtterance("¿Puedo usar Mercado Libre?", { destination: "MX" }), { tool: "get_local_apps", args: { destination: "MX" } });
  assert.equal(routeUtterance("¿Funciona Uber?"), null, "without a trip or a country, the router does not guess");
});
