import { z } from "zod";

// Country pack schema (context doc §4.5). Packs are built offline from official
// sources and validated before they are loaded by the server.

export const RuleCategory = z.enum([
  "prohibited_items",
  "medications",
  "conduct",
  "dress",
  "photography",
  "drugs",
  "alcohol",
  "lgbtq",
  "driving",
]);

export const Rule = z.object({
  id: z.string(),
  category: RuleCategory,
  severity: z.enum(["info", "fine", "arrest", "severe"]),
  summary: z.object({ en: z.string(), es: z.string().optional() }),
  quote: z.string().min(10), // verbatim text from the source, checked by the validator
  sources: z.array(z.string()).min(1),
  lastVerified: z.iso.date(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const Source = z.object({
  title: z.string(),
  url: z.url(),
  license: z.string(),
  retrieved: z.iso.date(),
});

export const Pack = z.object({
  schemaVersion: z.literal("1.0.0"),
  country: z.string().length(2),
  names: z.object({ en: z.string(), es: z.string().optional() }),
  generatedAt: z.iso.date(),
  // A = human reviewed (reviewedBy required), B = auto-extracted, C = live fallback
  tier: z.enum(["A", "B", "C"]),
  review: z.object({
    status: z.enum(["machine_extracted", "human_reviewed"]),
    reviewedBy: z.string().nullable(),
    reviewedAt: z.iso.date().nullable(),
  }),
  localRules: z.array(Rule),
  essentials: z.object({
    currency: z.string().length(3).nullable(),
    plugTypes: z.array(z.string()),
    emergency: z.record(z.string(), z.string()),
    languages: z.array(z.string()),
  }),
  advisory: z
    .object({
      us: z.object({ level: z.number().int().min(1).max(4), title: z.string(), date: z.string() }).optional(),
    })
    .default({}),
  sources: z.record(z.string(), Source),
  disclaimer: z.object({ en: z.string(), es: z.string() }),
});

export type Rule = z.infer<typeof Rule>;
export type Pack = z.infer<typeof Pack>;
export type RuleCategory = z.infer<typeof RuleCategory>;

export const DISCLAIMER = {
  en: "Rules change; verify with the official source before you travel.",
  es: "Las reglas cambian; verifica con la fuente oficial antes de viajar.",
};
