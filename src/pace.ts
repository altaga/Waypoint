// How rushed a trip is, and the least time a city needs at that pace. The three paces are the traveler's "pace"
// setting (relaxed, balanced, packed) under names people choose from: Slow, Classic, Express.
//
// The minimum days of a city come from the places the list has there, not from an official figure: the minutes of
// all its places, times the share of them the pace aims to see, over the minutes of sights a day holds at that pace,
// and never fewer days than the pace's floor. It is Waypoint's estimate and is shown as such.
import type { Place } from "./services/highlights.ts";
import type { CityStayRow, WorldCity } from "./services/world.ts";

export type Pace = "relaxed" | "balanced" | "packed";
export type StyleKey = "express" | "classic" | "slow";

export const STYLES: Record<Pace, { key: StyleKey; en: string; es: string; perDay: number; dayMinutes: number; coverage: number; floor: number }> = {
  packed: { key: "express", en: "Express", es: "Exprés", perDay: 4, dayMinutes: 480, coverage: 0.5, floor: 2 },
  balanced: { key: "classic", en: "Classic", es: "Clásico", perDay: 3, dayMinutes: 360, coverage: 0.9, floor: 3 },
  relaxed: { key: "slow", en: "Slow", es: "Pausado", perDay: 2, dayMinutes: 240, coverage: 0.8, floor: 4 },
};
export const PACES = Object.keys(STYLES) as Pace[];

/** The least days a city needs at a pace, from the minutes of the places it has. */
export function minDays(minutes: number, pace: Pace): number {
  const s = STYLES[pace];
  return Math.max(s.floor, Math.ceil((s.coverage * minutes) / s.dayMinutes));
}

const rad = Math.PI / 180;
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const x = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLon - aLon) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

/** The city a place belongs to for planning: the nearest city of the country within 50 km, else the place's own city. */
export function stayCity(place: Place, cities: WorldCity[], iso: string): string {
  if (place.lat == null || place.lon == null) return place.city;
  let best: WorldCity | null = null;
  let bestKm = 50;
  for (const c of cities) {
    if (c.iso !== iso) continue;
    const km = distanceKm(place.lat, place.lon, c.lat, c.lon);
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return best ? best.name.en : place.city;
}

export interface CityStay {
  city: string;
  /** Where the minutes come from: the list's places, or the size of the city (see scripts/build-city-stays.ts). */
  basis?: "places" | "population";
  places: number;
  minutes: number;
  minDays: Record<StyleKey, number>;
}

/** The cities of a country's list, biggest first, with the least days each needs at each pace. */
export function cityStays(places: Place[], cities: WorldCity[], iso: string, table?: Map<string, CityStayRow>): CityStay[] {
  const by = new Map<string, Place[]>();
  for (const p of places) {
    const c = stayCity(p, cities, iso);
    if (!by.has(c)) by.set(c, []);
    by.get(c)!.push(p);
  }
  const fromTable = (city: string) => {
    const c = cities.find((x) => x.iso === iso && x.name.en === city);
    return c ? table?.get(c.id) : undefined;
  };
  const rows: CityStay[] = [...by.entries()].map(([city, ps]) => {
    // The list holds few places per country, so a big city never gets fewer minutes than its size gives.
    const listed = ps.reduce((m, p) => m + p.durationMinutes, 0);
    const size = fromTable(city)?.minutes ?? 0;
    const minutes = Math.max(listed, size);
    return { city, basis: listed >= size ? "places" : "population", places: ps.length, minutes, minDays: { express: minDays(minutes, "packed"), classic: minDays(minutes, "balanced"), slow: minDays(minutes, "relaxed") } };
  });
  // Every other city of the country, from the worldwide table, so each city has a minimum even where the list has no place.
  const seen = new Set(rows.map((r) => r.city));
  const rest = cities
    .filter((c) => c.iso === iso && !seen.has(c.name.en) && table?.has(c.id))
    .sort((a, b) => b.population - a.population)
    .map((c): CityStay => {
      const t = table!.get(c.id)!;
      return { city: c.name.en, basis: t.basis, places: 0, minutes: t.minutes, minDays: t.minDays };
    });
  return [...rows.sort((a, b) => b.places - a.places || b.minutes - a.minutes), ...rest];
}
