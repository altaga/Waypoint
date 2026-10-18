import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyPlan, MAX_STOPS } from "../src/itinerary.ts";
import type { HighlightRegistry, Place } from "../src/services/highlights.ts";

// A small catalog: two countries, one place with a nightlife tag, one with an admission note.
const place = (id: string, extra: Partial<Place> = {}): Place => ({
  id, name: id.toUpperCase(), area: "Centro", city: "X", category: "sight", interests: ["sights"],
  durationMinutes: 90, desc: { en: "d", es: "d" }, sourceId: "s", ...extra,
});
const PLACES: Record<string, { place: Place; country: string }> = {
  "jp-a": { place: place("jp-a"), country: "JP" },
  "jp-b": { place: place("jp-b", { admission: "Reserve ahead" }), country: "JP" },
  "jp-bar": { place: place("jp-bar", { interests: ["nightlife"] }), country: "JP" },
  "jp-c": { place: place("jp-c", { durationMinutes: 400 }), country: "JP" },
  "jp-d": { place: place("jp-d"), country: "JP" },
  "jp-e": { place: place("jp-e"), country: "JP" },
  "jp-long": { place: place("jp-long", { durationMinutes: 300 }), country: "JP" },
  "mx-a": { place: place("mx-a"), country: "MX" },
};
const highlights: HighlightRegistry = {
  forCountry: () => undefined,
  place: (id) => PLACES[id],
  countries: () => ["JP", "MX"],
};
const base = { stayDays: 5, destinationIso: "JP", pace: "balanced" as const, avoid: [] as never[], highlights };

test("a valid plan passes and resolves every stop to its place", () => {
  const r = verifyPlan({ ...base, plan: [{ day: 1, stops: ["jp-a", "jp-b"] }, { day: 2, stops: [] }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.resolved[0].places.map((p) => p.id), ["jp-a", "jp-b"]);
  assert.deepEqual(r.warnings, ["Reserve ahead"]);
});

test("an id that is not in the catalog is rejected, even if it looks real", () => {
  const r = verifyPlan({ ...base, plan: [{ day: 1, stops: ["jp-tokyo-tower"] }] });
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].code, "unknown_place");
});

test("a place from another country is rejected", () => {
  const r = verifyPlan({ ...base, plan: [{ day: 1, stops: ["mx-a"] }] });
  assert.equal(r.violations[0].code, "wrong_country");
});

test("days outside the trip, duplicate days and repeated places are rejected", () => {
  const r = verifyPlan({ ...base, plan: [{ day: 9, stops: ["jp-a"] }, { day: 1, stops: ["jp-b"] }, { day: 1, stops: ["jp-b"] }] });
  const codes = r.violations.map((v) => v.code).sort();
  assert.ok(codes.includes("day_out_of_range"));
  assert.ok(codes.includes("duplicate_day"));
  assert.ok(codes.includes("repeated_place"));
});

test("the stop limit follows the pace", () => {
  const four = ["jp-a", "jp-b", "jp-d", "jp-e"];
  assert.equal(verifyPlan({ ...base, pace: "relaxed", plan: [{ day: 1, stops: four }] }).violations[0].code, "too_many_stops");
  assert.equal(verifyPlan({ ...base, pace: "packed", plan: [{ day: 1, stops: four }] }).ok, true);
  assert.equal(MAX_STOPS.relaxed, 2);
});

test("avoided interests are enforced", () => {
  const r = verifyPlan({ ...base, avoid: ["nightlife"], plan: [{ day: 1, stops: ["jp-bar"] }] });
  assert.equal(r.violations[0].code, "avoided_interest");
  assert.equal(verifyPlan({ ...base, avoid: ["beaches"], plan: [{ day: 1, stops: ["jp-bar"] }] }).ok, true);
});

test("a day that exceeds the daily time limit is rejected", () => {
  const r = verifyPlan({ ...base, plan: [{ day: 1, stops: ["jp-c", "jp-long"] }] });
  assert.equal(r.violations[0].code, "too_long");
  assert.equal(verifyPlan({ ...base, plan: [{ day: 1, stops: ["jp-c"] }] }).ok, true, "400 minutes alone is inside the limit");
});

