import { SkillBuilders, RequestHandler, ErrorHandler, HandlerInput } from "ask-sdk-core";
import { Response } from "ask-sdk-model";
import { callWaypointTool, canReachWaypoint, ToolCall } from "./mcp-call.ts";

// Alexa custom skill. Each intent becomes one Waypoint MCP tool call.
// The MCP endpoint comes from WAYPOINT_MCP_URL (a public HTTPS /mcp URL).

const DISCLAIMER = {
  "en-US": "Rules change; verify with the official source before you travel.",
  "es-MX": "Las reglas cambian; verifica con la fuente oficial antes de viajar.",
};

const TEXT = {
  "en-US": {
    welcome: "Welcome to Waypoint. Tell me where you are going and when, for example: plan a trip to Japan from December 3 to 10.",
    welcomeBack: "Welcome back to Waypoint. Where are you going and when?",
    askPassportFirst: "To check visas I need your passport. Which country issued it? You can say more than one.",
    askDestination: "Which country?",
    askPassport: "Which country issued your passport?",
    passportExample: "I didn't catch the country. Say, for example: my passport is from Mexico, or just: Mexican.",
    askResidence: "Which country do you live in?",
    residenceExample: "I didn't catch the country. Say, for example: I live in the United States.",
    askWhen: "When do you leave?",
    askTrip: "Where are you going and when?",
    needDates: (c: string) => `Tell me the dates too, for example: plan a trip to ${c} from December 3 to 10.`,
    which: (c: string) => `I heard ${c}. Is that your passport or where you are going? Say: my passport is from ${c}, or: plan a trip to ${c}.`,
    unavailable: "Waypoint is not reachable right now. Try again in a moment.",
    help: "You can say: my passport is a country, plan a trip to a country, can I bring something to a country, do I need a visa for a country, what should I pack, or what is left for my trip.",
    notUnderstood: "I didn't understand that. You can say: my passport is a country, or plan a trip to a country.",
    bye: "Safe travels.",
  },
  "es-MX": {
    welcome: "Bienvenido a Waypoint. Dime a dónde vas y cuándo, por ejemplo: planea un viaje a Japón del 3 al 10 de diciembre.",
    welcomeBack: "Bienvenido de nuevo a Waypoint. ¿A dónde vas y cuándo?",
    askPassportFirst: "Para revisar visas necesito tu pasaporte. ¿De qué país es? Puedes decir más de uno.",
    askDestination: "¿A qué país?",
    askPassport: "¿De qué país es tu pasaporte?",
    passportExample: "No alcancé a entender el país. Di, por ejemplo: mi pasaporte es de México, o solo: mexicano.",
    askResidence: "¿En qué país vives?",
    residenceExample: "No alcancé a entender el país. Di, por ejemplo: vivo en Estados Unidos.",
    askWhen: "¿Cuándo sales?",
    askTrip: "¿A dónde vas y cuándo?",
    needDates: (c: string) => `Dime también las fechas, por ejemplo: planea un viaje a ${c} del 3 al 10 de diciembre.`,
    which: (c: string) => `Entendí ${c}. ¿Es tu pasaporte o a dónde vas? Di: mi pasaporte es de ${c}, o: planea un viaje a ${c}.`,
    unavailable: "Waypoint no está disponible en este momento. Intenta de nuevo en un momento.",
    help: "Puedes decir: mi pasaporte es de un país, planea un viaje a un país, puedo llevar algo a un país, necesito visa para un país, qué debo empacar, o qué me falta para mi viaje.",
    notUnderstood: "No te entendí. Puedes decir: mi pasaporte es de un país, o planea un viaje a un país.",
    bye: "Buen viaje.",
  },
};

type Locale = keyof typeof TEXT;

function localeOf(handlerInput: HandlerInput): Locale {
  return handlerInput.requestEnvelope.request.locale?.startsWith("es") ? "es-MX" : "en-US";
}

// The language Alexa sends with the request, used when the server has no profile yet.
function requestLocale(handlerInput: HandlerInput): string | undefined {
  return handlerInput.requestEnvelope.request.locale;
}

type SlotMap = Record<
  string,
  { value?: string; resolutions?: { resolutionsPerAuthority?: { status?: { code?: string }; values?: { value?: { id?: string } }[] }[] } }
