import type { HighlightRegistry, Interest, Place } from "./services/highlights.ts";
type Pace = "relaxed" | "balanced" | "packed";

// Itinerary verifier. A plan is a list of days, each with place ids from the catalog.
// Every rule here is deterministic: the concierge's words are never trusted, only ids.
// A plan with errors is not saved; the reply lists the problems so the plan can be fixed.

export const MAX_STOPS: Record<Pace, number> = { relaxed: 2, balanced: 3, packed: 4 };
export const MAX_MINUTES_PER_DAY = 600;

export interface PlanDay {
  day: number;
  title?: string;
  stops: string[];
}

export interface Violation {
  day: number | null;
  code: "day_out_of_range" | "duplicate_day" | "unknown_place" | "wrong_country" | "repeated_place" | "too_many_stops" | "avoided_interest" | "too_long";
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
}): VerifyResult {
  const { plan, stayDays, destinationIso, pace, avoid, highlights } = input;
  const violations: Violation[] = [];
  const warnings: string[] = [];
  const seenDays = new Set<number>();
  const seenPlaces = new Set<string>();
  const resolved: VerifyResult["resolved"] = [];

  for (const d of plan) {
    if (seenDays.has(d.day)) {
      violations.push({ day: d.day, code: "duplicate_day", message: `day ${d.day} appears twice` });
    }
    seenDays.add(d.day);
    if (d.day < 1 || d.day > stayDays) {
      violations.push({ day: d.day, code: "day_out_of_range", message: `day ${d.day} is outside the ${stayDays}-day trip` });
      continue;
    }
    if (d.stops.length > MAX_STOPS[pace]) {
      violations.push({ day: d.day, code: "too_many_stops", message: `day ${d.day} has ${d.stops.length} stops; a ${pace} pace allows ${MAX_STOPS[pace]}` });
    }
    const places: Place[] = [];
    let minutes = 0;
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
      if (hit.place.admission) warnings.push(hit.place.admission);
      places.push(hit.place);
      minutes += hit.place.durationMinutes;
    }
    if (minutes > MAX_MINUTES_PER_DAY) {
      violations.push({ day: d.day, code: "too_long", message: `day ${d.day} needs about ${Math.round(minutes / 60)} hours; the limit is ${MAX_MINUTES_PER_DAY / 60}` });
    }
    resolved.push({ day: d.day, title: d.title, places });
  }
  return { ok: violations.length === 0, violations, warnings: [...new Set(warnings)], resolved };
}
