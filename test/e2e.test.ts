import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createApp, originAllowed } from "../src/server.ts";
import { createContext, type AppContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";

// Offline end-to-end: real Streamable HTTP, real MCP client, no network.
// Covers initialize, tools/list, tools/call, elicitation, cross-session memory,
// per-user isolation and origin validation.

let server: Server;
let base: string;
let ctx: AppContext;
const store = createMemoryStore();

const FIXED_NOW = new Date("2026-10-11T12:00:00Z");

async function connect(user: string, elicitCountry?: string) {
  const client = new Client({ name: "waypoint-test", version: "0.0.1" }, { capabilities: elicitCountry ? { elicitation: {} } : {} });
  if (elicitCountry) {
    client.setRequestHandler(ElicitRequestSchema, async () => ({ action: "accept", content: { country: elicitCountry } }));
  }
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { "x-waypoint-user": user } },
  });
  await client.connect(transport);
  return client;
}

function text(res: unknown): string {
  return ((res as { content: { text: string }[] }).content ?? []).map((c) => c.text).join(" ");
}

before(async () => {
  process.env.WAYPOINT_OFFLINE = "1";
  ctx = createContext({ offline: true, store, clock: () => FIXED_NOW });
  const app = createApp(ctx);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise<void>((resolve) => {
  server.closeAllConnections();
  server.close(() => resolve());
}));

test("tools/list exposes the 19 tools with outputSchema, annotations and the MCP App link", async () => {
  const client = await connect("e2e-list");
  const { tools } = await client.listTools();
  assert.equal(tools.length, 19);
  for (const t of tools) {
    assert.ok(t.outputSchema, `${t.name} needs outputSchema`);
    assert.ok(t.annotations, `${t.name} needs annotations`);
    assert.ok(t.description && t.description.length > 40, `${t.name} needs a description`);
  }
  const plan = tools.find((t) => t.name === "plan_trip");
  assert.match(String((plan as unknown as { _meta?: { ui?: { resourceUri?: string } } })._meta?.ui?.resourceUri), /^ui:\/\/waypoint\/plan-dashboard-[0-9a-f]{8}\.html$/);
  const resources = await client.listResources();
  assert.ok(resources.resources.some((r) => r.mimeType === "text/html;profile=mcp-app"));
  await client.close();
});

test("profile, elicitation for a missing passport, trip, then memory across sessions", async () => {
  const first = await connect("e2e-user", "Mexico");
  const upd = await first.callTool({
    name: "update_traveler_profile",
    arguments: {
      homeCurrency: "MXN",
      locale: "es-MX",
      travelers: [
        { displayName: "Ana", ageBand: "adult" },
        { displayName: "Luis", passports: ["MX"], ageBand: "adult" },
      ],
    },
  });
  assert.notEqual(upd.isError, true);
  // Stateless MCP: no elicitation round trip, so the missing passport comes back as missingFields.
  const firstSc = upd.structuredContent as { missingFields?: string[] };
  assert.deepEqual(firstSc.missingFields, ["passport:Ana"]);
  const upd2 = await first.callTool({
    name: "update_traveler_profile",
    arguments: { travelers: [{ displayName: "Ana", passports: ["MX"] }] },
  });
  assert.notEqual(upd2.isError, true);
  const updSc = upd2.structuredContent as { card: { rows: { label: string; value: string }[] } };
  assert.ok(updSc.card.rows.find((r) => r.label === "Ana")?.value.includes("México"));

  const trip = await first.callTool({
    name: "plan_trip",
    arguments: { destination: "Japón", startDate: "2026-12-03", endDate: "2026-12-10" },
  });
  assert.notEqual(trip.isError, true, text(trip));
  const sc = trip.structuredContent as { data: { trip: { tripId: string }; travelers: { label: string; status: string; value: string }[] }; confidence: string; sources: { id: string }[]; disclaimer: string; lastVerified: string };
  assert.ok(sc.data.trip.tripId);
  assert.equal(sc.data.travelers.length, 2);
  assert.match(sc.data.travelers[0].value, /Sin visa|Visa-free/);
  assert.ok(sc.sources.some((s) => s.id === "src:passport-index"));
  assert.match(sc.disclaimer, /verify with the official source|verifica con la fuente oficial/);
  assert.ok(["medium", "low"].includes(sc.confidence));
  await first.close();

  // New session, same user: the trip is still there.
  const second = await connect("e2e-user");
  const brief = await second.callTool({ name: "trip_brief", arguments: {} });
  assert.notEqual(brief.isError, true, text(brief));
  const b = brief.structuredContent as { data: { daysUntil: number; tripId: string } };
  assert.equal(b.data.daysUntil, 53); // 11-Oct to 3-Dec, calendar days
  assert.equal(b.data.tripId, sc.data.trip.tripId);
  await second.close();

  // A different user sees nothing of it.
  const other = await connect("e2e-other");
  const otherBrief = await other.callTool({ name: "trip_brief", arguments: {} });
  assert.equal(otherBrief.isError, true, "no profile yet, so a friendly error");
  assert.doesNotMatch(text(otherBrief), /Japan|Japón|2026-12/);
  await other.close();
});

test("local rules return verified quotes with sources", async () => {
  const client = await connect("e2e-rules");
  const res = await client.callTool({ name: "get_local_rules", arguments: { destination: "Singapore", categories: ["prohibited_items"] } });
  const sc = res.structuredContent as { data: { rules: { quote: string; sources: string[] }[] }; sources: { id: string }[] };
  assert.ok(sc.data.rules.some((r) => r.quote === "chewing gum to sell"));
  assert.ok(sc.sources.length > 1);
  await client.close();
});

test("budget conversion works offline and labels the rate source", async () => {
  const client = await connect("e2e-fx");
  await client.callTool({ name: "update_traveler_profile", arguments: { homeCurrency: "MXN", travelers: [{ displayName: "Solo", passports: ["MX"] }] } });
  const res = await client.callTool({ name: "convert_budget", arguments: { amount: 20000, destination: "Japan" } });
  assert.notEqual(res.isError, true, text(res));
  const sc = res.structuredContent as { data: { rateSource: string; to: string } };
  assert.equal(sc.data.rateSource, "snapshot");
  assert.equal(sc.data.to, "JPY");
  await client.close();
});

test("unknown destinations get a friendly error, never a stack or URL", async () => {
  const client = await connect("e2e-errors");
  await client.callTool({ name: "update_traveler_profile", arguments: { travelers: [{ displayName: "Solo", passports: ["MX"] }] } });
  const res = await client.callTool({ name: "get_destination_essentials", arguments: { destination: "Atlantis" } });
  assert.equal(res.isError, true);
  const msg = text(res);
  assert.match(msg, /Atlantis/);
  assert.doesNotMatch(msg, /Error:|at \/|https?:\/\/|\bundefined\b/);
  await client.close();
});

test("forget_me deletes the user's data after confirmation", async () => {
  const client = await connect("e2e-forget", "__never__");
  await client.callTool({ name: "update_traveler_profile", arguments: { travelers: [{ displayName: "Solo", passports: ["MX"] }] } });
  const res = await client.callTool({ name: "forget_me", arguments: { confirm: true } });
  assert.equal((res.structuredContent as { data: { deleted: boolean } }).data.deleted, true);
  const profile = await client.callTool({ name: "get_traveler_profile", arguments: {} });
  assert.ok((profile.structuredContent as { missingFields?: string[] }).missingFields !== undefined);
  await client.close();
});

test("origin validation: unknown browser origins get 403, localhost is allowed", async () => {
  const evil = await fetch(`${base}/healthz`, { headers: { origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  const ok = await fetch(`${base}/healthz`, { headers: { origin: "http://localhost:5173" } });
  assert.equal(ok.status, 200);
  assert.equal(originAllowed("https://evil.example", ["http://localhost"]), false);
});

test("origin validation: the page served by this host may call it, other hosts may not", () => {
  const host = "abc123.lambda-url.us-east-1.on.aws";
  assert.equal(originAllowed(`https://${host}`, [], host), true);
  assert.equal(originAllowed(`https://evil.example`, [], host), false);
  assert.equal(originAllowed(`http://${host}`, [], host), false);
  assert.equal(originAllowed(`https://${host}.evil.example`, [], host), false);
});

test("the simulated Alexa+ host is served at the root", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /simulated Alexa\+ host/);
});

test("brain endpoint: 400 without an utterance, 503 when Bedrock is not configured", async () => {
  const empty = await fetch(`${base}/api/brain`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(empty.status, 400);
  const res = await fetch(`${base}/api/brain`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ utterance: "hola", history: [{ role: "user", text: "x" }, { role: "evil", text: "y" }] }),
  });
  assert.equal(res.status, 503);
});

test("healthz reports the protocol version and loaded packs", async () => {
  const res = await fetch(`${base}/healthz`);
  const body = (await res.json()) as { protocolVersion: string; packs: number };
  assert.equal(body.protocolVersion, "2025-11-25");
  assert.ok(body.packs >= 10);
});
