import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/server.ts";
import { createContext, type AppContext } from "../src/context.ts";
import { createMemoryStore, type StateStore } from "../src/state.ts";
import { buildSkill } from "../src/alexa/skill.ts";
import type { RequestEnvelope } from "ask-sdk-model";
import { alexaUserKey } from "../src/alexa/mcp-call.ts";
import { TravelerProfile } from "../src/profile.ts";

// Alexa skill, offline: the skill handlers call the real Waypoint MCP server in-process.
// Signature verification on /alexa is tested with an unsigned request (must be rejected).

const ALEXA_USER = "amzn1.ask.account.TESTUSER0000000000000000000000000000";
let server: Server;
let base: string;
let ctx: AppContext;
let store: StateStore;

function envelope(intent: string, slots: Record<string, string> = {}, locale = "en-US"): RequestEnvelope {
  return {
    version: "1.0",
    session: { new: true, sessionId: "amzn1.echo-api.session.test", application: { applicationId: "amzn1.ask.skill.test" }, user: { userId: ALEXA_USER }, attributes: {} },
    context: {
      System: {
        application: { applicationId: "amzn1.ask.skill.test" },
        user: { userId: ALEXA_USER },
        device: { deviceId: "d", supportedInterfaces: {} },
        apiEndpoint: "https://api.amazonalexa.com",
      },
    },
    request: {
      type: "IntentRequest" as const,
      dialogState: "STARTED",
      requestId: "amzn1.echo-api.request.test",
      timestamp: "2026-10-11T12:00:00Z",
      locale,
      intent: {
        name: intent,
        confirmationStatus: "NONE",
        slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v, confirmationStatus: "NONE" as const }])),
      },
    },
  };
}

const speech = (res: unknown) => ((res as { response: { outputSpeech: { ssml: string } } }).response.outputSpeech.ssml ?? "").replace(/<[^>]+>/g, "");

before(async () => {
  process.env.ALEXA_SKILL_ID = "amzn1.ask.skill.test";
  store = createMemoryStore();
  ctx = createContext({ offline: true, store, clock: () => new Date("2026-10-11T12:00:00Z") });
  await store.save(alexaUserKey(ALEXA_USER), {
    profile: TravelerProfile.parse({
      profileId: "p", ownerUserId: "alexa", homeCurrency: "MXN", homeTimezone: "America/Mexico_City",
      travelers: [{ travelerId: "t", displayName: "Ana", passports: [{ country: "MX" }] }],
      consent: { sensitiveData: false, updatedAt: "2026-10-11T00:00:00Z" }, updatedAt: "2026-10-11T00:00:00Z",
    }),
    trips: [], expenses: [],
  });
  server = createApp(ctx).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.WAYPOINT_MCP_URL = `${base}/mcp`;
});
after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));

test("an unsigned request to /alexa is rejected before any handler runs", async () => {
  const res = await fetch(`${base}/alexa`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope("PlanTripIntent")) });
  assert.notEqual(res.status, 200);
  const body = await res.text();
  assert.doesNotMatch(body, /Japan|speech|outputSpeech/);
});

test("PlanTripIntent speaks the trip readiness from the MCP server", async () => {
  const skill = buildSkill();
  const res = await skill.invoke(envelope("PlanTripIntent", { destination: "Japan", startDate: "2026-12-03", endDate: "2026-12-10" }));
  const text = speech(res);
  assert.match(text, /Japan|Japón/);
  assert.match(text, /days/i);
  assert.match(text, /verify with the official source/i);
});

test("RulesIntent answers with the prohibited-items rule and no tool names", async () => {
  const res = await buildSkill().invoke(envelope("RulesIntent", { destination: "Singapore" }));
  const text = speech(res);
  assert.match(text, /vape|e-cigarette|confiscat/i);
  assert.doesNotMatch(text, /get_local_rules|plan_trip|tools\/call|structuredContent/);
});

test("EntryIntent answers in Spanish when the locale is es-MX", async () => {
  const res = await buildSkill().invoke(envelope("EntryIntent", { destination: "Japón" }, "es-MX"));
  assert.match(speech(res), /Japón|Japon|visa|entrada|pasaporte/i);
});

test("TripBriefIntent remembers the trip across skill sessions", async () => {
  await buildSkill().invoke(envelope("PlanTripIntent", { destination: "Japan", startDate: "2026-12-03", endDate: "2026-12-10" }));
  const res = await buildSkill().invoke(envelope("TripBriefIntent"));
  assert.match(speech(res), /53 days|Days left|days/i);
});

test("a missing MCP endpoint gives the friendly unavailable message, not an error", async () => {
  const saved = process.env.WAYPOINT_MCP_URL;
  process.env.WAYPOINT_MCP_URL = "";
  const res = await buildSkill().invoke(envelope("RulesIntent", { destination: "Japan" }));
  process.env.WAYPOINT_MCP_URL = saved;
  assert.match(speech(res), /not reachable|no está disponible|Try again/i);
});
