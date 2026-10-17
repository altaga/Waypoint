// How a visitor pays for city transit (data/world/transit.json). For each system: whether a contactless bank card
// (or phone) works at the gates directly, and the physical card locals use. The operator's own page is "oficial";
// press, guides and forums are "reportado". A country without an entry has no verified transit data.
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

export interface TransitRegistry {
  forCountry(iso: string): TransitSystem[];
  method: string;
  retrieved: string;
}

export function loadTransit(root: string): TransitRegistry {
  const file = JSON.parse(readFileSync(join(root, "data/world/transit.json"), "utf8")) as {
    source: { retrieved: string; method: string };
    systems: Record<string, Omit<TransitSystem, "id" | "retrieved">>;
  };
  const systems = Object.entries(file.systems).map(([id, s]) => ({ ...s, id, retrieved: file.source.retrieved }));
  return {
    forCountry(iso) {
      const code = String(iso).toUpperCase();
      return systems.filter((s) => s.country === code);
    },
    method: file.source.method,
    retrieved: file.source.retrieved,
  };
}
