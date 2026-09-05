// Phase 5.2 — timezone detection/display for onboarding's "About you"
// chapter. Detects once via the browser's own Intl data (never asks a
// client to type "EST") and renders a friendly long name ("Eastern Time")
// rather than the raw IANA identifier ("America/New_York").
//
// Phase 5.4A — extended into a full real search index for
// components/ui/timezone-picker.tsx: every real IANA identifier
// (Intl.supportedValuesOf("timeZone") — broadly supported, no fallback data
// source needed), searchable by city, region, IANA id, or UTC offset, with
// a live local-time label and DST handled automatically by Intl itself
// (never a fixed offset — see this phase's brief's timezone requirement).

export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Falls back to the raw IANA id if the runtime can't produce a long name
 * for it (should be rare) — never throws, never shows "undefined". */
export function friendlyTimeZoneLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** The DST-agnostic generic name ("Central Time," not "Central Daylight
 * Time") — what the phase brief's example label ("Chicago · Central Time")
 * actually wants. `longGeneric` isn't supported by every JS engine still in
 * the wild, so this falls back to stripping " Daylight"/" Standard" from
 * the always-supported `long` form rather than throwing. */
export function friendlyTimeZoneGenericLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longGeneric" as Intl.DateTimeFormatOptions["timeZoneName"] }).formatToParts(new Date());
    const generic = parts.find((p) => p.type === "timeZoneName")?.value;
    if (generic) return generic;
  } catch {
    // fall through to the long-name strip below
  }
  return friendlyTimeZoneLabel(timeZone).replace(/\s+(Daylight|Standard)(\s+Time)?$/, " Time");
}

/** The city-ish segment of an IANA id ("America/Chicago" -> "Chicago",
 * "America/Argentina/Buenos_Aires" -> "Buenos Aires") — every real IANA id
 * is Area/City (or Area/Region/City), so this is always a real place name,
 * never a guess. */
export function cityLabelFromTimeZone(timeZone: string): string {
  const last = timeZone.split("/").pop() ?? timeZone;
  return last.replace(/_/g, " ");
}

/** "Chicago · Central Time" — the one label this phase's brief requires as
 * the PRIMARY display, never the raw "America/Chicago" id. */
export function friendlyTimeZoneDisplayLabel(timeZone: string): string {
  return `${cityLabelFromTimeZone(timeZone)} · ${friendlyTimeZoneGenericLabel(timeZone)}`;
}

/** "UTC-06:00" — real, DST-aware (computed for right now, not a hardcoded
 * standard-time offset), used for search-by-offset and as small supporting
 * text next to the primary city label. */
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" as Intl.DateTimeFormatOptions["timeZoneName"] }).formatToParts(at);
    const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "UTC+0";
    // Normalize "GMT-6" -> "UTC-06:00"
    const match = raw.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!match) return raw;
    const sign = match[1];
    const hours = match[2].padStart(2, "0");
    const minutes = (match[3] ?? "00").padStart(2, "0");
    return `UTC${sign}${hours}:${minutes}`;
  } catch {
    return "UTC+00:00";
  }
}

/** The live current time in this zone, e.g. "10:45 PM" — recomputed by the
 * caller on whatever cadence it needs (components/ui/timezone-picker.tsx
 * ticks this once a minute while open). */
export function currentLocalTimeLabel(timeZone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
  } catch {
    return "—";
  }
}

export interface TimeZoneEntry {
  id: string;
  cityLabel: string;
  genericLabel: string;
  offsetLabel: string;
  /** Lowercased, space-joined haystack for search — city + region + id +
   * offset, so "chicago", "america/chicago", "central", and "utc-6" all
   * match the same entry. */
  searchText: string;
}

let cachedEntries: TimeZoneEntry[] | null = null;

/** Every real IANA timezone, indexed once and memoized (there are ~400 —
 * cheap, but no reason to recompute per keystroke). Falls back to a small
 * fixed list of major zones if the runtime doesn't support
 * Intl.supportedValuesOf (very old engines only). */
export function allTimeZoneEntries(): TimeZoneEntry[] {
  if (cachedEntries) return cachedEntries;
  let ids: string[];
  try {
    ids = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : FALLBACK_ZONES;
  } catch {
    ids = FALLBACK_ZONES;
  }
  cachedEntries = ids.map((id) => {
    const cityLabel = cityLabelFromTimeZone(id);
    const genericLabel = friendlyTimeZoneGenericLabel(id);
    const offsetLabel = utcOffsetLabel(id);
    return { id, cityLabel, genericLabel, offsetLabel, searchText: `${id} ${cityLabel} ${genericLabel} ${offsetLabel}`.toLowerCase() };
  });
  return cachedEntries;
}

const FALLBACK_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** Ranked, filtered search — a real match on city/region/id/offset, city
 * matches first. Empty query returns every zone in a stable, offset-then-
 * city order so the closed-list default is still sensibly browsable. */
export function matchTimeZoneEntries(query: string): TimeZoneEntry[] {
  const entries = allTimeZoneEntries();
  const q = query.trim().toLowerCase();
  if (!q) return [...entries].sort((a, b) => a.offsetLabel.localeCompare(b.offsetLabel) || a.cityLabel.localeCompare(b.cityLabel));
  const cityMatches = entries.filter((e) => e.cityLabel.toLowerCase().startsWith(q));
  const otherMatches = entries.filter((e) => !cityMatches.includes(e) && e.searchText.includes(q));
  return [...cityMatches, ...otherMatches];
}
