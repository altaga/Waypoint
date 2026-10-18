import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveCountry, countryName, currencyOf } from "./countries.ts";
import { TravelerProfile, Traveler, redactSensitive } from "./profile.ts";
import { UnknownDestinationError, ProfileMissingError } from "./errors.ts";
import { residenceNotes } from "./residence-rules.ts";
import { daysLeftSentence, daysUntilTripSentence, spokenDates, stayTooLongSentence, visaSentence } from "./voice.ts";
import { EnvelopeShape, envelopeResult, errorResult, pick, withDisclaimer, type Envelope, type ToolResult } from "./envelope.ts";
import { bestEntry, lookupVisa, STATUS_LABEL, type VisaEntry, type VisaStatus } from "./services/visa.ts";
import { pppEquivalent } from "./services/ppp.ts";
import type { Pack, Rule, RuleCategory } from "./packs/schema.ts";
import { DISCLAIMER } from "./packs/schema.ts";
import type { AppContext } from "./context.ts";
import { StateConflictError, type ItineraryDay, type Trip, type UserState } from "./state.ts";
import { PLAN_DASHBOARD_URI } from "./resources.ts";
import { itemTerms } from "./items.ts";
import { INTERESTS, type Interest } from "./services/highlights.ts";
import { mapsUrl, suggestTimes, verifyPlan, type Violation } from "./itinerary.ts";
import { STYLES, cityStays, stayCity } from "./pace.ts";
import { tripClimate, type TripClimate } from "./services/climate.ts";

type Locale = "en" | "es";

