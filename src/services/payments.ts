// Payment methods a foreign visitor can use, per country (data/world/payments.json). Every fact has
// a source and the date it was retrieved. Two tiers: "oficial" entries cite an official publisher
// (government, central bank, national tourism board); "reportado" entries come from travel guides,
// card and exchange sites and traveler reports, and are never presented as official. A country
// without an entry says so: nothing is guessed.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface PaymentSource { title: string; url: string }
export interface PaymentEntry {
  tier: "oficial" | "reportado";
  name: string;
  retrieved: string;
  confidence: "alta" | "media" | "baja";
  cash?: string | null;
  cards?: string | null;
  qr?: string | null;
  atm?: string | null;
  contactless?: string | null;
  banknotes?: string | null;
  crypto?: string | null;
  notes?: string[];
  sources: PaymentSource[];
}
export interface PaymentsRegistry {
  get(iso: string): PaymentEntry | undefined;
  cryptoNote: { text: string; sources: PaymentSource[] };
  method: string;
  retrieved: string;
}

export function loadPayments(root: string): PaymentsRegistry {
  const file = JSON.parse(readFileSync(join(root, "data/world/payments.json"), "utf8")) as {
    source: { method: string; retrieved: string };
    crypto_note: { text: string; sources: PaymentSource[] };
    countries: Record<string, PaymentEntry>;
  };
  return {
    get: (iso) => file.countries[String(iso).toUpperCase()],
    cryptoNote: file.crypto_note,
    method: file.source.method,
    retrieved: file.source.retrieved,
  };
}
