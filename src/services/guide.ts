// The country guide (data/guide/<ISO>.json, built by scripts/build-guide.mjs): facts a traveler needs beyond entry rules,
// each with the quote it comes from and its source (UK Government travel advice, OGL v3.0; Wikivoyage, CC BY-SA 4.0).
// A fact is only here if its quote was found in the downloaded source text; nothing is written from general knowledge.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const GUIDE_TOPICS = ["entry", "safety", "health", "help", "getting_in", "getting_around", "money", "etiquette", "connectivity", "phrases"] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];

const Fact = z.object({
  en: z.string(),
  es: z.string(),
  quote: z.string(),
  source: z.enum(["fcdo", "wikivoyage", "phrasebook"]),
  local: z.string().optional(),
  say: z.string().optional(),
});
const Source = z.object({ title: z.string(), url: z.string(), license: z.string(), updated: z.string().optional(), revision: z.string().optional() });
export const Guide = z.object({
  country: z.string().length(2),
  retrieved: z.string(),
  alert: z.array(z.string()),
  sources: z.record(z.string(), Source),
  topics: z.record(z.string(), z.array(Fact)),
});
export type GuideFact = z.infer<typeof Fact>;
export type CountryGuide = z.infer<typeof Guide>;

export interface GuideRegistry {
  forCountry(iso: string): CountryGuide | undefined;
  countries(): string[];
}

export function loadGuide(root: string): GuideRegistry {
  const dir = join(root, "data/guide");
  const cache = new Map<string, CountryGuide | undefined>();
  return {
    forCountry(iso) {
      if (cache.has(iso)) return cache.get(iso);
      const file = join(dir, `${iso}.json`);
      const g = existsSync(file) ? Guide.parse(JSON.parse(readFileSync(file, "utf8"))) : undefined;
      cache.set(iso, g);
      return g;
    },
    countries: () => (existsSync(dir) ? readdirSync(dir).filter((f) => /^[A-Z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2)) : []),
  };
}
