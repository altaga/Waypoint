import { test, before } from "node:test";
import assert from "node:assert/strict";
import type { RequestEnvelope } from "ask-sdk-model";
import { createApp } from "../src/server.ts";
import { createContext, type AppContext } from "../src/context.ts";
import { createMemoryStore, type StateStore } from "../src/state.ts";
import { buildSkill } from "../src/alexa/skill.ts";
import { alexaUserKey, callWaypointTool } from "../src/alexa/mcp-call.ts";
import { TravelerProfile } from "../src/profile.ts";

// Conversation coverage for the Alexa skill, offline. Each case sends one utterance as the
// intent Alexa's NLU would send (name + slots + locale) through the real handlers and the
// in-process Waypoint server. Not proven here: that Alexa maps the spoken words to that
// intent. That is checked on the developer console Test page and on a phone.

type Locale = "es-MX" | "en-US";
type Case = { say: string; locale: Locale; intent: string; slots?: Record<string, string>; expect: RegExp };

const SEEDED_ES = "amzn1.ask.account.SEEDEDES0000000000000000000000000000000";
const SEEDED_EN = "amzn1.ask.account.SEEDEDEN0000000000000000000000000000000";
const TRIP = { startDate: "2026-12-03", endDate: "2026-12-10" };
let fresh = 0;
const freshUser = () => `amzn1.ask.account.FRESH${String(++fresh).padStart(4, "0")}000000000000000000000000000`;

let store: StateStore;

