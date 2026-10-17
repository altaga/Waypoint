// Which international ride, delivery and marketplace apps a visitor can expect in a country (data/world/apps.json).
// A company's own list is "oficial"; press coverage and travel guides are "reportado" and never presented as
// confirmed. A country missing from a complete list is "not_listed"; from an incomplete list it is "unverified".
// Availability is by market, not by city.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface AppSource { title: string; url: string }
export type AppCategory = "mobility" | "delivery" | "marketplace";
export type AppTier = "oficial" | "reportado";
export type AppStatus = "listed" | "not_listed" | "unverified";

export interface AppAvailability {
  id: string;
  name: string;
  category: AppCategory;
  tier: AppTier;
  status: AppStatus;
  note: { en: string; es: string } | null;
  source: AppSource;
  retrieved: string;
}

export interface AppsRegistry {
  forCountry(iso: string): AppAvailability[];
  method: string;
  retrieved: string;
}

export function loadApps(root: string): AppsRegistry {
  const file = JSON.parse(readFileSync(join(root, "data/world/apps.json"), "utf8")) as {
    source: { retrieved: string; method: string };
    apps: Record<string, { name: string; category: AppCategory; tier: AppTier; complete: boolean; source: AppSource; retrieved: string }>;
    listings: Record<string, string[]>;
    notes: Record<string, Record<string, { en: string; es: string }>>;
  };
  return {
    forCountry(iso) {
      const code = String(iso).toUpperCase();
      return Object.entries(file.apps).map(([id, app]) => {
        const listed = file.listings[id]?.includes(code) ?? false;
        const status: AppStatus = listed ? "listed" : app.complete ? "not_listed" : "unverified";
        return {
          id,
          name: app.name,
          category: app.category,
          tier: app.tier,
          status,
          note: file.notes[id]?.[code] ?? null,
          source: app.source,
          retrieved: app.retrieved,
        };
      });
    },
    method: file.source.method,
    retrieved: file.source.retrieved,
  };
}
