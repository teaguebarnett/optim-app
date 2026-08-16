// Centralized client-local date/time handling for Phase 4.1's history and
// scheduling systems.
//
// Two very different concerns live here, deliberately kept separate:
//
// 1. "What calendar date is it for this client right now?" — this DOES
//    depend on a timezone (resolveClientLocalDateIso, zonedDateTimeToInstant)
//    because it converts a real instant into/out of a specific IANA zone's
//    wall-clock reading, using Intl.DateTimeFormat rather than a date
//    library (none is installed, and none is needed).
// 2. "Given a calendar date, what's N days later / which week does it start
//    / how many days between two dates?" — this is pure calendar arithmetic
//    on YYYY-MM-DD strings and NEVER needs a timezone. Every such function
//    below anchors to UTC noon internally so DST transitions in any zone can
//    never shift the calendar-day result by one.
//
// Every other module that needs "today" or "add N days" should import from
// here rather than doing its own Date math — see lib/planning/training-plan
// .ts's resolveLocalDateIso for the pre-4.1 browser-local-only version this
// supersedes for history/scheduling code (that function is left in place
// for the existing training-time flow it already serves correctly).

import type { DayOfWeek } from "../types";

// ---------------------------------------------------------------------------
// Dev-only "pretend today is this date" override
// ---------------------------------------------------------------------------

export const DEV_DATE_OVERRIDE_STORAGE_KEY = "peak-coaching:dev-date-override";

export function isValidDateIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Dev-only override so a developer/tester can pretend "today" is a
 * different date, to exercise rollover/archival without waiting for a real
 * calendar day to pass. Never consulted in a production build (see the
 * NODE_ENV check) and never written by any production code path — only a
 * dev-only settings control (see components/app-shell/settings-sheet.tsx)
 * ever sets this key. */
export function readDevDateOverride(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEV_DATE_OVERRIDE_STORAGE_KEY);
    return raw && isValidDateIso(raw) ? raw : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Instant <-> client-local wall clock
// ---------------------------------------------------------------------------

/** Best-effort IANA zone for a client with no explicit configured timezone —
 * the browser's own resolved zone. Used only as a fallback default when
 * seeding/migrating a ProgramEnrollment; every derivation downstream always
 * reads an explicit, stored IANA string rather than re-resolving this. */
export function resolveBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatPartsInZone(instant: Date, timeZone: string, opts: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return get;
}

/** The client's current calendar date (YYYY-MM-DD) in their configured IANA
 * timezone, derived from a real instant. This is the one function in the app
 * that should ever convert "now" into "today" for history/scheduling
 * purposes — everything else consumes the resulting date-only string. */
export function resolveClientLocalDateIso(instant: Date, timeZone: string): string {
  const override = readDevDateOverride();
  if (override) return override;
  const get = formatPartsInZone(instant, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The client's current local "HH:MM" wall-clock time in their configured
 * IANA timezone. Used only for display/derivation, never for scheduling
 * math (see zonedDateTimeToInstant for that). */
export function resolveClientLocalTime24(instant: Date, timeZone: string): string {
  const get = formatPartsInZone(instant, timeZone, { hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  return `${get("hour")}:${get("minute")}`;
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const get = formatPartsInZone(instant, timeZone, {
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second"))
  );
  return asUtc - instant.getTime();
}

/** Converts a client-local calendar date + "HH:MM" time in a given IANA
 * timezone into the real instant it represents — correct across DST
 * transitions, since the offset is derived from Intl's real timezone rules
 * (via two correction passes, the standard technique for this without a
 * dedicated Temporal/date-fns-tz dependency) rather than assumed from the
 * machine's own zone. Used to compute concrete due/overdue instants for
 * schedule-driven state such as the weekly check-in open time. */
export function zonedDateTimeToInstant(dateIso: string, time24: string, timeZone: string): Date {
  const { y, m, d } = parseDateIso(dateIso);
  const [hh, mm] = time24.split(":").map(Number);
  const naiveUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0);
  let guessMs = naiveUtcMs;
  for (let i = 0; i < 2; i++) {
    guessMs = naiveUtcMs - timeZoneOffsetMs(new Date(guessMs), timeZone);
  }
  return new Date(guessMs);
}

// ---------------------------------------------------------------------------
// Pure calendar-date arithmetic — never needs a timezone (see module doc)
// ---------------------------------------------------------------------------

function parseDateIso(dateIso: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateIso.split("-").map(Number);
  return { y, m, d };
}

/** Anchors a date-only string to UTC noon before doing calendar math, so no
 * DST transition in any zone can shift the resulting calendar day by one.
 * Never exposed as a real instant — internal to this module only. */
function toUtcNoon(dateIso: string): Date {
  const { y, m, d } = parseDateIso(dateIso);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function fromUtcNoon(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysToLocalDate(dateIso: string, days: number): string {
  const anchored = toUtcNoon(dateIso);
  anchored.setUTCDate(anchored.getUTCDate() + days);
  return fromUtcNoon(anchored);
}

export function compareLocalDates(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function isLocalDateBefore(a: string, b: string): boolean {
  return compareLocalDates(a, b) < 0;
}

export function isLocalDateAfter(a: string, b: string): boolean {
  return compareLocalDates(a, b) > 0;
}

/** Whole calendar days from `fromDateIso` to `toDateIso` (positive when
 * `toDateIso` is later). */
export function diffInLocalDays(fromDateIso: string, toDateIso: string): number {
  const fromMs = toUtcNoon(fromDateIso).getTime();
  const toMs = toUtcNoon(toDateIso).getTime();
  return Math.round((toMs - fromMs) / 86_400_000);
}

const DAY_OF_WEEK_BY_UTC_INDEX: DayOfWeek[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function localDateDayOfWeek(dateIso: string): DayOfWeek {
  return DAY_OF_WEEK_BY_UTC_INDEX[toUtcNoon(dateIso).getUTCDay()];
}

export type WeekStartsOn = "monday" | "sunday";

/** The demo program (and TRAINING_WEEK's Monday-first layout) treats Monday
 * as the first day of the training week — the default any enrollment falls
 * back to unless explicitly configured otherwise. */
export const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = "monday";

export function startOfLocalWeek(dateIso: string, weekStartsOn: WeekStartsOn = DEFAULT_WEEK_STARTS_ON): string {
  const utcDayIndex = toUtcNoon(dateIso).getUTCDay(); // 0=Sunday..6=Saturday
  const offset = weekStartsOn === "monday" ? (utcDayIndex === 0 ? 6 : utcDayIndex - 1) : utcDayIndex;
  return addDaysToLocalDate(dateIso, -offset);
}
