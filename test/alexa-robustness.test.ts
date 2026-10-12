import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { RequestEnvelope } from "ask-sdk-model";
import { createApp } from "../src/server.ts";
import { createContext } from "../src/context.ts";
import { createMemoryStore, type StateStore } from "../src/state.ts";
import { buildSkill } from "../src/alexa/skill.ts";
import { alexaUserKey } from "../src/alexa/mcp-call.ts";
import { TravelerProfile } from "../src/profile.ts";

// Robustness sweep, run before every deploy. Every intent of the interaction model, in four
// locales, three profile states and every pending question, with slots absent, empty (as Alexa
// sends them), valid, misspelled, garbage, special characters and every AMAZON.DATE shape.
// Each answer must hold the invariants in check(): no technical text, no crash message,
// one language, a question keeps the session open, valid SSML, within Alexa's size limit.

type Model = { interactionModel: { languageModel: { intents: { name: string; slots?: { name: string; type: string }[] }[] } } };
const MODEL = JSON.parse(readFileSync("skill/interactionModels/custom/en-US.json", "utf8")) as Model;
const INTENTS = MODEL.interactionModel.languageModel.intents;
const LOCALES = ["en-US", "es-MX", "es-US", "en-GB"] as const;
type Loc = (typeof LOCALES)[number];
const PROFILES = ["none", "passport", "trip"] as const;
type ProfileState = (typeof PROFILES)[number];
const NOW = "2026-10-12T12:00:00Z";

type SlotValue = { value?: string; id?: string; noMatch?: boolean };

const COUNTRY_VALUES: SlotValue[] = [
  { value: "Japan" }, { value: "Japón" }, { value: "Japn" }, { value: "asdfgh" }, { value: "Japan & <Korea>" },
  { value: "J" }, { value: "JP" }, { value: "🇯🇵" }, { value: "x".repeat(300) }, { value: "mexicano", id: "MX" },
  { value: "mexicanoo", noMatch: true }, { value: "Narnia", noMatch: true }, { value: '"Peru"' }, { value: "  " },
];
const DATE_VALUES: SlotValue[] = [
  { value: "2026-12-03" }, { value: "XXXX-XX-01" }, { value: "XXXX-12-01" }, { value: "2026-W50" }, { value: "2026-W50-WE" },
  { value: "2026-12" }, { value: "2026" }, { value: "PRESENT_REF" }, { value: "2026-WI" }, { value: "201X" },
  { value: "2026-02-30" }, { value: "2025-01-01" }, { value: "mañana" }, { value: "XXXX-WXX-1" },
];
const ITEM_VALUES: SlotValue[] = [
  { value: "chicles" }, { value: "vapes" }, { value: "& < > \" '" }, { value: "y".repeat(300) }, { value: "🍜" }, { value: "zxqv" },
];
const valuesFor = (type: string): SlotValue[] =>
  type === "AMAZON.DATE" ? DATE_VALUES : type === "AMAZON.SearchQuery" ? ITEM_VALUES : COUNTRY_VALUES;
const VALID: Record<string, SlotValue> = {
  "AMAZON.DATE": { value: "2026-12-03" },
  "AMAZON.Country": { value: "Japan" },
  WaypointCountry: { value: "Mexico", id: "MX" },
  "AMAZON.SearchQuery": { value: "chicles" },
};

const AWAITING = [
  null,
  { kind: "passport" },
  { kind: "residence" },
  { kind: "plan", startDate: "2026-12-03", endDate: "2026-12-10" },
  { kind: "plan" },
  { kind: "entry" },
  { kind: "rules", item: "chicles" },
  { kind: "rules" },
  { kind: "dates", destination: "Japan" },
];

let store: StateStore;
let n = 0;

function envelope(userId: string, locale: Loc, request: RequestEnvelope["request"], attributes: Record<string, unknown>): RequestEnvelope {
  return {
    version: "1.0",
    session: { new: false, sessionId: "amzn1.echo-api.session.sweep", application: { applicationId: "amzn1.ask.skill.test" }, user: { userId }, attributes },
    context: { System: { application: { applicationId: "amzn1.ask.skill.test" }, user: { userId }, device: { deviceId: "d", supportedInterfaces: {} }, apiEndpoint: "https://api.amazonalexa.com" } },
    request: { ...request, locale } as RequestEnvelope["request"],
  };
}

