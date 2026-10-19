// Public holidays per country for the next two years, from Nager.Date (https://date.nager.at, free, no key).
// Covers the countries Nager has; for the others the answer says there is no verified data. Writes data/world/holidays.json.
//   node scripts/build-holidays.mjs
import { writeFileSync } from "node:fs";
const ROOT = new URL("..", import.meta.url).pathname;
const UA = "Waypoint-hackathon/1.0 (https://github.com/altaga/waypoint)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
      if (r.status === 404 || r.status === 204) return null;
    } catch {}
    await sleep(1500 * (i + 1));
  }
  return null;
}
const available = (await get("https://date.nager.at/api/v3/AvailableCountries")) ?? [];
const years = [2026, 2027];
const out = {};
for (const c of available) {
  out[c.countryCode] = {};
  for (const y of years) {
    const rows = await get(`https://date.nager.at/api/v3/PublicHolidays/${y}/${c.countryCode}`);
    out[c.countryCode][y] = (rows ?? []).map((h) => ({ date: h.date, name: h.name, localName: h.localName, global: h.global, ...(h.counties ? { regions: h.counties } : {}) }));
    await sleep(150);
  }
}
writeFileSync(ROOT + "data/world/holidays.json", JSON.stringify({ source: { title: "Nager.Date public holidays", url: "https://date.nager.at", retrieved: new Date().toISOString().slice(0, 10), note: "Dates for countries Nager.Date covers; regional holidays carry their regions. Check locally: some holidays move." }, countries: out }) + "\n");
console.log(Object.keys(out).length, "countries");
