// Opening hours in OpenStreetMap's opening_hours syntax ("Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off"), read for one date.
// Only the common forms are understood: weekdays and ranges of weekdays, time ranges (several per day), "off" and
// "24/7". Anything else (public holidays, months, sunrise and sunset, week numbers) makes the whole text unknown, and
// an unknown text never says a place is open or closed.

export type Windows = { known: true; windows: [number, number][] } | { known: false };

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function weekdays(part: string): number[] | null {
  const out = new Set<number>();
  for (const token of part.split(",")) {
    const t = token.trim();
    const range = /^([A-Z][a-z])-([A-Z][a-z])$/.exec(t);
    if (range) {
      const a = DAYS.indexOf(range[1]);
      const b = DAYS.indexOf(range[2]);
      if (a < 0 || b < 0) return null;
      for (let d = a; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === b) break;
      }
    } else if (DAYS.includes(t)) out.add(DAYS.indexOf(t));
    else return null;
  }
  return [...out];
}

/** The open windows (minutes from midnight) of a text on a date (YYYY-MM-DD). */
export function openWindows(text: string, date: string): Windows {
  const unknown: Windows = { known: false };
  const raw = String(text ?? "").trim();
  if (!raw) return unknown;
  if (/^24\/7$/.test(raw)) return { known: true, windows: [[0, 24 * 60]] };
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (Number.isNaN(day)) return unknown;
  let windows: [number, number][] | null = null; // null: no rule has matched this day yet
  for (const rule of raw.split(";").map((r) => r.trim()).filter(Boolean)) {
    const m = /^((?:[A-Z][a-z](?:-[A-Z][a-z])?)(?:\s*,\s*[A-Z][a-z](?:-[A-Z][a-z])?)*)?\s*(off|closed|\d{2}:\d{2}-\d{2}:\d{2}(?:\s*,\s*\d{2}:\d{2}-\d{2}:\d{2})*|24\/7)$/.exec(rule);
    if (!m) return unknown;
    const days = m[1] ? weekdays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return unknown;
    if (!days.includes(day)) continue;
    if (m[2] === "off" || m[2] === "closed") windows = [];
    else if (m[2] === "24/7") windows = [[0, 24 * 60]];
    else {
      windows = m[2].split(",").map((r) => {
        const [a, b] = r.trim().split("-");
        const start = toMin(a);
        const end = toMin(b);
        return [start, end <= start ? 24 * 60 : end] as [number, number]; // past midnight: until the end of the day
      });
    }
  }
  // No rule for that weekday: the place has no stated hours that day, which is not the same as closed.
  return windows === null ? unknown : { known: true, windows };
}
