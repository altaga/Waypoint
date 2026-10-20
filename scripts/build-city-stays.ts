// Writes data/world/city-stays.json: for every city of the world list, the minutes of sights a visit holds and the
// least days it needs at each pace. Waypoint's estimate, from two raw inputs, never an official figure:
//   places     the minutes of the list's places nearest to the city (within 50 km), when the list has any there
//   population  a floor by city size, because a list of at most 30 places per country cannot hold a big city
// The larger of the two is used, but never more than half again the size floor; `basis` says which one that was.
//   npm run build-city-stays
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PACES, STYLES, distanceKm, minDays } from "../src/pace.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const world = JSON.parse(readFileSync(join(ROOT, "data/world/cities.json"), "utf8"));
const cities: { id: string; iso: string; name: { en: string }; population: number; lat: number; lon: number }[] = world.cities;

/** Minutes of sights by city size: the most a visit of that city can fill, before the pace picks its share. */
export const SIZE_MINUTES: { from: number; minutes: number }[] = [
  { from: 10_000_000, minutes: 2400 },
  { from: 5_000_000, minutes: 1800 },
  { from: 2_000_000, minutes: 1200 },
  { from: 1_000_000, minutes: 900 },
  { from: 300_000, minutes: 600 },
  { from: 0, minutes: 360 },
];
const sizeMinutes = (pop: number) => SIZE_MINUTES.find((t) => pop >= t.from)!.minutes;

const placesBy = new Map<string, { lat: number; lon: number; durationMinutes: number }[]>();
for (const f of readdirSync(join(ROOT, "data/highlights")).filter((x) => x.endsWith(".json"))) {
  const pack = JSON.parse(readFileSync(join(ROOT, "data/highlights", f), "utf8"));
  placesBy.set(f.replace(".json", ""), (pack.places ?? []).filter((p: any) => p.lat != null && p.lon != null));
}

const out: Record<string, { name: string; iso: string; places: number; minutes: number; basis: "places" | "population"; minDays: Record<string, number> }> = {};
for (const c of cities) {
  const mine = (placesBy.get(c.iso) ?? []).filter((p) => {
    const km = distanceKm(p.lat, p.lon, c.lat, c.lon);
    if (km >= 50) return false;
    // A place belongs to the nearest city of the country, as the planner assigns it.
    return !cities.some((o) => o.iso === c.iso && o.id !== c.id && distanceKm(p.lat, p.lon, o.lat, o.lon) < km);
  });
  const fromPlaces = mine.reduce((m, p) => m + p.durationMinutes, 0);
  const fromSize = sizeMinutes(c.population);
  const minutes = Math.min(Math.max(fromPlaces, fromSize), fromSize * 1.5);
  out[c.id] = {
    name: c.name.en,
    iso: c.iso,
    places: mine.length,
    minutes,
    basis: fromPlaces >= fromSize ? "places" : "population",
    minDays: Object.fromEntries(PACES.map((p) => [STYLES[p].key, minDays(minutes, p)])),
  };
}
writeFileSync(
  join(ROOT, "data/world/city-stays.json"),
  JSON.stringify({ generatedBy: "scripts/build-city-stays.ts", note: "Waypoint's estimate, not an official figure. minutes = max(minutes of the list's places within 50 km, floor by city size).", sizeMinutes: SIZE_MINUTES, cities: out }, null, 1) + "\n",
);
const rows = Object.values(out);
console.log(`${rows.length} cities | basis places ${rows.filter((r) => r.basis === "places").length}, population ${rows.filter((r) => r.basis === "population").length}`);
