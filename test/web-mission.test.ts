import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";
import { isAutopilot, planFrom, repair, runMission } from "../web/mission.js";

// Autopilot: the host chains real tools/call requests (profile, then five at once, then the plan and
// the bag, then readiness) and shows each step. These run the same module against the real server.
const ctx = createContext({ offline: true, store: createMemoryStore(), clock: () => new Date("2026-10-13T12:00:00Z") });

async function session(user: string, locale = "es-MX") {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createWaypointMcpServer(ctx, user, locale).connect(s);
  const mcp = new Client({ name: "t", version: "1" });
  await mcp.connect(c);
  const client = { callTool: (name: string, args: Record<string, unknown>) => mcp.callTool({ name, arguments: args }) };
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool(name, args)) as { isError?: boolean; structuredContent: any; content: { text: string }[] };
    assert.ok(!r.isError, `${name} failed: ${r.content?.[0]?.text}`);
    return r.structuredContent;
  };
  return { client, call };
}

type Step = { dataset: Record<string, string>; res: { textContent: string }; ms: { textContent: string }; querySelector(sel: string): { textContent: string } };

// Just enough of the mission card for the run to write into.
function fakeRoot() {
  const steps = new Map<string, Step>();
  const progress = { style: {} as Record<string, string> };
  const foot = { innerHTML: "" };
  const classes = new Set<string>();
  const root = {
    steps,
    foot,
    classes,
    querySelector(sel: string) {
      const key = /data-key="(\w+)"/.exec(sel)?.[1];
      if (key) {
        if (!steps.has(key)) {
          const res = { textContent: "" };
          const ms = { textContent: "" };
          steps.set(key, { dataset: {}, res, ms, querySelector: (s) => (s === ".m-res" ? res : ms) });
        }
        return steps.get(key);
      }
      if (sel === ".m-progress span") return progress;
      if (sel === ".m-foot") return foot;
      return null;
    },
    querySelectorAll() {
      return { length: [...steps.values()].filter((s) => ["done", "skip", "err"].includes(s.dataset.state)).length };
    },
    classList: { add: (c: string) => void classes.add(c) },
    removeAttribute: () => {},
  };
  return root;
}

const state = (root: ReturnType<typeof fakeRoot>) => Object.fromEntries([...root.steps].map(([k, s]) => [k, s.dataset.state]));

test("autopilot is asked for in plain words, in both languages", () => {
  for (const t of ["Prepárame para el viaje", "prepárame para Japón", "Piloto automático", "Organiza todo", "Get me ready for the trip", "autopilot"]) {
    assert.ok(isAutopilot(t), t);
  }
  for (const t of ["¿Qué me falta para mi viaje?", "What should I pack?", "Prepara un café", "Arma mis días: comida y templos"]) {
    assert.ok(!isAutopilot(t), t);
  }
});

test("the plan from the places keeps to the pace, the day's hours and the stay", () => {
  const places = [
    { id: "a", city: "Tokyo", durationMinutes: 240 },
    { id: "b", city: "Tokyo", durationMinutes: 240 },
    { id: "c", city: "Tokyo", durationMinutes: 240 },
    { id: "d", city: "Kyoto", durationMinutes: 60 },
    { id: "e", city: "Kyoto", durationMinutes: 60 },
  ];
  const plan = planFrom(places, 8, "relaxed");
  assert.deepEqual(plan.map((d) => d.stops), [["a", "b"], ["c"], ["d", "e"]]);
  assert.deepEqual(plan.map((d) => d.day), [1, 2, 3]);
  assert.equal(planFrom(places, 1, "packed").length, 1, "a one-day stay gets one day");
  for (const d of planFrom(places, 8, "packed")) {
    const minutes = d.stops.reduce((m, id) => m + (places.find((p) => p.id === id)?.durationMinutes ?? 0), 0);
    assert.ok(minutes <= 600, `day ${d.day} fits in ten hours`);
  }
});

