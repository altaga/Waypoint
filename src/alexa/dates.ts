// Alexa AMAZON.DATE values come in several shapes: "2026-12-01", a day without month or year
// ("XXXX-XX-01"), a month ("2026-12"), a week ("2026-W49") or a weekend ("2026-W49-WE").
// This turns a start and an end into two calendar dates, or null when they cannot be known.

type Parts = { y?: number; m?: number; d?: number; weekStart?: Date; weekend?: boolean; monthOnly?: boolean };

function parse(value: string | undefined): Parts | null {
  if (!value) return null;
  let m = /^(\d{4}|X{4})-(\d{2}|X{2})-(\d{2})$/.exec(value);
  if (m) return { y: m[1] === "XXXX" ? undefined : Number(m[1]), m: m[2] === "XX" ? undefined : Number(m[2]), d: Number(m[3]) };
  m = /^(\d{4})-W(\d{2})(-WE)?$/.exec(value);
  if (m) {
    // ISO week: the week with January 4th is week 1, and weeks start on Monday.
    const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
    const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (Number(m[2]) - 1) * 7 * 86400000);
    return { weekStart: monday, weekend: Boolean(m[3]) };
  }
  m = /^(\d{4})-(\d{2})$/.exec(value);
  if (m) return { y: Number(m[1]), m: Number(m[2]), monthOnly: true };
  return null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

function valid(y: number, m: number, d: number): boolean {
  const t = day(y, m, d);
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Start and end as YYYY-MM-DD, or null when the dates need to be asked again. */
export function resolveTripDates(start: string | undefined, end: string | undefined, now: Date): { startDate: string; endDate: string } | null {
  const s = parse(start);
  const e = parse(end);
  if (!s) return null;
  // A week or a weekend: Monday to Sunday, or Saturday to Sunday.
  if (s.weekStart) {
    const from = s.weekend ? new Date(s.weekStart.getTime() + 5 * 86400000) : s.weekStart;
    const to = new Date(s.weekStart.getTime() + 6 * 86400000);
    if (!e) return { startDate: iso(from), endDate: iso(to) };
  }
  // A month alone gives no days: ask.
  if (s.monthOnly || e?.monthOnly) return null;
  if (s.d === undefined && !s.weekStart) return null;

  const today = day(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  // The end lends its month and year to a start said as a bare day ("del 1 al 25 de diciembre").
  const startParts: Parts = s.weekStart ? { y: s.weekStart.getUTCFullYear(), m: s.weekStart.getUTCMonth() + 1, d: s.weekStart.getUTCDate() } : { ...s };
  const endParts: Parts | null = e ? (e.weekStart ? { y: e.weekStart.getUTCFullYear(), m: e.weekStart.getUTCMonth() + 1, d: e.weekStart.getUTCDate() + 6 } : { ...e }) : null;
  if (endParts) {
    startParts.m ??= endParts.m;
    startParts.y ??= endParts.y;
    endParts.m ??= startParts.m;
    endParts.y ??= startParts.y;
  }
  // Still missing a month: this month, or next month if that day has passed.
  if (startParts.m === undefined) {
    startParts.m = today.getUTCMonth() + 1;
    startParts.y ??= today.getUTCFullYear();
    if (startParts.d! < today.getUTCDate()) startParts.m += 1;
    if (startParts.m > 12) {
      startParts.m = 1;
      startParts.y += 1;
    }
  }
  // Still missing a year: the next time that date comes.
  if (startParts.y === undefined) {
    startParts.y = today.getUTCFullYear();
    if (day(startParts.y, startParts.m, startParts.d!) < today) startParts.y += 1;
  }
  if (!valid(startParts.y, startParts.m, startParts.d!)) return null;
  const from = day(startParts.y, startParts.m, startParts.d!);

  let to = from;
  if (endParts) {
    endParts.m ??= startParts.m;
    endParts.y ??= startParts.y;
    if (endParts.d === undefined || !valid(endParts.y!, endParts.m!, endParts.d)) return null;
    to = day(endParts.y!, endParts.m!, endParts.d);
    // "del 28 de diciembre al 3 de enero" without years: the end is in the next year.
    if (to < from && e && !/^\d{4}/.test(end ?? "")) to = day(endParts.y! + 1, endParts.m!, endParts.d);
    if (to < from) return null;
  }
  return { startDate: iso(from), endDate: iso(to) };
}
