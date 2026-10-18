// Types for the browser module (web/brands.js), used by the tests.
export interface Brand { name: string; kind: "ride" | "delivery" | "shop" | "card" | "wallet" | "transit"; icon: string | null }
export function brandsIn(text: string): Brand[];
export function brandChip(b: Brand): string;
export function brandStrip(text: string, max?: number): string;
export function appUrl(name: string): string;
