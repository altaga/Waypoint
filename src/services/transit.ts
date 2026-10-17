// How a visitor pays for city transit (data/world/transit.json). For each system: whether a contactless bank card
// (or phone) works at the gates directly, and the physical card locals use. The operator's own page is "oficial";
// press, guides and forums are "reportado". Countries with no city system use a country-level entry
// (data/world/transit-countries.json): one status for the whole country, from reports, not checked city by city.
// A country with neither has no verified transit data.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type BankCard = "yes" | "partial" | "no" | "unverified";
export type TransitTier = "oficial" | "reportado";
export interface Bilingual { en: string; es: string }
export interface TransitSource { title: string; url: string }

export interface TransitSystem {
  id: string;
  country: string;
  city: Bilingual;
  system: Bilingual;
  physicalCard: Bilingual;
  bankCard: BankCard;
  bankCardNote: Bilingual;
  note: Bilingual;
  tier: TransitTier;
  source: TransitSource;
  retrieved: string;
}

// One status for a whole country, used only when the country has no city system in transit.json.
export interface TransitCountry {
  iso: string;
  bankCard: BankCard;
  tier: TransitTier;
  bankCardNote: Bilingual;
  source: TransitSource;
  retrieved: string;
}

export interface TransitRegistry {
  forCountry(iso: string): TransitSystem[];
  countryEntry(iso: string): TransitCountry | undefined;
  method: string;
  retrieved: string;
}

export function loadTransit(root: string): TransitRegistry {
  const file = JSON.parse(readFileSync(join(root, "data/world/transit.json"), "utf8")) as {
    source: { retrieved: string; method: string };
    systems: Record<string, Omit<TransitSystem, "id" | "retrieved">>;
  };
  const systems = Object.entries(file.systems).map(([id, s]) => ({ ...s, id, retrieved: file.source.retrieved }));
  const countryFile = JSON.parse(readFileSync(join(root, "data/world/transit-countries.json"), "utf8")) as {
    source: { retrieved: string };
    countries: Record<string, Omit<TransitCountry, "iso" | "retrieved">>;
  };
  const countries = Object.entries(countryFile.countries).map(([iso, c]) => ({ ...c, iso, retrieved: countryFile.source.retrieved }));
  return {
    forCountry(iso) {
      const code = String(iso).toUpperCase();
      return systems.filter((s) => s.country === code);
    },
    countryEntry(iso) {
      const code = String(iso).toUpperCase();
      return countries.find((c) => c.iso === code);
    },
    method: file.source.method,
    retrieved: file.source.retrieved,
  };
}
