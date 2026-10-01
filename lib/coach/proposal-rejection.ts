// Optional reasons a coach may give when rejecting a program proposal —
// shared by the reject form (components/coach/proposal-reject-form.tsx) and
// the server action that validates the submitted value.

export const REJECTION_REASONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "too_much_volume", label: "Too much volume" },
  { value: "wrong_exercise_selection", label: "Wrong exercise selection" },
  { value: "too_aggressive", label: "Too aggressive" },
  { value: "does_not_fit_schedule", label: "Doesn't fit schedule" },
  { value: "inputs_unverified", label: "Inputs unverified" },
  { value: "method_changed", label: "Prepared under a previous method" },
  { value: "other", label: "Other" },
];

/** A known reason, or undefined — blank or unrecognized values are simply
 * "no reason given", never an error (the reason is optional). */
export function parseRejectionReason(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  return REJECTION_REASONS.some((r) => r.value === raw) ? raw : undefined;
}
