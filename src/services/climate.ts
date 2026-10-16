// Climate normals for a destination's capital (NASA POWER, vendored in data/world/climate.json):
// what a traveler should expect on their dates, and what that means for the bag. Normals, not a
// forecast: a forecast does not reach weeks ahead, and the vendored data never fails at runtime.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface MonthNormal { hi: number; lo: number; rain: number }
export interface ClimateEntry { city: { en: string; es: string }; lat: number; lon: number; months: MonthNormal[] }
export interface ClimateSource { id: string; title: string; url: string; license: string; retrieved: string; range?: string }
export interface ClimateRegistry { get(iso: string): ClimateEntry | undefined; source: ClimateSource }

export function loadClimate(root: string): ClimateRegistry {
  const file = JSON.parse(readFileSync(join(root, "data/world/climate.json"), "utf8")) as { source: ClimateSource; climate: Record<string, ClimateEntry> };
  return { get: (iso) => file.climate[String(iso).toUpperCase()], source: file.source };
}

export interface TripClimate {
  /** Average daily high and low over the trip, °C (whole degrees, as said aloud). */
  hi: number;
  lo: number;
  /** Average rain, mm per day. */
  rain: number;
  /** The months the trip touches, 1 to 12. */
  months: number[];
  cold: boolean;
  cool: boolean;
  hot: boolean;
  wet: boolean;
}

const DAY = 86_400_000;

/** The normals over the trip's days, weighted by how many of them fall in each month. */
export function tripClimate(entry: ClimateEntry, startDate: string, endDate: string): TripClimate {
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const end = Math.max(start, Date.parse(`${endDate}T12:00:00Z`));
  const counts = new Map<number, number>();
  for (let t = start, i = 0; t <= end && i < 366; t += DAY, i++) {
    const m = new Date(t).getUTCMonth();
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  let days = 0, hi = 0, lo = 0, rain = 0;
  for (const [m, n] of counts) {
    hi += entry.months[m].hi * n;
    lo += entry.months[m].lo * n;
    rain += entry.months[m].rain * n;
    days += n;
  }
  const H = Math.round(hi / days), L = Math.round(lo / days), R = Math.round((rain / days) * 10) / 10;
  return {
    hi: H, lo: L, rain: R,
    months: [...counts.keys()].map((m) => m + 1),
    cold: L <= 5,
    cool: L > 5 && L <= 12,
    hot: H >= 30,
    wet: R >= 4,
  };
}
