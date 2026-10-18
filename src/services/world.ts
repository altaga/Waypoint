import { readFileSync } from "node:fs";
import { join } from "node:path";

// Worldwide reference data built by scripts/build-world.ts from Wikidata (CC0):
// every sovereign country with its ISO code and capital, and every city with a population
// of 300,000 or more or that is a capital. Used to resolve destinations and to name places.

export interface WorldCountry {
  iso: string;
  name: { en: string; es: string };
  capital: { en: string; es: string } | null;
  wikidata: string;
}

export interface WorldCity {
  id: string;
  iso: string;
  name: { en: string; es: string };
  population: number;
  lat: number;
  lon: number;
}

export interface CityStayRow {
  name: string;
  iso: string;
  places: number;
  minutes: number;
  basis: "places" | "population";
  minDays: { express: number; classic: number; slow: number };
}

export interface WorldRegistry {
  /** Minutes of sights and the least days each city needs at each pace (data/world/city-stays.json), by city id. */
  stays: Map<string, CityStayRow>;
  countries: WorldCountry[];
  cities: WorldCity[];
  countryByIso(iso: string): WorldCountry | undefined;
  /** Finds a city by name (case and accent insensitive), in English or Spanish. */
  findCity(name: string): WorldCity | undefined;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function loadWorld(root: string): WorldRegistry {
  let countries: WorldCountry[] = [];
  let cities: WorldCity[] = [];
  const stays = new Map<string, CityStayRow>();
  try {
    const raw = JSON.parse(readFileSync(join(root, "data/world/city-stays.json"), "utf8")).cities as Record<string, CityStayRow>;
    for (const [id, row] of Object.entries(raw)) stays.set(id, row);
  } catch {
    // Without the table the minimums come from the places alone.
  }
  try {
    countries = JSON.parse(readFileSync(join(root, "data/world/countries.json"), "utf8")).countries;
    cities = JSON.parse(readFileSync(join(root, "data/world/cities.json"), "utf8")).cities;
  } catch {
    // Without the build output the server still works with its curated data.
  }
  const byIso = new Map(countries.map((c) => [c.iso, c]));
  const byName = new Map<string, WorldCity>();
  // Bigger cities win a name clash (e.g. two places called Santiago).
  for (const c of [...cities].sort((a, b) => a.population - b.population)) {
    byName.set(fold(c.name.en), c);
    byName.set(fold(c.name.es), c);
  }
  return {
    stays,
    countries,
    cities,
    countryByIso: (iso) => byIso.get(iso),
    findCity: (name) => byName.get(fold(name)),
  };
}
