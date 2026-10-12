import { SkillBuilders, RequestHandler, ErrorHandler, HandlerInput } from "ask-sdk-core";
import { Response } from "ask-sdk-model";
import { callWaypointTool, ToolCall } from "./mcp-call.ts";

// Alexa custom skill. Each intent becomes one Waypoint MCP tool call.
// The MCP endpoint comes from WAYPOINT_MCP_URL (a public HTTPS /mcp URL).

const DISCLAIMER = {
  "en-US": "Rules change; verify with the official source before you travel.",
  "es-MX": "Las reglas cambian; verifica con la fuente oficial antes de viajar.",
};

const TEXT = {
  "en-US": {
    welcome: "Welcome to Waypoint. Tell me where you are going and when, for example: plan a trip to Japan from December 3 to 10.",
    askDestination: "Which country?",
    unavailable: "Waypoint is not reachable right now. Try again in a moment.",
    help: "You can say: plan a trip to a country, can I bring something to a country, do I need a visa for a country, or what is left for my trip.",
    bye: "Safe travels.",
  },
  "es-MX": {
    welcome: "Bienvenido a Waypoint. Dime a dónde vas y cuándo, por ejemplo: planea un viaje a Japón del 3 al 10 de diciembre.",
    askDestination: "¿A qué país?",
    unavailable: "Waypoint no está disponible en este momento. Intenta de nuevo en un momento.",
    help: "Puedes decir: planea un viaje a un país, puedo llevar algo a un país, necesito visa para un país, o qué me falta para mi viaje.",
    bye: "Buen viaje.",
  },
};

type Locale = keyof typeof TEXT;

function localeOf(handlerInput: HandlerInput): Locale {
  return handlerInput.requestEnvelope.request.locale?.startsWith("es") ? "es-MX" : "en-US";
}

function slot(handlerInput: HandlerInput, name: string): string | undefined {
  const req = handlerInput.requestEnvelope.request as { intent?: { slots?: Record<string, { value?: string }> } };
  return req.intent?.slots?.[name]?.value;
}

function speakResult(handlerInput: HandlerInput, r: ToolCall, title: string): Response {
  const locale = localeOf(handlerInput);
  const parts = [r.voice];
  if (r.missing.length) parts.push(locale === "es-MX" ? "Dime el país del pasaporte de cada viajero." : "Tell me each traveler's passport country.");
  const text = r.isError ? r.voice : `${parts.join(" ")} ${DISCLAIMER[locale]}`;
  return handlerInput.responseBuilder
    .speak(text)
    .withSimpleCard(title, r.rows.join("\n") || text)
    .getResponse();
}

const mcpUrl = () => process.env.WAYPOINT_MCP_URL ?? "";

async function run(handlerInput: HandlerInput, tool: string, args: Record<string, unknown>, title: string) {
  const locale = localeOf(handlerInput);
  const userId = handlerInput.requestEnvelope.context.System.user.userId;
  if (!mcpUrl()) return handlerInput.responseBuilder.speak(TEXT[locale].unavailable).getResponse();
  try {
    const r = await callWaypointTool(mcpUrl(), userId, tool, args);
    return speakResult(handlerInput, r, title);
  } catch {
    return handlerInput.responseBuilder.speak(TEXT[locale].unavailable).getResponse();
  }
}

const LaunchRequestHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "LaunchRequest",
  handle: (h) => h.responseBuilder.speak(TEXT[localeOf(h)].welcome).reprompt(TEXT[localeOf(h)].askDestination).getResponse(),
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
    const destination = slot(h, "destination");
    if (!destination) return h.responseBuilder.speak(TEXT[localeOf(h)].askDestination).reprompt(TEXT[localeOf(h)].askDestination).getResponse();
    return run(h, "get_local_rules", { destination, categories: ["prohibited_items"] }, "Local rules");
  },
};

const BriefHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "TripBriefIntent",
  handle: (h) => run(h, "trip_brief", {}, "What is left"),
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
    .addRequestHandlers(LaunchRequestHandler, PlanTripHandler, EntryHandler, RulesHandler, BriefHandler, HelpHandler, StopHandler, SessionEndedHandler)
    .addErrorHandlers(ErrorHandlerImpl)
    .withSkillId(process.env.ALEXA_SKILL_ID ?? "")
    .create();
}
