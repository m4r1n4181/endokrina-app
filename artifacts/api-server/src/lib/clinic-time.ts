/**
 * Timezone helpers for clinic-local "days".
 *
 * Kept free of config/db imports so they can be unit-tested in isolation.
 * Uses only Intl (full ICU is bundled with Node), no date library.
 */

export interface ClinicDay {
  /** Local calendar date in the clinic timezone, YYYY-MM-DD. */
  date: string;
  /** Local hour of day, 0-23. */
  hour: number;
  /** Start of the local day as a UTC instant (inclusive). */
  startUtc: Date;
  /** Start of the NEXT local day as a UTC instant (exclusive). */
  endUtc: Date;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockIn(at: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // h23 avoids the "24:00" midnight quirk that hour12:false can produce.
    hourCycle: "h23",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset (local wall clock minus UTC) of `timeZone` at instant `at`, in ms. */
function offsetMs(at: Date, timeZone: string): number {
  const w = wallClockIn(at, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const atSeconds = Math.floor(at.getTime() / 1000) * 1000;
  return asUtc - atSeconds;
}

/** The UTC instant at which local midnight of `date` (YYYY-MM-DD) occurs in `timeZone`. */
export function zonedMidnightUtc(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);

  // Two passes handle the case where the offset differs between the guess and the result (DST).
  const first = offsetMs(new Date(guess), timeZone);
  let result = guess - first;
  const second = offsetMs(new Date(result), timeZone);
  if (second !== first) result = guess - second;
  return new Date(result);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Describes the clinic-local day containing `now`. DST-safe (days may be 23 or 25 hours long). */
export function clinicDay(now: Date, timeZone: string): ClinicDay {
  const w = wallClockIn(now, timeZone);
  const date = `${String(w.year).padStart(4, "0")}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
  return {
    date,
    hour: w.hour,
    startUtc: zonedMidnightUtc(date, timeZone),
    endUtc: zonedMidnightUtc(addDays(date, 1), timeZone),
  };
}

/** "09:30" in the given timezone. */
export function formatClinicTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

/** "četvrtak, 24. septembar 2026." in the given timezone. */
export function formatClinicDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
}
