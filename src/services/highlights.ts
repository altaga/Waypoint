import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// Destination highlights: a deterministic catalog of real places per country, with a
// stable id. The itinerary may only name places from this catalog, so a plan can be
// checked and never invents a sight (the concierge's own knowledge is not a source).

export const INTERESTS = [
  "food", "museums", "nature", "temples", "history", "shopping", "nightlife", "beaches",
  "family", "architecture", "markets", "art", "sights",
] as const;
export type Interest = (typeof INTERESTS)[number];

export const CATEGORIES = ["sight", "food", "nature", "museum", "shopping", "experience", "neighborhood", "beach"] as const;

export const Place = z.object({
  id: z.string().regex(/^[a-z]{2}-[a-z0-9-]+$/),
  name: z.string(),
  area: z.string(),
  city: z.string(),
  // A part of a big city (east, center, west), so a day can stay in one part. Optional: only where it is curated.
  zone: z.string().optional(),
  category: z.enum(CATEGORIES),
  interests: z.array(z.enum(INTERESTS)).min(1),
  durationMinutes: z.number().int().positive(),
  desc: z.object({ en: z.string(), es: z.string() }),
  sourceId: z.string(),
  admission: z.string().optional(),
  // Where each description came from: a Wikipedia article's first sentence, or Waypoint's own text.
  descBy: z.object({ en: z.enum(["wikipedia", "curated"]), es: z.enum(["wikipedia", "curated"]) }).optional(),
  // The article behind a Wikipedia description (CC BY-SA 4.0): keep the link wherever it is shown.
  ground: z
    .object({
      retrieved: z.string(),
      en: z.object({ title: z.string(), url: z.url() }).optional(),
      es: z.object({ title: z.string(), url: z.url() }).optional(),
    })
    .optional(),
});

export const HighlightPack = z.object({
  schemaVersion: z.literal("1.0.0"),
  country: z.string().length(2),
  names: z.object({ en: z.string(), es: z.string() }),
  review: z.object({
    // curated_unverified: picked by Waypoint, not yet checked by a person.
    // wikidata_ranked: worldwide, ordered by Wikipedia popularity, not curated at all.
    status: z.enum(["curated_unverified", "human_reviewed", "wikidata_ranked"]),
    reviewedBy: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    note: z.string(),
  }),
  sources: z.record(z.string(), z.object({ title: z.string(), url: z.url(), license: z.string(), retrieved: z.string() })),
  places: z.array(Place).min(1),
});

export type Place = z.infer<typeof Place>;
export type HighlightPack = z.infer<typeof HighlightPack>;

export interface HighlightRegistry {
  forCountry(iso: string): HighlightPack | undefined;
  place(id: string): { place: Place; country: string } | undefined;
  countries(): string[];
}

/**
 * Loads highlights at startup: curated packs in highlights/ first, then the worldwide
 * Wikidata catalog in data/world/highlights/ for countries that have no curated pack.
 * A file that fails validation is skipped and logged.
 */
export function loadHighlights(root: string): HighlightRegistry {
  const byCountry = new Map<string, HighlightPack>();
  const byId = new Map<string, { place: Place; country: string }>();
  loadDir(join(root, "highlights"), byCountry, byId, true);
  loadDir(join(root, "data/world/highlights"), byCountry, byId, false);
  return {
    forCountry: (iso) => byCountry.get(iso),
    place: (id) => byId.get(id),
    countries: () => [...byCountry.keys()],
  };
}

function loadDir(dir: string, byCountry: Map<string, HighlightPack>, byId: Map<string, { place: Place; country: string }>, curated: boolean) {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return; // a missing folder means no catalog, not a crash
  }
  for (const file of files) {
    if (!/^[A-Z]{2}\.json$/.test(file)) continue;
    const iso = file.slice(0, 2);
    if (!curated && byCountry.has(iso)) continue; // curated wins
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      console.warn(`skipping highlights ${file}: not valid JSON`);
      continue;
    }
    const result = HighlightPack.safeParse(raw);
    if (!result.success) {
      console.warn(`skipping highlights ${file}: ${result.error.issues.map((i) => i.message).join("; ")}`);
      continue;
    }
    const pack = result.data;
    if (!pack.places.every((p) => pack.sources[p.sourceId])) {
      console.warn(`skipping highlights ${file}: a place cites an unknown source`);
      continue;
    }
    byCountry.set(pack.country, pack);
    for (const p of pack.places) byId.set(p.id, { place: p, country: pack.country });
  }
}
