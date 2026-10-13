import { z } from "zod";

// Traveler profile model (context doc §4.4). Passport numbers are never stored,
// only the ISO 3166-1 alpha-2 country and an optional expiry date.

export const Traveler = z.object({
  travelerId: z.string(),
  displayName: z.string(),
  role: z.enum(["self", "partner", "child", "parent", "friend"]).default("self"),
  passports: z
    // May be empty: a traveler can be saved before the passport is known. Trip planning
    // asks for the missing passports (missingFields), so no trip is built without one.
    .array(
      z.object({
        country: z.string().length(2), // ISO 3166-1 alpha-2, uppercase
        expires: z.iso.date().optional(), // for the 6-month validity check
      }),
    ),
  residenceCountry: z.string().length(2).optional(),
  // Preferences of this traveler, used to score how fair a plan is to each person.
  likes: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  validVisas: z
    .array(
      z.object({
        country: z.string().length(2),
        type: z.string(),
        expires: z.iso.date().optional(),
      }),
    )
    .default([]),
  ageBand: z.enum(["infant", "child", "teen", "adult", "senior"]).optional(),
  // Sensitive, opt-in, never sent to third-party APIs:
  medications: z.array(z.string()).optional(),
  dietary: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
});

export const TravelerProfile = z.object({
  profileId: z.string(),
  ownerUserId: z.string(),
  locale: z.enum(["es-MX", "es-ES", "en-US"]).default("en-US"),
  homeCurrency: z.string().length(3),
  homeTimezone: z.string(),
  homeCity: z.string().optional(),
  travelers: z.array(Traveler).min(1), // the group
  interests: z.array(z.string()).default([]),
  pace: z.enum(["relaxed", "balanced", "packed"]).default("balanced"),
  budgetPerDay: z
    .object({ amount: z.number(), currency: z.string().length(3) })
    .optional(),
  consent: z.object({
    sensitiveData: z.boolean().default(false),
    updatedAt: z.string(),
  }),
  updatedAt: z.string(),
});

export type Traveler = z.infer<typeof Traveler>;
export type TravelerProfile = z.infer<typeof TravelerProfile>;

/**
 * Returns the profile with sensitive fields (medications) removed unless the
 * owner has opted in. Used before any data leaves the local store.
 */
export function redactSensitive(profile: TravelerProfile): TravelerProfile {
  if (profile.consent.sensitiveData) return profile;
  return {
    ...profile,
    travelers: profile.travelers.map(({ medications: _omit, ...rest }) => rest),
  };
}
