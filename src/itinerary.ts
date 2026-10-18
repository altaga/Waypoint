import type { HighlightRegistry, Interest, Place } from "./services/highlights.ts";
import { openWindows } from "./hours.ts";
import { STYLES, minDays } from "./pace.ts";
type Pace = "relaxed" | "balanced" | "packed";

// Itinerary verifier. A plan is a list of days, each with place ids from the catalog.
// Every rule here is deterministic: the concierge's words are never trusted, only ids.
// A plan with errors is not saved; the reply lists the problems so the plan can be fixed.
// A day is in one city: Kyoto and Osaka in the same day is two days of travel, not one plan.
// Moving between cities costs most of a day, so a plan that moves needs the city's minimum days at the traveler's pace
// (see pace.ts) in each city, and the first day in a new city has at most two stops. With fewer days or places, the
// plan stays in one city.
export const MAX_ARRIVAL_STOPS = 2;

export const MAX_STOPS: Record<Pace, number> = { relaxed: 2, balanced: 3, packed: 4 };
export const MAX_MINUTES_PER_DAY = 600;

export interface PlanDay {
  day: number;
  title?: string;
  stops: string[];
}

export interface Violation {
  day: number | null;
  code: "day_out_of_range" | "duplicate_day" | "unknown_place" | "wrong_country" | "repeated_place" | "too_many_stops" | "avoided_interest" | "too_long" | "mixed_cities" | "short_stay" | "arrival_day_busy";
  message: string;
  placeId?: string;
}

export interface VerifyResult {
  ok: boolean;
  violations: Violation[];
  warnings: string[];
  resolved: { day: number; title?: string; places: Place[] }[];
}

export function verifyPlan(input: {
  plan: PlanDay[];
  stayDays: number;
  destinationIso: string;
  pace: Pace;
  avoid: Interest[];
  highlights: HighlightRegistry;
  /** Place ids already planned on days this plan does not replace: they may not appear again. */
  takenPlaces?: string[];
  /** The city a place belongs to for planning (the nearest city of the country); the place's own city when absent. */
  cityOf?: (p: Place) => string;
  /** Minutes of sights a city holds by its size, a floor under the minutes of the list's places (data/world/city-stays.json). */
  cityMinutes?: (city: string) => number;
}): VerifyResult {
  const { plan, stayDays, destinationIso, pace, avoid, highlights, takenPlaces = [] } = input;
  const cityOf = input.cityOf ?? ((p: Place) => p.city);
  const violations: Violation[] = [];
  const warnings: string[] = [];
  const seenDays = new Set<number>();
  const seenPlaces = new Set<string>(takenPlaces);
  const resolved: VerifyResult["resolved"] = [];

  for (const d of plan) {
    if (seenDays.has(d.day)) {
      violations.push({ day: d.day, code: "duplicate_day", message: `day ${d.day} appears twice` });
    }
    seenDays.add(d.day);
    // Written so that a non-numeric trip length refuses every day instead of accepting it.
    if (!(d.day >= 1 && d.day <= stayDays)) {
      violations.push({ day: d.day, code: "day_out_of_range", message: `day ${d.day} is outside the ${stayDays}-day trip` });
      continue;
    }
    if (d.stops.length > MAX_STOPS[pace]) {
      violations.push({ day: d.day, code: "too_many_stops", message: `day ${d.day} has ${d.stops.length} stops; a ${pace} pace allows ${MAX_STOPS[pace]}` });
    }
    const places: Place[] = [];
    let minutes = 0;
    let dayCity: string | null = null;
    for (const id of d.stops) {
      const hit = highlights.place(id);
      if (!hit) {
        violations.push({ day: d.day, code: "unknown_place", placeId: id, message: `"${id}" is not in the verified catalog` });
        continue;
      }
      if (hit.country !== destinationIso) {
        violations.push({ day: d.day, code: "wrong_country", placeId: id, message: `"${id}" is not in the destination` });
        continue;
      }
      if (seenPlaces.has(id)) {
        violations.push({ day: d.day, code: "repeated_place", placeId: id, message: `"${id}" is planned twice` });
      }
      seenPlaces.add(id);
      const clash = hit.place.interests.filter((i) => avoid.includes(i));
      if (clash.length) {
        violations.push({ day: d.day, code: "avoided_interest", placeId: id, message: `"${id}" is tagged ${clash.join(", ")}, which the traveler avoids` });
      }
      if (dayCity === null) dayCity = cityOf(hit.place);
      else if (cityOf(hit.place) !== dayCity) {
        violations.push({ day: d.day, code: "mixed_cities", placeId: id, message: `"${id}" is in ${cityOf(hit.place)}, but day ${d.day} is in ${dayCity}: plan one city a day` });
      }
      if (hit.place.admission) warnings.push(hit.place.admission);
      places.push(hit.place);
      minutes += hit.place.durationMinutes;
    }
    if (minutes > MAX_MINUTES_PER_DAY) {
      violations.push({ day: d.day, code: "too_long", message: `day ${d.day} needs about ${Math.round(minutes / 60)} hours; the limit is ${MAX_MINUTES_PER_DAY / 60}` });
    }
    resolved.push({ day: d.day, title: d.title, places });
  }
  // Blocks of consecutive planned days in one city. More than one block means the plan moves between cities.
  const planned = resolved.filter((r) => r.places.length).sort((a, b) => a.day - b.day);
  const blocks: { city: string; days: typeof planned }[] = [];
  for (const r of planned) {
    const city = cityOf(r.places[0]);
    const last = blocks[blocks.length - 1];
    if (last && last.city === city) last.days.push(r);
    else blocks.push({ city, days: [r] });
  }
  if (blocks.length > 1) {
    // The least days a city needs at this pace: from all the places the list has in it (not only the planned ones).
    const pack = highlights.forCountry(destinationIso);
    const minutesIn = (city: string) => Math.max((pack?.places ?? []).filter((p) => cityOf(p) === city).reduce((m, p) => m + p.durationMinutes, 0), input.cityMinutes?.(city) ?? 0);
    const need = (city: string) => Math.max(STYLES[pace].floor, minDays(minutesIn(city), pace));
    blocks.forEach((b, i) => {
      const least = need(b.city);
      if (b.days.length < least) {
        violations.push({ day: b.days[0].day, code: "short_stay", message: `${b.city} has ${b.days.length} day${b.days.length > 1 ? "s" : ""} at a ${STYLES[pace].en} pace: moving between cities takes most of a day, so a city needs at least ${least} days (Waypoint's estimate), or stay in one city` });
      }
      if (i > 0 && b.days[0].places.length > MAX_ARRIVAL_STOPS) {
        violations.push({ day: b.days[0].day, code: "arrival_day_busy", message: `day ${b.days[0].day} is the first day in ${b.city}: after the trip there, plan at most ${MAX_ARRIVAL_STOPS} stops` });
      }
    });
  }
  return { ok: violations.length === 0, violations, warnings: [...new Set(warnings)], resolved };
}