test("what the verifier rejects is dropped and the days are numbered again", () => {
  const plan = [
    { day: 1, stops: ["a", "b"] },
    { day: 2, stops: ["c"] },
    { day: 3, stops: ["d", "e", "f"] },
  ];
  const fixed = repair(plan, [
    { day: 2, code: "avoided_interest", placeId: "c" },
    { day: 3, code: "too_long" },
  ]);
  assert.deepEqual(fixed, [
    { day: 1, stops: ["a", "b"] },
    { day: 2, stops: ["d", "e"] },
  ]);
});

test("autopilot runs every step against the server and the trip is readier after", async () => {
  const s = await session("mission-run", "es-MX");
  await s.call("update_traveler_profile", {
    homeCurrency: "MXN",
    interests: ["food", "temples", "karaoke"],
    travelers: [
      { displayName: "Ana", passports: ["MX"], role: "self", ageBand: "adult" },
      { displayName: "Priya", passports: ["IN"], role: "friend", ageBand: "adult" },
    ],
  });
  await s.call("plan_trip", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  const before = (await s.call("trip_brief")).data;
  const root = fakeRoot();
  const res = await runMission({ client: s.client, lang: "es", brief: before, root, minStepMs: 0 });

  assert.deepEqual(state(root), { profile: "done", entry: "done", rules: "done", climate: "done", essentials: "done", places: "done", plan: "done", packing: "done", brief: "done" });
  assert.equal(res.calls, 9);
  assert.match(root.steps.get("entry")!.res.textContent, /Priya: trámite pendiente/);
  assert.match(root.steps.get("climate")!.res.textContent, /^\d+° \/ -?\d+°/);
  assert.match(root.steps.get("packing")!.res.textContent, /con abrigo/);
  assert.match(root.foot.innerHTML, /NASA POWER/);
  assert.ok(root.classes.has("m-done"));

  const after = (await s.call("trip_brief")).data;
  assert.equal(after.planned, 3, "three verified days were saved");
  assert.ok(after.readiness > before.readiness, `${before.readiness}% → ${after.readiness}%`);
  assert.match(res.voice, /^Listo\. Revisé la entrada de 2 pasaportes/);
  assert.match(res.voice, new RegExp(`Vas ${after.readiness}% listo`));
});

test("autopilot works around what the trip avoids and keeps a saved plan", async () => {
  const s = await session("mission-avoid", "en-US");
  await s.call("update_traveler_profile", {
    homeCurrency: "USD",
    interests: ["temples", "food"],
    travelers: [{ displayName: "Sam", passports: ["US"], role: "self", ageBand: "adult" }],
  });
  await s.call("plan_trip", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  await s.call("set_trip_constraints", { avoid: ["temples"] });
  const root = fakeRoot();
  await runMission({ client: s.client, lang: "en", brief: (await s.call("trip_brief")).data, root, minStepMs: 0 });
  assert.equal(root.steps.get("plan")!.dataset.state, "done", root.steps.get("plan")!.res.textContent);
  // Temples were asked for but the trip avoids them: the verifier rejects those stops and the run drops them.
  assert.match(root.steps.get("plan")!.res.textContent, /\d+ fix(es)? from the verifier/);
  const saved = (await s.call("build_itinerary")).data;
  assert.ok(saved.planned > 0 && saved.violations.length === 0, "the saved plan passes the verifier");

  // A second run keeps the plan instead of replacing it.
  const again = fakeRoot();
  const res = await runMission({ client: s.client, lang: "en", brief: (await s.call("trip_brief")).data, root: again, minStepMs: 0 });
  assert.equal(again.steps.get("places")!.dataset.state, "skip");
  assert.equal(again.steps.get("plan")!.dataset.state, "skip");
  assert.match(again.steps.get("plan")!.res.textContent, /already planned, kept/);
  assert.equal(res.calls, 7);
});
