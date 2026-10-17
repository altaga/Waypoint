// What a visitor can pay with when a foreign card does not work at the destination (data/world/what-works.json).
// Options are already-cited facts: domestic card networks, local apps, merchant QR codes, local schemes,
// global wallets and cash. Each says whether a visitor can use it. Crypto is never listed as accepted, and a
// country with no usable option says so.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface WhatWorksSource { title: string; url: string; type: string }
export type WhatWorksKind = "domestic_network" | "local_app" | "merchant_qr" | "in_app_qr" | "local_scheme" | "global_wallet" | "cash";
export interface WhatWorksOption {
  kind: WhatWorksKind;
  name: string;
  operator: string | null;
  usable_by_tourist: boolean;
  detail: string;
  veracity: number;
  sources: WhatWorksSource[];
}
export interface WhatWorks {
  iso: string;
  viable_count: number;
  options: WhatWorksOption[];
  sources: WhatWorksSource[];
  retrieved: string;
}

export interface WhatWorksRegistry {
  forCountry(iso: string): WhatWorks | undefined;
  method: string;
  retrieved: string;
}

export function loadWhatWorks(root: string): WhatWorksRegistry {
  const file = JSON.parse(readFileSync(join(root, "data/world/what-works.json"), "utf8")) as {
    source: { retrieved: string; method: string };
    countries: Record<string, Omit<WhatWorks, "iso" | "retrieved">>;
  };
  const countries = Object.entries(file.countries).map(([iso, c]) => ({ ...c, iso, retrieved: file.source.retrieved }));
  return {
    forCountry(iso) {
      const code = String(iso).toUpperCase();
      return countries.find((c) => c.iso === code);
    },
    method: file.source.method,
    retrieved: file.source.retrieved,
  };
}
