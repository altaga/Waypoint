// Public holidays of a country (data/world/holidays.json from Nager.Date, built by scripts/build-holidays.mjs).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Holiday { date: string; name: string; localName: string; global: boolean; regions?: string[] }
export interface HolidayRegistry {
  /** Holidays of the country from startDate to endDate (inclusive), or null when the dataset does not cover the country or the year. */
  between(iso: string, startDate: string, endDate: string): Holiday[] | null;
  retrieved: string;
}

export function loadHolidays(root: string): HolidayRegistry {
  const file = join(root, "data/world/holidays.json");
  const data = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { source: { retrieved: string }; countries: Record<string, Record<string, Holiday[]>> }) : { source: { retrieved: "" }, countries: {} };
  return {
    retrieved: data.source.retrieved,
    between(iso, startDate, endDate) {
      const c = data.countries[String(iso).toUpperCase()];
      if (!c) return null;
      const years = new Set([startDate.slice(0, 4), endDate.slice(0, 4)]);
      if ([...years].some((y) => !c[y])) return null;
      return [...years].flatMap((y) => c[y]).filter((h) => h.date >= startDate && h.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}
