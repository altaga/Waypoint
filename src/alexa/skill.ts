import { SkillBuilders, RequestHandler, ErrorHandler, HandlerInput, ResponseInterceptor } from "ask-sdk-core";
import { Response } from "ask-sdk-model";
import { callWaypointTool, canReachWaypoint, ToolCall } from "./mcp-call.ts";
import { resolveTripDates, tripDateProblem } from "./dates.ts";
import { countryName, resolveCountry } from "../countries.ts";
import { spokenDates } from "../voice.ts";

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
    welcomeNoPassport: "Welcome to Waypoint. To check visas, first tell me which country issued your passport. You can say more than one.",
    askDestination: "Which country?",
    askPassport: "Which country issued your passport?",
    passportExample: "I didn't catch the country. Say, for example: my passport is from Mexico, or just: Mexican.",
    askResidence: "Which country do you live in?",
    residenceExample: "I didn't catch the country. Say, for example: I live in the United States.",
    askWhen: "When do you leave?",
    datesExample: "I didn't get the dates. Say the day and month, for example: from December 1 to 25.",
    datesPast: (when: string) => `${when.replace(/^on /, "")} has already passed. Tell me future dates, for example: from December 1 to 25.`,
    askReturn: "And when do you come back?",
    askLeave: "What day do you leave?",
    datesNoted: "Got the dates. Which country are you going to?",
    unknownPlace: (place: string) => `I don't recognize "${place}" as a destination. Which country are you going to?`,
    datesTooLong: "That trip is longer than a year. Tell me shorter dates, for example: from December 1 to 25.",
    somethingWrong: "Something didn't work with that. Try again in other words.",
    askTrip: "Where are you going and when?",
    afterTrip: "You can ask me what you can't bring, or for your packing list.",
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
    welcomeNoPassport: "Bienvenido a Waypoint. Para revisar visas, primero dime de qué país es tu pasaporte. Puedes decir más de uno.",
    askDestination: "¿A qué país?",
    askPassport: "¿De qué país es tu pasaporte?",
    passportExample: "No alcancé a entender el país. Di, por ejemplo: mi pasaporte es de México, o solo: mexicano.",
    askResidence: "¿En qué país vives?",
    residenceExample: "No alcancé a entender el país. Di, por ejemplo: vivo en Estados Unidos.",
    askWhen: "¿Cuándo sales?",
    datesExample: "No entendí las fechas. Dime el día y el mes, por ejemplo: del 1 al 25 de diciembre.",
    datesPast: (when: string) => `${when.charAt(0).toUpperCase()}${when.slice(1)} ya pasó. Dime fechas futuras, por ejemplo: del 1 al 25 de diciembre.`,
    askReturn: "¿Y cuándo regresas?",
    askLeave: "¿Qué día sales?",
    datesNoted: "Anoté las fechas. ¿A qué país vas?",
    unknownPlace: (place: string) => `No reconozco "${place}" como destino. ¿A qué país vas?`,
    datesTooLong: "Ese viaje dura más de un año. Dime fechas más cortas, por ejemplo: del 1 al 25 de diciembre.",
    somethingWrong: "Algo no salió bien con eso. Inténtalo de nuevo con otras palabras.",
    askTrip: "¿A dónde vas y cuándo?",
    afterTrip: "Puedes preguntarme qué no puedes llevar, o pedir tu lista de empaque.",
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
  | { kind: "dates"; destination: string; startDate?: string; endDate?: string }
  | { kind: "entry" }
  | { kind: "rules"; item?: string };

// Sets or clears the pending question; everything else in the session (last destination,
// whether the disclaimer was said) is kept.
function setAwaiting(h: HandlerInput, awaiting: Awaiting | null) {
  const { awaiting: _previous, ...rest } = h.attributesManager.getSessionAttributes() as { awaiting?: Awaiting };
  h.attributesManager.setSessionAttributes({ ...rest, ...(awaiting ? { awaiting } : {}) });
}

// The destination of the trip planned in this session, so "what can't I bring" needs no country.
function lastDestination(h: HandlerInput): string | undefined {
  return (h.attributesManager.getSessionAttributes() as { lastDestination?: string }).lastDestination;
}

function rememberDestination(h: HandlerInput, destination: string) {
  h.attributesManager.setSessionAttributes({ ...h.attributesManager.getSessionAttributes(), lastDestination: destination });
}

function getAwaiting(h: HandlerInput): Awaiting | undefined {
  return (h.attributesManager.getSessionAttributes() as { awaiting?: Awaiting }).awaiting;
}

function ask(h: HandlerInput, awaiting: Awaiting, text: string, reprompt = text): Response {
  setAwaiting(h, awaiting);
  return h.responseBuilder.speak(text).reprompt(reprompt).getResponse();
}

const TITLES_ES: Record<string, string> = {
  "Your trip": "Tu viaje",
  "Entry requirements": "Requisitos de entrada",
  "Local rules": "Reglas locales",
  "What is left": "Lo que falta",
  "Traveler profile": "Tu perfil",
  "Packing checklist": "Lista de empaque",
};