// One city a day: Kyoto and Osaka in the same day is a plan nobody would follow.
test("a day with stops in two cities is rejected, naming the stop that does not belong", () => {
  const cities: Record<string, { place: Place; country: string }> = {
    "jp-kyoto-1": { place: place("jp-kyoto-1", { city: "Kyoto" }), country: "JP" },
    "jp-kyoto-2": { place: place("jp-kyoto-2", { city: "Kyoto" }), country: "JP" },
    "jp-osaka-1": { place: place("jp-osaka-1", { city: "Osaka" }), country: "JP" },
  };
  const reg: HighlightRegistry = { forCountry: () => undefined, place: (id) => cities[id], countries: () => ["JP"] };
  const same = verifyPlan({ ...base, highlights: reg, plan: [{ day: 1, stops: ["jp-kyoto-1", "jp-kyoto-2"] }] });
  assert.equal(same.ok, true);
  const mixed = verifyPlan({ ...base, highlights: reg, plan: [{ day: 1, stops: ["jp-kyoto-1", "jp-osaka-1"] }] });
  assert.equal(mixed.ok, false);
  assert.deepEqual(mixed.violations.map((v) => [v.code, v.placeId, v.day]), [["mixed_cities", "jp-osaka-1", 1]]);
  assert.match(mixed.violations[0].message, /plan one city a day/);
});

// Moving between cities costs most of a day.
test("a plan that moves between cities needs two days in each, and few stops on the arrival day", () => {
  const cs: Record<string, { place: Place; country: string }> = {};
  for (const [id, city] of [["t1", "Tokyo"], ["t2", "Tokyo"], ["t3", "Tokyo"], ["k1", "Kyoto"], ["k2", "Kyoto"], ["k3", "Kyoto"], ["o1", "Osaka"]] as const) cs[`jp-${id}`] = { place: place(`jp-${id}`, { city }), country: "JP" };
  const reg: HighlightRegistry = { forCountry: () => undefined, place: (id) => cs[id], countries: () => ["JP"] };
  const v = (plan: { day: number; stops: string[] }[]) => verifyPlan({ ...base, stayDays: 8, highlights: reg, plan }).violations.map((x) => [x.code, x.day]);
  // Tokyo, Tokyo, Kyoto, Osaka: one day in Kyoto and one in Osaka.
  assert.deepEqual(v([{ day: 1, stops: ["jp-t1"] }, { day: 2, stops: ["jp-t2"] }, { day: 3, stops: ["jp-k1"] }, { day: 4, stops: ["jp-o1"] }]), [["short_stay", 3], ["short_stay", 4]]);
  // Two days in each, and two stops on the arrival day: fine.
  assert.deepEqual(v([{ day: 1, stops: ["jp-t1"] }, { day: 2, stops: ["jp-t2"] }, { day: 3, stops: ["jp-k1", "jp-k2"] }, { day: 4, stops: ["jp-k3"] }]), []);
  // Three stops on the arrival day.
  assert.deepEqual(v([{ day: 1, stops: ["jp-t1"] }, { day: 2, stops: ["jp-t2"] }, { day: 3, stops: ["jp-k1", "jp-k2", "jp-k3"] }, { day: 4, stops: ["jp-t3"] }]).map(([c]) => c).sort(), ["arrival_day_busy", "short_stay", "short_stay"].sort());
  // One city, any number of days: nothing to check.
  assert.deepEqual(v([{ day: 1, stops: ["jp-t1"] }, { day: 5, stops: ["jp-t2", "jp-t3"] }]), []);
});

import { suggestTimes, mapsUrl } from "../src/itinerary.ts";

// Suggested times and the map link: help to arrive when a place is open, without claiming its hours.
test("a day starts at nine, leaves half an hour between stops and an hour for lunch, and puts nightlife in the evening", () => {
  const stop = (id: string, minutes: number, interests: Place["interests"] = ["sights"]) => place(id, { durationMinutes: minutes, interests });
  const t = suggestTimes([stop("a", 90), stop("b", 120), stop("c", 60), stop("bar", 90, ["nightlife"])]);
  assert.deepEqual(t[0], { start: "09:00", end: "10:30" });
  assert.deepEqual(t[1], { start: "11:00", end: "13:00" }, "the second stop starts before noon");
  assert.deepEqual(t[2], { start: "14:30", end: "15:30" }, "after noon there is an hour for lunch first");
  assert.deepEqual(t[3], { start: "18:30", end: "20:00" }, "nightlife is in the evening");
});

test("the map link is a search for the place that names its city and country", () => {
  const u = new URL(mapsUrl("Senso-ji", "Tokyo", "Japan"));
  assert.equal(u.origin + u.pathname, "https://www.google.com/maps/search/");
  assert.equal(u.searchParams.get("api"), "1");
  assert.equal(u.searchParams.get("query"), "Senso-ji, Tokyo, Japan");
  assert.equal(new URL(mapsUrl("Café & Bar #1", "Zürich", "Switzerland")).searchParams.get("query"), "Café & Bar #1, Zürich, Switzerland");
});
