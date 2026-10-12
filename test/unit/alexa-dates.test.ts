import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTripDates } from "../../src/alexa/dates.ts";

const NOW = new Date("2026-10-12T12:00:00Z");

test("plain dates pass through", () => {
  assert.deepEqual(resolveTripDates("2026-12-03", "2026-12-10", NOW), { startDate: "2026-12-03", endDate: "2026-12-10" });
});

test("one date only: the trip is that day", () => {
  assert.deepEqual(resolveTripDates("2026-12-05", undefined, NOW), { startDate: "2026-12-05", endDate: "2026-12-05" });
});

test("a bare day takes the month and year of the end ('del uno al veinticinco de diciembre')", () => {
  assert.deepEqual(resolveTripDates("XXXX-XX-01", "2026-12-25", NOW), { startDate: "2026-12-01", endDate: "2026-12-25" });
});

test("a date with no year is the next time it comes", () => {
  assert.deepEqual(resolveTripDates("XXXX-12-01", "XXXX-12-25", NOW), { startDate: "2026-12-01", endDate: "2026-12-25" });
  assert.deepEqual(resolveTripDates("XXXX-03-01", undefined, NOW), { startDate: "2027-03-01", endDate: "2027-03-01" });
});

test("a trip across new year without years ends in the next year", () => {
  assert.deepEqual(resolveTripDates("XXXX-12-28", "XXXX-01-03", NOW), { startDate: "2026-12-28", endDate: "2027-01-03" });
});

test("a week is Monday to Sunday, a weekend Saturday to Sunday", () => {
  assert.deepEqual(resolveTripDates("2026-W49", undefined, NOW), { startDate: "2026-11-30", endDate: "2026-12-06" });
  assert.deepEqual(resolveTripDates("2026-W49-WE", undefined, NOW), { startDate: "2026-12-05", endDate: "2026-12-06" });
});

test("a month alone, an impossible date, or an end before the start is asked again", () => {
  assert.equal(resolveTripDates("2026-12", undefined, NOW), null);
  assert.equal(resolveTripDates("2026-02-30", undefined, NOW), null);
  assert.equal(resolveTripDates("2026-12-10", "2026-12-03", NOW), null);
  assert.equal(resolveTripDates("next week", undefined, NOW), null);
  assert.equal(resolveTripDates(undefined, undefined, NOW), null);
});