// ---- Suggested times and a map link: help to arrive when a place is open, without claiming its hours. ----

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * A time for each stop of one day, in the order given: the day starts at 09:00, each stop lasts its duration plus
 * 30 minutes to get to the next, and there is an hour for lunch once the morning is over. A stop tagged nightlife is
 * placed in the evening (from 18:30). When a place has opening hours that this module can read and a date is given,
 * the start moves to its opening time, and the stop says if the place is closed that day or the visit ends after it
 * closes. These are suggestions from the stops' durations and the hours public data gives, not a promise: the traveler
 * checks the hours of each place (see mapsUrl).
 */
export type HoursState = "open" | "closed" | "outside" | "unknown";
export function suggestTimes(places: Place[], date?: string): { start: string; end: string; hours: HoursState }[] {
  const out: { start: string; end: string; hours: HoursState }[] = new Array(places.length);
  const run = (idx: number[], startAt: number, lunch: boolean) => {
    let t = startAt;
    let ate = !lunch;
    for (const i of idx) {
      if (!ate && t >= 12 * 60) {
        t += 60;
        ate = true;
      }
      const dur = places[i].durationMinutes;
      let hours: HoursState = "unknown";
      const h = date && places[i].hours ? openWindows(places[i].hours!.text, date) : null;
      if (h?.known) {
        if (!h.windows.length) hours = "closed";
        else {
          // The first window that is still open at t, or the next one to open; the visit has to end before it closes.
          const w = h.windows.find(([, close]) => t + dur <= close && t < close) ?? h.windows.find(([open]) => open > t);
          if (w && w[0] > t) t = w[0];
          hours = w && t + dur <= w[1] ? "open" : "outside";
        }
      }
      out[i] = { start: hhmm(t), end: hhmm(t + dur), hours };
      t += dur + 30;
    }
  };
  const all = places.map((_, i) => i);
  run(all.filter((i) => !places[i].interests.includes("nightlife")), 9 * 60, true);
  run(all.filter((i) => places[i].interests.includes("nightlife")), 18 * 60 + 30, false);
  return out;
}

/** A Google Maps search for the place (documented Maps URLs): it opens on the place, with its current hours. */
export function mapsUrl(name: string, city: string, country: string): string {
  const query = [name, city, country].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