function envelope(userId: string, intent: string, slots: Record<string, string> = {}, locale: Locale = "en-US"): RequestEnvelope {
  return {
    version: "1.0",
    session: { new: true, sessionId: "amzn1.echo-api.session.conv", application: { applicationId: "amzn1.ask.skill.test" }, user: { userId }, attributes: {} },
    context: {
      System: {
        application: { applicationId: "amzn1.ask.skill.test" },
        user: { userId },
        device: { deviceId: "d", supportedInterfaces: {} },
        apiEndpoint: "https://api.amazonalexa.com",
      },
    },
    request: {
      type: "IntentRequest",
      dialogState: "STARTED",
      requestId: "amzn1.echo-api.request.conv",
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

function speechOf(res: unknown): string {
  return ((res as { response: { outputSpeech: { ssml: string } } }).response.outputSpeech.ssml ?? "").replace(/<[^>]+>/g, "");
}

// Each turn is a separate skill invocation, as on a device, so state must live in the store.
async function turn(userId: string, intent: string, slots: Record<string, string> = {}, locale: Locale = "en-US") {
  return speechOf(await buildSkill().invoke(envelope(userId, intent, slots, locale)));
}

function profileWith(passport: string | null, locale: Locale) {
  return TravelerProfile.parse({
    profileId: "p",
    ownerUserId: "alexa",
    homeCurrency: "MXN",
    homeTimezone: "America/Mexico_City",
    locale,
    travelers: [{ travelerId: "t", displayName: "Yo", passports: passport ? [{ country: passport }] : [] }],
    consent: { sensitiveData: false, updatedAt: "2026-10-11T00:00:00Z" },
    updatedAt: "2026-10-11T00:00:00Z",
  });
}

before(async () => {
  process.env.ALEXA_SKILL_ID = "amzn1.ask.skill.test";
  delete process.env.WAYPOINT_MCP_URL; // in-process path, same as Lambda
  store = createMemoryStore();
  const ctx: AppContext = createContext({ offline: true, store, clock: () => new Date("2026-10-11T12:00:00Z") });
  createApp(ctx); // registers the in-process MCP factory the skill uses
  // Seeded users: a Mexican passport and a Japan trip. The profile locale sets the voice language.
  for (const [user, locale] of [[SEEDED_ES, "es-MX"], [SEEDED_EN, "en-US"]] as const) {
    await store.save(alexaUserKey(user), { profile: profileWith("MX", locale), trips: [], expenses: [] });
    await turn(user, "PlanTripIntent", { destination: "Japan", ...TRIP }, locale);
  }
});

const SINGLE: Case[] = [
  // Trip planning
  { say: "planea un viaje a Japón del 3 al 10 de diciembre", locale: "es-MX", intent: "PlanTripIntent", slots: { destination: "Japón", startDate: "2026-12-03", endDate: "2026-12-10" }, expect: /Japón|Japan|días|days/i },
  { say: "plan a trip to Japan from December 3 to 10", locale: "en-US", intent: "PlanTripIntent", slots: { destination: "Japan", startDate: "2026-12-03", endDate: "2026-12-10" }, expect: /Japan|days/i },
  { say: "quiero viajar a Singapur el 5 de diciembre", locale: "es-MX", intent: "PlanTripIntent", slots: { destination: "Singapur", startDate: "2026-12-05" }, expect: /Singapur|Singapore|días|days/i },
  { say: "I want to go to Thailand on December 5", locale: "en-US", intent: "PlanTripIntent", slots: { destination: "Thailand", startDate: "2026-12-05" }, expect: /Thailand|days/i },
  { say: "planea un viaje a Francia", locale: "es-MX", intent: "PlanTripIntent", slots: { destination: "Francia" }, expect: /¿Cuándo sales\?/i },
  { say: "plan a trip", locale: "en-US", intent: "PlanTripIntent", expect: /Which country\?/i },
  { say: "planea un viaje", locale: "es-MX", intent: "PlanTripIntent", expect: /¿A qué país\?/i },
  { say: "voy a Canadá del 1 al 8 de diciembre", locale: "es-MX", intent: "PlanTripIntent", slots: { destination: "Canadá", startDate: "2026-12-01", endDate: "2026-12-08" }, expect: /Canad|días|days/i },
  { say: "I am going to Peru from December 1 to 8", locale: "en-US", intent: "PlanTripIntent", slots: { destination: "Peru", startDate: "2026-12-01", endDate: "2026-12-08" }, expect: /Peru|days/i },
  { say: "quiero ir a Corea del Sur el 20 de diciembre", locale: "es-MX", intent: "PlanTripIntent", slots: { destination: "Corea del Sur", startDate: "2026-12-20" }, expect: /Corea|Korea|días|days/i },
  { say: "quiero viajar a Italia el 10 de diciembre", locale: "es-MX", intent: "PlanTripIntent", slots: { destination: "Italia", startDate: "2026-12-10" }, expect: /Italia|Italy|días|days/i },
  { say: "I want to visit Japan", locale: "en-US", intent: "PlanTripIntent", slots: { destination: "Japan" }, expect: /When do you leave/i },
  { say: "planea un viaje a Brasil del 1 al 5 de diciembre", locale: "es-MX", intent: "PlanTripIntent", slots: { destination: "Brasil", startDate: "2026-12-01", endDate: "2026-12-05" }, expect: /Brasil|Brazil|días|days/i },
  { say: "plan a trip to Peru on December 2", locale: "en-US", intent: "PlanTripIntent", slots: { destination: "Peru", startDate: "2026-12-02" }, expect: /Peru|days/i },
  // Entry requirements (visa questions)
  { say: "necesito visa para Japón", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Japón" }, expect: /visa|entrada|Sin visa/i },
  { say: "do I need a visa for Japan", locale: "en-US", intent: "EntryIntent", slots: { destination: "Japan" }, expect: /visa|entry|Sin visa/i },
  { say: "puedo entrar a Singapur", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Singapur" }, expect: /visa|entrada|Sin visa|sin visa/i },
  { say: "can I enter Thailand", locale: "en-US", intent: "EntryIntent", slots: { destination: "Thailand" }, expect: /visa|entry|Sin visa/i },
  { say: "cuáles son los requisitos de entrada a Francia", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Francia" }, expect: /visa|entrada|Sin visa|sin visa/i },
  { say: "what are the entry requirements for Germany", locale: "en-US", intent: "EntryIntent", slots: { destination: "Germany" }, expect: /visa|entry|Sin visa/i },
  { say: "necesito visa para Estados Unidos", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Estados Unidos" }, expect: /visa|Estados Unidos|United States/i },
  { say: "do I need a visa for Brazil", locale: "en-US", intent: "EntryIntent", slots: { destination: "Brazil" }, expect: /visa|Brazil|Brasil/i },
  { say: "puedo entrar a Perú", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Perú" }, expect: /visa|Perú|Peru|entrada|Sin visa/i },
  { say: "do I need a visa for Colombia", locale: "en-US", intent: "EntryIntent", slots: { destination: "Colombia" }, expect: /visa|Colombia|entry/i },
  { say: "necesito visa para Italia", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Italia" }, expect: /visa|Italia|Italy|entrada|Sin visa/i },
  { say: "can I go to Spain", locale: "en-US", intent: "EntryIntent", slots: { destination: "Spain" }, expect: /visa|Spain|entry|Sin visa/i },
  { say: "necesito visa para Rusia", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Rusia" }, expect: /visa|Rusia|Russia|entrada|Sin visa/i },
  { say: "do I need a visa for Egypt", locale: "en-US", intent: "EntryIntent", slots: { destination: "Egypt" }, expect: /visa|Egypt|entry|Sin visa/i },
  { say: "puedo entrar a Vietnam", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Vietnam" }, expect: /visa|Vietnam|entrada|Sin visa/i },
  { say: "do I need a visa for Australia", locale: "en-US", intent: "EntryIntent", slots: { destination: "Australia" }, expect: /visa|Australia|entry|Sin visa/i },
  { say: "necesito visa", locale: "es-MX", intent: "EntryIntent", expect: /¿A qué país\?/i },
  { say: "do I need a visa", locale: "en-US", intent: "EntryIntent", expect: /Which country\?/i },
  { say: "a dónde puedo ir sin visa", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Tailandia" }, expect: /visa|Tailandia|Thailand|entrada|Sin visa/i },
  // Rules: items the traveler wants to bring
  { say: "puedo llevar chicles a Singapur", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Singapur", item: "chicles" }, expect: /chewing gum/i },
  { say: "can I bring gum to Singapore", locale: "en-US", intent: "RulesIntent", slots: { destination: "Singapore", item: "gum" }, expect: /chewing gum/i },
  { say: "puedo llevar vapes a Singapur", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Singapur", item: "vapes" }, expect: /vape|e-cigarette/i },
  { say: "can I bring vapes to Singapore", locale: "en-US", intent: "RulesIntent", slots: { destination: "Singapore", item: "vapes" }, expect: /vape|e-cigarette/i },
  { say: "puedo llevar carne a Japón", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Japón", item: "carne" }, expect: /meat/i },
  { say: "can I bring meat to Japan", locale: "en-US", intent: "RulesIntent", slots: { destination: "Japan", item: "meat" }, expect: /meat/i },
  { say: "puedo llevar jamón a Japón", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Japón", item: "jamón" }, expect: /meat|ham|verifica|no encontré/i },
  { say: "puedo llevar medicamentos a Singapur", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Singapur", item: "medicamentos" }, expect: /medic|medicine|drug/i },
  { say: "can I bring medicine to Singapore", locale: "en-US", intent: "RulesIntent", slots: { destination: "Singapore", item: "medicine" }, expect: /medic|drug/i },
  { say: "puedo llevar alcohol a Japón", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Japón", item: "alcohol" }, expect: /alcohol|liquor/i },
  { say: "can I bring alcohol to Singapore", locale: "en-US", intent: "RulesIntent", slots: { destination: "Singapore", item: "alcohol" }, expect: /alcohol|liquor/i },
  { say: "puedo llevar drogas a Singapur", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Singapur", item: "drogas" }, expect: /drug|illegal/i },
  { say: "can I bring plants to Japan", locale: "en-US", intent: "RulesIntent", slots: { destination: "Japan", item: "plants" }, expect: /plant|verify|no verified/i },
  { say: "puedo llevar fruta a Japón", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Japón", item: "fruta" }, expect: /fruit|fruta|verifica|no encontré/i },
  { say: "can I bring a knife to Singapore", locale: "en-US", intent: "RulesIntent", slots: { destination: "Singapore", item: "knife" }, expect: /knife|weapon|no verified|verify/i },
  { say: "puedo llevar un cuchillo a Japón", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Japón", item: "cuchillo" }, expect: /knife|weapon|verifica|no encontré/i },
  { say: "can I bring cheese to Japan", locale: "en-US", intent: "RulesIntent", slots: { destination: "Japan", item: "cheese" }, expect: /cheese|dairy|verify|no verified/i },
  { say: "can I bring a laser pointer to Singapore", locale: "en-US", intent: "RulesIntent", slots: { destination: "Singapore", item: "laser pointer" }, expect: /laser|verify|no verified/i },
  { say: "puedo llevar balones de fútbol a Singapur", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Singapur", item: "balones de fútbol" }, expect: /no encontré una regla verificada/i },
  { say: "can I bring soccer balls to Singapore", locale: "en-US", intent: "RulesIntent", slots: { destination: "Singapore", item: "soccer balls" }, expect: /no verified rule about soccer balls/i },
  { say: "puedo llevar pescado a Japón", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Japón", item: "pescado" }, expect: /verifica|no encontré|fish|meat|regla/i },
  { say: "can I bring cigarettes to Singapore", locale: "en-US", intent: "RulesIntent", slots: { destination: "Singapore", item: "cigarettes" }, expect: /cigarette|vape|tobacco|verify|no verified/i },
  { say: "puedo llevar cigarros a Singapur", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Singapur", item: "cigarros" }, expect: /cigarr|tobacco|vape|verifica|no encontré/i },
  { say: "is it allowed to bring vapes to Japan", locale: "en-US", intent: "RulesIntent", slots: { destination: "Japan", item: "vapes" }, expect: /vape|e-cigarette|verify|no verified/i },
  { say: "qué no puedo llevar a Singapur", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Singapur" }, expect: /Reglas|vape|confiscat|prohib|regla/i },
  { say: "what am I not allowed to bring to Singapore", locale: "en-US", intent: "RulesIntent", slots: { destination: "Singapore" }, expect: /vape|confiscat|prohib|rule/i },
  { say: "cuáles son las reglas locales en Japón", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Japón" }, expect: /Japan|Japón|regla|rule/i },
  { say: "qué está prohibido en Japón", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Japón" }, expect: /Japan|Japón|regla|rule|prohib/i },
  { say: "qué no puedo llevar a Japón", locale: "es-MX", intent: "RulesIntent", slots: { destination: "Japón" }, expect: /Japan|Japón|regla|rule/i },
  { say: "rules for Japan", locale: "en-US", intent: "RulesIntent", slots: { destination: "Japan" }, expect: /Japan|rule/i },
  // Trip brief and packing (seeded trip to Japan)
  { say: "qué me falta para mi viaje", locale: "es-MX", intent: "TripBriefIntent", expect: /Faltan|días|Pendiente/i },
  { say: "qué está pendiente de mi viaje", locale: "es-MX", intent: "TripBriefIntent", expect: /Faltan|días|Pendiente/i },
  { say: "qué falta por hacer", locale: "es-MX", intent: "TripBriefIntent", expect: /Faltan|Pendiente|días/i },
  { say: "what is left for my trip", locale: "en-US", intent: "TripBriefIntent", expect: /days|Pending|left/i },
  { say: "what do I still have to do", locale: "en-US", intent: "TripBriefIntent", expect: /days|Pending|left/i },
  { say: "what should I pack", locale: "en-US", intent: "PackingIntent", expect: /items|checklist|pack|Tu lista/i },
  { say: "what do I need to pack for my trip", locale: "en-US", intent: "PackingIntent", expect: /items|checklist|Tu lista/i },
  { say: "make my packing list", locale: "en-US", intent: "PackingIntent", expect: /items|checklist|Tu lista/i },
  { say: "qué debo empacar", locale: "es-MX", intent: "PackingIntent", expect: /lista|artículos|empacar|Tu lista/i },
  { say: "haz mi lista de equipaje", locale: "es-MX", intent: "PackingIntent", expect: /lista|Tu lista|artículos/i },
  { say: "qué empaco para mi viaje", locale: "es-MX", intent: "PackingIntent", expect: /lista|artículos|Tu lista/i },
  // Help, stop, cancel
  { say: "ayuda", locale: "es-MX", intent: "AMAZON.HelpIntent", expect: /Puedes decir/i },
  { say: "qué puedo decirte", locale: "es-MX", intent: "AMAZON.HelpIntent", expect: /Puedes decir/i },
  { say: "help", locale: "en-US", intent: "AMAZON.HelpIntent", expect: /You can say/i },
  { say: "what can you do", locale: "en-US", intent: "AMAZON.HelpIntent", expect: /You can say/i },
  { say: "cancelar", locale: "es-MX", intent: "AMAZON.CancelIntent", expect: /Buen viaje/i },
  { say: "stop", locale: "en-US", intent: "AMAZON.StopIntent", expect: /Safe travels/i },
  // Passport set on a new user (each case gets its own user, so none leak into the others)
  { say: "mi pasaporte es de Argentina", locale: "es-MX", intent: "SetPassportIntent", slots: { country: "Argentina" }, expect: /Guardado|Argentina/i },
  { say: "my passport is from Canada", locale: "en-US", intent: "SetPassportIntent", slots: { country: "Canada" }, expect: /Saved|Canad|Guardado/i },
  { say: "soy de Colombia", locale: "es-MX", intent: "SetPassportIntent", slots: { country: "Colombia" }, expect: /Guardado|Colombia/i },
  { say: "I am from Peru", locale: "en-US", intent: "SetPassportIntent", slots: { country: "Peru" }, expect: /Saved|Peru|Guardado/i },
  { say: "mi nacionalidad es Brasil", locale: "es-MX", intent: "SetPassportIntent", slots: { country: "Brasil" }, expect: /Guardado|Brasil|Brazil/i },
  { say: "my nationality is Japan", locale: "en-US", intent: "SetPassportIntent", slots: { country: "Japan" }, expect: /Saved|Japan|Guardado/i },
  { say: "mi pasaporte es de España", locale: "es-MX", intent: "SetPassportIntent", slots: { country: "España" }, expect: /Guardado|España|Spain/i },
  { say: "my passport is Germany", locale: "en-US", intent: "SetPassportIntent", slots: { country: "Germany" }, expect: /Saved|Germany|Guardado/i },
  { say: "soy de Estados Unidos", locale: "es-MX", intent: "SetPassportIntent", slots: { country: "Estados Unidos" }, expect: /Guardado|Estados Unidos|United States/i },
  { say: "I hold a Mexican passport", locale: "en-US", intent: "SetPassportIntent", slots: { country: "Mexico" }, expect: /Saved|Mexico|México|Guardado/i },
  { say: "mi pasaporte es", locale: "es-MX", intent: "SetPassportIntent", expect: /¿De qué país es tu pasaporte\?/i },
  { say: "my passport is", locale: "en-US", intent: "SetPassportIntent", expect: /Which country issued your passport/i },
  // Unknown input is answered honestly, not with a guess
  { say: "puedo llevar algo a Narnia", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Narnia" }, expect: /no tengo información|Narnia/i },
  { say: "necesito visa para Atlantis", locale: "es-MX", intent: "EntryIntent", slots: { destination: "Atlantis" }, expect: /no tengo información|Atlantis/i },
  { say: "do I need a visa for Narnia", locale: "en-US", intent: "EntryIntent", slots: { destination: "Narnia" }, expect: /don't have entry information|Narnia/i },
  // Launch: welcome
  { say: "abre waypoint", locale: "es-MX", intent: "LaunchRequest", expect: /Bienvenido/i },
  { say: "open waypoint", locale: "en-US", intent: "LaunchRequest", expect: /Welcome/i },
];

// Which user a single-turn case runs as: a new user for passport cases, otherwise the seeded user for its language.
const userFor = (c: Case, i: number) => (c.intent === "SetPassportIntent" ? freshUser() : c.locale === "es-MX" ? SEEDED_ES : SEEDED_EN);

SINGLE.forEach((c, i) => {
  test(`[${c.locale}] "${c.say}" -> ${c.intent}`, async () => {
    const user = userFor(c, i);
    let text: string;
    if (c.intent === "LaunchRequest") {
      const env = envelope(user, "AMAZON.HelpIntent", {}, c.locale);
      env.request = { type: "LaunchRequest", requestId: "amzn1.echo-api.request.launch", timestamp: "2026-10-11T12:00:00Z", locale: c.locale } as RequestEnvelope["request"];
      text = speechOf(await buildSkill().invoke(env));
    } else {
      text = await turn(user, c.intent, c.slots ?? {}, c.locale);
    }
    assert.match(text, c.expect);
    assert.doesNotMatch(text, /get_local_rules|plan_trip|update_traveler_profile|packing_checklist|check_entry_requirements|trip_brief|structuredContent|tools\/call|undefined|\[object/);
  });
});

// Multi-turn chains. Each turn is one skill invocation, run in order, against one user.

test("chain: new user asks for a trip, gives the passport, then plans and checks what is left", async () => {
  const user = freshUser();
  assert.match(await turn(user, "PlanTripIntent", { destination: "Japan", ...TRIP }, "en-US"), /nationality|passport/i, "without a passport, the skill asks for it");
  assert.match(await turn(user, "SetPassportIntent", { country: "Mexico" }, "en-US"), /Saved|Guardado/i);
  assert.match(await turn(user, "PlanTripIntent", { destination: "Japan", ...TRIP }, "en-US"), /Japan|days/i);
  assert.match(await turn(user, "TripBriefIntent", {}, "en-US"), /days|left|Pending/i);
  assert.match(await turn(user, "PackingIntent", {}, "en-US"), /items|checklist|Tu lista/i);
});

test("chain (es-MX): passport, trip to Japón, visa, item rule, packing", async () => {
  const user = freshUser();
  assert.match(await turn(user, "SetPassportIntent", { country: "México" }, "es-MX"), /Guardado/i);
  assert.match(await turn(user, "PlanTripIntent", { destination: "Japón", ...TRIP }, "es-MX"), /Japón|días/i);
  assert.match(await turn(user, "EntryIntent", { destination: "Japón" }, "es-MX"), /visa|Sin visa/i);
  assert.match(await turn(user, "RulesIntent", { destination: "Japón", item: "carne" }, "es-MX"), /meat/i);
  assert.match(await turn(user, "PackingIntent", {}, "es-MX"), /lista|Tu lista/i);
});

test("chain: asking what is left before any trip says there is no trip, and does not invent one", async () => {
  const user = freshUser();
  await turn(user, "SetPassportIntent", { country: "United States" }, "en-US");
  assert.match(await turn(user, "TripBriefIntent", {}, "en-US"), /don't have a trip yet/i);
  assert.match(await turn(user, "EntryIntent", { destination: "Japan" }, "en-US"), /visa|entry|Sin visa/i);
});

test("chain: a Spanish user with no passport gets the question in Spanish", async () => {
  const user = freshUser();
  assert.match(await turn(user, "PlanTripIntent", { destination: "Japón", ...TRIP }, "es-MX"), /pasaporte|nacionalidad/i);
});

test("chain: two users do not see each other's passport or trip", async () => {
  const a = freshUser();
  const b = freshUser();
  await turn(a, "SetPassportIntent", { country: "Argentina" }, "es-MX");
  assert.match(await turn(b, "PlanTripIntent", { destination: "Japan", ...TRIP }, "en-US"), /nationality|passport/i, "user B has no passport of their own");
});

// Launch checks the passport on open, and a passport can be more than one country.
const launch = async (user: string, locale: Locale) => {
  const env = envelope(user, "AMAZON.HelpIntent", {}, locale);
  env.request = { type: "LaunchRequest", requestId: "amzn1.echo-api.request.launch", timestamp: "2026-10-11T12:00:00Z", locale } as RequestEnvelope["request"];
  return speechOf(await buildSkill().invoke(env));
};

test("launch with no passport on file asks for it, and says more than one is fine", async () => {
  const text = await launch(freshUser(), "en-US");
  assert.match(text, /need your passport/i);
  assert.match(text, /more than one/i);
});

test("launch for a user with a passport on file welcomes them back without asking again", async () => {
  const text = await launch(SEEDED_EN, "en-US");
  assert.match(text, /Welcome back/i);
  assert.doesNotMatch(text, /need your passport/i);
});

test("launch in Spanish with no passport asks for el pasaporte", async () => {
  assert.match(await launch(freshUser(), "es-MX"), /necesito tu pasaporte/i);
});

test("two passports in one utterance are both saved on the traveler", async () => {
  const user = freshUser();
  assert.match(await turn(user, "SetPassportIntent", { country: "México", secondCountry: "España" }, "es-MX"), /Guardado/i);
  const r = await callWaypointTool(user, "get_traveler_profile", {});
  const profile = r.data.profile as { travelers: { passports: { country: string }[] }[] };
  assert.deepEqual(profile.travelers[0].passports.map((p) => p.country), ["MX", "ES"]);
});

// Residence is separate from passport. It is saved, and it adds a caveat to visa answers.
test("chain: residence is saved, and the entry answer says it can change where to apply", async () => {
  const user = freshUser();
  await turn(user, "SetPassportIntent", { country: "México" }, "es-MX");
  assert.match(await turn(user, "SetResidenceIntent", { country: "Estados Unidos" }, "es-MX"), /Guardado/i);
  const r = await callWaypointTool(user, "get_traveler_profile", {});
  assert.equal((r.data.profile as { travelers: { residenceCountry?: string }[] }).travelers[0].residenceCountry, "US");
  const entry = await turn(user, "EntryIntent", { destination: "Japón" }, "es-MX");
  assert.match(entry, /residencia en Estados Unidos.*consulado/is);
});

test("entry answers without a residence on file have no residence caveat", async () => {
  assert.doesNotMatch(await turn(SEEDED_ES, "EntryIntent", { destination: "Japón" }, "es-MX"), /residencia/i);
});

test("residence without a country asks which country", async () => {
  assert.match(await turn(freshUser(), "SetResidenceIntent", {}, "en-US"), /Which country do you live in/i);
});
