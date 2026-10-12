import type { Bookmark, TimeRange } from "./model.ts";

const PRESET_DAYS: Record<string, number> = { today: 1, week: 7, month: 30 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Local midnight `days` calendar days after the day of `date` (DST-safe). */
function midnight(date: Date, days = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function parseDate(value: string): Date {
  if (!DATE_RE.test(value)) throw new RangeError(`expected YYYY-MM-DD, got '${value}'`);
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw new RangeError(`invalid date '${value}'`);
  }
  return date;
}

/**
 * Parses a timeframe: `today`, `yesterday`, `week` (7 days), `month` (30 days), `Nd`, `all`, `YYYY-MM-DD`
 * (since that day) or `YYYY-MM-DD..YYYY-MM-DD`. Days are local and include today; `until` is inclusive.
 */
export function parseTimeRange(since: string, until?: string, today: Date = new Date()): TimeRange {
  if (since.includes("..") || since === "yesterday") {
    if (until !== undefined) throw new RangeError(`'${since}' already sets the end`);
    if (since === "yesterday") return { since: midnight(today, -1), until: midnight(today) };
    const [start = "", end = ""] = since.split("..", 2);
    return { since: parseDate(start), until: midnight(parseDate(end), 1) };
  }

  const untilDate = until === undefined ? undefined : midnight(parseDate(until), 1);
  const daysMatch = /^(\d+)d$/.exec(since);
  if (since === "all") return { until: untilDate };
  if (since in PRESET_DAYS || daysMatch) {
    const days = PRESET_DAYS[since] ?? Number(daysMatch?.[1]);
    if (days < 1) throw new RangeError("Nd needs N >= 1");
    return { since: midnight(today, 1 - days), until: untilDate };
  }
  if (DATE_RE.test(since)) return { since: parseDate(since), until: untilDate };
  throw new RangeError(`unrecognized timeframe '${since}'`);
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function describeRange({ since, until }: TimeRange): string {
  const last = until && isoDate(midnight(until, -1));
  if (since && last) return isoDate(since) === last ? `on ${last}` : `from ${isoDate(since)} to ${last}`;
  if (since) return `since ${isoDate(since)}`;
  return last ? `until ${last}` : "all time";
}

export function inRange(bookmarks: readonly Bookmark[], { since, until }: TimeRange): Bookmark[] {
  return bookmarks.filter((b) =>
    (since === undefined || b.addedAt >= since.getTime()) && (until === undefined || b.addedAt < until.getTime()));
}

export function dayKey(ms: number): string {
  return isoDate(new Date(ms));
}

/** "Mon 12 Oct 2026", locale-independent. */
export function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function timeLabel(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function msUntilNextMidnight(now: Date = new Date()): number {
  return midnight(now, 1).getTime() - now.getTime();
}