// Alexa sends every slot of the intent; an unfilled one has a name and no value.
function intentRequest(intent: { name: string; slots?: { name: string; type: string }[] }, filled: Record<string, SlotValue | "empty">, locale: Loc): RequestEnvelope["request"] {
  const slots: Record<string, unknown> = {};
  for (const s of intent.slots ?? []) {
    const v = filled[s.name];
    if (v === undefined) continue;
    if (v === "empty" || v.value === undefined) {
      slots[s.name] = { name: s.name, confirmationStatus: "NONE" };
      continue;
    }
    const resolutions = v.id
      ? { resolutionsPerAuthority: [{ authority: "a", status: { code: "ER_SUCCESS_MATCH" }, values: [{ value: { id: v.id, name: v.value } }] }] }
      : v.noMatch
        ? { resolutionsPerAuthority: [{ authority: "a", status: { code: "ER_SUCCESS_NO_MATCH" } }] }
        : undefined;
    slots[s.name] = { name: s.name, value: v.value, confirmationStatus: "NONE", ...(resolutions ? { resolutions } : {}) };
  }
  return { type: "IntentRequest", requestId: "r", timestamp: NOW, locale, dialogState: "STARTED", intent: { name: intent.name, confirmationStatus: "NONE", slots } } as RequestEnvelope["request"];
}

async function freshUser(state: ProfileState, locale: Loc): Promise<string> {
  const user = `amzn1.ask.account.SWEEP${String(++n).padStart(6, "0")}`;
  if (state === "none") return user;
  await store.save(alexaUserKey(user), {
    profile: TravelerProfile.parse({
      profileId: "p", ownerUserId: "alexa", homeCurrency: "MXN", homeTimezone: "America/Mexico_City", locale: locale.startsWith("es") ? "es-MX" : "en-US",
      travelers: [{ travelerId: "t", displayName: "Yo", role: "self", passports: [{ country: "MX" }] }],
      consent: { sensitiveData: false, updatedAt: NOW }, updatedAt: NOW,
    }),
    trips: [], expenses: [],
  });
  if (state === "trip") {
    const plan = INTENTS.find((i) => i.name === "PlanTripIntent")!;
    await buildSkill().invoke(envelope(user, locale, intentRequest(plan, { destination: { value: "Japan" }, startDate: { value: "2026-12-03" }, endDate: { value: "2026-12-10" } }, locale), {}));
  }
  return user;
}

const EN_MARKERS = ["Saved.", "Welcome", "Which country", "I didn't", "Rules change", "Tell me", "When do you", "Your passport", "You live", "I found no", "I don't have", "days until", "Still open", "Nothing pending", "Something didn't", "Your group", "You can say", "Safe travels", "Where are you going", "Waypoint is not reachable"];
const ES_MARKERS = ["¿", "Guardado", "Bienvenido", "Faltan", "Dime", "No entendí", "Tu pasaporte", "Las reglas", "Sin visa", "Puedes decir", "Buen viaje", "Vives en", " días", "Aún no", "No alcancé", "no está disponible"];

type Res = { response: { outputSpeech?: { ssml?: string }; reprompt?: unknown; shouldEndSession?: boolean } };

