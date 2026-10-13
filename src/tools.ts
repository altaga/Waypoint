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
import type { ItineraryDay, Trip, UserState } from "./state.ts";
import { PLAN_DASHBOARD_URI } from "./resources.ts";
import { itemTerms } from "./items.ts";

type Locale = "en" | "es";

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
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

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
/** Calendar days from the date of `from` (UTC) to `date`. */
const daysUntil = (from: Date, date: string) =>
  Math.round((Date.parse(date) - Date.parse(from.toISOString().slice(0, 10))) / 86_400_000);

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

/** Locale-aware number formatting for spoken and on-screen money. */
function money(value: number, currency: string, locale: Locale): string {
  const tag = locale === "es" ? "es-MX" : "en-US";
  try {
    return new Intl.NumberFormat(tag, { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString(tag)} ${currency}`;
  }
}

function sortRules(rules: Rule[]): Rule[] {
  const rank = { severe: 0, arrest: 1, fine: 2, info: 3 } as const;
  return [...rules].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function packSources(pack: Pack | undefined, ctx: AppContext) {
  const sources = [ctx.visaSource];
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
  partial: Pick<Envelope, "voice" | "card" | "data" | "followUps"> & { missingFields?: string[] },
): Envelope {
  const pack = ctx.packs.get(dest);
  return {
    voice: withDisclaimer(partial.voice, locale),
    card: partial.card,
    data: partial.data,
    sources: packSources(pack, ctx) as Envelope["sources"],
    lastVerified: pack?.generatedAt ?? ctx.visaSource.retrieved,
    confidence: pack ? "medium" : "low",
    disclaimer: DISCLAIMER[locale],
    followUps: partial.followUps,
    ...(partial.missingFields?.length ? { missingFields: partial.missingFields } : {}),
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
  const run = (fn: () => Promise<ToolResult>) =>
    fn().catch(async (err) => errorResult(err, undefined, await load().then(localeOf, () => "en" as const)));

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
        return envelopeResult(
          baseEnvelope(ctx, "", locale, {
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
        );
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
        homeCurrency: z.string().length(3).optional().describe("ISO 4217 code, for example MXN"),
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
          };
          if (input.ageBand) traveler.ageBand = input.ageBand;
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
        const left = daysUntil(ctx.clock(), args.startDate);
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
        const ruleRows = sortRules(pack?.localRules ?? []).slice(0, 5).map((r) => ({
          label: categoryLabel(r.category, locale),
          value: ruleText(r, locale),
          status: (r.severity === "info" ? "info" : "warn") as "info" | "warn",
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
          voice: [
            pick(locale, `Done: your trip to ${countryName(dest, "en")} ${when}.`, `Listo: tu viaje a ${countryName(dest, "es")} ${when}.`),
            daysLeftSentence(left, locale),
            ...visaLines,
          ].join(" "),
          card: {
            pattern: "card",
            title: pick(locale, `Trip to ${countryName(dest, "en")}`, `Viaje a ${countryName(dest, "es")}`),
            subtitle: `${args.startDate} → ${args.endDate} · ${stay} ${pick(locale, "days", "días")}`,
            rows: [...rows, ...ruleRows],
            footer: pack ? undefined : pick(locale, "No verified local rules for this destination yet.", "Aún no tengo reglas locales verificadas para este destino."),
          },
          data: {
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
            card: { pattern: "list", title: pick(locale, "Item check", "Revisión del artículo"), rows: matches.map((r) => ({ label: `${categoryLabel(r.category, locale)} · ${severityLabel(r.severity, locale)}`, value: ruleText(r, locale), status: "warn" as const })) },
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
        const emergency = Object.values(essentials.emergency);
        const env = baseEnvelope(ctx, dest, locale, {
          voice: pick(
            locale,
            `In ${countryName(dest, "en")} the currency is ${essentials.currency ?? "unknown"}, plugs ${essentials.plugTypes.join(", ") || "not listed"}.`,
            `En ${countryName(dest, "es")} la moneda es ${essentials.currency ?? "desconocida"}, enchufes tipo ${essentials.plugTypes.join(", ") || "no listados"}.`,
          ),
          card: {
            pattern: "card",
            title: countryName(dest, locale),
            rows: [
              { label: pick(locale, "Currency", "Moneda"), value: essentials.currency ?? "—", status: "info" },
              { label: pick(locale, "Plug types", "Enchufes"), value: essentials.plugTypes.join(", ") || "—", status: "info" },
              { label: pick(locale, "Emergency", "Emergencias"), value: emergency.join(" · ") || "—", status: "info" },
              { label: pick(locale, "Languages", "Idiomas"), value: essentials.languages.join(", ") || "—", status: "info" },
              ...(pack?.advisory.us ? [{ label: "US advisory", value: `Level ${pack.advisory.us.level}`, status: "info" as const }] : []),
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
        from: z.string().length(3).optional(),
        to: z.string().length(3).optional(),
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
        const stay = daysBetween(trip.startDate, trip.endDate);
        const items: { id: string; group: string; label: string; status: "ok" | "warn" | "info" | "blocked" }[] = [];
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

  // 9. build_itinerary (written by the concierge agent, saved on the trip)
  server.registerTool(
    "build_itinerary",
    {
      title: "Day plan",
      description:
        "Use when the user asks for a day plan or itinerary. To create or change it, write the plan yourself (neighborhoods, sights, food and experiences that fit the destination, the travelers' interests and pace; one idea per slot, short) and pass it in `plan`; it is saved on the trip. Without `plan` it returns the saved plan, or the empty days with dates if none exists yet. Ideas are suggestions; tell the user to check opening hours.",
      inputSchema: {
        tripId: z.string().optional(),
        day: z.number().int().positive().optional(),
        plan: z
          .array(
            z.object({
              day: z.number().int().positive(),
              title: z.string().max(80).optional(),
              morning: z.string().max(160).optional(),
              afternoon: z.string().max(160).optional(),
              evening: z.string().max(160).optional(),
            }),
          )
          .max(30)
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
        const dateOf = (day: number) => new Date(Date.parse(trip.startDate) + (day - 1) * 86_400_000).toISOString().slice(0, 10);
        if (args.plan?.length) {
          const byDay = new Map((trip.itinerary ?? []).map((d) => [d.day, d]));
          for (const d of args.plan) if (d.day <= stay) byDay.set(d.day, { ...d, date: dateOf(d.day) });
          trip.itinerary = [...byDay.values()].sort((x, y) => x.day - y.day);
          await save(state);
        }
        const saved = trip.itinerary ?? [];
        const days: ItineraryDay[] = Array.from({ length: stay }, (_, i) => saved.find((d) => d.day === i + 1) ?? { day: i + 1, date: dateOf(i + 1) });
        const selected = args.day ? days.filter((d) => d.day === args.day) : days;
        const planned = days.filter((d) => d.morning || d.afternoon || d.evening).length;
        const slot = (d: ItineraryDay) =>
          [d.morning && `${pick(locale, "Morning", "Mañana")}: ${d.morning}`, d.afternoon && `${pick(locale, "Afternoon", "Tarde")}: ${d.afternoon}`, d.evening && `${pick(locale, "Evening", "Noche")}: ${d.evening}`]
            .filter(Boolean)
            .join(" · ");
        const first = selected.find((d) => d.morning || d.afternoon || d.evening);
        const voice = planned === 0
          ? pick(locale, `There is no day plan yet for your ${stay} days. Tell me what you enjoy and I'll put one together.`, `Aún no hay plan para tus ${stay} días. Dime qué te gusta y te armo uno.`)
          : args.plan?.length
            ? pick(locale, `Saved: a plan for ${planned} of ${stay} days.${first?.title ? ` Day ${first.day}: ${first.title}.` : ""} Check opening hours before you go.`, `Guardado: plan para ${planned} de ${stay} días.${first?.title ? ` Día ${first.day}: ${first.title}.` : ""} Revisa horarios antes de ir.`)
            : pick(locale, `Your plan covers ${planned} of ${stay} days.`, `Tu plan cubre ${planned} de ${stay} días.`);
        const env = baseEnvelope(ctx, trip.destination, locale, {
          voice,
          card: {
            pattern: "carousel",
            title: pick(locale, "Day plan", "Plan de días"),
            subtitle: pick(locale, `${countryName(trip.destination, "en")} · suggestions, check hours`, `${countryName(trip.destination, "es")} · sugerencias, revisa horarios`),
            rows: selected.map((d) => ({
              label: `${pick(locale, "Day", "Día")} ${d.day}${d.title ? ` · ${d.title}` : ""}`,
              value: slot(d) || pick(locale, "Free day", "Día libre"),
              status: "info" as const,
            })),
          },
          data: { days: selected, pace: profile.pace, interests: profile.interests, planned, stay },
          followUps: [pick(locale, "Anything else for this trip?", "¿Algo más para este viaje?")],
        });
        env.confidence = "low";
        return envelopeResult(env);
      }),
  );

  // 10. trip_brief (multi-session memory)
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
        const left = daysUntil(ctx.clock(), trip.startDate);
        const pending: string[] = [];
        for (const t of travelers) {
          const { best } = entryFor(ctx, t, trip.destination);
          if (best.entry.status !== "visa_free" && best.entry.status !== "same_country") {
            pending.push(pick(locale, `Check the entry requirement for ${t.displayName} (${STATUS_LABEL[best.entry.status].en})`, `Revisa el requisito de entrada de ${t.displayName} (${STATUS_LABEL[best.entry.status].es})`));
          }
        }
        const packCount = trip.packingDone.length;
        if (packCount === 0) pending.push(pick(locale, "Packing list not started", "Lista de equipaje sin empezar"));
        const expenseTotal = state.expenses.filter((e) => e.tripId === trip.tripId).reduce((s, e) => s + e.amount, 0);
        const env = baseEnvelope(ctx, trip.destination, locale, {
          voice: pick(
            locale,
            `${daysUntilTripSentence(left, countryName(trip.destination, "en"), "en")} ${pending.length ? `Still open: ${pending.map(lowerFirst).join("; ")}.` : "Nothing pending."}`,
            `${daysUntilTripSentence(left, countryName(trip.destination, "es"), "es")} ${pending.length ? `Pendiente: ${pending.map(lowerFirst).join("; ")}.` : "No hay pendientes."}`,
          ),
          card: {
            pattern: "list",
            title: pick(locale, "What's left", "Lo que falta"),
            subtitle: `${trip.startDate} → ${trip.endDate}`,
            rows: [
              { label: pick(locale, "Days left", "Días restantes"), value: String(left), status: "info" },
              ...pending.map((p) => ({ label: pick(locale, "Pending", "Pendiente"), value: p, status: "warn" as const })),
              { label: pick(locale, "Logged spending", "Gastos registrados"), value: `${expenseTotal.toFixed(2)} ${(state.expenses.find((e) => e.tripId === trip.tripId)?.currency) ?? ""}`.trim(), status: "info" },
            ],
          },
          data: { tripId: trip.tripId, daysUntil: left, pending, expenseTotal },
          followUps: [pick(locale, "Show the packing list?", "¿Muestro la lista de equipaje?")],
        });
        return envelopeResult(env);
      }),
  );

  // 11. log_expense
  server.registerTool(
    "log_expense",
    {
      title: "Log expense",
      description:
        "Use when the user says they spent money on the trip. Stores the expense and returns the trip total in the currency of the expense.",
      inputSchema: {
        amount: z.number().positive(),
        currency: z.string().length(3).optional(),
        category: z.string().min(2),
        note: z.string().optional(),
        tripId: z.string().optional(),
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
        const currency = (args.currency ?? profile?.homeCurrency ?? "USD").toUpperCase();
        const expense = {
          id: randomUUID(),
          tripId: trip?.tripId ?? null,
          amount: args.amount,
          currency,
          category: args.category,
          note: args.note,
          createdAt: ctx.clock().toISOString(),
        };
        state.expenses.push(expense);
        await save(state);
        const total = state.expenses.filter((e) => e.tripId === expense.tripId && e.currency === currency).reduce((s, e) => s + e.amount, 0);
        const env = baseEnvelope(ctx, trip?.destination ?? "", locale, {
          voice: pick(locale, `Logged ${args.amount} ${currency} for ${args.category}. Trip total in ${currency}: ${total.toFixed(2)}.`, `Registré ${args.amount} ${currency} en ${args.category}. Total del viaje en ${currency}: ${total.toFixed(2)}.`),
          card: {
            pattern: "card",
            title: pick(locale, "Expense logged", "Gasto registrado"),
            rows: [
              { label: args.category, value: `${args.amount} ${currency}`, status: "ok" },
              { label: pick(locale, "Trip total", "Total del viaje"), value: `${total.toFixed(2)} ${currency}`, status: "info" },
            ],
          },
          data: { expense, totalSameCurrency: total },
          followUps: [pick(locale, "How much is left in my budget?", "¿Cuánto me queda del presupuesto?")],
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
