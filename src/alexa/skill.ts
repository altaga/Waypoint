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
    unavailable: "Waypoint is not reachable right now. Try again in a moment.",
    help: "You can say: my passport is a country, plan a trip to a country, can I bring something to a country, do I need a visa for a country, what should I pack, or what is left for my trip.",
    bye: "Safe travels.",
  },
  "es-MX": {
    welcome: "Bienvenido a Waypoint. Dime a dónde vas y cuándo, por ejemplo: planea un viaje a Japón del 3 al 10 de diciembre.",
    welcomeBack: "Bienvenido de nuevo a Waypoint. ¿A dónde vas y cuándo?",
    askPassportFirst: "Para revisar visas necesito tu pasaporte. ¿De qué país es? Puedes decir más de uno.",
    askDestination: "¿A qué país?",
    askPassport: "¿De qué país es tu pasaporte?",
    unavailable: "Waypoint no está disponible en este momento. Intenta de nuevo en un momento.",
    help: "Puedes decir: mi pasaporte es de un país, planea un viaje a un país, puedo llevar algo a un país, necesito visa para un país, qué debo empacar, o qué me falta para mi viaje.",
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

function slot(handlerInput: HandlerInput, name: string): string | undefined {
  const req = handlerInput.requestEnvelope.request as { intent?: { slots?: Record<string, { value?: string }> } };
  return req.intent?.slots?.[name]?.value;
}

function speakResult(handlerInput: HandlerInput, r: ToolCall, title: string): Response {
  const locale = localeOf(handlerInput);
  const parts = [r.voice];
  if (r.missing.length) parts.push(locale === "es-MX" ? "Dime el país del pasaporte de cada viajero." : "Tell me each traveler's passport country.");
  const alreadyDisclaimed = /verify with the official source|verifica con la fuente oficial/i.test(r.voice);
  const text = r.isError || alreadyDisclaimed ? parts.join(" ") : `${parts.join(" ")} ${DISCLAIMER[locale]}`;
  return handlerInput.responseBuilder
    .speak(text)
    .withSimpleCard(title, r.rows.join("\n") || text)
    .getResponse();
}

async function run(handlerInput: HandlerInput, tool: string, args: Record<string, unknown>, title: string) {
  const locale = localeOf(handlerInput);
  const userId = handlerInput.requestEnvelope.context.System.user.userId;
  if (!canReachWaypoint()) return handlerInput.responseBuilder.speak(TEXT[locale].unavailable).getResponse();
  try {
    const r = await callWaypointTool(userId, tool, args, requestLocale(handlerInput));
    return speakResult(handlerInput, r, title);
  } catch {
    return handlerInput.responseBuilder.speak(TEXT[locale].unavailable).getResponse();
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
      return h.responseBuilder.speak(`${TEXT[locale].welcome} ${TEXT[locale].askPassportFirst}`).reprompt(TEXT[locale].askPassportFirst).getResponse();
    } catch {
      return h.responseBuilder.speak(TEXT[locale].welcome).reprompt(TEXT[locale].askDestination).getResponse();
    }
  },
};

const PlanTripHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "PlanTripIntent",
  async handle(h) {
    const destination = slot(h, "destination");
    const startDate = slot(h, "startDate");
    const endDate = slot(h, "endDate") ?? startDate;
    if (!destination) return h.responseBuilder.speak(TEXT[localeOf(h)].askDestination).reprompt(TEXT[localeOf(h)].askDestination).getResponse();
    if (!startDate) return h.responseBuilder.speak(localeOf(h) === "es-MX" ? "¿Cuándo sales?" : "When do you leave?").reprompt("When?").getResponse();
    return run(h, "plan_trip", { destination, startDate, endDate }, "Waypoint trip");
  },
};

const EntryHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "EntryIntent",
  async handle(h) {
    const destination = slot(h, "destination");
    if (!destination) return h.responseBuilder.speak(TEXT[localeOf(h)].askDestination).reprompt(TEXT[localeOf(h)].askDestination).getResponse();
    return run(h, "check_entry_requirements", { destination }, "Entry requirements");
  },
};

const RulesHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "RulesIntent",
  async handle(h) {
    const locale = localeOf(h);
    const destination = slot(h, "destination");
    if (!destination) return h.responseBuilder.speak(TEXT[locale].askDestination).reprompt(TEXT[locale].askDestination).getResponse();
    const item = slot(h, "item");
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
    const locale = localeOf(h);
    // One or two countries: a traveler can hold more than one passport.
    const passports = [slot(h, "country"), slot(h, "secondCountry")].filter((c): c is string => Boolean(c));
    if (!passports.length) return h.responseBuilder.speak(TEXT[locale].askPassport).reprompt(TEXT[locale].askPassport).getResponse();
    return run(
      h,
      "update_traveler_profile",
      { locale, travelers: [{ displayName: "Yo", role: "self", passports }] },
      "Traveler profile",
    );
  },
};

// Residence is saved apart from the passport: it affects where a visa is applied for.
const SetResidenceHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "SetResidenceIntent",
  async handle(h) {
    const locale = localeOf(h);
    const country = slot(h, "country");
    const ask = locale === "es-MX" ? "¿En qué país vives?" : "Which country do you live in?";
    if (!country) return h.responseBuilder.speak(ask).reprompt(ask).getResponse();
    return run(h, "update_traveler_profile", { locale, travelers: [{ displayName: "Yo", role: "self", residence: country }] }, "Traveler profile");
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
      PlanTripHandler,
      EntryHandler,
      RulesHandler,
      BriefHandler,
      PackingHandler,
      SetResidenceHandler,
      HelpHandler,
      StopHandler,
      SessionEndedHandler,
    )
    .addErrorHandlers(ErrorHandlerImpl)
    .withSkillId(process.env.ALEXA_SKILL_ID ?? "")
    .create();
}