function check(res: Res, locale: Loc): string[] {
  const problems: string[] = [];
  const ssml = res.response.outputSpeech?.ssml;
  if (!ssml) return ["no speech"];
  const inner = ssml.replace(/^<speak>/, "").replace(/<\/speak>$/, "");
  if (/[<>]/.test(inner) || /&(?!amp;|lt;|gt;|quot;|apos;)/.test(inner)) problems.push("invalid SSML (unescaped & < >)");
  const text = inner.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  if (text.length > 8000) problems.push(`too long (${text.length})`);
  if (!text.trim()) problems.push("empty speech");
  const technical = /MCP error|Input validation|Invalid arguments|-32\d{3}|\bundefined\b|\bnull\b|NaN|\[object|YYYY|Error:|\.ts:\d|ZodError|Infinity/.exec(text);
  if (technical) problems.push(`technical text: ${technical[0]}`);
  if (/not reachable right now|no está disponible en este momento/.test(text)) problems.push("crash message (handler threw)");
  if (/(^|[\s(])-\d+ (days|días)/.test(text)) problems.push("negative day count");
  if (/(^|[.!?] )(Yo|Me|Self): /.test(text)) problems.push("table-style label in speech");
  if (/\b1 (días|days)\b/.test(text)) problems.push("plural with one");
  const es = locale.startsWith("es");
  for (const m of es ? EN_MARKERS : ES_MARKERS) if (text.includes(m)) problems.push(`wrong language: "${m}"`);
  if (/\?\s*$/.test(text) && (!res.response.reprompt || res.response.shouldEndSession === true)) problems.push("asks a question but closes the session");
  return problems;
}

before(() => {
  process.env.ALEXA_SKILL_ID = "amzn1.ask.skill.test";
  delete process.env.WAYPOINT_MCP_URL;
  store = createMemoryStore();
  createApp(createContext({ offline: true, store, clock: () => new Date(NOW) }));
});

const ENDS_SESSION = new Set(["AMAZON.StopIntent", "AMAZON.CancelIntent", "AMAZON.NoIntent", "SessionEndedRequest"]);

type Case = { label: string; locale: Loc; state: ProfileState; request: (l: Loc) => RequestEnvelope["request"]; attributes?: Record<string, unknown> };

async function sweep(cases: Case[]) {
  const failures: string[] = [];
  for (const c of cases) {
    const user = await freshUser(c.state, c.locale);
    let res: Res;
    try {
      res = (await buildSkill().invoke(envelope(user, c.locale, c.request(c.locale), c.attributes ?? {}))) as Res;
    } catch (e) {
      failures.push(`${c.label}: threw ${(e as Error).message}`);
      continue;
    }
    const problems = check(res, c.locale);
    // A closed session means the next sentence never reaches the skill (found by the live Alexa run).
    if (!ENDS_SESSION.has(c.label.split(" ")[0]) && !res.response.reprompt) problems.push("closes the session");
    if (problems.length) {
      const said = (res.response.outputSpeech?.ssml ?? "").replace(/<\/?speak>/g, "").slice(0, 160);
      failures.push(`${c.label}: ${problems.join("; ")} | said: ${said}`);
    }
  }
  return failures;
}

function report(failures: string[]) {
  assert.equal(failures.length, 0, `${failures.length} failing answers:\n` + [...new Set(failures)].slice(0, 40).join("\n"));
}

for (const intent of INTENTS) {
  test(`sweep: ${intent.name} with every slot shape`, async () => {
    const cases: Case[] = [];
    for (const locale of LOCALES) {
      for (const state of PROFILES) {
        const base = (label: string, filled: Record<string, SlotValue | "empty">) =>
          cases.push({ label: `${intent.name} ${locale} ${state} ${label}`, locale, state, request: (l: Loc) => intentRequest(intent, filled, l) });
        base("no slots", {});
        base("empty slots", Object.fromEntries((intent.slots ?? []).map((s) => [s.name, "empty" as const])));
        base("valid", Object.fromEntries((intent.slots ?? []).map((s) => [s.name, VALID[s.type]])));
        for (const s of intent.slots ?? []) {
          for (const v of valuesFor(s.type)) {
            const filled = Object.fromEntries((intent.slots ?? []).map((o) => [o.name, VALID[o.type]]));
            filled[s.name] = v;
            base(`${s.name}=${JSON.stringify(v.value)?.slice(0, 30)}`, filled);
          }
        }
      }
    }
    report(await sweep(cases));
  });

  test(`sweep: ${intent.name} with every pending question`, async () => {
    const cases: Case[] = [];
    for (const locale of LOCALES) {
      for (const state of PROFILES) {
        for (const awaiting of AWAITING) {
          for (const shape of ["valid", "no slots"] as const) {
            const filled = shape === "valid" ? Object.fromEntries((intent.slots ?? []).map((s) => [s.name, VALID[s.type]])) : {};
            cases.push({
              label: `${intent.name} ${locale} ${state} awaiting=${JSON.stringify(awaiting)} ${shape}`,
              locale, state, attributes: awaiting ? { awaiting } : {},
              request: (l: Loc) => intentRequest(intent, filled, l),
            });
          }
        }
      }
    }
    report(await sweep(cases));
  });
}

test("sweep: launch in every locale and profile state", async () => {
  const cases: Case[] = [];
  for (const locale of LOCALES)
    for (const state of PROFILES)
      cases.push({ label: `Launch ${locale} ${state}`, locale, state, request: (l: Loc) => ({ type: "LaunchRequest", requestId: "r", timestamp: NOW, locale: l }) as RequestEnvelope["request"] });
  report(await sweep(cases));
});

test("sweep: a session end never throws", async () => {
  for (const locale of LOCALES) {
    const res = await buildSkill().invoke(envelope("amzn1.ask.account.END", locale, { type: "SessionEndedRequest", requestId: "r", timestamp: NOW, locale, reason: "USER_INITIATED" } as RequestEnvelope["request"], {}));
    assert.ok(res);
  }
});

// Conversations in any order: random walks over the intents with random slot values, carrying
// the session attributes from each response into the next request, as Alexa does. Seeded, so a
// failure is reproducible from its seed and step.
function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

test("sweep: random conversations in any order keep every invariant", async () => {
  const failures: string[] = [];
  const WALKS = 150;
  const STEPS = 8;
  for (const locale of LOCALES) {
    for (let w = 0; w < WALKS; w++) {
      const seed = w * 7919 + locale.length * 104729 + (locale.startsWith("es") ? 13 : 0) + (locale.endsWith("US") ? 0 : 1);
      const rand = rng(seed);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
      const user = await freshUser(pick(PROFILES), locale);
      let attributes: Record<string, unknown> = {};
      const path: string[] = [];
      let previous = "";
      for (let step = 0; step < STEPS; step++) {
        const launch = rand() < 0.08;
        const intent = pick(INTENTS);
        const filled: Record<string, SlotValue | "empty"> = {};
        for (const s of intent.slots ?? []) {
          const r = rand();
          if (r < 0.15) continue;
          filled[s.name] = r < 0.25 ? "empty" : r < 0.65 ? VALID[s.type] : pick(valuesFor(s.type));
        }
        const request = launch ? ({ type: "LaunchRequest", requestId: "r", timestamp: NOW, locale } as RequestEnvelope["request"]) : intentRequest(intent, filled, locale);
        path.push(launch ? "Launch" : `${intent.name}(${Object.entries(filled).map(([k, v]) => `${k}=${v === "empty" ? "∅" : v.value?.slice(0, 12)}`).join(",")})`);
        let res: Res & { sessionAttributes?: Record<string, unknown> };
        try {
          res = (await buildSkill().invoke(envelope(user, locale, request, attributes))) as Res & { sessionAttributes?: Record<string, unknown> };
        } catch (e) {
          failures.push(`seed ${seed} ${locale} step ${step}: threw ${(e as Error).message} | ${path.join(" > ")}`);
          break;
        }
        const problems = check(res, locale);
        if (!launch && !ENDS_SESSION.has(intent.name) && !res.response.reprompt) problems.push("closes the session");
        // The same question right after the user answered it with a valid value is a loop.
        const now = res.response.outputSpeech?.ssml ?? "";
        // A loop is the same question right after the user answered exactly what was asked: a valid
        // country to a country question, or valid dates to a dates question.
        const asked = (attributes.awaiting as { kind?: string } | undefined)?.kind;
        const askedCountry = ["passport", "residence", "plan", "entry", "rules"].includes(asked ?? "");
        const directAnswer = !launch && ((askedCountry && intent.name === "CountryAnswerIntent") || (asked === "dates" && intent.name === "DatesAnswerIntent"));
        const answeredValidly = directAnswer && Object.values(filled).some((v) => v !== "empty" && Object.values(VALID).includes(v));
        if (answeredValidly && now === previous && /\?\s*<\/speak>$/.test(now)) problems.push("repeated the same question after a valid answer");
        previous = now;
        if (problems.length) {
          const said = (res.response.outputSpeech?.ssml ?? "").replace(/<\/?speak>/g, "").slice(0, 140);
          failures.push(`seed ${seed} ${locale} step ${step}: ${problems.join("; ")} | said: ${said} | path: ${path.join(" > ")}`);
          break;
        }
        // Stop and Cancel end the session, as on a device.
        attributes = res.response.shouldEndSession ? {} : (res.sessionAttributes ?? {});
      }
    }
  }
  report(failures);
});
