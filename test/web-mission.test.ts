import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { createWaypointMcpServer } from "../src/mcp-server.ts";
import { isAutopilot, makeTrip, planFrom, repair, runMission, tripFromRequest } from "../web/mission.js";

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

type Step = { dataset: Record<string, string>; res: { textContent: string }; ms: { textContent: string }; by: { textContent: string }; querySelector(sel: string): { textContent: string } };

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
          const by = { textContent: "" };
          steps.set(key, { dataset: {}, res, ms, by, querySelector: (s) => (s === ".m-res" ? res : s === ".m-by" ? by : ms) });
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
  // Kyoto has two places, which is one day: moving there for one day is not a plan, so it is left out.
  assert.deepEqual(plan.map((d) => d.stops), [["a", "b"], ["c"]]);
  assert.deepEqual(plan.map((d) => d.day), [1, 2]);
  assert.equal(planFrom(places, 1, "packed").length, 1, "a one-day stay gets one day");
  for (const d of planFrom(places, 8, "packed")) {
    const minutes = d.stops.reduce((m, id) => m + (places.find((p) => p.id === id)?.durationMinutes ?? 0), 0);
    assert.ok(minutes <= 600, `day ${d.day} fits in ten hours`);
  }
});

test("the plan stays in the main city and moves only with room for two days there, an arrival day of at most two stops", () => {
  const tokyo = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, city: "Tokyo", durationMinutes: 60 }));
  const kyoto = Array.from({ length: 4 }, (_, i) => ({ id: `k${i}`, city: "Kyoto", durationMinutes: 60 }));
  const osaka = [{ id: "o0", city: "Osaka", durationMinutes: 60 }];
  const all = [...tokyo, ...kyoto, ...osaka];
  const city = new Map(all.map((p) => [p.id, p.city]));
  const long = planFrom(all, 14, "balanced");
  assert.deepEqual(long.map((d) => d.stops.length), [3, 3, 2, 2, 2], "Tokyo 3, 3, 2, then Kyoto 2, 2; Osaka has one place, so no stay there");
  assert.deepEqual(long.map((d) => city.get(d.stops[0])), ["Tokyo", "Tokyo", "Tokyo", "Kyoto", "Kyoto"]);
  for (const d of long) assert.equal(new Set(d.stops.map((id) => city.get(id))).size, 1, `day ${d.day} is in one city`);
  // No room to move: the days left cannot hold two days in Kyoto, so the plan stays in Tokyo.
  assert.deepEqual(planFrom(all, 4, "balanced").map((d) => city.get(d.stops[0])), ["Tokyo", "Tokyo", "Tokyo"]);
  assert.equal(new Set(planFrom(all, 3, "balanced").map((d) => city.get(d.stops[0]))).size, 1);
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, city: "Paris", durationMinutes: 60 }));
  assert.equal(planFrom(many, 30, "balanced").length, 7, "at most seven days");
});

