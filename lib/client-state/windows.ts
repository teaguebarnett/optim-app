// Phase 9D — domain-appropriate analysis windows (spec section 24: "do not
// create one universal 7-day window; use bounded domain-appropriate
// windows and document them"). Every constant here is deliberately
// documented with WHY that window, not just what it is.

/** Acute-disruption window: "days," per spec section 24's own example.
 * Long enough to cover a real short illness/travel event without
 * requiring a full calendar week to have already passed, short enough
 * that it never blends into a genuine multi-week trend question. */
export const ADHERENCE_RECENT_WINDOW_DAYS = 14;

/** Adherence-trend baseline window immediately preceding the recent
 * window — six calendar weeks, matching this repo's own established
 * "recent activity" horizon elsewhere (lib/production/chat.ts's
 * RECENT_ACTIVITY_DAYS-style bounded lookback) and long enough to
 * distinguish "historically 95% adherent, this week 50%" from "six-week
 * gradual decline" (spec section 9's own required distinction). */
export const ADHERENCE_BASELINE_WINDOW_DAYS = 42;

/** Performance-trend lookback: "multiple comparable exposures," per spec
 * section 24 — long enough to accumulate several comparable exposures of
 * the same exercise/activity even at a typical 1-2x/week frequency,
 * bounded so a query never scans a client's entire lifetime (spec section
 * 35). */
export const PERFORMANCE_LOOKBACK_DAYS = 84;

/** The minimum number of genuinely comparable exposures before a
 * performance direction (improving/declining/stable/inconsistent) is ever
 * reported instead of insufficient_evidence — one or two data points is
 * normal variability, not a trend (spec section 11/N: "one high RPE does
 * not become trend"). */
export const PERFORMANCE_MIN_COMPARABLE_EXPOSURES = 3;
