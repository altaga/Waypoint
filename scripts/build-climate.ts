// Monthly climate normals for every capital, from NASA POWER (MERRA-2 reanalysis), for the
// climate card and the packing list. The data is vendored so a trip answer never waits on, or
// fails with, a weather service. Run: npx tsx scripts/build-climate.ts (writes data/world/climate.json).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Name = { en: string; es: string };
const root = join(import.meta.dirname, "..");
const countries = (JSON.parse(readFileSync(join(root, "data/world/countries.json"), "utf8")) as { countries: { iso: string; capital?: Name }[] }).countries;
const cities = (JSON.parse(readFileSync(join(root, "data/world/cities.json"), "utf8")) as { cities: { iso: string; name: Name; population?: number; lat: number; lon: number }[] }).cities;
// A capital missing from the city list (Wikidata Q36262).
const EXTRA: Record<string, { name: Name; lat: number; lon: number }> = {
  AG: { name: { en: "Saint John's", es: "Saint John's" }, lat: 17.1211, lon: -61.8447 },
};
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const URL = "https://power.larc.nasa.gov/api/temporal/climatology/point";

function capitalOf(iso: string, capital?: Name) {
  const inCountry = cities.filter((c) => c.iso === iso);
  const exact = capital && inCountry.find((c) => c.name.en.toLowerCase() === capital.en.toLowerCase());
  if (exact) return { name: exact.name, lat: exact.lat, lon: exact.lon };
  if (EXTRA[iso]) return EXTRA[iso];
  const largest = [...inCountry].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
  return largest ? { name: largest.name, lat: largest.lat, lon: largest.lon } : undefined;
}

let range = "";
async function climatology(lat: number, lon: number) {
  const url = `${URL}?parameters=T2M,T2M_RANGE,PRECTOTCORR&community=RE&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&format=JSON`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) {
      const body = (await res.json()) as { header?: { range?: string }; properties: { parameter: Record<string, Record<string, number>> } };
      range ||= body.header?.range ?? "";
      return body.properties.parameter;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`NASA POWER failed for ${lat},${lon}`);
}

const round = (n: number) => Math.round(n * 10) / 10;
const climate: Record<string, unknown> = {};
const queue = countries.map((c) => ({ c, cap: capitalOf(c.iso, c.capital) })).filter((x) => x.cap);
let done = 0;
async function worker() {
  for (let next = queue.shift(); next; next = queue.shift()) {
    const { c, cap } = next;
    const p = await climatology(cap!.lat, cap!.lon);
    climate[c.iso] = {
      city: cap!.name,
      lat: round(cap!.lat),
      lon: round(cap!.lon),
      // Average daily high and low (mean plus or minus half the daily range), in °C; rain in mm per day.
      months: MONTHS.map((m) => ({ hi: round(p.T2M[m] + p.T2M_RANGE[m] / 2), lo: round(p.T2M[m] - p.T2M_RANGE[m] / 2), rain: round(p.PRECTOTCORR[m]) })),
    };
    if (++done % 20 === 0) console.log(`${done} capitals`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

const sorted = Object.fromEntries(Object.entries(climate).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(
  join(root, "data/world/climate.json"),
  JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    source: {
      id: "nasa-power",
      title: "NASA POWER climatology (MERRA-2), capital city",
      url: "https://power.larc.nasa.gov/",
      license: "Public domain (NASA data)",
      retrieved: new Date().toISOString().slice(0, 10),
      range,
    },
    climate: sorted,
  }) + "\n",
);
console.log(`wrote ${Object.keys(sorted).length} capitals; ${range}`);
