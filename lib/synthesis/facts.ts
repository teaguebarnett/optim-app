// Gate 4.0C-1 — a single fact about a client (or their goal), with where it
// came from. Missing stays missing: a fact the client never gave is
// { status: "missing" } — never 0, false, "normal", an average, or a
// default. Planners must handle "missing" explicitly (see readiness.ts).
//
// Pure types + tiny constructors. No React, no Supabase.

/** How a known fact was established. */
export type FactBasis =
  /** Recorded by an instrument or logged data (e.g. a logged weigh-in). */
  | "measured"
  /** The client said so (intake answers, check-ins). */
  | "client_reported"
  /** The coach recorded or confirmed it. Outranks client_reported. */
  | "coach_confirmed"
  /** Computed by OPTIM from other facts (see `derivedFrom`). */
  | "derived";

export interface FactSource {
  kind: "onboarding" | "health_review" | "coach_brain" | "client_profile" | "enrollment" | "derivation";
  /** Where exactly, e.g. "onboarding.your_week.availableDays". */
  ref: string;
  /** For derived facts: the refs it was computed from. */
  derivedFrom?: string[];
}

export type Fact<T> =
  | { status: "known"; value: T; basis: FactBasis; source: FactSource }
  | { status: "missing"; ref: string; note?: string };

export const known = <T>(value: T, basis: FactBasis, source: FactSource): Fact<T> => ({ status: "known", value, basis, source });
export const missing = <T = never>(ref: string, note?: string): Fact<T> => ({ status: "missing", ref, ...(note ? { note } : {}) });

export function isKnown<T>(fact: Fact<T>): fact is Extract<Fact<T>, { status: "known" }> {
  return fact.status === "known";
}

/** The value if known, otherwise undefined — never a substitute value. */
export function factValue<T>(fact: Fact<T>): T | undefined {
  return fact.status === "known" ? fact.value : undefined;
}