>;

function slots(handlerInput: HandlerInput): SlotMap {
  return (handlerInput.requestEnvelope.request as { intent?: { slots?: SlotMap } }).intent?.slots ?? {};
}

function slot(handlerInput: HandlerInput, name: string): string | undefined {
  return slots(handlerInput)[name]?.value;
}

// A country slot of the WaypointCountry type resolves to an ISO code ("mexicano" -> "MX").
// Without a resolution, the words the user said are passed on and the server resolves them.
function slotId(handlerInput: HandlerInput, name: string): string | undefined {
  const s = slots(handlerInput)[name];
  for (const authority of s?.resolutions?.resolutionsPerAuthority ?? []) {
    const id = authority.status?.code === "ER_SUCCESS_MATCH" ? authority.values?.[0]?.value?.id : undefined;
    if (id) return id;
  }
  return s?.value;
}

// What the skill just asked, so a bare answer ("Mexican") is read in the right role.
type Awaiting =
  | { kind: "passport" }
  | { kind: "residence" }
  | { kind: "plan"; startDate?: string; endDate?: string }
  | { kind: "entry" }
  | { kind: "rules"; item?: string };

function setAwaiting(h: HandlerInput, awaiting: Awaiting | null) {
  h.attributesManager.setSessionAttributes(awaiting ? { awaiting } : {});
}

function getAwaiting(h: HandlerInput): Awaiting | undefined {
  return (h.attributesManager.getSessionAttributes() as { awaiting?: Awaiting }).awaiting;
}

function ask(h: HandlerInput, awaiting: Awaiting, text: string, reprompt = text): Response {
  setAwaiting(h, awaiting);
  return h.responseBuilder.speak(text).reprompt(reprompt).getResponse();
}

function speakResult(handlerInput: HandlerInput, r: ToolCall, title: string, after?: string): Response {
  const locale = localeOf(handlerInput);
  const parts = [r.voice];
  if (r.missing.length) parts.push(locale === "es-MX" ? "Dime el país del pasaporte de cada viajero." : "Tell me each traveler's passport country.");
  const alreadyDisclaimed = /verify with the official source|verifica con la fuente oficial/i.test(r.voice);
  const base = r.isError || alreadyDisclaimed ? parts.join(" ") : `${parts.join(" ")} ${DISCLAIMER[locale]}`;
  const builder = handlerInput.responseBuilder.speak(after ? `${base} ${after}` : base).withSimpleCard(title, r.rows.join("\n") || base);
  if (after) builder.reprompt(after);
  return builder.getResponse();
}

async function run(handlerInput: HandlerInput, tool: string, args: Record<string, unknown>, title: string, after?: string) {
  const locale = localeOf(handlerInput);
  const userId = handlerInput.requestEnvelope.context.System.user.userId;
  if (!canReachWaypoint()) return handlerInput.responseBuilder.speak(TEXT[locale].unavailable).getResponse();
  try {
    const r = await callWaypointTool(userId, tool, args, requestLocale(handlerInput));
    return speakResult(handlerInput, r, title, after);
  } catch {
    return handlerInput.responseBuilder.speak(TEXT[locale].unavailable).getResponse();
  }
}

// Shared by the intent handlers and by a bare country answer.
async function savePassports(h: HandlerInput, passports: string[]) {
  const locale = localeOf(h);
  setAwaiting(h, null);
  // After saving, keep the conversation going with the next question.
  return run(h, "update_traveler_profile", { locale, travelers: [{ displayName: "Yo", role: "self", passports }] }, "Traveler profile", TEXT[locale].askTrip);
}

async function saveResidence(h: HandlerInput, country: string) {
  setAwaiting(h, null);
  return run(h, "update_traveler_profile", { locale: localeOf(h), travelers: [{ displayName: "Yo", role: "self", residence: country }] }, "Traveler profile");
}

async function entryAnswer(h: HandlerInput, destination: string) {
  setAwaiting(h, null);
  return run(h, "check_entry_requirements", { destination }, "Entry requirements");
}

async function planAnswer(h: HandlerInput, destination: string, startDate: string, endDate: string) {
  setAwaiting(h, null);
  return run(h, "plan_trip", { destination, startDate, endDate }, "Waypoint trip");
}

