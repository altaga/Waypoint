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

// Moving between cities costs most of a day: each city needs its minimum days at the pace.
test("a plan that moves between cities needs each city's minimum days at the pace, and few stops on the arrival day", () => {
  const cs: Record<string, { place: Place; country: string }> = {};
  for (const [id, city] of [["t1", "Tokyo"], ["t2", "Tokyo"], ["t3", "Tokyo"], ["k1", "Kyoto"], ["k2", "Kyoto"], ["k3", "Kyoto"], ["o1", "Osaka"]] as const) cs[`jp-${id}`] = { place: place(`jp-${id}`, { city }), country: "JP" };
  const reg: HighlightRegistry = { forCountry: () => undefined, place: (id) => cs[id], countries: () => ["JP"] };
  const v = (pace: "relaxed" | "balanced" | "packed", plan: { day: number; stops: string[] }[]) => verifyPlan({ ...base, pace, stayDays: 8, highlights: reg, plan }).violations.map((x) => [x.code, x.day]);
  const tokyoTokyoKyotoOsaka = [{ day: 1, stops: ["jp-t1"] }, { day: 2, stops: ["jp-t2"] }, { day: 3, stops: ["jp-k1"] }, { day: 4, stops: ["jp-o1"] }];
  // Express needs two days in a city: one day in Kyoto and one in Osaka are both too short.
  assert.deepEqual(v("packed", tokyoTokyoKyotoOsaka), [["short_stay", 3], ["short_stay", 4]]);
  // Two days in each, two stops on the arrival day: fine at an Express pace.
  const ok = [{ day: 1, stops: ["jp-t1"] }, { day: 2, stops: ["jp-t2"] }, { day: 3, stops: ["jp-k1", "jp-k2"] }, { day: 4, stops: ["jp-k3"] }];
  assert.deepEqual(v("packed", ok), []);
  // The same plan at a Classic pace (three days a city at least) or a Slow one (four) is too short.
  assert.deepEqual(v("balanced", ok), [["short_stay", 1], ["short_stay", 3]]);
  assert.deepEqual(v("relaxed", ok), [["short_stay", 1], ["short_stay", 3]]);
  // Three stops on the arrival day.
  assert.deepEqual(v("packed", [{ day: 1, stops: ["jp-t1"] }, { day: 2, stops: ["jp-t2"] }, { day: 3, stops: ["jp-k1", "jp-k2", "jp-k3"] }, { day: 4, stops: ["jp-t3"] }]).map(([c]) => c).sort(), ["arrival_day_busy", "short_stay", "short_stay"].sort());
  // One city, any number of days: nothing to check.
  assert.deepEqual(v("relaxed", [{ day: 1, stops: ["jp-t1"] }, { day: 5, stops: ["jp-t2", "jp-t3"] }]), []);
  // The city of a place can come from outside (the nearest city), not only from the place's own field.
  const byCity = verifyPlan({ ...base, pace: "packed", stayDays: 8, highlights: reg, cityOf: () => "Same", plan: [{ day: 1, stops: ["jp-t1", "jp-k1"] }] });
  assert.equal(byCity.ok, true);
});

import { suggestTimes, mapsUrl } from "../src/itinerary.ts";

// Suggested times and the map link: help to arrive when a place is open, without claiming its hours.
test("a day starts at nine, leaves half an hour between stops and an hour for lunch, and puts nightlife in the evening", () => {
  const stop = (id: string, minutes: number, interests: Place["interests"] = ["sights"]) => place(id, { durationMinutes: minutes, interests });
  const t = suggestTimes([stop("a", 90), stop("b", 120), stop("c", 60), stop("bar", 90, ["nightlife"])]);
  assert.deepEqual(t[0], { start: "09:00", end: "10:30", hours: "unknown" });
  assert.deepEqual(t[1], { start: "11:00", end: "13:00", hours: "unknown" }, "the second stop starts before noon");
  assert.deepEqual(t[2], { start: "14:30", end: "15:30", hours: "unknown" }, "after noon there is an hour for lunch first");
  assert.deepEqual(t[3], { start: "18:30", end: "20:00", hours: "unknown" }, "nightlife is in the evening");
});

test("the map link is a search for the place that names its city and country", () => {
  const u = new URL(mapsUrl("Senso-ji", "Tokyo", "Japan"));
  assert.equal(u.origin + u.pathname, "https://www.google.com/maps/search/");
  assert.equal(u.searchParams.get("api"), "1");
  assert.equal(u.searchParams.get("query"), "Senso-ji, Tokyo, Japan");
  assert.equal(new URL(mapsUrl("Café & Bar #1", "Zürich", "Switzerland")).searchParams.get("query"), "Café & Bar #1, Zürich, Switzerland");
});

test("suggested times leave room for the estimated way between stops, and say how long it is and how to go", async () => {
  const { suggestTimes, travelBetween } = await import("../src/itinerary.ts");
  const P = (id: string, lat: number, lon: number): any => ({ id, name: id, area: "a", city: "c", category: "sight", interests: ["sights"], durationMinutes: 60, desc: { en: "d", es: "d" }, sourceId: "x", lat, lon });
  const near = P("near", 35.6595, 139.7005), next = P("next", 35.6620, 139.7030), far = P("far", 35.7100, 139.8107), unknown = { ...P("u", 0, 0), lat: undefined, lon: undefined };
  const walk = travelBetween(near, next)!;
  assert.equal(walk.mode, "walk");
  assert.ok(walk.minutes >= 3 && walk.minutes <= 12, String(walk.minutes));
  const ride = travelBetween(near, far)!;
  assert.equal(ride.mode, "ride");
  assert.ok(ride.minutes > 20 && ride.minutes < 70, String(ride.minutes));
  assert.equal(travelBetween(near, unknown), null);
  const t = suggestTimes([near, next, far]);
  assert.equal(t[0].start, "09:00");
  assert.equal(t[0].travelMinutes, undefined);
  assert.equal(t[1].travelMode, "walk");
  // 09:00 + 60 min visit + the walk + 10 minutes: earlier than the old fixed half hour.
  assert.ok(t[1].start < "10:30" && t[1].start > "10:05", t[1].start);
  assert.equal(t[2].travelMode, "ride");
});