test("a day alone in its city, or a busy arrival day, is repaired away", () => {
  const plan = [
    { day: 1, stops: ["t1", "t2"] },
    { day: 2, stops: ["t3"] },
    { day: 3, stops: ["k1", "k2", "k3"] },
    { day: 4, stops: ["o1"] },
  ];
  const fixed = repair(plan, [
    { day: 3, code: "arrival_day_busy" },
    { day: 4, code: "short_stay" },
  ]);
  assert.deepEqual(fixed.map((d) => d.stops), [["t1", "t2"], ["t3"], ["k1", "k2"]]);
  assert.deepEqual(fixed.map((d) => d.day), [1, 2, 3]);
  // One day in each of two cities: the plan keeps the first rather than losing everything.
  const lone = repair([{ day: 1, stops: ["t1", "t2"] }, { day: 2, stops: ["k1"] }], [{ day: 1, code: "short_stay" }, { day: 2, code: "short_stay" }]);
  assert.deepEqual(lone.map((d) => d.stops), [["t1", "t2"]]);
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
  assert.match(root.steps.get("climate")!.res.textContent, /^habitual \d+° \/ -?\d+°/, "the climate is the usual weather, not a live reading");
  assert.match(root.steps.get("packing")!.res.textContent, /con abrigo/);
  assert.match(root.foot.innerHTML, /NASA POWER/);
  // Each step names the publisher behind its own answer; the traveler's profile has none.
  assert.match(root.steps.get("climate")!.by.textContent, /NASA POWER/);
  assert.ok(root.steps.get("entry")!.by.textContent.length > 0, "the entry step names its source");
  assert.equal(root.steps.get("profile")!.by.textContent, "");
  assert.ok(root.classes.has("m-done"));

  const after = (await s.call("trip_brief")).data;
  assert.equal(after.planned, 4, "four verified days were saved: Tokyo twice, Kyoto and Osaka once each, one city a day");
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

test("when the climate step fails, the spoken summary leaves the weather out instead of reading null", async () => {
  const s = await session("mission-no-climate", "es-MX");
  await s.call("update_traveler_profile", {
    homeCurrency: "MXN",
    travelers: [{ displayName: "Ana", passports: ["MX"], role: "self", ageBand: "adult" }],
  });
  await s.call("plan_trip", { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  const down = { callTool: (name: string, args: Record<string, unknown>) => (name === "get_trip_climate" ? Promise.reject(new Error("down")) : s.client.callTool(name, args)) };
  const root = fakeRoot();
  const res = await runMission({ client: down, lang: "es", brief: (await s.call("trip_brief")).data, root, minStepMs: 0 });
  assert.equal(root.steps.get("climate")!.dataset.state, "err");
  assert.doesNotMatch(res.voice, /null|undefined|unos/);
  assert.match(res.voice, /^Listo\. Revisé la entrada de 1 pasaportes/);
});

test("a request that names a place and its dates creates that trip first, then prepares it", async () => {
  const s = await session("mission-request", "en-US");
  await s.call("update_traveler_profile", {
    homeCurrency: "USD",
    travelers: [{ displayName: "Sam", passports: ["US"], role: "self", ageBand: "adult" }],
  });
  // No trip exists yet: the request is the only thing that creates one.
  const req = tripFromRequest("Get me ready for Japan from December 3 to 10", null);
  if (req.use !== "create") throw new Error("the request names a place and both dates");
  assert.deepEqual(req.trip, { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  const made = await makeTrip(s.client, req.trip);
  assert.equal(made.answer, undefined);
  assert.equal(made.brief.destination, "JP");
  // The panel the trip opens belongs to the trip just made: the host keeps its link only for that trip.
  assert.match(made.plan._meta.ui.resourceUri, /^ui:\/\//, "the trip opens its panel");
  assert.equal(made.plan.structuredContent.data.trip.tripId, made.brief.tripId);

  const root = fakeRoot();
  const res = await runMission({ client: s.client, lang: "en", brief: made.brief, root, minStepMs: 0 });
  assert.equal(root.steps.get("brief")!.dataset.state, "done");
  assert.match(res.voice, /^Done\. I checked entry for 1 passports/);
  assert.equal((await s.call("trip_brief")).data.destination, "JP", "the trip the request named is the one prepared");
});

test("a place without dates asks for them, unless it is the trip already on the screen", () => {
  assert.deepEqual(tripFromRequest("Prepárame para Japón", "MX"), { use: "ask" });
  assert.deepEqual(tripFromRequest("Prepárame para Japón", "JP"), { use: "current" });
  assert.deepEqual(tripFromRequest("Get me ready"), { use: "current" });
  // Dates for a place the browser does not know are not applied to the trip on the screen.
  assert.deepEqual(tripFromRequest("Get me ready for Portugal from March 1 to 5", "JP"), { use: "unknown" });
});

test("a trip with a traveler who has no passport is not created, and the server names the passport", async () => {
  const s = await session("mission-request-missing", "en-US");
  await s.call("update_traveler_profile", { travelers: [{ displayName: "Tom", role: "self", ageBand: "adult" }] });
  const made = await makeTrip(s.client, { destination: "JP", startDate: "2026-12-03", endDate: "2026-12-10" });
  assert.equal(made.brief, undefined, "no brief is read back for a trip that was not made");
  assert.ok(made.answer, "the server's answer is returned, so the host can show it");
  assert.ok(made.answer.structuredContent.missingFields.includes("passport:Tom"));
});