async function rulesAnswer(h: HandlerInput, destination: string, item?: string) {
  const locale = localeOf(h);
  setAwaiting(h, null);
  if (!item) return run(h, "get_local_rules", { destination, categories: ["prohibited_items"] }, "Local rules");
  // Item question: speak the matching official rule in the user's language; the quote stays in English.
  if (!canReachWaypoint()) return h.responseBuilder.speak(TEXT[locale].unavailable).getResponse();
  try {
    const r = await callWaypointTool(h.requestEnvelope.context.System.user.userId, "get_local_rules", { destination, item }, requestLocale(h));
    const matches = (r.data.matches as { quote: string }[] | undefined) ?? [];
    const es = locale === "es-MX";
    const speech = matches.length
      ? es
        ? `Sobre ${item} en ${destination}: ${matches[0].quote}. Este es el texto oficial en inglés. Las reglas cambian; verifica con la fuente oficial antes de viajar.`
        : `About ${item} in ${destination}: ${matches[0].quote}. Rules change; verify with the official source before you travel.`
      : es
        ? `No encontré una regla verificada sobre ${item} para ${destination}. Consulta la fuente oficial antes de viajar.`
        : `I found no verified rule about ${item} for ${destination}. Check the official source before you travel.`;
    return h.responseBuilder.speak(speech).withSimpleCard(es ? "Reglas locales" : "Local rules", speech).getResponse();
  } catch {
    return h.responseBuilder.speak(TEXT[locale].unavailable).getResponse();
  }
}

// On open, check whether a passport is on file. Without one, ask for it first, since visa answers depend on it.
const LaunchRequestHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "LaunchRequest",
  async handle(h) {
    const locale = localeOf(h);
    if (!canReachWaypoint()) return h.responseBuilder.speak(TEXT[locale].welcome).reprompt(TEXT[locale].askDestination).getResponse();
    try {
      const r = await callWaypointTool(h.requestEnvelope.context.System.user.userId, "get_traveler_profile", {}, requestLocale(h));
      const travelers = (r.data.profile as { travelers?: { passports: { country: string }[] }[] } | undefined)?.travelers ?? [];
      const hasPassport = travelers.some((t) => t.passports.length > 0);
      if (hasPassport) return h.responseBuilder.speak(TEXT[locale].welcomeBack).reprompt(TEXT[locale].askDestination).getResponse();
      return ask(h, { kind: "passport" }, `${TEXT[locale].welcome} ${TEXT[locale].askPassportFirst}`, TEXT[locale].askPassportFirst);
    } catch {
      return h.responseBuilder.speak(TEXT[locale].welcome).reprompt(TEXT[locale].askDestination).getResponse();
    }
  },
};

const PlanTripHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "PlanTripIntent",
  async handle(h) {
    const t = TEXT[localeOf(h)];
    const destination = slot(h, "destination");
    const startDate = slot(h, "startDate");
    const endDate = slot(h, "endDate") ?? startDate;
    if (!destination) return ask(h, { kind: "plan", startDate, endDate }, t.askDestination);
    if (!startDate) return h.responseBuilder.speak(t.askWhen).reprompt(t.askWhen).getResponse();
    return planAnswer(h, destination, startDate, endDate ?? startDate);
  },
};

const EntryHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "EntryIntent",
  async handle(h) {
    const destination = slot(h, "destination");
    if (!destination) return ask(h, { kind: "entry" }, TEXT[localeOf(h)].askDestination);
    return entryAnswer(h, destination);
  },
};

const RulesHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "RulesIntent",
  async handle(h) {
    const destination = slot(h, "destination");
    const item = slot(h, "item");
    if (!destination) return ask(h, { kind: "rules", item }, TEXT[localeOf(h)].askDestination);
    return rulesAnswer(h, destination, item);
  },
};

const BriefHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "TripBriefIntent",
  handle: (h) => run(h, "trip_brief", {}, "What is left"),
};

