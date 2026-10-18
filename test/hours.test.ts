import { test } from "node:test";
import assert from "node:assert/strict";
import { openWindows } from "../src/hours.ts";
import { humanizeHours } from "../web/hours.js";
import { suggestTimes } from "../src/itinerary.ts";
import type { Place } from "../src/services/highlights.ts";

// 2026-12-07 is a Monday, 2026-12-08 a Tuesday, 2026-12-13 a Sunday.
test("opening hours are read for one date: weekdays, ranges, several windows a day, off and 24/7", () => {
  assert.deepEqual(openWindows("Mo-Fr 09:00-17:00", "2026-12-07"), { known: true, windows: [[540, 1020]] });
  assert.deepEqual(openWindows("Mo-Fr 09:00-12:00,13:00-17:00", "2026-12-08"), { known: true, windows: [[540, 720], [780, 1020]] });
  assert.deepEqual(openWindows("Tu-Su 10:00-18:00; Mo off", "2026-12-07"), { known: true, windows: [] }, "a rule that says off closes the day");
  assert.deepEqual(openWindows("Tu-Su 10:00-18:00; Mo off", "2026-12-13"), { known: true, windows: [[600, 1080]] });
  assert.deepEqual(openWindows("09:00-17:00", "2026-12-13"), { known: true, windows: [[540, 1020]] }, "no weekday means every day");
  assert.deepEqual(openWindows("24/7", "2026-12-13"), { known: true, windows: [[0, 1440]] });
  assert.deepEqual(openWindows("Sa-Mo 10:00-16:00", "2026-12-07"), { known: true, windows: [[600, 960]] }, "a range of days can wrap past Sunday");
  assert.deepEqual(openWindows("Mo-Su 18:00-02:00", "2026-12-07"), { known: true, windows: [[1080, 1440]] }, "past midnight counts to the end of the day");
});

test("a text that is not understood is unknown, never open or closed", () => {
  for (const t of ["", "Mo-Su sunrise-sunset", "Apr-Oct Mo-Su 09:00-17:00", "Mo-Fr 09:00-17:00; PH off", "by appointment", "Mo-Fr 9-17"]) {
    assert.deepEqual(openWindows(t, "2026-12-07"), { known: false }, t);
  }
  assert.deepEqual(openWindows("Tu-Su 10:00-18:00", "2026-12-07"), { known: false }, "no rule for that weekday is not 'closed'");
});

test("hours are shown for people, and an unusual text is shown as it is", () => {
  assert.equal(humanizeHours("Mo-Fr 09:00-17:00; Sa off"), "Mon–Fri 09:00–17:00 · Sat closed");
  assert.equal(humanizeHours("Mo-Su 09:00-12:00,13:00-17:00", "es"), "lun–dom 09:00–12:00, 13:00–17:00");
  assert.equal(humanizeHours("24/7"), "Open 24 hours");
  assert.equal(humanizeHours("sunrise-sunset"), "sunrise-sunset");
});

const place = (id: string, extra: Partial<Place> = {}): Place => ({
  id, name: id, area: "A", city: "X", category: "sight", interests: ["sights"], durationMinutes: 90, desc: { en: "d", es: "d" }, sourceId: "s", ...extra,
});
const hrs = (text: string) => ({ text, source: "osm", retrieved: "2026-10-18" });

test("a suggested time moves to the opening time, and a closed day or a late visit is said", () => {
  const monday = "2026-12-07";
  // Opens at 10:00: the visit starts then, not at 09:00.
  const late = suggestTimes([place("a", { hours: hrs("Mo-Su 10:00-18:00") })], monday);
  assert.deepEqual(late[0], { start: "10:00", end: "11:30", hours: "open" });
  // Closed on Mondays.
  assert.equal(suggestTimes([place("b", { hours: hrs("Tu-Su 10:00-18:00; Mo off") })], monday)[0].hours, "closed");
  // Closes at 10:00 but the visit lasts 90 minutes from 09:00.
  assert.equal(suggestTimes([place("c", { hours: hrs("Mo-Su 08:00-10:00") })], monday)[0].hours, "outside");
  // No hours, or no date: nothing is claimed.
  assert.equal(suggestTimes([place("d")], monday)[0].hours, "unknown");
  assert.equal(suggestTimes([place("e", { hours: hrs("Mo-Su 10:00-18:00") })])[0].hours, "unknown");
  // The next stop follows the moved one.
  const two = suggestTimes([place("f", { hours: hrs("Mo-Su 10:00-18:00") }), place("g")], monday);
  assert.equal(two[1].start, "13:00", "11:30 plus half an hour is noon, so lunch comes first");
});