// The "rules change" disclaimer goes with visa and rule answers, once per session.
const DISCLAIMED_TOOLS = new Set(["plan_trip", "check_entry_requirements", "get_local_rules"]);

function takeDisclaimer(h: HandlerInput, tool: string): boolean {
  if (!DISCLAIMED_TOOLS.has(tool)) return false;
  const attrs = h.attributesManager.getSessionAttributes() as { disclaimed?: boolean };
  if (attrs.disclaimed) return false;
  h.attributesManager.setSessionAttributes({ ...attrs, disclaimed: true });
  return true;
}

// Text from data sources can carry a space before a period ("Service ."); speech should not.
const tidy = (s: string) => s.replace(/\s+([.,;:])/g, "$1").replace(/\s{2,}/g, " ").trim();

function speakResult(handlerInput: HandlerInput, r: ToolCall, title: string, after?: string, tool = ""): Response {
  if (localeOf(handlerInput) === "es-MX") title = TITLES_ES[title] ?? title;
  // The next step follows a success only; after an error it would not make sense.
  if (r.isError) after = undefined;
  const locale = localeOf(handlerInput);
  // A protocol or schema error is for logs, not for the user's ears.
  const technical = r.isError && /MCP error|Input validation|Invalid arguments|-32\d{3}/i.test(r.voice);
  if (technical) console.error("waypoint tool error", r.voice.slice(0, 200));
  const parts = [technical ? TEXT[locale].somethingWrong : r.voice];
  if (r.missing.length) parts.push(locale === "es-MX" ? "Dime el país del pasaporte de cada viajero." : "Tell me each traveler's passport country.");
  // The server adds the disclaimer itself; keep it only where it belongs, and once.
  const stripped = parts.join(" ").replace(/\s*(Rules change; verify with the official source before you travel\.|Las reglas cambian; verifica con la fuente oficial antes de viajar\.)/g, "");
  const base = tidy(!r.isError && takeDisclaimer(handlerInput, tool) ? `${stripped} ${DISCLAIMER[locale]}` : stripped);
  const builder = handlerInput.responseBuilder.speak(after ? `${base} ${after}` : base).withSimpleCard(title, r.rows.join("\n") || base);
  if (after) builder.reprompt(after);
  return builder.getResponse();
}

async function run(handlerInput: HandlerInput, tool: string, args: Record<string, unknown>, title: string, after?: string, onOk?: () => void) {
  const locale = localeOf(handlerInput);
  const userId = handlerInput.requestEnvelope.context.System.user.userId;
  if (!canReachWaypoint()) return handlerInput.responseBuilder.speak(TEXT[locale].unavailable).getResponse();
  try {
    const r = await callWaypointTool(userId, tool, args, requestLocale(handlerInput));
    if (!r.isError) onOk?.();
    return speakResult(handlerInput, r, title, after, tool);
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

// A trip needs a known destination and both dates. The destination is checked first (a city
// resolves to its country), then whatever dates are missing are asked for, keeping the ones
// already given. Alexa's date values (a bare day, a week, no year) become calendar dates.
async function planAnswer(h: HandlerInput, destination: string, startDate?: string, endDate?: string) {
  const locale = localeOf(h);
  const t = TEXT[locale];
  const iso = resolveCountry(destination);
  if (!iso) return ask(h, { kind: "plan", startDate, endDate }, t.unknownPlace(destination), t.askDestination);
  const isWeek = (d?: string) => Boolean(d && /^\d{4}-W\d{2}/.test(d));
  if (!startDate && !endDate) return ask(h, { kind: "dates", destination: iso }, t.askWhen);
  const now = new Date(h.requestEnvelope.request.timestamp ?? Date.now());
  if (startDate && !endDate && !isWeek(startDate)) {
    if (!resolveTripDates(startDate, undefined, now)) return ask(h, { kind: "dates", destination: iso }, t.datesExample);
    return ask(h, { kind: "dates", destination: iso, startDate }, t.askReturn);
  }
  if (!startDate && endDate) return ask(h, { kind: "dates", destination: iso, endDate }, t.askLeave);
  const dates = resolveTripDates(startDate, endDate, now);
  if (!dates) return ask(h, { kind: "dates", destination: iso }, t.datesExample);
  const problem = tripDateProblem(dates, now);
  if (problem === "past") {
    return ask(h, { kind: "dates", destination: iso }, t.datesPast(spokenDates(dates.startDate, dates.startDate, locale === "es-MX" ? "es" : "en")), t.datesExample);
  }
  if (problem) return ask(h, { kind: "dates", destination: iso }, t.datesTooLong, t.datesExample);
  setAwaiting(h, null);
  return run(h, "plan_trip", { destination: iso, ...dates }, "Your trip", t.afterTrip, () => rememberDestination(h, iso));
}

// A destination said in a visa or rules question that is not a known place is asked again here,
// instead of failing later.
function unknownDestination(h: HandlerInput, destination: string, awaiting: Awaiting): Response | null {
  if (resolveCountry(destination)) return null;
  const t = TEXT[localeOf(h)];
  return ask(h, awaiting, t.unknownPlace(destination), t.askDestination);
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
    // The country by its proper name, not as typed ("japon" -> "Japón").
    const iso = resolveCountry(destination);
    const place = iso ? countryName(iso, es ? "es" : "en") : destination;
    const quote = matches[0]?.quote.replace(/[\s.]+$/, "");
    const said = matches.length
      ? es
        ? `Sobre ${item} en ${place}, el texto oficial en inglés dice: ${quote}.`
        : `About ${item} in ${place}, the official text says: ${quote}.`
      : es
        ? `No encontré una regla verificada sobre ${item} para ${place}. Consulta la fuente oficial antes de viajar.`
        : `I found no verified rule about ${item} for ${place}. Check the official source before you travel.`;
    const speech = tidy(matches.length && takeDisclaimer(h, "get_local_rules") ? `${said} ${DISCLAIMER[locale]}` : said);
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
      return ask(h, { kind: "passport" }, TEXT[locale].welcomeNoPassport, TEXT[locale].askPassportFirst);
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
    const endDate = slot(h, "endDate");
    if (!destination) return ask(h, { kind: "plan", startDate, endDate }, t.askDestination);
    return planAnswer(h, destination, startDate, endDate);
  },
};

const EntryHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "EntryIntent",
  async handle(h) {
    const destination = slot(h, "destination");
    const known = destination ?? lastDestination(h);
    if (!known) return ask(h, { kind: "entry" }, TEXT[localeOf(h)].askDestination);
    return unknownDestination(h, known, { kind: "entry" }) ?? entryAnswer(h, known);
  },
};

const RulesHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "RulesIntent",
  async handle(h) {
    const destination = slot(h, "destination");
    const item = slot(h, "item");
    const known = destination ?? lastDestination(h);
    if (!known) return ask(h, { kind: "rules", item }, TEXT[localeOf(h)].askDestination);
    return unknownDestination(h, known, { kind: "rules", item }) ?? rulesAnswer(h, known, item);
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
        return planAnswer(h, country, awaiting.startDate, awaiting.endDate);
      default:
        // Nothing was asked: do not guess whether it is a passport or a destination.
        return h.responseBuilder.speak(t.which(spoken)).reprompt(t.which(spoken)).getResponse();
    }
  },
};

// Dates said on their own ("del 1 al 25 de diciembre"): for the trip being planned, or kept until the destination comes.
const DatesAnswerHandler: RequestHandler = {
  canHandle: (h) => h.requestEnvelope.request.type === "IntentRequest" && h.requestEnvelope.request.intent.name === "DatesAnswerIntent",
  async handle(h) {
    const awaiting = getAwaiting(h);
    // Dates already given in this conversation are kept; one date said now fills the missing one.
    const kept = awaiting?.kind === "dates" || awaiting?.kind === "plan" ? awaiting : undefined;
    const said = { start: slot(h, "startDate"), end: slot(h, "endDate") };
    let startDate = kept?.startDate;
    let endDate = kept?.endDate;
    if (said.start && said.end) {
      startDate = said.start;
      endDate = said.end;
    } else if (said.start || said.end) {
      const one = (said.start ?? said.end) as string;
      if (startDate && !endDate) endDate = one;
      else if (endDate && !startDate) startDate = one;
      else if (said.end) endDate = one;
      else startDate = one;
    }
    if (awaiting?.kind === "dates") return planAnswer(h, awaiting.destination, startDate, endDate);
    const t = TEXT[localeOf(h)];
    return ask(h, { kind: "plan", startDate, endDate }, startDate || endDate ? t.datesNoted : t.askDestination, t.askDestination);
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

// Speech is plain text: escape it so a quote with "&" or "<" never breaks Alexa's SSML.
function escapeSsml(ssml: string | undefined): string | undefined {
  if (!ssml) return ssml;
  const inner = ssml.replace(/^<speak>/, "").replace(/<\/speak>$/, "");
  return `<speak>${inner.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</speak>`;
}

const EscapeSpeech: ResponseInterceptor = {
  process(_h, response) {
    if (response?.outputSpeech?.type === "SSML") response.outputSpeech.ssml = escapeSsml(response.outputSpeech.ssml) as string;
    const reprompt = response?.reprompt?.outputSpeech;
    if (reprompt?.type === "SSML") reprompt.ssml = escapeSsml(reprompt.ssml) as string;
  },
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
      DatesAnswerHandler,
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
    .addResponseInterceptors(EscapeSpeech)
    .addErrorHandlers(ErrorHandlerImpl)
    .withSkillId(process.env.ALEXA_SKILL_ID ?? "")
    .create();
}
