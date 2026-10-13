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

export interface WorldRegistry {
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
    countries,
    cities,
    countryByIso: (iso) => byIso.get(iso),
    findCity: (name) => byName.get(fold(name)),
  };
}