// A new Alexa user has no passport on file, and trip planning needs one. This saves the
// user's own passport country as the first traveler, so the voice path can reach trips.
const SetPassportHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "SetPassportIntent",
  async handle(h) {
    // One or two countries: a traveler can hold more than one passport.
    const passports = [slotId(h, "country"), slotId(h, "secondCountry")].filter((c): c is string => Boolean(c));
    if (!passports.length) return ask(h, { kind: "passport" }, TEXT[localeOf(h)].passportExample, TEXT[localeOf(h)].askPassport);
    return savePassports(h, passports);
  },
};

// Residence is saved apart from the passport: it affects where a visa is applied for.
const SetResidenceHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "SetResidenceIntent",
  async handle(h) {
    const country = slotId(h, "country");
    const t = TEXT[localeOf(h)];
    if (!country) return ask(h, { kind: "residence" }, t.residenceExample, t.askResidence);
    return saveResidence(h, country);
  },
};

// A bare country ("Mexican", "Japón"): read it by what the skill just asked.
const CountryAnswerHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "CountryAnswerIntent",
  async handle(h) {
    const locale = localeOf(h);
    const t = TEXT[locale];
    const country = slotId(h, "country");
    const spoken = slot(h, "country") ?? country;
    const awaiting = getAwaiting(h);
    if (!country || !spoken) return h.responseBuilder.speak(t.notUnderstood).reprompt(t.notUnderstood).getResponse();
    switch (awaiting?.kind) {
      case "passport":
        return savePassports(h, [country]);
      case "residence":
        return saveResidence(h, country);
      case "entry":
        return entryAnswer(h, country);
      case "rules":
        return rulesAnswer(h, country, awaiting.item);
      case "plan":
        if (awaiting.startDate) return planAnswer(h, country, awaiting.startDate, awaiting.endDate ?? awaiting.startDate);
        return h.responseBuilder.speak(t.needDates(spoken)).reprompt(t.needDates(spoken)).getResponse();
      default:
        // Nothing was asked: do not guess whether it is a passport or a destination.
        return h.responseBuilder.speak(t.which(spoken)).reprompt(t.which(spoken)).getResponse();
    }
  },
};

const PackingHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "PackingIntent",
  handle: (h) => run(h, "packing_checklist", {}, "Packing checklist"),
};

const HelpHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "AMAZON.HelpIntent",
  handle: (h) => h.responseBuilder.speak(TEXT[localeOf(h)].help).reprompt(TEXT[localeOf(h)].askDestination).getResponse(),
};

// When Alexa cannot match what was said: answer by what was asked, with an example.
const FallbackHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "AMAZON.FallbackIntent",
  handle(h) {
    const t = TEXT[localeOf(h)];
    const awaiting = getAwaiting(h);
    if (awaiting?.kind === "passport") return ask(h, awaiting, t.passportExample, t.askPassport);
    if (awaiting?.kind === "residence") return ask(h, awaiting, t.residenceExample, t.askResidence);
    return h.responseBuilder.speak(t.notUnderstood).reprompt(t.help).getResponse();
  },
};

const StopHandler: RequestHandler = {
  canHandle: (h) =>
    h.requestEnvelope.request.type === "IntentRequest" &&
    ["AMAZON.CancelIntent", "AMAZON.StopIntent"].includes(h.requestEnvelope.request.intent.name),
  handle: (h) => h.responseBuilder.speak(TEXT[localeOf(h)].bye).withShouldEndSession(true).getResponse(),
};

const SessionEndedHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "SessionEndedRequest",
  handle: (h) => h.responseBuilder.getResponse(),
};

const ErrorHandlerImpl: ErrorHandler = {
  canHandle: () => true,
  handle: (h, error) => {
    console.error("alexa handler error", error.name);
    return h.responseBuilder.speak(TEXT[localeOf(h)].unavailable).getResponse();
  },
};

export function buildSkill() {
  return SkillBuilders.custom()
    .addRequestHandlers(
      LaunchRequestHandler,
      SetPassportHandler,
      CountryAnswerHandler,
      PlanTripHandler,
      EntryHandler,
      RulesHandler,
      BriefHandler,
      PackingHandler,
      SetResidenceHandler,
      HelpHandler,
      FallbackHandler,
      StopHandler,
      SessionEndedHandler,
    )
    .addErrorHandlers(ErrorHandlerImpl)
    .withSkillId(process.env.ALEXA_SKILL_ID ?? "")
    .create();
}