// A date must be a real calendar day: "2026-02-30" is refused, not rolled over.
function isRealDate(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").refine(isRealDate, "not a real calendar date");
// Longer trips are refused: the plan and its cards are built one entry per day.
const MAX_TRIP_DAYS = 365;
const CURRENCIES = new Set<string>(Intl.supportedValuesOf("currency"));
// ISO 4217 codes only, so money is never stored under a guessed code such as "US$".
const CURRENCY = z.string().length(3).refine((c) => CURRENCIES.has(c.toUpperCase()), "use an ISO 4217 code, for example USD or MXN");
const RULE_CATEGORIES = [
  "prohibited_items", "medications", "conduct", "dress", "photography", "drugs", "alcohol", "lgbtq", "driving",
] as const;

const ann = (o: { readOnly?: boolean; destructive?: boolean; idempotent?: boolean; openWorld?: boolean }) => ({
  readOnlyHint: o.readOnly ?? false,
  destructiveHint: o.destructive ?? false,
  idempotentHint: o.idempotent ?? false,
  openWorldHint: o.openWorld ?? false,
});

// Voice language: the language of the current request (Alexa's locale) when the client sends one,
// else the profile's saved locale, else English.
function localeFromState(state: UserState, hintLocale?: string): Locale {
  if (hintLocale) return hintLocale.toLowerCase().startsWith("es") ? "es" : "en";
  return state.profile?.locale?.startsWith("es") ? "es" : "en";
}

function requireProfile(state: UserState): TravelerProfile {
  if (!state.profile || state.profile.travelers.length === 0) throw new ProfileMissingError();
  return state.profile;
}

function resolveDestinationOrThrow(input: string): string {
  const iso = resolveCountry(input);
  if (!iso) throw new UnknownDestinationError(input);
  return iso;
}

function latestTrip(state: UserState, tripId?: string): Trip | null {
  if (tripId) return state.trips.find((t) => t.tripId === tripId) ?? null;
  return [...state.trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** Runs a tool again when its save lost a race (each run loads the state afresh); other errors are not retried. */
async function retryOnConflict<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof StateConflictError) || i >= attempts) throw err;
    }
  }
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
/** Today's calendar date in the traveler's timezone, so countdowns and deadlines match their day. */
function localToday(now: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
/** Calendar days from `today` to `date` (both YYYY-MM-DD). */
const daysUntil = (today: string, date: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

// Calendar text (RFC 5545): backslash, semicolon and comma are escaped, and line breaks become \n.
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
// Lines are folded at 75 octets; a continuation line starts with one space.
function icsLine(line: string): string {
  const parts: string[] = [];
  let cur = "";
  let limit = 75;
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > limit) {
      parts.push(cur);
      cur = ch;
      limit = 74;
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.join("\r\n ");
}
// Text inside a Markdown line: one line, and the characters that would start formatting are escaped.
const mdText = (s: string) => s.replace(/\r\n|\r|\n/g, " ").replace(/([\\`*_[\]|<>])/g, "\\$1");

function supportsElicitation(server: McpServer): boolean {
  return Boolean(server.server.getClientCapabilities()?.elicitation);
}

/**
 * Asks the user for a traveler's passport country through MCP form elicitation.
 * Returns null when the client does not support elicitation or the user declines,
 * so callers fall back to `missingFields`.
 */
async function askPassport(server: McpServer, name: string, locale: Locale): Promise<string | null> {
  if (!supportsElicitation(server)) return null;
  try {
    const res = await server.server.elicitInput({
      message: pick(locale, `Which country issued ${name}'s passport?`, `¿De qué país es el pasaporte de ${name}?`),
      requestedSchema: {
        type: "object",
        properties: {
          country: {
            type: "string",
            title: pick(locale, "Passport country", "País del pasaporte"),
            description: pick(locale, "For example: Mexico, MX, Japan", "Por ejemplo: México, MX, Japón"),
          },
        },
        required: ["country"],
      },
    });
    if (res.action !== "accept" || typeof res.content?.country !== "string") return null;
    return resolveCountry(res.content.country);
  } catch {
    return null;
  }
}

/** Ensures each selected traveler has at least one passport, asking when possible. */
async function ensurePassports(
  server: McpServer,
  profile: TravelerProfile,
  ids: string[] | undefined,
  locale: Locale,
): Promise<{ travelers: Traveler[]; missing: string[] }> {
  const travelers = ids?.length ? profile.travelers.filter((t) => ids.includes(t.travelerId)) : profile.travelers;
  const missing: string[] = [];
  for (const t of travelers) {
    if (t.passports.length > 0) continue;
    const iso = await askPassport(server, t.displayName, locale);
    if (iso) t.passports.push({ country: iso });
    else missing.push(t.displayName);
  }
  return { travelers, missing };
}

function entryFor(ctx: AppContext, t: Traveler, dest: string) {
  const entries = t.passports.map((p) => ({ passport: p.country, entry: lookupVisa(ctx.visa, p.country, dest) }));
  const best = bestEntry(entries);
  return { traveler: t, best, entries };
}

function statusText(entry: VisaEntry, locale: Locale): string {
  const label = STATUS_LABEL[entry.status as VisaStatus][locale];
  return entry.maxStayDays ? `${label} (${pick(locale, "up to", "hasta")} ${entry.maxStayDays} ${pick(locale, "days", "días")})` : label;
}

// Curated packs carry a Spanish summary; older packs only have the English one.
function ruleText(r: Rule, locale: Locale): string {
  const es = (r.summary as { es?: string }).es;
  return locale === "es" && es ? es : r.summary.en;
}
const hasSpanish = (r: Rule) => Boolean((r.summary as { es?: string }).es);

const CATEGORY_LABEL: Record<string, { en: string; es: string }> = {
  prohibited_items: { en: "Prohibited items", es: "Artículos prohibidos" },
  medications: { en: "Medications", es: "Medicamentos" },
  conduct: { en: "Conduct", es: "Conducta" },
  dress: { en: "Dress code", es: "Vestimenta" },
  photography: { en: "Photography", es: "Fotografía" },
  drugs: { en: "Drugs", es: "Drogas" },
  alcohol: { en: "Alcohol", es: "Alcohol" },
  lgbtq: { en: "LGBTQ+", es: "LGBTQ+" },
  driving: { en: "Driving", es: "Manejo" },
};
const SEVERITY_LABEL: Record<string, { en: string; es: string }> = {
  severe: { en: "severe penalty", es: "pena grave" },
  arrest: { en: "arrest", es: "arresto" },
  fine: { en: "fine", es: "multa" },
  info: { en: "good to know", es: "a tener en cuenta" },
};
const categoryLabel = (c: string, locale: Locale) => CATEGORY_LABEL[c]?.[locale] ?? c.replace(/_/g, " ");
const severityLabel = (v: string, locale: Locale) => SEVERITY_LABEL[v]?.[locale] ?? v;
// The card colour for a rule: the same mapping as the readiness panel (arrest and severe are red).
const ruleStatus = (v: string): "blocked" | "warn" | "info" => (v === "severe" || v === "arrest" ? "blocked" : v === "info" ? "info" : "warn");

/** Locale-aware number formatting for spoken and on-screen money. */
/** Spoken form of a verifier problem, in the request's language. */
function violationText(v: Violation, locale: Locale, placeName: (id: string) => string): string {
  const p = v.placeId ? placeName(v.placeId) : "";
  const es: Record<Violation["code"], string> = {
    day_out_of_range: `el día ${v.day} está fuera del viaje`,
    duplicate_day: `el día ${v.day} aparece dos veces`,
    unknown_place: `"${v.placeId}" no está en la lista verificada; pide get_highlights`,
    wrong_country: `${p} no está en el destino`,
    repeated_place: `${p} aparece en dos días`,
    too_many_stops: `el día ${v.day} tiene demasiadas paradas para el ritmo del viaje`,
    avoided_interest: `${p} entra en algo que el viajero quiere evitar`,
    too_long: `el día ${v.day} es demasiado largo`,
    mixed_cities: `${p} está en otra ciudad que el resto del día ${v.day}: planea una ciudad por día`,
    short_stay: `el día ${v.day} es el único en esa ciudad: cambiar de ciudad toma casi un día, planea al menos 2 días en cada ciudad o quédate en una`,
    arrival_day_busy: `el día ${v.day} es el primero en una ciudad nueva: planea máximo 2 paradas`,
  };
  return locale === "es" ? es[v.code] : v.message;
}

function money(value: number, currency: string, locale: Locale): string {
  const tag = locale === "es" ? "es-MX" : "en-US";
  try {
    return new Intl.NumberFormat(tag, { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString(tag)} ${currency}`;
  }
}

type PackItem = { id: string; group: string; label: string; status: "ok" | "warn" | "info" | "blocked" };

/** What the usual weather on the trip's dates means for the bag (climate normals, not a forecast). */
function climateAdvice(c: TripClimate, locale: Locale): { id: string; label: string; status: "info" | "warn" }[] {
  const out: { id: string; label: string; status: "info" | "warn" }[] = [];
  if (c.cold) out.push({ id: "warm", label: pick(locale, `Warm coat and layers: lows around ${c.lo} °C`, `Abrigo y capas: mínimas de ${c.lo} °C`), status: "warn" });
  else if (c.cool) out.push({ id: "layer", label: pick(locale, `A light jacket for the evenings (around ${c.lo} °C)`, `Chaqueta ligera para las noches (unos ${c.lo} °C)`), status: "info" });
  if (c.hot) out.push({ id: "sun", label: pick(locale, `Light clothes, sunscreen and a hat: highs around ${c.hi} °C`, `Ropa ligera, protector solar y gorra: máximas de ${c.hi} °C`), status: "info" });
  if (c.wet) out.push({ id: "rain", label: pick(locale, "Umbrella or rain jacket: rain is frequent", "Paraguas o impermeable: llueve seguido"), status: "info" });
  return out;
}

/** Where the group travels from and to, for the globe: each traveler's home (residence, else first passport) and the destination's capital. */
function tripGeo(ctx: AppContext, trip: Trip, travelers: Traveler[]) {
  const at = (iso: string) => {
    const c = ctx.climate.get(iso);
    return c ? { iso, lat: c.lat, lon: c.lon } : null;
  };
  const destination = at(trip.destination);
  if (!destination) return null;
  const origins = new Map<string, { iso: string; lat: number; lon: number; names: string[] }>();
  for (const t of travelers) {
    const iso = t.residenceCountry || t.passports[0]?.country;
    if (!iso || iso === trip.destination) continue;
    const point = at(iso);
    if (!point) continue;
    const o = origins.get(iso) ?? { ...point, names: [] };
    o.names.push(t.displayName);
    origins.set(iso, o);
  }
  return { destination, origins: [...origins.values()] };
}

/** The packing list for a trip; ids are stable so ticks survive sessions. */
function packingItems(ctx: AppContext, trip: Trip, travelers: Traveler[], locale: Locale): PackItem[] {
  const pack = ctx.packs.get(trip.destination);
  const stay = daysBetween(trip.startDate, trip.endDate);
  const items: PackItem[] = [];
  const add = (id: string, group: string, label: string, status: "ok" | "warn" | "info" | "blocked" = "info") =>
    items.push({ id, group, label, status });

  add("passports", "documents", pick(locale, `Passports (${travelers.length}), valid for the whole trip`, `Pasaportes (${travelers.length}), vigentes todo el viaje`), "ok");
  if (travelers.some((t) => t.passports.some((p) => !["visa_free", "same_country"].includes(lookupVisa(ctx.visa, p.country, trip.destination).status)))) {
    add("visa", "documents", pick(locale, "Visa, eTA or e-visa confirmation (printed and on your phone)", "Confirmación de visa, eTA o e-visa (impresa y en el celular)"), "warn");
  }
  add("insurance", "documents", pick(locale, "Travel insurance details", "Datos del seguro de viaje"));
  add("copies", "documents", pick(locale, "Digital copy of passports and bookings", "Copia digital de pasaportes y reservas"));
  if (pack?.essentials.plugTypes.length) {
    add("adapter", "electronics", pick(locale, `Plug adapter (type ${pack.essentials.plugTypes.join("/")})`, `Adaptador de enchufe (tipo ${pack.essentials.plugTypes.join("/")})`));
  }
  add("power", "electronics", pick(locale, "Phone charger and power bank (carry-on)", "Cargador y batería externa (en equipaje de mano)"));
  add("data", "electronics", pick(locale, "eSIM or roaming plan", "eSIM o plan de roaming"));
  add("clothes", "clothing", pick(locale, `Clothes for ${stay} days${stay > 7 ? " (or plan a laundry stop)" : ""}`, `Ropa para ${stay} días${stay > 7 ? " (o planea lavandería)" : ""}`));
  add("shoes", "clothing", pick(locale, "Comfortable walking shoes", "Zapatos cómodos para caminar"));
  const climate = ctx.climate.get(trip.destination);
  if (climate) for (const a of climateAdvice(tripClimate(climate, trip.startDate, trip.endDate), locale)) add(a.id, "clothing", a.label, a.status);
  if (pack?.essentials.currency) add("cash", "money", pick(locale, `Some cash in ${pack.essentials.currency} and a card without foreign fees`, `Algo de efectivo en ${pack.essentials.currency} y una tarjeta sin comisión en el extranjero`));
  if (travelers.some((t) => t.medications?.length)) {
    add("meds", "health", pick(locale, "Medications in original packaging with prescriptions", "Medicamentos en su empaque original con receta"), "warn");
  }
  for (const t of travelers.filter((x) => x.ageBand === "child" || x.ageBand === "infant")) {
    add(`kid-${t.travelerId.slice(0, 6)}`, "family", pick(locale, `${t.displayName}: extra clothes, snacks and documents`, `${t.displayName}: ropa extra, snacks y documentos`));
  }
  for (const r of sortRules((pack?.localRules ?? []).filter((x) => x.category === "prohibited_items" || x.category === "medications" || x.category === "drugs")).slice(0, 3)) {
    add(`no-${r.id}`, "do-not-pack", ruleText(r, locale), "blocked");
  }
  return items;
}

// A short date range for cards and the panel, in the traveler's language: "3 dic – 10 dic".
function shortRange(startIso: string, endIso: string, locale: Locale): string {
  const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

function sortRules(rules: Rule[]): Rule[] {
  const rank = { severe: 0, arrest: 1, fine: 2, info: 3 } as const;
  return [...rules].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// The visa matrix is cited only by answers that depend on passports; the rest cite their own pack.
function packSources(pack: Pack | undefined, ctx: AppContext, visa: boolean) {
  const sources = visa ? [ctx.visaSource] : [];
  if (pack) {
    for (const [id, s] of Object.entries(pack.sources)) {
      sources.push({ id, title: s.title, url: s.url, license: s.license, retrieved: s.retrieved } as typeof ctx.visaSource);
    }
  }
  return sources;
}

function baseEnvelope(
  ctx: AppContext,
  dest: string,
  locale: Locale,
  partial: Pick<Envelope, "voice" | "card" | "data" | "followUps"> & { missingFields?: string[]; visa?: boolean },
): Envelope {
  const pack = ctx.packs.get(dest);
  return {
    voice: withDisclaimer(partial.voice, locale),
    card: partial.card,
    data: partial.data,
    sources: packSources(pack, ctx, partial.visa === true) as Envelope["sources"],
    lastVerified: pack?.generatedAt ?? ctx.visaSource.retrieved,
    confidence: pack ? "medium" : "low",
    disclaimer: DISCLAIMER[locale],
    followUps: partial.followUps,
    ...(partial.missingFields?.length ? { missingFields: partial.missingFields } : {}),
    // A pack is compiled by us from cited sources; only a pack a person signed off counts as human-reviewed.
    ...(pack ? { review: pack.review.status === "human_reviewed" ? ("human" as const) : ("curated" as const) } : {}),
  };
}

// What was saved, said back so a misheard country is caught at once.
function savedSummary(travelers: Traveler[], locale: Locale): string {
  const en = locale === "en";
  const list = (isos: string[]) => isos.map((c) => countryName(c, locale)).join(en ? " and " : " y ");
  const parts = travelers.map((t) => {
    const self = t.role === "self" && travelers.length === 1;
    const passports = t.passports.map((p) => p.country);
    const bits: string[] = [];
    if (passports.length) {
      bits.push(
        self
          ? en ? `Your passport is from ${list(passports)}.` : `Tu pasaporte es de ${list(passports)}.`
          : en ? `${t.displayName}: passport from ${list(passports)}.` : `${t.displayName}: pasaporte de ${list(passports)}.`,
      );
    }
    if (t.residenceCountry) {
      bits.push(
        self
          ? en ? `You live in ${countryName(t.residenceCountry, locale)}.` : `Vives en ${countryName(t.residenceCountry, locale)}.`
          : en ? `${t.displayName} lives in ${countryName(t.residenceCountry, locale)}.` : `${t.displayName} vive en ${countryName(t.residenceCountry, locale)}.`,
      );
    }
    return bits.join(" ");
  });
  return parts.filter(Boolean).join(" ") || (en ? "Profile updated." : "Perfil actualizado.");
}

const firstSentence = (s: string) => {
  const m = s.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim().replace(/[^.!?]$/, (c) => `${c}.`);
};
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// Nothing is saved yet: say so, instead of listing an empty set of missing passports.
function nothingYetEnvelope(locale: Locale, kind: "trip" | "profile"): ToolResult {
  const voice =
    kind === "profile"
      ? pick(locale, "I don't have your profile yet. Tell me your passport country.", "Aún no tengo tu perfil. Dime el país de tu pasaporte.")
      : pick(locale, "I don't have a trip yet. Tell me where you are going and when.", "Aún no tengo un viaje. Dime a dónde vas y cuándo.");
  return envelopeResult({
    voice,
    card: { pattern: "list", title: pick(locale, "Nothing saved yet", "Aún no hay nada guardado"), rows: [] },
    data: {},
    sources: [],
    lastVerified: null,
    confidence: "low",
    disclaimer: DISCLAIMER[locale],
    followUps: [voice],
    missingFields: [],
  });
}

// Residence is not the passport: it can change where a visa is applied for, and some countries
// exempt residence-permit holders. The matrix does not model those exemptions, so say so instead.
function residenceNote(travelers: Traveler[], dest: string, locale: Locale): string {
  const specific = residenceNotes(dest, travelers, locale === "es" ? "es" : "en");
  if (specific.length) return " " + specific.join(" ");
  const where = travelers.filter((tr) => tr.residenceCountry).map((tr) => countryName(tr.residenceCountry as string, locale === "es" ? "es" : "en"));
  if (!where.length) return "";
  return " " + pick(
    locale,
    `Residence in ${where.join(", ")} can change where you apply, and some countries exempt residence-permit holders. Confirm with that consulate.`,
    `La residencia en ${where.join(", ")} puede cambiar dónde solicitas la visa, y algunos países eximen a quien tiene permiso de residencia. Confirma con ese consulado.`,
  );
}

function missingEnvelope(locale: Locale, names: string[]): ToolResult {
  const env: Envelope = {
    voice: pick(
      locale,
      `I still need the passport country for ${names.join(", ")}.`,
      `Todavía necesito el país del pasaporte de ${names.join(", ")}.`,
    ),
    card: {
      pattern: "list",
      title: pick(locale, "A few details are missing", "Faltan algunos datos"),
      rows: names.map((n) => ({ label: n, value: pick(locale, "Passport country needed", "Falta el país del pasaporte"), status: "warn" as const })),
    },
    data: {},
    sources: [],
    lastVerified: null,
    confidence: "low",
    disclaimer: DISCLAIMER[locale],
    followUps: [pick(locale, "Tell me each traveler's passport country.", "Dime el país del pasaporte de cada viajero.")],
    missingFields: names.map((n) => `passport:${n}`),
  };
  return envelopeResult(env);
}

export function registerWaypointTools(server: McpServer, ctx: AppContext, userId: string, hintLocale?: string): void {
  const load = () => ctx.store.load(userId);
  const localeOf = (state: UserState) => localeFromState(state, hintLocale);
  const save = (s: UserState) => ctx.store.save(userId, s);

  // Errors are spoken in the profile language, so a Spanish user does not hear English.
  // A save that lost a race with another request runs the tool again, on the state as it is now.
  const run = (fn: () => Promise<ToolResult>) =>
    retryOnConflict(fn).catch(async (err) => errorResult(err, undefined, await load().then(localeOf, () => "en" as const)));

  // 1. get_traveler_profile
  server.registerTool(
    "get_traveler_profile",
    {
      title: "Get traveler profile",
      description:
        "Use when the user asks what Waypoint knows about them or their group. Returns travelers, home currency and preferences. Sensitive fields are only included with consent.",
      inputSchema: {},
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true }),
    },
    () =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        if (!state.profile) {
          return nothingYetEnvelope(locale, "profile");
        }
        const profile = redactSensitive(state.profile);
        const names = profile.travelers.map((t) => t.displayName).join(", ");
        // The profile is the traveler's own input: it cites no source, not even the visa matrix baseEnvelope adds by default.
        return envelopeResult({
          ...baseEnvelope(ctx, "", locale, {
            voice: pick(locale, `Your group is ${names}. Home currency ${profile.homeCurrency}.`, `Tu grupo es ${names}. Moneda de origen ${profile.homeCurrency}.`),
            card: {
              pattern: "card",
              title: pick(locale, "Your travel profile", "Tu perfil de viaje"),
              rows: profile.travelers.map((t) => ({
                label: t.displayName,
                value: t.passports.map((p) => countryName(p.country, locale)).join(", ") || pick(locale, "No passport yet", "Sin pasaporte"),
                status: t.passports.length ? ("ok" as const) : ("warn" as const),
              })),
            },
            data: { profile },
            followUps: [pick(locale, "Update a traveler or plan a trip.", "Actualiza un viajero o planea un viaje.")],
          }),
          sources: [],
        });
      }),
  );

  // 2. update_traveler_profile
  server.registerTool(
    "update_traveler_profile",
    {
      title: "Create or update traveler profile",
      description:
        "Use when the user tells Waypoint about themselves or their companions (passports, age band, preferences). Upserts travelers by displayName. Asks for missing passports when the client supports it. Medications are kept only with sensitiveDataConsent.",
      inputSchema: {
        locale: z.enum(["en-US", "es-MX", "es-ES"]).optional(),
        homeCurrency: CURRENCY.optional().describe("ISO 4217 code, for example MXN"),
        homeTimezone: z.string().optional(),
        interests: z.array(z.string()).optional(),
        pace: z.enum(["relaxed", "balanced", "packed"]).optional(),
        sensitiveDataConsent: z.boolean().optional(),
        travelers: z
          .array(
            z.object({
              displayName: z.string().min(1),
              passports: z.array(z.string()).optional().describe("Country names or ISO codes"),
              ageBand: z.enum(["infant", "child", "teen", "adult", "senior"]).optional(),
              role: z.enum(["self", "partner", "child", "parent", "friend"]).optional(),
              medications: z.array(z.string()).optional(),
              likes: z.array(z.enum(INTERESTS)).optional().describe("Interests this person enjoys"),
              avoid: z.array(z.enum(INTERESTS)).optional().describe("Interests this person does not want in the plan"),
              residence: z.string().optional().describe("Country of legal residence, not nationality. Can change where a visa is applied for."),
            }),
          )
          .optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const now = ctx.clock().toISOString();
        const profile: TravelerProfile = state.profile ?? {
          profileId: `profile-${userId}`,
          ownerUserId: userId,
          locale: hintLocale?.toLowerCase().startsWith("es") ? "es-MX" : "en-US",
          homeCurrency: args.homeCurrency ?? "USD",
          homeTimezone: args.homeTimezone ?? "UTC",
          travelers: [],
          interests: [],
          pace: "balanced",
          consent: { sensitiveData: false, updatedAt: now },
          updatedAt: now,
        };
        if (args.locale) profile.locale = args.locale;
        if (args.homeCurrency) profile.homeCurrency = args.homeCurrency.toUpperCase();
        if (args.homeTimezone) profile.homeTimezone = args.homeTimezone;
        if (args.interests) profile.interests = args.interests;
        if (args.pace) profile.pace = args.pace;
        if (args.sensitiveDataConsent !== undefined) {
          profile.consent = { sensitiveData: args.sensitiveDataConsent, updatedAt: now };
        }
        const locale = localeFromState({ ...state, profile }, hintLocale);
        const notes: string[] = [];

        for (const input of args.travelers ?? []) {
          const existing = profile.travelers.find((t) => t.displayName.toLowerCase() === input.displayName.toLowerCase());
          const passports = (input.passports ?? []).map((raw) => {
            const iso = resolveCountry(raw);
            if (!iso) throw new UnknownDestinationError(raw);
            return { country: iso };
          });
          const traveler: Traveler = existing ?? {
            travelerId: randomUUID(),
            displayName: input.displayName,
            role: input.role ?? "self",
            passports: [],
            validVisas: [],
            dietary: [],
            languages: [],
            likes: [],
            avoid: [],
          };
          if (input.ageBand) traveler.ageBand = input.ageBand;
          if (input.likes) traveler.likes = input.likes;
          if (input.avoid) traveler.avoid = input.avoid;
          if (input.role) traveler.role = input.role;
          if (passports.length) traveler.passports = passports;
          if (input.residence) {
            const iso = resolveCountry(input.residence);
            if (!iso) throw new UnknownDestinationError(input.residence);
            traveler.residenceCountry = iso;
          }
          if (input.medications?.length) {
            if (profile.consent.sensitiveData) traveler.medications = input.medications;
            else notes.push(pick(locale, `Medications for ${traveler.displayName} were not saved: sensitive data needs consent.`, `Los medicamentos de ${traveler.displayName} no se guardaron: los datos sensibles requieren consentimiento.`));
          }
          if (!existing) profile.travelers.push(traveler);
        }

        const missing: string[] = [];
        for (const t of profile.travelers) {
          if (t.passports.length) continue;
          const iso = await askPassport(server, t.displayName, locale);
          if (iso) t.passports.push({ country: iso });
          else missing.push(t.displayName);
        }

        profile.updatedAt = now;
        const parsed = TravelerProfile.parse(profile);
        state.profile = parsed;
        await save(state);

        const env = baseEnvelope(ctx, "", locale, {
          voice: missing.length
            ? pick(locale, `Saved. I still need the passport for ${missing.join(", ")}.`, `Guardado. Todavía necesito el pasaporte de ${missing.join(", ")}.`)
            : pick(locale, `Saved. ${savedSummary(parsed.travelers, "en")}`, `Guardado. ${savedSummary(parsed.travelers, "es")}`),
          card: {
            pattern: "card",
            title: pick(locale, "Profile updated", "Perfil actualizado"),
            rows: [
              ...parsed.travelers.map((t) => ({
                label: t.displayName,
                value: t.passports.map((p) => countryName(p.country, locale)).join(", ") || pick(locale, "Passport needed", "Falta pasaporte"),
                status: t.passports.length ? ("ok" as const) : ("warn" as const),
              })),
              ...notes.map((n) => ({ label: pick(locale, "Note", "Nota"), value: n, status: "info" as const })),
            ],
          },
          data: { travelerCount: parsed.travelers.length },
          followUps: [pick(locale, "Plan a trip with this group.", "Planea un viaje con este grupo.")],
          missingFields: missing.map((m) => `passport:${m}`),
        });
        return envelopeResult(env);
      }),
  );

  // 3. plan_trip (hero)
  server.registerTool(
    "plan_trip",
    {
      title: "Plan trip readiness",
      description:
        "Use when the user says where and when they are going. Creates a trip for the selected travelers and returns a per-traveler entry readiness check, the top local rules, essentials and days left. Opens the readiness dashboard. Asks for missing passport countries.",
      inputSchema: {
        destination: z.string().min(2).describe("Country name in English or Spanish, or ISO code"),
        startDate: ISO_DATE,
        endDate: ISO_DATE,
        travelerIds: z.array(z.string()).optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ openWorld: false }),
      _meta: { ui: { resourceUri: PLAN_DASHBOARD_URI } },
    },
    (args) =>
      run(async () => {
        const state = await load();
        const profile = requireProfile(state);
        const locale = localeOf(state);
        const dest = resolveDestinationOrThrow(args.destination);
        if (args.endDate < args.startDate) {
          return errorResult(new Error("bad dates"), pick(locale, "The return date is before the start date. Tell me the dates again.", "La fecha de regreso es anterior a la de salida. Dime las fechas otra vez."));
        }
        if (daysBetween(args.startDate, args.endDate) > MAX_TRIP_DAYS) {
          return errorResult(new Error("trip too long"), pick(locale, `A trip can last at most ${MAX_TRIP_DAYS} days. Tell me the dates again.`, `Un viaje puede durar como máximo ${MAX_TRIP_DAYS} días. Dime las fechas otra vez.`));
        }
        const { travelers, missing } = await ensurePassports(server, profile, args.travelerIds, locale);
        if (missing.length) return missingEnvelope(locale, missing);

        const trip: Trip = {
          tripId: randomUUID(),
          destination: dest,
          startDate: args.startDate,
          endDate: args.endDate,
          travelerIds: travelers.map((t) => t.travelerId),
          createdAt: ctx.clock().toISOString(),
          packingDone: [],
        };
        state.trips.push(trip);
        await save(state);

        const pack = ctx.packs.get(dest);
        const stay = daysBetween(args.startDate, args.endDate);
        const left = daysUntil(localToday(ctx.clock(), profile.homeTimezone), args.startDate);
        const rows = travelers.map((t) => {
          const { best } = entryFor(ctx, t, dest);
          const tone = STATUS_LABEL[best.entry.status].tone;
          const tooLong = best.entry.maxStayDays !== undefined && stay > best.entry.maxStayDays;
          return {
            label: t.displayName,
            value: statusText(best.entry, locale) + (tooLong ? pick(locale, ` · your ${stay}-day stay is longer than the limit`, ` · tu estancia de ${stay} días supera el límite`) : ""),
            status: (tooLong ? "blocked" : tone) as "ok" | "warn" | "blocked" | "info",
          };
        });
        // One row per rule category, its most serious rule: no category repeats on the card, and the
        // card keeps the rule detail that the Alexa card (which has no panel) shows. The panel has all rules.
        const topByCategory = new Map<string, Rule>();
        for (const r of sortRules(pack?.localRules ?? [])) if (!topByCategory.has(r.category)) topByCategory.set(r.category, r);
        const ruleRows = [...topByCategory.values()].slice(0, 5).map((r) => ({
          label: categoryLabel(r.category, locale),
          value: ruleText(r, locale),
          status: ruleStatus(r.severity),
        }));
        // One traveler who is the user is spoken to directly; a group is spoken about by name.
        const solo = travelers.length === 1 && travelers[0].role === "self";
        const visaLines = travelers.map((t) => {
          const { best } = entryFor(ctx, t, dest);
          const name = solo ? undefined : t.displayName;
          const tooLong = best.entry.maxStayDays !== undefined && stay > best.entry.maxStayDays;
          const line = visaSentence(best.entry.status as VisaStatus, best.entry.maxStayDays, locale, name);
          return tooLong ? `${line} ${stayTooLongSentence(stay, locale, name)}` : line;
        });
        const when = spokenDates(args.startDate, args.endDate, locale);
        const env = baseEnvelope(ctx, dest, locale, {
          visa: true,
          voice: [
            pick(locale, `Done: your trip to ${countryName(dest, "en")} ${when}.`, `Listo: tu viaje a ${countryName(dest, "es")} ${when}.`),
            daysLeftSentence(left, locale),
            ...visaLines,
          ].join(" "),
          card: {
            pattern: "card",
            title: pick(locale, `Trip to ${countryName(dest, "en")}`, `Viaje a ${countryName(dest, "es")}`),
            subtitle: `${shortRange(args.startDate, args.endDate, locale)} · ${stay} ${stay === 1 ? pick(locale, "day", "día") : pick(locale, "days", "días")}`,
            rows: [...rows, ...ruleRows],
            footer: pack ? undefined : pick(locale, "No verified local rules for this destination yet.", "Aún no tengo reglas locales verificadas para este destino."),
          },
          data: {
            locale,
            destinationName: countryName(dest, locale),
            trip,
            daysUntil: left,
            travelers: rows,
            rules: sortRules(pack?.localRules ?? []),
            essentials: pack?.essentials ?? { currency: currencyOf(dest), plugTypes: [], emergency: {}, languages: [] },
          },
          followUps: [
            pick(locale, "What can't I bring?", "¿Qué no puedo llevar?"),
            pick(locale, "What should I pack?", "¿Qué debo empacar?"),
            pick(locale, "How far does my budget go?", "¿Cuánto rinde mi presupuesto?"),
          ],
        });
        return envelopeResult(env, { ui: { resourceUri: PLAN_DASHBOARD_URI } });
      }),
  );

  // 4. check_entry_requirements
  server.registerTool(
    "check_entry_requirements",
    {
      title: "Check entry requirements",
      description:
        "Use when the user asks whether they need a visa, eTA or e-visa for a destination. Returns one row per traveler using their best passport. Based on the vendored passport matrix snapshot; the official source always wins.",
      inputSchema: {
        destination: z.string().min(2),
        travelerIds: z.array(z.string()).optional(),
        purpose: z.enum(["tourism", "business", "transit"]).optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true, openWorld: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const profile = requireProfile(state);
        const locale = localeOf(state);
        const dest = resolveDestinationOrThrow(args.destination);
        const { travelers, missing } = await ensurePassports(server, profile, args.travelerIds, locale);
        if (missing.length) return missingEnvelope(locale, missing);
        const results = travelers.map((t) => {
          const { best, entries } = entryFor(ctx, t, dest);
          return { traveler: t.displayName, status: best.entry.status, maxStayDays: best.entry.maxStayDays ?? null, passport: best.passport, checkedPassports: entries.length };
        });
        const env = baseEnvelope(ctx, dest, locale, {
          visa: true,
          voice:
            travelers
              .map((t, i) => visaSentence(results[i].status as VisaStatus, results[i].maxStayDays ?? undefined, locale, travelers.length === 1 && t.role === "self" ? undefined : t.displayName))
              .join(" ") + residenceNote(travelers.filter((_, i) => results[i].status !== "same_country"), dest, locale),
          card: {
            pattern: "list",
            title: pick(locale, `Entry to ${countryName(dest, "en")}`, `Entrada a ${countryName(dest, "es")}`),
            rows: travelers.map((t, i) => ({
              label: t.displayName,
              value: statusText({ status: results[i].status as VisaStatus, maxStayDays: results[i].maxStayDays ?? undefined }, locale),
              status: STATUS_LABEL[results[i].status as VisaStatus].tone,
            })),
          },
          data: { results, purpose: args.purpose ?? "tourism" },
          followUps: [pick(locale, "Plan the trip?", "¿Planeamos el viaje?")],
        });
        return envelopeResult(env);
      }),
  );

  // 5. get_local_rules
  server.registerTool(
    "get_local_rules",
    {
      title: "Get local rules",
      description:
        "Use when the user asks what they cannot bring, do or wear at a destination. Returns verified local rules with severity, each with its source. Not legal advice.",
      inputSchema: {
        destination: z.string().min(2),
        categories: z.array(z.enum(RULE_CATEGORIES)).optional(),
        item: z.string().optional().describe("Something the traveler wants to bring or do, in Spanish or English"),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true, openWorld: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const dest = resolveDestinationOrThrow(args.destination);
        const pack = ctx.packs.get(dest);
        const rules = sortRules(
          (pack?.localRules ?? []).filter((r) => !args.categories?.length || args.categories.includes(r.category as RuleCategory)),
        );
        // Item question: keep only rules that mention the item (in English, after translation).
        const matches = args.item
          ? rules.filter((r) => {
              const text = `${r.summary.en} ${ruleText(r, "es")} ${r.quote}`.toLowerCase();
              return itemTerms(args.item!).some((t) => text.includes(t));
            })
          : [];
        if (args.item) {
          const top = matches[0];
          const itemVoice = top
            ? pick(locale, `For ${args.item} in ${countryName(dest, "en")}: ${top.summary.en}`, hasSpanish(top) ? `Sobre ${args.item} en ${countryName(dest, "es")}: ${ruleText(top, "es")}` : `Sobre ${args.item} en ${countryName(dest, "es")}: ${top.quote} (texto oficial en inglés)`)
            : pick(locale, `I found no verified rule about ${args.item} for ${countryName(dest, "en")}. Check the official source.`, `No encontré una regla verificada sobre ${args.item} para ${countryName(dest, "es")}. Consulta la fuente oficial.`);
          const env = baseEnvelope(ctx, dest, locale, {
            voice: itemVoice,
            card: { pattern: "list", title: pick(locale, "Item check", "Revisión del artículo"), rows: matches.map((r) => ({ label: `${categoryLabel(r.category, locale)} · ${severityLabel(r.severity, locale)}`, value: ruleText(r, locale), status: ruleStatus(r.severity) })) },
            data: { item: args.item, matches },
            followUps: [],
          });
          return envelopeResult(env);
        }
        const env = baseEnvelope(ctx, dest, locale, {
          voice: rules.length
            ? pick(locale, `I found ${rules.length} local rules for ${countryName(dest, "en")}. The most serious: ${rules[0].summary.en}`, hasSpanish(rules[0]) ? `Encontré ${rules.length} reglas locales para ${countryName(dest, "es")}. La más importante: ${ruleText(rules[0], "es")}` : `Encontré ${rules.length} reglas locales para ${countryName(dest, "es")}. La más grave, en el texto oficial en inglés: ${rules[0].summary.en}`)
            : pick(locale, `I don't have verified local rules for ${countryName(dest, "en")} yet. Check the official travel advice.`, `Aún no tengo reglas locales verificadas para ${countryName(dest, "es")}. Consulta el aviso oficial.`),
          card: {
            pattern: "list",
            title: pick(locale, "Local rules", "Reglas locales"),
            rows: rules.map((r) => ({
              label: `${categoryLabel(r.category, locale)} · ${severityLabel(r.severity, locale)}`,
              value: ruleText(r, locale),
              status: r.severity === "info" ? ("info" as const) : ("warn" as const),
            })),
          },
          data: { rules },
          followUps: [pick(locale, "Anything for medications?", "¿Algo sobre medicamentos?")],
        });
        return envelopeResult(env);
      }),
  );

  // 6. get_destination_essentials
  server.registerTool(
    "get_destination_essentials",
    {
      title: "Get destination essentials",
      description:
        "Use for practical facts about a destination: plug types, emergency numbers, currency, languages and the US advisory level.",
      inputSchema: { destination: z.string().min(2) },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true, openWorld: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const dest = resolveDestinationOrThrow(args.destination);
        const pack = ctx.packs.get(dest);
        const essentials = pack?.essentials ?? { currency: currencyOf(dest), plugTypes: [], emergency: {}, languages: [] };
        // Old packs stored Wikidata URLs instead of numbers; never read those out.
        const EMERGENCY: Record<string, { en: string; es: string }> = {
          general: { en: "emergencies", es: "emergencias" },
          police: { en: "police", es: "policía" },
          ambulance: { en: "ambulance", es: "ambulancia" },
          fire: { en: "fire", es: "bomberos" },
          tourist: { en: "tourist police", es: "policía turística" },
        };
        const numbers = Object.entries(essentials.emergency).filter(([, v]) => /^\+?[\d\s-]{2,}$/.test(String(v)));
        const emergencyText = numbers.map(([k, v]) => `${v} ${EMERGENCY[k]?.[locale] ?? k}`).join(", ");
        const names = (essentials as { languageNames?: { en: string[]; es: string[] } }).languageNames?.[locale] ?? essentials.languages;
        const plugs = essentials.plugTypes.length ? essentials.plugTypes.join(pick(locale, " and ", " y ")) : "";
        const env = baseEnvelope(ctx, dest, locale, {
          voice: pick(
            locale,
            `In ${countryName(dest, "en")} you pay in ${essentials.currency ?? "local currency"}${plugs ? `, plugs are type ${plugs}` : ""}${emergencyText ? `, and for emergencies call ${emergencyText}` : ""}.`,
            `En ${countryName(dest, "es")} se paga en ${essentials.currency ?? "moneda local"}${plugs ? `, los enchufes son tipo ${plugs}` : ""}${emergencyText ? ` y para emergencias marca ${emergencyText}` : ""}.`,
          ),
          card: {
            pattern: "card",
            title: countryName(dest, locale),
            rows: [
              { label: pick(locale, "Currency", "Moneda"), value: essentials.currency ?? "—", status: "info" },
              { label: pick(locale, "Plug types", "Enchufes"), value: essentials.plugTypes.join(", ") || "—", status: "info" },
              { label: pick(locale, "Emergency", "Emergencias"), value: emergencyText || "—", status: "info" },
              { label: pick(locale, "Languages", "Idiomas"), value: names.join(", ") || "—", status: "info" },
              ...(pack?.advisory.us ? [{ label: pick(locale, "US travel advisory", "Alerta de viaje de EE. UU."), value: pick(locale, `Level ${pack.advisory.us.level}`, `Nivel ${pack.advisory.us.level}`), status: "info" as const }] : []),
            ],
          },
          data: { essentials, advisory: pack?.advisory ?? {} },
          followUps: [pick(locale, "Can I bring my plug adapter?", "¿Puedo llevar mi adaptador?")],
        });
        return envelopeResult(env);
      }),
  );

  // 7. convert_budget
  server.registerTool(
    "convert_budget",
    {
      title: "Convert budget",
      description:
        "Use when the user asks how far an amount goes. Converts currencies with live rates when available (snapshot otherwise, labelled) and adds a purchasing-power equivalent from World Bank PPP factors.",
      inputSchema: {
        amount: z.number().positive(),
        from: CURRENCY.optional(),
        to: CURRENCY.optional(),
        destination: z.string().optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, openWorld: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const profile = state.profile;
        const from = (args.from ?? profile?.homeCurrency ?? "USD").toUpperCase();
        const destIso = args.destination ? resolveDestinationOrThrow(args.destination) : latestTrip(state)?.destination ?? null;
        const to = (args.to ?? (destIso ? currencyOf(destIso) : null) ?? "USD").toUpperCase();
        const conv = await ctx.fx.convert(args.amount, from, to);
        if (!conv) {
          return errorResult(new Error("no rate"), pick(locale, "I can't convert that currency right now. Try a major currency code like USD or EUR.", "No puedo convertir esa moneda ahora. Prueba con un código principal como USD o EUR."));
        }
        const homeIso = profile?.travelers[0]?.passports[0]?.country ?? null;
        let ppp: number | null = null;
        if (destIso && homeIso) {
          const home = ctx.ppp.get(homeIso);
          const dest = ctx.ppp.get(destIso);
          if (home && dest) ppp = pppEquivalent(args.amount, home, dest);
        }
        const value = Math.round(conv.value * 100) / 100;
        const fmt = (n: number, c: string) => money(n, c, locale);
        const env = baseEnvelope(ctx, destIso ?? "", locale, {
          voice: pick(
            locale,
            `${fmt(args.amount, from)} is about ${fmt(value, to)}${ppp ? `. Adjusted for local prices, it goes as far as ${fmt(ppp, to)} would at home` : ""}.`,
            `${fmt(args.amount, from)} son unos ${fmt(value, to)}${ppp ? `. Ajustado a precios locales, rinde como ${fmt(ppp, to)} en tu país` : ""}.`,
          ),
          card: {
            pattern: "card",
            title: pick(locale, "Budget", "Presupuesto"),
            rows: [
              { label: pick(locale, "Exchange", "Cambio"), value: `${fmt(args.amount, from)} = ${fmt(value, to)}`, status: "info" },
              ...(ppp ? [{ label: pick(locale, "Purchasing power (PPP)", "Poder de compra (PPA)"), value: `≈ ${fmt(ppp, to)}`, status: "info" as const }] : []),
              { label: pick(locale, "Rate source", "Fuente del tipo de cambio"), value: conv.source === "live" ? `open.er-api.com · ${conv.asOf}` : `${pick(locale, "snapshot", "snapshot")} · ${conv.asOf}`, status: conv.source === "live" ? "ok" : "warn" },
            ],
          },
          data: { amount: args.amount, from, to, converted: value, rate: conv.rate, ppp, rateSource: conv.source },
          followUps: [pick(locale, "Log an expense?", "¿Registro un gasto?")],
        });
        env.sources = [...env.sources, { id: "src:open-er-api", title: "Open Exchange Rates (open.er-api.com)", url: "https://open.er-api.com", license: "Attribution required", retrieved: conv.asOf.slice(0, 10) }, { id: "src:world-bank-ppp", title: "World Bank PA.NUS.PRVT.PP", url: "https://data.worldbank.org/indicator/PA.NUS.PRVT.PP", license: "CC BY 4.0" }];
        env.confidence = conv.source === "live" ? "high" : "medium";
        return envelopeResult(env);
      }),
  );

  // 8. packing_checklist
  server.registerTool(
    "packing_checklist",
    {
      title: "Packing checklist",
      description:
        "Use when the user asks what to pack, or says they packed something. Builds a checklist from the trip length, plugs, travelers (children, medications), entry needs and the local rules that restrict items. To tick items off, pass their ids (or a few words of the label) in markPacked; to undo, in unmarkPacked.",
      inputSchema: {
        tripId: z.string().optional(),
        markPacked: z.array(z.string()).optional().describe("Item ids or label words the user has packed"),
        unmarkPacked: z.array(z.string()).optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const profile = requireProfile(state);
        const trip = latestTrip(state, args.tripId);
        if (!trip) return nothingYetEnvelope(locale, "trip");
        const pack = ctx.packs.get(trip.destination);
        const travelers = profile.travelers.filter((t) => trip.travelerIds.includes(t.travelerId));
        const items = packingItems(ctx, trip, travelers, locale);

        // Tick items off by id or by a few words of the label.
        const matchItem = (q: string) => {
          const n = q.toLowerCase().trim();
          return items.find((i) => i.id === n) ?? items.find((i) => i.group !== "do-not-pack" && i.label.toLowerCase().includes(n));
        };
        const done = new Set(trip.packingDone);
        let changed = false;
        for (const q of args.markPacked ?? []) {
          const it = matchItem(q);
          if (it && !done.has(it.id)) { done.add(it.id); changed = true; }
        }
        for (const q of args.unmarkPacked ?? []) {
          const it = matchItem(q);
          if (it && done.delete(it.id)) changed = true;
        }
        if (changed) {
          trip.packingDone = [...done];
          await save(state);
        }
        const toPack = items.filter((i) => i.group !== "do-not-pack");
        const packed = toPack.filter((i) => done.has(i.id)).length;
        const left = toPack.filter((i) => !done.has(i.id));
        const avoid = items.filter((i) => i.group === "do-not-pack");
        const nextUp = left.slice(0, 3).map((i) => lowerFirst(i.label.split(" (")[0]));
        const voice = left.length === 0
          ? pick(locale, "Everything on your list is packed. Have a great trip!", "Ya empacaste todo lo de tu lista. ¡Buen viaje!")
          : pick(
              locale,
              `Your list has ${toPack.length} items and you've packed ${packed}. Next: ${nextUp.join(", ")}.${avoid.length ? ` Watch out: ${firstSentence(avoid[0].label)}` : ""}`,
              `Tu lista tiene ${toPack.length} cosas y llevas ${packed}. Sigue: ${nextUp.join(", ")}.${avoid.length ? ` Ojo: ${lowerFirst(firstSentence(avoid[0].label))}` : ""}`,
            );
        const env = baseEnvelope(ctx, trip.destination, locale, {
          voice,
          card: {
            pattern: "list",
            title: pick(locale, "Packing list", "Lista de equipaje"),
            subtitle: pick(locale, `${packed} of ${toPack.length} packed`, `${packed} de ${toPack.length} empacados`),
            rows: items.map((i) => ({
              label: i.group === "do-not-pack" ? pick(locale, "Do not pack", "No llevar") : `${done.has(i.id) ? "☑" : "☐"}`,
              value: i.label,
              status: i.group === "do-not-pack" ? "blocked" : done.has(i.id) ? "ok" : i.status === "warn" ? "warn" : "info",
            })),
          },
          data: { tripId: trip.tripId, packed, total: toPack.length, items: items.map((i) => ({ ...i, done: done.has(i.id) })) },
          followUps: [pick(locale, "Build my day plan?", "¿Armo mi plan de días?")],
        });
        return envelopeResult(env);
      }),
  );

  // 9. get_highlights: the catalog of real places. The only source of place ids.
  server.registerTool(
    "get_highlights",
    {
      title: "Destination highlights",
      description:
        "Use to find real places to see, eat or visit in a destination. Call it before planning any day: the day plan may only use the place ids this tool returns. Filter by the traveler's interests. Opening hours and prices are not in this catalog; say so and point to the official source.",
      inputSchema: {
        destination: z.string().min(2),
        interests: z.array(z.enum(INTERESTS)).optional(),
        limit: z.number().int().min(1).max(30).optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const dest = resolveDestinationOrThrow(args.destination);
        const pack = ctx.highlights.forCountry(dest);
        const name = countryName(dest, locale);
        if (!pack) {
          const env = baseEnvelope(ctx, dest, locale, {
            voice: pick(locale, `I don't have a list of places for ${name} yet. Check the official tourism site.`, `Aún no tengo una lista de lugares para ${name}. Revisa el sitio oficial de turismo.`),
            card: { pattern: "list", title: name, rows: [] },
            data: { places: [], curated: false },
            followUps: [],
          });
          return envelopeResult(env);
        }
        const want = args.interests ?? [];
        const ranked = pack.places
          .map((p, i) => ({ p, i, hit: want.filter((w) => p.interests.includes(w)).length }))
          .filter((x) => want.length === 0 || x.hit > 0)
          .sort((a, b) => b.hit - a.hit || a.i - b.i)
          .slice(0, args.limit ?? 12)
          .map((x) => x.p);
        const curated = pack.review.status !== "wikidata_ranked";
        const names = ranked.slice(0, 3).map((p) => p.name).join(", ");
        const env = baseEnvelope(ctx, dest, locale, {
          voice: ranked.length
            ? pick(
                locale,
                `${ranked.length} places in ${name}. The first ones: ${names}.${curated ? "" : " This list is ranked by popularity, not curated, so check each place."}`,
                `${ranked.length} lugares en ${name}. Los primeros: ${names}.${curated ? "" : " Esta lista va por popularidad, no está curada; revisa cada lugar."}`,
              )
            : pick(locale, `No place in ${name} matches those interests in my list.`, `Ningún lugar de ${name} coincide con esos intereses en mi lista.`),
          card: {
            pattern: "list",
            title: pick(locale, `Places in ${name}`, `Lugares en ${name}`),
            subtitle: curated ? pick(locale, "Curated list, not reviewed by a person; verify hours", "Lista curada, sin revisión humana; verifica horarios") : pick(locale, "Ranked by popularity, not curated", "Por popularidad, sin curación"),
            rows: ranked.map((p) => ({ label: p.name, value: `${p.area} · ${p.desc[locale]}`, status: "info" as const })),
          },
          data: {
            country: dest,
            curated,
            // The cities of the list and the least days each needs at each pace (Waypoint's estimate from the places it has).
            cities: cityStays(pack.places, ctx.world.cities, dest, ctx.world.stays),
            // descSource says where the description came from; article links to the Wikipedia article it was taken from (CC BY-SA 4.0).
            places: ranked.map((p) => ({ id: p.id, name: p.name, area: p.area, city: p.city, stayCity: stayCity(p, ctx.world.cities, dest), ...(p.zone ? { zone: p.zone } : {}), category: p.category, interests: p.interests, durationMinutes: p.durationMinutes, mapsUrl: mapsUrl(p.name, p.city, countryName(dest, "en")), website: p.website ?? null, hours: p.hours?.text ?? null, hoursSource: p.hours?.source ?? null, phone: p.phone ?? null, ...(p.lat != null && p.lon != null ? { lat: p.lat, lon: p.lon } : {}), desc: p.desc[locale], descSource: p.descBy?.[locale] ?? "curated", article: p.ground?.[locale] ?? null, admission: p.admission ?? null })),
          },
          followUps: [pick(locale, "Build my day plan with these?", "¿Armo mi plan de días con estos?")],
        });
        env.sources = Object.entries(pack.sources).map(([key, s]) => ({ id: `src:${key}`, title: s.title, url: s.url, license: s.license, retrieved: s.retrieved }));
        env.confidence = curated ? "medium" : "low";
        return envelopeResult(env);
      }),
  );

  // 10. set_trip_constraints: what the traveler will not do or will not spend.
  server.registerTool(
    "set_trip_constraints",
    {
      title: "Trip constraints",
      description:
        "Use when the traveler says what to avoid on this trip (use the interest names, for example nightlife) or sets a spending limit. Constraints apply to every day plan and to expense logging. Pass clearAvoid or clearBudget to remove them.",
      inputSchema: {
        tripId: z.string().optional(),
        avoid: z.array(z.enum(INTERESTS)).optional(),
        maxBudget: z.object({ amount: z.number().positive(), currency: CURRENCY }).optional(),
        clearAvoid: z.boolean().optional(),
        clearBudget: z.boolean().optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const trip = latestTrip(state, args.tripId);
        if (!trip) return nothingYetEnvelope(locale, "trip");
        const c = trip.constraints ?? { avoid: [] };
        if (args.clearAvoid) c.avoid = [];
        if (args.avoid) c.avoid = [...new Set([...c.avoid, ...args.avoid])];
        if (args.clearBudget) delete c.maxBudget;
        if (args.maxBudget) c.maxBudget = { amount: args.maxBudget.amount, currency: args.maxBudget.currency.toUpperCase() };
        trip.constraints = c;
        await save(state);
        const avoidText = c.avoid.length ? c.avoid.join(", ") : pick(locale, "nothing", "nada");
        const budgetText = c.maxBudget ? money(c.maxBudget.amount, c.maxBudget.currency, locale) : pick(locale, "no limit", "sin límite");
        const env = baseEnvelope(ctx, trip.destination, locale, {
          voice: pick(
            locale,
            `Saved. I'll keep out: ${avoidText}. Spending limit: ${budgetText}.`,
            `Guardado. Evitaré: ${avoidText}. Tope de gasto: ${budgetText}.`,
          ),
          card: {
            pattern: "card",
            title: pick(locale, "Trip rules", "Reglas del viaje"),
            rows: [
              { label: pick(locale, "Avoid", "Evitar"), value: avoidText, status: c.avoid.length ? "warn" : "info" },
              { label: pick(locale, "Spending limit", "Tope de gasto"), value: budgetText, status: c.maxBudget ? "ok" : "info" },
            ],
          },
          data: { constraints: c },
          followUps: [pick(locale, "Build my day plan?", "¿Armo mi plan de días?")],
        });
        return envelopeResult(env);
      }),
  );

  // 11. build_itinerary: the plan is checked before it is saved. Only catalog ids are accepted.
  server.registerTool(
    "build_itinerary",
    {
      title: "Day plan",
      description:
        "Use when the user asks for a day plan. First call get_highlights and choose real places. Then pass `plan`: for each day, up to the pace's stop limit, as place ids from get_highlights (never names you made up). The plan is verified before it is saved: if the verifier reports problems, nothing is saved; fix the listed problems and call again. Without `plan` it returns the saved plan.",
      inputSchema: {
        tripId: z.string().optional(),
        day: z.number().int().positive().optional(),
        // true: the plan replaces the whole saved itinerary (a new pace), not only the days it names.
        replace: z.boolean().optional(),
        plan: z
          .array(
            z.object({
              day: z.number().int().positive(),
              title: z.string().max(80).optional(),
              stops: z.array(z.string().min(3).max(80)).max(4),
            }),
          )
          .max(31)
          .optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const profile = requireProfile(state);
        const trip = latestTrip(state, args.tripId);
        if (!trip) return nothingYetEnvelope(locale, "trip");
        const stay = daysBetween(trip.startDate, trip.endDate);
        const dest = trip.destination;
        const dateOf = (day: number) => new Date(Date.parse(trip.startDate) + (day - 1) * 86_400_000).toISOString().slice(0, 10);
        const avoid = (trip.constraints?.avoid ?? []) as Interest[];
        let verdict: ReturnType<typeof verifyPlan> | null = null;

        if (args.plan?.length) {
          // Places planned on the days this plan does not replace still count, so a place cannot repeat across days.
          const replaced = new Set(args.replace ? (trip.itinerary ?? []).map((d) => d.day).concat(args.plan.map((d) => d.day)) : args.plan.map((d) => d.day));
          const takenPlaces = (trip.itinerary ?? []).filter((d) => !replaced.has(d.day)).flatMap((d) => d.stops);
          verdict = verifyPlan({ plan: args.plan, stayDays: stay, destinationIso: dest, pace: profile.pace, avoid, highlights: ctx.highlights, takenPlaces, cityOf: (p) => stayCity(p, ctx.world.cities, dest), cityMinutes: (city) => ctx.world.cities.filter((c) => c.iso === dest && c.name.en === city).reduce((m, c) => Math.max(m, ctx.world.stays.get(c.id)?.minutes ?? 0), 0) });
          if (verdict.ok) {
            const byDay = new Map((args.replace ? [] : (trip.itinerary ?? [])).map((d) => [d.day, d]));
            for (const d of args.plan) byDay.set(d.day, { day: d.day, date: dateOf(d.day), title: d.title, stops: d.stops });
            trip.itinerary = [...byDay.values()].sort((x, y) => x.day - y.day);
            await save(state);
          }
        }

        // Without a new plan, the saved days are checked again: a new pace or an avoided interest can break them.
        const stale = !verdict && (trip.itinerary ?? []).some((d) => d.stops.length)
          ? verifyPlan({ plan: (trip.itinerary ?? []).map((d) => ({ day: d.day, title: d.title, stops: d.stops })), stayDays: stay, destinationIso: dest, pace: profile.pace, avoid, highlights: ctx.highlights, cityOf: (p) => stayCity(p, ctx.world.cities, dest), cityMinutes: (city) => ctx.world.cities.filter((c) => c.iso === dest && c.name.en === city).reduce((m, c) => Math.max(m, ctx.world.stays.get(c.id)?.minutes ?? 0), 0) })
          : null;
        const staleProblem = stale && !stale.ok ? stale.violations[0] : null;
        const reported = verdict ?? stale;

        const saved = trip.itinerary ?? [];
        const days = Array.from({ length: stay }, (_, i) => saved.find((d) => d.day === i + 1) ?? { day: i + 1, date: dateOf(i + 1), stops: [] as string[] });
        const resolvedDays = days.map((d) => ({
          day: d.day,
          date: d.date,
          title: d.title,
          places: d.stops.map((id) => ctx.highlights.place(id)?.place).filter((p): p is NonNullable<typeof p> => Boolean(p)),
        }));
        const selected = args.day ? resolvedDays.filter((d) => d.day === args.day) : resolvedDays;
        const planned = resolvedDays.filter((d) => d.places.length).length;
        const warnings = [...new Set(resolvedDays.flatMap((d) => d.places.map((p) => p.admission).filter((a): a is string => Boolean(a))))];
        const placeName = (id: string) => ctx.highlights.place(id)?.place.name ?? id;

        let voice: string;
        if (verdict && !verdict.ok) {
          const first = verdict.violations[0];
          voice = pick(
            locale,
            `I didn't save the plan: ${verdict.violations.length} problem${verdict.violations.length > 1 ? "s" : ""}. First: ${first.message}.`,
            `No guardé el plan: ${verdict.violations.length} problema${verdict.violations.length > 1 ? "s" : ""}. El primero: ${violationText(first, locale, placeName)}.`,
          );
        } else if (planned === 0) {
          voice = pick(locale, `There is no day plan yet for your ${stay} days. Tell me what you enjoy and I'll put one together from real places.`, `Aún no hay plan para tus ${stay} días. Dime qué te gusta y armo uno con lugares reales.`);
        } else if (verdict) {
          voice = pick(locale, `Saved a plan for ${planned} of ${stay} days, checked against the places list.${warnings.length ? " Some places need a reservation." : ""}${planned < stay ? ` Do you want the other ${stay - planned} days free?` : ""}`, `Guardé el plan de ${planned} de ${stay} días, revisado contra la lista de lugares.${warnings.length ? " Algunos lugares requieren reserva." : ""}${planned < stay ? ` ¿Quieres dejar libres los otros ${stay - planned} días?` : ""}`);
        } else {
          voice = pick(locale, `Your plan covers ${planned} of ${stay} days.${planned < stay ? ` Do you want the other ${stay - planned} days free?` : ""}`, `Tu plan cubre ${planned} de ${stay} días.${planned < stay ? ` ¿Quieres dejar libres los otros ${stay - planned} días?` : ""}`);
        }
        // A stop whose hours (public data) say it is closed that day, or that the visit would end after closing.
        const shut = selected.flatMap((d) => {
          const t = suggestTimes(d.places, d.date);
          return d.places.flatMap((p, i) => (t[i].hours === "closed" || t[i].hours === "outside" ? [{ day: d.day, name: p.name, state: t[i].hours }] : []));
        });
        if (shut.length) {
          const first = shut[0];
          voice += pick(
            locale,
            ` Check ${shut.length > 1 ? `${shut.length} stops` : first.name}: ${shut.length > 1 ? `for example ${first.name} on day ${first.day}, ` : ""}public hours say ${first.state === "closed" ? "it is closed that day" : "it may be closed at the suggested time"}.`,
            ` Revisa ${shut.length > 1 ? `${shut.length} paradas` : first.name}: ${shut.length > 1 ? `por ejemplo ${first.name} el día ${first.day}, ` : ""}los horarios públicos dicen que ${first.state === "closed" ? "cierra ese día" : "podría estar cerrado a la hora sugerida"}.`,
          );
        }
        if (staleProblem) {
          voice += pick(locale, ` Your saved plan no longer fits your settings: ${violationText(staleProblem, locale, placeName)}.`, ` Tu plan guardado ya no cumple tus ajustes: ${violationText(staleProblem, locale, placeName)}.`);
        }

        const env = baseEnvelope(ctx, dest, locale, {
          voice,
          card: {
            pattern: "carousel",
            title: pick(locale, "Day plan", "Plan de días"),
            subtitle: pick(locale, "Real places from the list · suggested times, not opening hours: check each place", "Lugares reales de la lista · horas sugeridas, no son horarios de apertura: revisa cada lugar"),
            rows: selected.map((d) => ({
              label: `${pick(locale, "Day", "Día")} ${d.day}${d.title ? ` · ${d.title}` : ""}`,
              value: d.places.map((p) => `${p.name} (${p.area})`).join(" · ") || pick(locale, "Free day", "Día libre"),
              status: "info" as const,
            })),
          },
          data: {
            days: selected.map((d) => { const times = suggestTimes(d.places, d.date); return { day: d.day, date: d.date, title: d.title, stops: d.places.map((p, i) => ({ id: p.id, name: p.name, area: p.area, category: p.category, desc: p.desc[locale], admission: p.admission ?? null, durationMinutes: p.durationMinutes, start: times[i].start, end: times[i].end, hoursState: times[i].hours, hours: p.hours?.text ?? null, hoursSource: p.hours ? p.hours.source : null, website: p.website ?? null, phone: p.phone ?? null, mapsUrl: mapsUrl(p.name, p.city, countryName(dest, "en")) })) }; }),
            pace: profile.pace,
            planned,
            stay,
            saved: !verdict || verdict.ok,
            violations: reported && !reported.ok ? reported.violations.map((v) => ({ day: v.day, code: v.code, placeId: v.placeId ?? null, message: v.message })) : [],
            warnings,
          },
          followUps: [pick(locale, "Anything else for this trip?", "¿Algo más para este viaje?")],
        });
        env.confidence = "medium";
        return envelopeResult(env);
      }),
  );

  // Payment methods a visitor can use, from official sources only (data/world/payments.json).
  server.registerTool(
    "get_payment_methods",
    {
      title: "Payment methods",
      description:
        "Use when the user asks how to pay in a destination: cash or cards, QR codes or e-wallets, ATMs, banknotes, or cryptocurrency. Answers from official sources when it has them, dated; otherwise from travel guides and traveler reports, labelled as not officially confirmed. For a country without an entry it says so and does not guess. Defaults to the trip's destination.",
      inputSchema: {
        destination: z.string().min(2).optional(),
        topic: z.enum(["cash", "cards", "qr", "atm", "banknotes", "crypto"]).optional().describe("What the traveler asked about; the answer starts with it"),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true, openWorld: false }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const trip = latestTrip(state);
        const dest = args.destination ? resolveDestinationOrThrow(args.destination) : trip?.destination;
        if (!dest) return nothingYetEnvelope(locale, "trip");
        const name = countryName(dest, locale);
        const entry = ctx.payments.get(dest);
        if (!entry) {
          return envelopeResult({
            voice: pick(
              locale,
              `I don't have payment information for ${countryName(dest, "en")} yet. Check the official travel advice and your bank before you travel.`,
              `Aún no tengo información de pagos para ${name}. Revisa el aviso oficial de viaje y a tu banco antes de viajar.`,
            ),
            card: { pattern: "list", title: pick(locale, `Payments in ${name}`, `Pagos en ${name}`), rows: [] },
            data: { destination: dest, tier: null, verified: false },
            sources: [],
            lastVerified: ctx.payments.retrieved,
            confidence: "low",
            disclaimer: DISCLAIMER[locale],
            followUps: [pick(locale, "What's the currency there?", "¿Cuál es la moneda?")],
          });
        }
        // The facts are written in Spanish; the official entries also have an English version. An English answer
        // for an entry without one keeps the Spanish text on the card and says so, instead of mixing it into a sentence.
        const text = locale === "en" && entry.en ? entry.en : entry;
        const spanishOnly = locale === "en" && !entry.en;
        const pairs: Array<[string, string | null | undefined]> = [
          [pick(locale, "Cash", "Efectivo"), text.cash],
          [pick(locale, "Cards", "Tarjetas"), text.cards],
          [pick(locale, "Contactless", "Sin contacto"), text.contactless],
          [pick(locale, "QR and e-wallets", "QR y billeteras"), text.qr],
          [pick(locale, "ATMs", "Cajeros"), text.atm],
          [pick(locale, "Banknotes", "Billetes"), text.banknotes],
        ];
        const rows: Array<{ label: string; value: string; status: "info" | "warn" }> = pairs
          .filter((p): p is [string, string] => Boolean(p[1]))
          .map(([label, value]) => ({ label, value, status: "info" as const }));
        rows.push({
          label: pick(locale, "Cryptocurrency", "Criptomonedas"),
          value: text.crypto ?? pick(locale, "No official source says whether merchants accept it.", "Ninguna fuente oficial dice si los comercios la aceptan."),
          status: "warn",
        });
        // The answer starts with what was asked (QR, ATM, ...); crypto says plainly when no official source covers it.
        const byTopic: Record<string, string | null | undefined> = { cash: text.cash, cards: text.cards, qr: text.qr, atm: text.atm, banknotes: text.banknotes, crypto: text.crypto };
        const asked = args.topic ? byTopic[args.topic] : undefined;
        const first = args.topic === "crypto" && !text.crypto
          ? pick(locale, "no official source says whether merchants accept cryptocurrency", "ninguna fuente oficial dice si los comercios aceptan criptomonedas")
          : asked ?? text.cash ?? text.cards ?? "";
        // Official entries answer as official. Reported entries (guides, card sites, traveler reports) say so in the voice,
        // the subtitle and the source license, and never claim the official confidence level.
        const official = entry.tier === "oficial";
        const confidence = !official ? "low" : entry.confidence === "alta" ? "high" : entry.confidence === "media" ? "medium" : "low";
        const said = spanishOnly && first ? "the details are only written in Spanish for now, and the card shows them" : first.replace(/\.\s*$/, "");
        const env: Envelope = {
          voice: official
            ? pick(
                locale,
                `In ${name}: ${said || "check the official source for the details"}. Verify with the official source before you travel.`,
                `En ${name}: ${said || "revisa la fuente oficial para los detalles"}. Verifica con la fuente oficial antes de viajar.`,
              )
            : pick(
                locale,
                `In ${name}, according to travel guides and travelers, not confirmed by an official source: ${said || "check an official source for the details"}. Verify before you travel.`,
                `En ${name}, según guías y viajeros, sin confirmación oficial: ${said || "revisa una fuente oficial para los detalles"}. Verifica antes de viajar.`,
              ),
          card: {
            pattern: "list",
            title: pick(locale, `Payments in ${name}`, `Pagos en ${name}`),
            subtitle: official
              ? pick(locale, `Official sources, retrieved ${entry.retrieved}`, `Fuentes oficiales, consultadas el ${entry.retrieved}`)
              : pick(locale, `Travel guides and traveler reports, not official; retrieved ${entry.retrieved}`, `Guías y viajeros, no oficial; consultado el ${entry.retrieved}`),
            rows,
          },
          data: { destination: dest, tier: entry.tier, verified: official, confidence: entry.confidence, notes: text.notes ?? [], retrieved: entry.retrieved },
          sources: entry.sources.map((s, i) => ({
            id: `src:payments:${dest}:${i}`,
            title: s.title,
            url: s.url,
            license: official ? "Official public information" : "Travel guide or traveler report (not official)",
            retrieved: entry.retrieved,
          })),
          followUps: [pick(locale, "Anything else for this trip?", "¿Algo más para este viaje?")],
          lastVerified: ctx.payments.retrieved,
          confidence,
          disclaimer: DISCLAIMER[locale],
        };
        return envelopeResult(env);
      }),
  );

  // Ride, delivery and marketplace apps a visitor can expect in a country. Company lists are official; press and
  // guides are reported and say so. A country missing from an incomplete list is unverified, never "not available".
  server.registerTool(
    "get_local_apps",
    {
      title: "Travel apps",
      description:
        "Use when the user asks whether a ride, delivery or shopping app works in a destination: Uber, Grab, DiDi, Rappi, Mercado Libre, Amazon or Mercari. Answers from each company's own list when it publishes one, otherwise from press or travel guides, labelled as not confirmed. Where there is no verified data it says so. Availability is by market, not by city. Defaults to the trip's destination.",
      inputSchema: {
        destination: z.string().min(2).optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true, openWorld: false }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const trip = latestTrip(state);
        const dest = args.destination ? resolveDestinationOrThrow(args.destination) : trip?.destination;
        if (!dest) return nothingYetEnvelope(locale, "trip");
        const name = countryName(dest, locale);
        const apps = ctx.apps.forCountry(dest);
        const listed = apps.filter((a) => a.status === "listed");
        const unverified = apps.filter((a) => a.status === "unverified");
        const names = (rows: { name: string }[]) => rows.map((a) => a.name).join(", ");
        // Company lists are official; press and guides are reported. The voice keeps the two apart.
        const official = listed.filter((a) => a.tier === "oficial");
        const reported = listed.filter((a) => a.tier === "reportado");
        const statusText = (a: { status: string; tier: string }) => {
          if (a.status === "unverified") return pick(locale, "No verified data", "Sin dato verificado");
          if (a.status === "not_listed") return pick(locale, "Not on the company's list", "No aparece en la lista de la empresa");
          return a.tier === "oficial"
            ? pick(locale, "On the company's list", "En la lista de la empresa")
            : pick(locale, "Reported by press or travel guides; the company has not confirmed it", "Reportado por prensa o guías; la empresa no lo ha confirmado");
        };
        // The card shows the apps that work there: on the company's own list, or reported. The rest (not on a list,
        // no verified data) is one count in the subtitle and one clause in the voice, not a row each.
        const rest = apps.length - listed.length;
        const rows = listed.map((a) => ({
          label: a.name,
          value: a.note ? `${statusText(a)}. ${pick(locale, a.note.en, a.note.es)}` : statusText(a),
          status: "info" as const,
        }));
        const env: Envelope = {
          voice: pick(
            locale,
            `In ${name}: ${official.length ? `on the company's list: ${names(official)}` : "no company list includes it"}${reported.length ? `; reported by press or guides, not confirmed: ${names(reported)}` : ""}${rest ? `; for the other ${rest} apps there is no listing or no verified data` : ""}. Check the app before you travel; availability is by market, not by city.`,
            `En ${name}: ${official.length ? `en la lista de la empresa: ${names(official)}` : "ninguna lista de empresa lo incluye"}${reported.length ? `; reportado por prensa o guías, sin confirmar: ${names(reported)}` : ""}${rest ? `; de las otras ${rest} apps no hay listado o dato verificado` : ""}. Revisa la app antes de viajar; la disponibilidad es por mercado, no por ciudad.`,
          ),
          card: {
            pattern: "list",
            title: pick(locale, `Apps in ${name}`, `Apps en ${name}`),
            subtitle: pick(
              locale,
              `Company lists and reports, retrieved ${ctx.apps.retrieved}${rest ? ` · ${rest} other apps not listed or unverified` : ""}`,
              `Listas de empresas e informes, consultado el ${ctx.apps.retrieved}${rest ? ` · ${rest} apps más sin listado o sin dato verificado` : ""}`,
            ),
            rows,
          },
          data: { destination: dest, apps: listed.map((a) => ({ id: a.id, name: a.name, tier: a.tier, status: statusText(a), links: ctx.appLinks.get(a.name) ?? null })), listed: listed.map((a) => a.id), unverified: unverified.map((a) => a.id), notListed: apps.filter((a) => a.status === "not_listed").map((a) => a.id) },
          sources: apps.map((a) => ({
            id: `src:apps:${a.id}`,
            title: a.source.title,
            url: a.source.url,
            license: a.tier === "oficial" ? "Company's own publication" : "Press or travel guide (not official)",
            retrieved: a.retrieved,
          })),
          followUps: [pick(locale, "Anything else for this trip?", "¿Algo más para este viaje?")],
          lastVerified: ctx.apps.retrieved,
          confidence: listed.some((a) => a.tier === "oficial") ? "medium" : "low",
          disclaimer: DISCLAIMER[locale],
        };
        return envelopeResult(env);
      }),
  );

  // How a visitor pays for city transit: whether a contactless bank card works at the gates, and the local card.
  // An operator's own page is official; press and guides are reported. A country with no entry says so.
  server.registerTool(
    "get_transit_payment",
    {
      title: "Transit payment",
      description:
        "Use when the user asks how to pay for the metro, bus, tram or train in a destination: whether a contactless bank card or phone works at the gates, and which transit card locals use (Oyster, Octopus, Suica, OV-chipkaart, Navigo, T-money, EasyCard, Istanbulkart). Answers from the operator's page when it has one, otherwise from press or guides, labelled as not confirmed. A country with no city entry gets a country-level report from press or guides. Where there is no entry it says so. Defaults to the trip's destination.",
      inputSchema: {
        destination: z.string().min(2).optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true, openWorld: false }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const trip = latestTrip(state);
        const dest = args.destination ? resolveDestinationOrThrow(args.destination) : trip?.destination;
        if (!dest) return nothingYetEnvelope(locale, "trip");
        const name = countryName(dest, locale);
        const systems = ctx.transit.forCountry(dest);
        // No city system: a country-level report (one status for the whole country, from reports).
        const country = systems.length ? undefined : ctx.transit.countryEntry(dest);
        if (country) {
          const sentence = {
            yes: { en: "a bank card works at the gates", es: "una tarjeta bancaria entra en los torniquetes", status: "info" as const },
            partial: { en: "a bank card works only partly", es: "una tarjeta bancaria funciona solo en parte", status: "info" as const },
            no: { en: "a bank card does not work on transit; use the local card or cash", es: "la tarjeta bancaria no funciona en el transporte; usa la tarjeta local o efectivo", status: "warn" as const },
            unverified: { en: "a bank card is not confirmed for transit", es: "no se confirma que la tarjeta bancaria funcione en el transporte", status: "warn" as const },
          }[country.bankCard];
          const official = country.tier === "oficial";
          const tierLine =
            country.bankCard === "unverified"
              ? ""
              : official
                ? pick(locale, " The operator's own page says so.", " Lo dice la página del operador.")
                : pick(locale, " Press and guides say so; cities were not checked one by one.", " Lo dicen prensa y guías; no revisé ciudad por ciudad.");
          return envelopeResult({
            voice: pick(
              locale,
              `In ${name}: ${sentence.en}.${tierLine} Check the operator before you travel.`,
              `En ${name}: ${sentence.es}.${tierLine} Revisa al operador antes de viajar.`,
            ),
            card: {
              pattern: "list",
              title: pick(locale, `Transit in ${name}`, `Transporte en ${name}`),
              subtitle: pick(locale, `Country-level report, retrieved ${country.retrieved}`, `Informe por país, consultado el ${country.retrieved}`),
              rows: [{ label: name, value: pick(locale, country.bankCardNote.en, country.bankCardNote.es), status: sentence.status }],
            },
            data: { destination: dest, systems: [], country: country.iso, verified: true },
            sources: [
              {
                id: `src:transit-country:${country.iso}`,
                title: country.source.title,
                url: country.source.url,
                license: official ? "Operator's own page" : "Press or guide (not official)",
                retrieved: country.retrieved,
              },
            ],
            lastVerified: ctx.transit.retrieved,
            confidence: official && country.bankCard === "yes" ? "medium" : "low",
            disclaimer: DISCLAIMER[locale],
            followUps: [pick(locale, "Anything else for this trip?", "¿Algo más para este viaje?")],
          });
        }
        if (!systems.length) {
          return envelopeResult({
            voice: pick(
              locale,
              `I don't have verified transit payment information for ${countryName(dest, "en")} yet. Check the local transit operator before you travel.`,
              `Aún no tengo información verificada de pago en el transporte para ${name}. Revisa al operador local antes de viajar.`,
            ),
            card: { pattern: "list", title: pick(locale, `Transit in ${name}`, `Transporte en ${name}`), rows: [] },
            data: { destination: dest, systems: [], verified: false },
            sources: [],
            lastVerified: ctx.transit.retrieved,
            confidence: "low",
            disclaimer: DISCLAIMER[locale],
            followUps: [pick(locale, "Anything else for this trip?", "¿Algo más para este viaje?")],
          });
        }
        const end = (text: string) => text.replace(/\.\s*$/, "");
        const bank: Record<string, { en: string; es: string; status: "info" | "warn" }> = {
          yes: { en: "Bank card works at the gates", es: "La tarjeta bancaria entra en los torniquetes", status: "info" },
          partial: { en: "Partly: bank card on some lines or services only", es: "En parte: tarjeta bancaria solo en algunas líneas o servicios", status: "info" },
          no: { en: "Bank card does not work: use the local card", es: "La tarjeta bancaria no funciona: usa la tarjeta local", status: "warn" },
          unverified: { en: "Not confirmed: check the operator", es: "Sin confirmar: revisa al operador", status: "warn" },
        };
        const rows = systems.map((s) => {
          const label = bank[s.bankCard]!;
          return {
            label: pick(locale, s.city.en, s.city.es),
            value: `${pick(locale, label.en, label.es)}. ${end(pick(locale, s.bankCardNote.en, s.bankCardNote.es))}. ${pick(locale, "Local card", "Tarjeta local")}: ${end(pick(locale, s.physicalCard.en, s.physicalCard.es))}.`,
            status: label.status,
          };
        });
        const cityNames = (xs: { city: { en: string; es: string } }[]) => xs.map((s) => pick(locale, s.city.en, s.city.es)).join(", ");
        const yes = systems.filter((s) => s.bankCard === "yes");
        const partial = systems.filter((s) => s.bankCard === "partial");
        const no = systems.filter((s) => s.bankCard === "no");
        const unverified = systems.filter((s) => s.bankCard === "unverified");
        const env: Envelope = {
          voice: pick(
            locale,
            `In ${name}: ${yes.length ? `a bank card works at the gates in ${cityNames(yes)}` : "no system we have confirmed takes a bank card at the gates"}${partial.length ? `; only partly in ${cityNames(partial)}` : ""}${no.length ? `; not with a bank card in ${cityNames(no)}` : ""}${unverified.length ? `; not confirmed for ${cityNames(unverified)}` : ""}. Check the operator before you travel.`,
            `En ${name}: ${yes.length ? `la tarjeta bancaria entra en ${cityNames(yes)}` : "ningún sistema confirmado acepta tarjeta bancaria en los torniquetes"}${partial.length ? `; solo en parte en ${cityNames(partial)}` : ""}${no.length ? `; no funciona con tarjeta bancaria en ${cityNames(no)}` : ""}${unverified.length ? `; sin confirmar en ${cityNames(unverified)}` : ""}. Revisa al operador antes de viajar.`,
          ),
          card: {
            pattern: "list",
            title: pick(locale, `Transit in ${name}`, `Transporte en ${name}`),
            subtitle: pick(locale, `Operator pages and reports, retrieved ${ctx.transit.retrieved}`, `Páginas de operadores e informes, consultado el ${ctx.transit.retrieved}`),
            rows,
          },
          data: { destination: dest, systems: systems.map((s) => s.id), verified: true },
          sources: systems.map((s) => ({
            id: `src:transit:${s.id}`,
            title: s.source.title,
            url: s.source.url,
            license: s.tier === "oficial" ? "Operator's own page" : "Press or guide (not official)",
            retrieved: s.retrieved,
          })),
          followUps: [pick(locale, "Anything else for this trip?", "¿Algo más para este viaje?")],
          lastVerified: ctx.transit.retrieved,
          confidence: systems.some((s) => s.tier === "oficial" && s.bankCard === "yes") ? "medium" : "low",
          disclaimer: DISCLAIMER[locale],
        };
        return envelopeResult(env);
      }),
  );

  // What a visitor can pay with when a foreign card does not work here (data/world/what-works.json). A synthesis of
  // options already cited elsewhere: domestic networks, local apps, merchant QR codes, wallets, cash. Never crypto.
  server.registerTool(
    "get_what_works",
    {
      title: "What works without a card",
      description:
        "Use when the user's foreign card does not work at the destination, or they ask what else they can pay with there: lists the options a visitor can actually use (local apps, merchant QR codes, domestic card networks, wallets, cash), each with whether a visitor can use it and its sources. Says plainly when no verified option is open to a visitor. Defaults to the trip's destination.",
      inputSchema: {
        destination: z.string().min(2).optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true, openWorld: false }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const trip = latestTrip(state);
        const dest = args.destination ? resolveDestinationOrThrow(args.destination) : trip?.destination;
        if (!dest) return nothingYetEnvelope(locale, "trip");
        const name = countryName(dest, locale);
        const entry = ctx.whatWorks.forCountry(dest);
        if (!entry) {
          return envelopeResult({
            voice: pick(
              locale,
              `I don't have verified information on what to pay with in ${countryName(dest, "en")} if your card fails. Check the official travel advice and your bank.`,
              `Aún no tengo información verificada de qué pagar en ${name} si la tarjeta no funciona. Revisa el aviso oficial de viaje y a tu banco.`,
            ),
            card: { pattern: "list", title: pick(locale, `What works in ${name}`, `Qué funciona en ${name}`), rows: [] },
            data: { destination: dest, viable: 0, verified: false },
            sources: [],
            lastVerified: ctx.whatWorks.retrieved,
            confidence: "low",
            disclaimer: DISCLAIMER[locale],
            followUps: [pick(locale, "Anything else for this trip?", "¿Algo más para este viaje?")],
          });
        }
        const kindLabel: Record<string, { en: string; es: string }> = {
          domestic_network: { en: "Domestic card network", es: "Red nacional de tarjetas" },
          local_app: { en: "Local app", es: "App local" },
          merchant_qr: { en: "Merchant QR code", es: "QR de comercio" },
          in_app_qr: { en: "QR inside an app", es: "QR dentro de una app" },
          local_scheme: { en: "Local payment scheme", es: "Esquema de pago local" },
          global_wallet: { en: "Wallet", es: "Billetera" },
          cash: { en: "Cash", es: "Efectivo" },
        };
        // Crypto never reaches the answer, even if a data row mentions it.
        const CRYPTO = /cripto|crypto|usdc|usdt|bitcoin|stablecoin/i;
        const options = entry.options.filter((o) => !CRYPTO.test(`${o.name} ${o.operator ?? ""} ${o.detail}`));
        const label = (o: { kind: string; name: string }) => (o.kind === "cash" ? pick(locale, "Cash", "Efectivo") : o.name);
        // The data's detail is written in Spanish only, so it is shown in Spanish sessions and left out otherwise.
        const detailOf = (o: { detail: string }) => (locale.startsWith("es") ? o.detail : "");
        const viable = options.filter((o) => o.usable_by_tourist);
        // Estimated cash (veracity below 0.5) stays in the rows, but it is not counted as a verified way.
        const ways = viable.filter((o) => !(o.kind === "cash" && o.veracity < 0.5));
        const best = viable.reduce((m, o) => Math.max(m, o.veracity), 0);
        const officialBest = viable
          .filter((o) => o.sources.some((s) => s.official))
          .reduce((m, o) => Math.max(m, o.veracity), 0);
        const count =
          ways.length === 1 ? pick(locale, "1 way", "una vía") : pick(locale, `${ways.length} ways`, `${ways.length} vías`);
        const shown = ways.slice(0, 4).map(label);
        const more = ways.length - shown.length;
        const names = shown.join(", ") + (more > 0 ? pick(locale, ` and ${more} more`, ` y ${more} más`) : "");
        const env: Envelope = {
          voice: ways.length
            ? pick(
                locale,
                `In ${name}: ${count} a visitor can pay with without a local card: ${names}. Check each one before you travel.`,
                `En ${name}: ${count} que un turista puede usar sin tarjeta local: ${names}. Revisa cada una antes de viajar.`,
              )
            : viable.length
              ? pick(
                  locale,
                  `In ${name}: I found no verified way a visitor can pay with a foreign card or wallet. Cash is the usual way, though that is an estimate.`,
                  `En ${name}: no encontré ninguna vía verificada con tarjeta o billetera extranjera. El efectivo parece ser lo habitual, aunque es una estimación.`,
                )
              : pick(
                locale,
                `In ${name}: I found no verified way a visitor can pay with a foreign card or wallet. Check the official travel advice and your bank.`,
                `En ${name}: no encontré ninguna vía verificada que un turista pueda usar con tarjeta o billetera extranjera. Revisa el aviso oficial de viaje y a tu banco.`,
              ),
          card: {
            pattern: "list",
            title: pick(locale, `What works in ${name}`, `Qué funciona en ${name}`),
            subtitle: pick(
              locale,
              `Options from cited sources, retrieved ${ctx.whatWorks.retrieved}`,
              `Opciones de fuentes citadas, consultado el ${ctx.whatWorks.retrieved}`,
            ),
            rows: options.map((o) => {
              const verdict = o.usable_by_tourist
                ? pick(locale, "Available to visitors.", "Disponible para turistas.")
                : pick(locale, "Not available to visitors.", "No disponible para turistas.");
              return {
                label: label(o),
                value: `${pick(locale, kindLabel[o.kind]!.en, kindLabel[o.kind]!.es)}. ${verdict} ${detailOf(o)}`.trim(),
                status: o.usable_by_tourist ? ("info" as const) : ("warn" as const),
              };
            }),
          },
          data: { destination: dest, viable: viable.length, options: options.length, verified: true },
          sources: entry.sources.map((s, i) => ({
            id: `src:what-works:${dest}:${i}`,
            title: s.title,
            url: s.url,
            license: s.official ? "Official public information" : "Company, press or guide (not official)",
            retrieved: ctx.whatWorks.retrieved,
          })),
          followUps: [pick(locale, "Anything else for this trip?", "¿Algo más para este viaje?")],
          lastVerified: ctx.whatWorks.retrieved,
          // High only when a usable option is backed by an official publisher; company or press sources stay at medium.
          confidence: officialBest >= 0.8 ? "high" : best >= 0.5 ? "medium" : "low",
          disclaimer: DISCLAIMER[locale],
        };
        return envelopeResult(env);
      }),
  );

  // 12. trip_brief (multi-session memory)
  // The usual weather on the trip's dates, from vendored climate normals (NASA POWER).
  server.registerTool(
    "get_trip_climate",
    {
      title: "Trip climate",
      description:
        "Use when the user asks about the weather, temperature or rain at the destination, or what clothes to bring. Returns the usual highs, lows and rain for the trip's dates at the destination's capital (climate normals from NASA POWER, not a forecast) and what that means for packing. Without arguments it uses the saved trip.",
      inputSchema: {
        destination: z.string().min(2).optional(),
        startDate: ISO_DATE.optional(),
        endDate: ISO_DATE.optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true, openWorld: false }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const trip = latestTrip(state);
        const dest = args.destination ? resolveDestinationOrThrow(args.destination) : trip?.destination;
        if (!dest) return nothingYetEnvelope(locale, "trip");
        const sameTrip = trip && trip.destination === dest;
        const today = localToday(ctx.clock(), state.profile?.homeTimezone);
        const startDate = args.startDate ?? (sameTrip ? trip.startDate : today);
        const endDate = args.endDate ?? (sameTrip ? trip.endDate : args.startDate ?? today);
        const entry = ctx.climate.get(dest);
        if (!entry) {
          return envelopeResult({
            voice: pick(locale, `I have no climate data for ${countryName(dest, "en")}.`, `No tengo datos de clima para ${countryName(dest, "es")}.`),
            card: { pattern: "card", title: pick(locale, "Weather", "Clima"), rows: [] },
            data: { destination: dest },
            sources: [],
            lastVerified: ctx.climate.source.retrieved,
            confidence: "low",
            disclaimer: DISCLAIMER[locale],
            followUps: [],
          });
        }
        const c = tripClimate(entry, startDate, endDate);
        const city = entry.city[locale];
        const advice = climateAdvice(c, locale);
        const rainWords = c.wet ? pick(locale, "frequent rain", "lluvia frecuente") : c.rain >= 1.5 ? pick(locale, "some rain", "algo de lluvia") : pick(locale, "little rain", "poca lluvia");
        const when = spokenDates(startDate, endDate, locale);
        const tip = c.cold
          ? pick(locale, "Bring a warm coat and layers.", "Lleva abrigo y capas.")
          : c.cool
            ? pick(locale, "Bring a light jacket for the evenings.", "Lleva una chaqueta ligera para las noches.")
            : c.hot
              ? pick(locale, "Pack light clothes and sunscreen.", "Lleva ropa ligera y protector solar.")
              : pick(locale, "Pack for mild weather.", "Lleva ropa para clima templado.");
        const rainTip = c.wet ? pick(locale, " And an umbrella.", " Y un paraguas.") : "";
        const env: Envelope = {
          voice: pick(
            locale,
            `In ${city} ${when}, highs are usually around ${c.hi} degrees and lows around ${c.lo}, with ${rainWords}. ${tip}${rainTip}`,
            `En ${city} ${when}, las máximas suelen rondar los ${c.hi} grados y las mínimas los ${c.lo}, con ${rainWords}. ${tip}${rainTip}`,
          ),
          card: {
            pattern: "card",
            title: pick(locale, `Weather in ${city}`, `Clima en ${city}`),
            subtitle: `${shortRange(startDate, endDate, locale)} · ${pick(locale, "usual weather, not a forecast", "clima habitual, no un pronóstico")}`,
            rows: [
              { label: pick(locale, "Highs", "Máximas"), value: `${c.hi} °C`, status: c.hot ? "warn" : "info" },
              { label: pick(locale, "Lows", "Mínimas"), value: `${c.lo} °C`, status: c.cold ? "warn" : "info" },
              { label: pick(locale, "Rain", "Lluvia"), value: pick(locale, `${c.rain} mm a day`, `${c.rain} mm al día`), status: c.wet ? "warn" : "info" },
              ...advice.map((a) => ({ label: pick(locale, "Bring", "Lleva"), value: a.label, status: a.status })),
            ],
          },
          data: { destination: dest, city, startDate, endDate, ...c, advice: advice.map((a) => a.label) },
          sources: [{ id: ctx.climate.source.id, title: ctx.climate.source.title, url: ctx.climate.source.url, license: ctx.climate.source.license, retrieved: ctx.climate.source.retrieved }] as Envelope["sources"],
          lastVerified: ctx.climate.source.retrieved,
          confidence: "medium",
          disclaimer: pick(locale, `Climate normals for ${city} (NASA POWER, 2001 to 2025), not a forecast.`, `Clima habitual de ${city} (NASA POWER, 2001 a 2025), no un pronóstico.`),
          followUps: [pick(locale, "Update the packing list?", "¿Actualizo la lista de equipaje?")],
        };
        return envelopeResult(env);
      }),
  );

  server.registerTool(
    "trip_brief",
    {
      title: "Trip brief",
      description:
        "Use when the user comes back and asks what is left for their trip, or what is pending. Works across sessions: it reads the stored trip, travelers, packing progress and expenses.",
      inputSchema: { tripId: z.string().optional() },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const profile = requireProfile(state);
        const trip = latestTrip(state, args.tripId);
        if (!trip) return nothingYetEnvelope(locale, "trip");
        const travelers = profile.travelers.filter((t) => trip.travelerIds.includes(t.travelerId));
        const left = daysUntil(localToday(ctx.clock(), profile.homeTimezone), trip.startDate);
        const stay = daysBetween(trip.startDate, trip.endDate);
        const pending: string[] = [];
        const entries = travelers.map((t) => {
          const { best } = entryFor(ctx, t, trip.destination);
          return { traveler: t.displayName, status: best.entry.status, maxStayDays: best.entry.maxStayDays ?? null };
        });
        for (const e of entries) {
          if (e.status !== "visa_free" && e.status !== "same_country") {
            pending.push(pick(locale, `Check the entry requirement for ${e.traveler} (${STATUS_LABEL[e.status].en})`, `Revisa el requisito de entrada de ${e.traveler} (${STATUS_LABEL[e.status].es})`));
          }
        }
        const items = packingItems(ctx, trip, travelers, locale).filter((i) => i.group !== "do-not-pack");
        const done = new Set(trip.packingDone);
        const packed = items.filter((i) => done.has(i.id)).length;
        if (packed === 0) pending.push(pick(locale, "Packing list not started", "Lista de equipaje sin empezar"));
        else if (packed < items.length) pending.push(pick(locale, `${items.length - packed} items left to pack`, `Faltan ${items.length - packed} cosas por empacar`));
        const planned = (trip.itinerary ?? []).filter((d) => d.stops.length > 0).length;
        if (planned === 0) pending.push(pick(locale, "No day plan yet", "Aún sin plan de días"));
        // Bookings: pending confirmations, and cancellation deadlines within the next 30 days.
        const today = localToday(ctx.clock(), profile.homeTimezone);
        const bookings = trip.bookings ?? [];
        const deadlines = bookings
          .filter((b) => b.cancelBy && b.cancelBy >= today)
          .map((b) => ({ title: b.title, cancelBy: b.cancelBy as string, days: Math.round((Date.parse(`${b.cancelBy}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) }))
          .filter((d) => d.days <= 30)
          .sort((a, b) => a.days - b.days);
        for (const d of deadlines) {
          pending.push(pick(locale, `Free cancellation for ${d.title} ends ${d.cancelBy} (${d.days} days)`, `La cancelación gratis de ${d.title} termina el ${d.cancelBy} (en ${d.days} días)`));
        }
        for (const b of bookings.filter((x) => x.status === "to_confirm")) {
          pending.push(pick(locale, `Confirm the details of ${b.title}`, `Confirma los datos de ${b.title}`));
        }
        // Readiness: entry 40%, packing 35%, day plan 25%.
        const entryOk = entries.length ? entries.filter((e) => e.status === "visa_free" || e.status === "same_country").length / entries.length : 0;
        const readiness = Math.round(100 * (0.4 * entryOk + 0.35 * (items.length ? packed / items.length : 0) + 0.25 * Math.min(1, planned / stay)));
        const expenses = state.expenses.filter((e) => e.tripId === trip.tripId);
        const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
        const expenseCurrency = expenses[0]?.currency ?? profile.homeCurrency;
        const env = baseEnvelope(ctx, trip.destination, locale, {
          visa: true,
          voice: pick(
            locale,
            `${daysUntilTripSentence(left, countryName(trip.destination, "en"), "en")} You're ${readiness}% ready. ${pending.length ? `Still open: ${pending.map(lowerFirst).join("; ")}.` : "Nothing pending."}`,
            `${daysUntilTripSentence(left, countryName(trip.destination, "es"), "es")} Vas ${readiness}% listo. ${pending.length ? `Pendiente: ${pending.map(lowerFirst).join("; ")}.` : "No hay pendientes."}`,
          ),
          card: {
            pattern: "list",
            title: pick(locale, "What's left", "Lo que falta"),
            subtitle: shortRange(trip.startDate, trip.endDate, locale),
            rows: [
              { label: pick(locale, "Days left", "Días restantes"), value: String(left), status: "info" },
              { label: pick(locale, "Ready", "Preparación"), value: `${readiness}%`, status: readiness >= 80 ? "ok" : "warn" },
              ...pending.map((p) => ({ label: pick(locale, "Pending", "Pendiente"), value: p, status: "warn" as const })),
              ...(expenses.length ? [{ label: pick(locale, "Logged spending", "Gastos registrados"), value: money(expenseTotal, expenseCurrency, locale), status: "info" as const }] : []),
            ],
          },
          data: {
            deadlines,
            tripId: trip.tripId,
            destination: trip.destination,
            destinationName: countryName(trip.destination, locale),
            startDate: trip.startDate,
            endDate: trip.endDate,
            daysUntil: left,
            stay,
            readiness,
            entries,
            packed,
            packTotal: items.length,
            planned,
            pending,
            expenseTotal,
            expenseCurrency,
            climate: (() => {
              const cl = ctx.climate.get(trip.destination);
              if (!cl) return null;
              const c = tripClimate(cl, trip.startDate, trip.endDate);
              return { city: cl.city[locale], hi: c.hi, lo: c.lo, rain: c.rain };
            })(),
            geo: tripGeo(ctx, trip, travelers),
          },
          followUps: [pick(locale, "Show the packing list?", "¿Muestro la lista de equipaje?")],
        });
        return envelopeResult(env);
      }),
  );

  // 13. log_expense
  server.registerTool(
    "log_expense",
    {
      title: "Log expense",
      description:
        "Use when the user says they spent money on the trip. Stores the expense and returns the trip total in the currency of the expense.",
      inputSchema: {
        amount: z.number().positive(),
        currency: CURRENCY.optional(),
        category: z.string().min(2),
        note: z.string().optional(),
        tripId: z.string().optional(),
        payer: z.string().optional().describe("Who paid: a traveler's name or id"),
        splitAmong: z.array(z.string()).optional().describe("Names or ids of the people who share this cost; omit for everyone"),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({}),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const profile = state.profile;
        const trip = latestTrip(state, args.tripId);
        if (args.tripId && !trip) {
          return errorResult(new Error("unknown trip"), pick(locale, "I don't have that trip. Tell me its destination again.", "No tengo ese viaje. Dime otra vez su destino."));
        }
        const currency = (args.currency ?? profile?.homeCurrency ?? "USD").toUpperCase();
        const findTraveler = (ref: string) =>
          profile?.travelers.find((t) => t.travelerId === ref || t.displayName.toLowerCase() === ref.trim().toLowerCase());
        // A name outside the group is refused, not dropped: dropping it would charge the cost to everyone else.
        const unknown = [args.payer, ...(args.splitAmong ?? [])].filter((r): r is string => Boolean(r) && !findTraveler(r as string));
        if (unknown.length) {
          return errorResult(new Error("unknown traveler"), pick(locale, `I don't know ${unknown.join(" or ")} in this group. Use the names saved in the profile.`, `No conozco a ${unknown.join(" ni a ")} en este grupo. Usa los nombres guardados en tu perfil.`));
        }
        const payer = args.payer ? findTraveler(args.payer)?.travelerId : undefined;
        // Repeated names count once, so a name typed twice does not weigh twice in settle_up.
        const splitAmong = [...new Set((args.splitAmong ?? []).map((r) => findTraveler(r)?.travelerId).filter((x): x is string => Boolean(x)))];
        const expense = {
          id: randomUUID(),
          tripId: trip?.tripId ?? null,
          amount: args.amount,
          currency,
          category: args.category,
          note: args.note,
          createdAt: ctx.clock().toISOString(),
          ...(payer ? { payer } : {}),
          ...(splitAmong.length ? { splitAmong } : {}),
        };
        state.expenses.push(expense);
        await save(state);
        const total = state.expenses.filter((e) => e.tripId === expense.tripId && e.currency === currency).reduce((s, e) => s + e.amount, 0);
        // Spending limit: every expense of the trip, converted to the limit's currency.
        const cap = trip?.constraints?.maxBudget;
        let spentInCap: number | null = null;
        let unconvertible: string | null = null;
        if (cap && trip) {
          let sum = 0;
          for (const e of state.expenses.filter((x) => x.tripId === trip.tripId)) {
            const conv = e.currency === cap.currency ? { value: e.amount } : await ctx.fx.convert(e.amount, e.currency, cap.currency);
            if (!conv) { unconvertible = e.currency; break; }
            sum += conv.value;
          }
          if (!unconvertible) spentInCap = Math.round(sum * 100) / 100;
        }
        const overBudget = cap !== undefined && spentInCap !== null && spentInCap > cap.amount;
        const budgetLine = cap && spentInCap !== null
          ? pick(locale, ` Spent ${money(spentInCap, cap.currency, locale)} of the ${money(cap.amount, cap.currency, locale)} limit.${overBudget ? " You are over the limit." : ""}`, ` Llevas ${money(spentInCap, cap.currency, locale)} de tu tope de ${money(cap.amount, cap.currency, locale)}.${overBudget ? " Ya pasaste el tope." : ""}`)
          : cap && unconvertible
            ? pick(locale, ` I have no rate from ${unconvertible} to ${cap.currency}, so I cannot check your limit.`, ` No tengo tasa de ${unconvertible} a ${cap.currency}, así que no puedo revisar tu tope.`)
            : "";
        const env = baseEnvelope(ctx, trip?.destination ?? "", locale, {
          voice: pick(locale, `Logged ${args.amount} ${currency} for ${args.category}. Trip total in ${currency}: ${total.toFixed(2)}.`, `Registré ${args.amount} ${currency} en ${args.category}. Total del viaje en ${currency}: ${total.toFixed(2)}.`) + budgetLine,
          card: {
            pattern: "card",
            title: pick(locale, "Expense logged", "Gasto registrado"),
            rows: [
              { label: args.category, value: `${args.amount} ${currency}`, status: "ok" },
              { label: pick(locale, "Trip total", "Total del viaje"), value: `${total.toFixed(2)} ${currency}`, status: "info" },
            ],
          },
          data: { expense, totalSameCurrency: total, budget: cap ?? null, spentInBudgetCurrency: spentInCap, overBudget },
          followUps: [pick(locale, "How much is left in my budget?", "¿Cuánto me queda del presupuesto?")],
        });
        return envelopeResult(env);
      }),
  );

  // Bookings: what the traveler has reserved, with the date a cancellation stops being free.
  server.registerTool(
    "add_booking",
    {
      title: "Add booking",
      description:
        "Use when the traveler gives a booking (flight, hotel, car, activity) or pastes its confirmation text. Extract the fields yourself. Saved as to_confirm unless status is given; the traveler confirms the details with confirm_booking. cancelBy is the last date the booking can be cancelled free of charge, when the text states it, and it cannot be after the booking date or the trip's end.",
      inputSchema: {
        tripId: z.string().optional(),
        kind: z.enum(["flight", "hotel", "car", "activity", "other"]),
        title: z.string().min(2).max(120),
        date: ISO_DATE.optional(),
        cancelBy: ISO_DATE.optional(),
        reference: z.string().max(40).optional(),
        status: z.enum(["to_confirm", "confirmed"]).optional(),
      },
      outputSchema: EnvelopeShape,
      annotations: ann({}),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const trip = latestTrip(state, args.tripId);
        if (!trip) return nothingYetEnvelope(locale, "trip");
        // A free-cancellation date after the booking itself, or after the trip ends, is a mistake in the text.
        if (args.cancelBy && ((args.date && args.cancelBy > args.date) || args.cancelBy > trip.endDate)) {
          return errorResult(new Error("bad cancelBy"), pick(locale, "The free-cancellation date is after the booking or the trip. Check the confirmation text.", "La fecha de cancelación gratis es posterior a la reserva o al viaje. Revisa el texto de confirmación."));
        }
        const booking = {
          id: randomUUID(),
          kind: args.kind,
          title: args.title,
          date: args.date,
          cancelBy: args.cancelBy,
          reference: args.reference,
          status: args.status ?? "to_confirm",
          createdAt: ctx.clock().toISOString(),
        } as const;
        trip.bookings = [...(trip.bookings ?? []), { ...booking }];
        await save(state);
        const cancel = booking.cancelBy ? pick(locale, ` Free cancellation until ${booking.cancelBy}.`, ` Cancelación gratis hasta el ${booking.cancelBy}.`) : "";
        const env = baseEnvelope(ctx, trip.destination, locale, {
          voice: pick(
            locale,
            `Saved ${booking.title}${booking.status === "to_confirm" ? ", pending your confirmation" : ""}.${cancel}`,
            `Guardé ${booking.title}${booking.status === "to_confirm" ? ", pendiente de tu confirmación" : ""}.${cancel}`,
          ),
          card: {
            pattern: "card",
            title: pick(locale, "Booking", "Reserva"),
            rows: [
              { label: pick(locale, "Booking", "Reserva"), value: booking.title, status: booking.status === "to_confirm" ? "warn" : "ok" },
              ...(booking.date ? [{ label: pick(locale, "Date", "Fecha"), value: booking.date, status: "info" as const }] : []),
              ...(booking.cancelBy ? [{ label: pick(locale, "Free cancellation until", "Cancelación gratis hasta"), value: booking.cancelBy, status: "warn" as const }] : []),
            ],
          },
          data: { booking },
          followUps: [],
        });
        return envelopeResult(env);
      }),
  );

  server.registerTool(
    "confirm_booking",
    {
      title: "Confirm booking",
      description: "Use after the traveler confirms the details of a booking that is pending (to_confirm).",
      inputSchema: { tripId: z.string().optional(), bookingId: z.string() },
      outputSchema: EnvelopeShape,
      annotations: ann({ idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        // The booking may belong to any trip of this traveler, not only the latest one.
        const trip = state.trips.filter((t) => !args.tripId || t.tripId === args.tripId).find((t) => (t.bookings ?? []).some((x) => x.id === args.bookingId));
        const b = trip?.bookings?.find((x) => x.id === args.bookingId);
        if (!trip || !b) return errorResult(new Error("no booking"), pick(locale, "I can't find that booking.", "No encuentro esa reserva."));
        b.status = "confirmed";
        await save(state);
        const env = baseEnvelope(ctx, trip.destination, locale, {
          voice: pick(locale, `Confirmed ${b.title}.`, `Confirmé ${b.title}.`),
          card: { pattern: "card", title: pick(locale, "Booking", "Reserva"), rows: [{ label: b.title, value: pick(locale, "confirmed", "confirmada"), status: "ok" }] },
          data: { booking: b },
          followUps: [],
        });
        return envelopeResult(env);
      }),
  );

  // Group expenses: who paid what, and the transfers that square everyone up.
  server.registerTool(
    "settle_up",
    {
      title: "Settle up the group",
      description:
        "Use when the group asks who owes whom for the trip. Balances every expense that has a payer, split equally among the people it covers, in the traveler's home currency. Expenses without a payer are reported, not guessed.",
      inputSchema: { tripId: z.string().optional() },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const profile = requireProfile(state);
        const trip = latestTrip(state, args.tripId);
        if (!trip) return nothingYetEnvelope(locale, "trip");
        const home = profile.homeCurrency;
        const members = profile.travelers.filter((t) => trip.travelerIds.includes(t.travelerId));
        const balance = new Map<string, number>(members.map((m) => [m.travelerId, 0]));
        let unassigned = 0;
        let unconverted = 0;
        for (const e of state.expenses.filter((x) => x.tripId === trip.tripId)) {
          if (!e.payer || !balance.has(e.payer)) { unassigned++; continue; }
          const conv = e.currency === home ? { value: e.amount } : await ctx.fx.convert(e.amount, e.currency, home);
          if (!conv) { unconverted++; continue; }
          // A name listed twice in splitAmong weighs once.
          const among = [...new Set((e.splitAmong ?? []).filter((id) => balance.has(id)))];
          const sharers = among.length ? among : members.map((m) => m.travelerId);
          balance.set(e.payer, (balance.get(e.payer) ?? 0) + conv.value);
          const share = conv.value / sharers.length;
          for (const id of sharers) balance.set(id, (balance.get(id) ?? 0) - share);
        }
        const name = (id: string) => members.find((m) => m.travelerId === id)?.displayName ?? id;
        // Money is settled in whole cents. Each balance is rounded once; the rounding left over goes to the
        // largest balance, so the balances add up to zero and the transfers add up exactly.
        const cents = new Map([...balance].map(([id, v]) => [id, Math.round(v * 100)]));
        const drift = [...cents.values()].reduce((s, c) => s + c, 0);
        if (drift !== 0) {
          const [biggestId, biggest] = [...cents].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
          cents.set(biggestId, biggest - drift);
        }
        // Greedy settle-up: the largest debtor pays the largest creditor, until everyone is even.
        const owes = [...cents].filter(([, c]) => c < 0).map(([id, c]) => ({ id, c: -c })).sort((a, b) => b.c - a.c);
        const gets = [...cents].filter(([, c]) => c > 0).map(([id, c]) => ({ id, c })).sort((a, b) => b.c - a.c);
        const transfers: { from: string; to: string; amount: number }[] = [];
        let i = 0, j = 0;
        while (i < owes.length && j < gets.length) {
          const pay = Math.min(owes[i].c, gets[j].c);
          transfers.push({ from: name(owes[i].id), to: name(gets[j].id), amount: pay / 100 });
          owes[i].c -= pay;
          gets[j].c -= pay;
          if (owes[i].c === 0) i++;
          if (gets[j].c === 0) j++;
        }
        const lines = transfers.map((t) => `${t.from} ${pick(locale, "pays", "paga a")} ${t.to} ${money(t.amount, home, locale)}`);
        const caveat = [
          unassigned ? pick(locale, ` ${unassigned} expense(s) have no payer and are not counted.`, ` ${unassigned} gasto(s) no tienen quién pagó y no cuentan.`) : "",
          unconverted ? pick(locale, ` ${unconverted} expense(s) have no exchange rate to ${home} and are not counted.`, ` ${unconverted} gasto(s) no tienen tasa de cambio a ${home} y no cuentan.`) : "",
        ].join("");
        const env = baseEnvelope(ctx, trip.destination, locale, {
          voice: transfers.length
            ? pick(locale, `To square up: ${lines.join("; ")}.${caveat}`, `Para quedar a mano: ${lines.join("; ")}.${caveat}`)
            : pick(locale, `Everyone is square.${caveat}`, `Todos están a mano.${caveat}`),
          card: {
            pattern: "list",
            title: pick(locale, "Settle up", "Cuentas del grupo"),
            subtitle: pick(locale, `In ${home}`, `En ${home}`),
            rows: [
              ...members.map((m) => {
                const v = (cents.get(m.travelerId) ?? 0) / 100;
                return { label: m.displayName, value: `${v >= 0 ? "+" : "−"}${money(Math.abs(v), home, locale)}`, status: (v >= 0 ? "ok" : "warn") as "ok" | "warn" };
              }),
              ...transfers.map((t) => ({ label: pick(locale, "Transfer", "Transferencia"), value: `${t.from} → ${t.to} · ${money(t.amount, home, locale)}`, status: "info" as const })),
            ],
          },
          data: { transfers, balances: Object.fromEntries([...cents].map(([id, c]) => [name(id), c / 100])), unassigned, unconverted, home },
          followUps: [],
        });
        return envelopeResult(env);
      }),
  );

  // Fairness: how many of the planned stops each traveler actually likes, and any they avoid.
  server.registerTool(
    "plan_fairness",
    {
      title: "Plan fairness",
      description:
        "Use when the group plans together and someone may be left out. Scores the saved day plan for each traveler: the share of stops that match their likes, and any stop that matches what they avoid. Travelers without likes are not scored.",
      inputSchema: { tripId: z.string().optional() },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const profile = requireProfile(state);
        const trip = latestTrip(state, args.tripId);
        if (!trip) return nothingYetEnvelope(locale, "trip");
        const stops = (trip.itinerary ?? []).flatMap((d) => d.stops).map((id) => ctx.highlights.place(id)?.place).filter((p): p is NonNullable<typeof p> => Boolean(p));
        const members = profile.travelers.filter((t) => trip.travelerIds.includes(t.travelerId));
        const rows = members.map((m) => {
          const likes = new Set(m.likes);
          const avoid = new Set(m.avoid);
          const liked = stops.filter((p) => p.interests.some((i) => likes.has(i))).length;
          const clash = stops.filter((p) => p.interests.some((i) => avoid.has(i)));
          const score = likes.size && stops.length ? liked / stops.length : null;
          return { traveler: m.displayName, score, liked, stops: stops.length, clash: clash.map((p) => p.name) };
        });
        const scored = rows.filter((r) => r.score !== null) as { traveler: string; score: number; liked: number; stops: number; clash: string[] }[];
        const worst = [...scored].sort((a, b) => a.score - b.score)[0];
        const clashes = rows.filter((r) => r.clash.length);
        const voice = !stops.length
          ? pick(locale, "There is no plan to score yet.", "Aún no hay plan que evaluar.")
          : !scored.length
            ? pick(locale, "I don't know what each person likes yet. Ask them and I'll check the plan for everyone.", "No sé qué le gusta a cada quien todavía. Pregúntales y reviso el plan para todos.")
            : pick(
                locale,
                `The plan fits ${worst.traveler} least: ${worst.liked} of ${worst.stops} stops match.${clashes.length ? ` ${clashes[0].traveler} has something they avoid in the plan.` : ""}`,
                `El plan le queda menos a ${worst.traveler}: ${worst.liked} de ${worst.stops} paradas le gustan.${clashes.length ? ` ${clashes[0].traveler} tiene algo que evita en el plan.` : ""}`,
              );
        const env = baseEnvelope(ctx, trip.destination, locale, {
          voice,
          card: {
            pattern: "list",
            title: pick(locale, "Fairness", "Equidad del plan"),
            rows: rows.map((r) => ({
              label: r.traveler,
              value: r.score === null ? pick(locale, "no likes saved", "sin gustos guardados") : `${r.liked}/${r.stops} · ${Math.round(r.score * 100)}%`,
              status: (r.clash.length ? "blocked" : r.score !== null && r.score < 0.34 ? "warn" : "ok") as "ok" | "warn" | "blocked",
            })),
          },
          data: { rows, stops: stops.length },
          followUps: [],
        });
        env.confidence = "medium";
        return envelopeResult(env);
      }),
  );

  // Export: the whole trip as a calendar file or as text, for any app the traveler uses.
  server.registerTool(
    "export_trip",
    {
      title: "Export trip",
      description:
        "Use when the traveler wants the trip in another app: format ics (calendar file with the trip and each planned day) or markdown (the plan, bookings and what is pending as text). Returns the content in data.content.",
      inputSchema: { tripId: z.string().optional(), format: z.enum(["ics", "markdown"]) },
      outputSchema: EnvelopeShape,
      annotations: ann({ readOnly: true, idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        const trip = latestTrip(state, args.tripId);
        if (!trip) return nothingYetEnvelope(locale, "trip");
        const name = countryName(trip.destination, locale);
        const dateOf = (day: number) => new Date(Date.parse(trip.startDate) + (day - 1) * 86_400_000).toISOString().slice(0, 10);
        const plan = (trip.itinerary ?? []).filter((d) => d.stops.length);
        const placeOf = (id: string) => ctx.highlights.place(id)?.place;
        let content: string;
        if (args.format === "ics") {
          const stamp = ctx.clock().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
          const day = (iso: string) => iso.replace(/-/g, "");
          const next = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
          const events = [
            ["BEGIN:VEVENT", `UID:${trip.tripId}@waypoint`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(trip.startDate)}`, `DTEND;VALUE=DATE:${day(next(trip.endDate))}`, `SUMMARY:${icsText(`${locale === "es" ? "Viaje a" : "Trip to"} ${name}`)}`, "END:VEVENT"],
            ...plan.map((d) => [
              "BEGIN:VEVENT", `UID:${trip.tripId}-d${d.day}@waypoint`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(dateOf(d.day))}`, `DTEND;VALUE=DATE:${day(next(dateOf(d.day)))}`,
              `SUMMARY:${icsText(`${locale === "es" ? "Día" : "Day"} ${d.day}${d.title ? ` · ${d.title}` : ""}`)}`,
              `DESCRIPTION:${icsText(d.stops.map((id) => placeOf(id)?.name ?? id).join(", "))}`, "END:VEVENT",
            ]),
          ];
          content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Waypoint//Travel concierge//EN", ...events.flat().map(icsLine), "END:VCALENDAR"].join("\r\n") + "\r\n";
        } else {
          const lines = [`# ${mdText(name)}`, `${trip.startDate} → ${trip.endDate}`, ""];
          for (const d of plan) {
            lines.push(`## ${locale === "es" ? "Día" : "Day"} ${d.day}${d.title ? ` · ${mdText(d.title)}` : ""} (${dateOf(d.day)})`);
            for (const id of d.stops) {
              const p = placeOf(id);
              if (p) lines.push(`- ${mdText(p.name)} (${mdText(p.area)}, ~${p.durationMinutes} min)${p.admission ? ` — ${mdText(p.admission)}` : ""}`);
            }
            lines.push("");
          }
          const bookings = trip.bookings ?? [];
          if (bookings.length) {
            lines.push(`## ${locale === "es" ? "Reservas" : "Bookings"}`);
            for (const b of bookings) {
              const pending = b.status === "to_confirm" ? (locale === "es" ? " (pendiente de confirmar)" : " (pending confirmation)") : "";
              lines.push(`- ${mdText(b.title)}${b.date ? ` (${b.date})` : ""}${b.cancelBy ? ` — ${locale === "es" ? "cancelación gratis hasta" : "free cancellation until"} ${b.cancelBy}` : ""}${pending}`);
            }
          }
          lines.push("", locale === "es" ? "Verifica horarios y reglas en la fuente oficial antes de viajar." : "Check hours and rules on the official source before you travel.");
          content = lines.join("\n");
        }
        const env = baseEnvelope(ctx, trip.destination, locale, {
          voice: pick(locale, `Your trip is ready as ${args.format === "ics" ? "a calendar file" : "text"}.`, `Tu viaje está listo como ${args.format === "ics" ? "archivo de calendario" : "texto"}.`),
          card: { pattern: "card", title: pick(locale, "Export", "Exportar"), rows: [{ label: args.format.toUpperCase(), value: `${content.length} ${pick(locale, "characters", "caracteres")}`, status: "ok" }] },
          data: { format: args.format, content, days: plan.length },
          followUps: [],
        });
        return envelopeResult(env);
      }),
  );

  // 12. forget_me
  server.registerTool(
    "forget_me",
    {
      title: "Forget me",
      description:
        "Use only when the user asks Waypoint to delete all their data. Asks for explicit confirmation first. Deletes the profile, trips and expenses.",
      inputSchema: { confirm: z.boolean().optional().describe("Set true only after the user explicitly agrees") },
      outputSchema: EnvelopeShape,
      annotations: ann({ destructive: true, idempotent: true }),
    },
    (args) =>
      run(async () => {
        const state = await load();
        const locale = localeOf(state);
        let confirmed = args.confirm === true;
        if (supportsElicitation(server)) {
          try {
            const res = await server.server.elicitInput({
              message: pick(locale, "Delete all Waypoint data for you? This removes your profile, trips and expenses.", "¿Borrar todos tus datos de Waypoint? Se eliminan tu perfil, viajes y gastos."),
              requestedSchema: {
                type: "object",
                properties: { confirm: { type: "boolean", title: pick(locale, "Yes, delete everything", "Sí, borrar todo") } },
                required: ["confirm"],
              },
            });
            confirmed = res.action === "accept" && res.content?.confirm === true;
          } catch {
            // fall through to the explicit-argument path
          }
        } else if (args.confirm === undefined) {
          return envelopeResult(baseEnvelope(ctx, "", locale, {
            voice: pick(locale, "Please confirm: say yes to delete all your data.", "Confírmalo: di que sí para borrar todos tus datos."),
            card: { pattern: "card", title: pick(locale, "Confirm deletion", "Confirmar borrado"), rows: [] },
            data: {},
            followUps: [],
            missingFields: ["confirm"],
          }));
        }
        if (!confirmed) {
          return envelopeResult(baseEnvelope(ctx, "", locale, {
            voice: pick(locale, "Nothing was deleted.", "No se borró nada."),
            card: { pattern: "card", title: pick(locale, "Not deleted", "No se borró"), rows: [] },
            data: { deleted: false },
            followUps: [],
          }));
        }
        await ctx.store.remove(userId);
        return envelopeResult(baseEnvelope(ctx, "", locale, {
          voice: pick(locale, "Done. All your Waypoint data is deleted.", "Listo. Todos tus datos de Waypoint se borraron."),
          card: { pattern: "card", title: pick(locale, "Data deleted", "Datos borrados"), rows: [] },
          data: { deleted: true },
          followUps: [],
        }));
      }),
  );
}
