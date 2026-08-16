// Overall day-status derivation — Phase 4 Required Derivation Correction #1:
// a rest day's *type* (TrainingDayType, on the snapshot) is a separate axis
// from its *lifecycle* (open/closed, supplied by the caller — see below)
// and its *overall adherence status* (computed here). Nothing about a day's
// status is ever persisted on the DailyRecord itself — see lib/history/
// types.ts's module doc — so this always recomputes fresh from raw facts.

import type { DailyRecord, TrainingDayType } from "./types";
import { deriveTrainingAdherence } from "./derive-training-adherence.ts";
import { deriveMealPlanAdherence } from "./derive-nutrition.ts";
import { deriveCardioAdherence } from "./derive-cardio.ts";

export type DomainOutcome = "complete" | "partial" | "missed" | "insufficient_data" | "not_applicable";

/** "open" = today's still-live, not-yet-archived day (the caller is looking
 * at current AppState). "closed" = an archived DailyRecord read from the
 * HistoryStore. This is never stored on the record itself — a DailyRecord
 * only ever exists in the store once a day has actually been archived, so
 * lifecycle is inherent to *where the record came from*, not a field to
 * track redundantly. */
export type DayLifecycle = "open" | "closed";

export type OverallAdherenceStatus = "complete" | "partial" | "missed" | "in_progress" | "not_applicable";

export interface RequiredDomains {
  weight: boolean;
  nutrition: boolean;
  cardio: boolean;
  training: boolean;
}

/** Weight, nutrition, and cardio are tracked every day in this program;
 * training is only required on a day actually assigned a workout. Nothing
 * here varies by day-of-week or program phase beyond that — see the Phase
 * 4.1 report for why (no per-day domain opt-out exists in the live product
 * today). */
export function deriveRequiredDomains(trainingDayType: TrainingDayType): RequiredDomains {
  return { weight: true, nutrition: true, cardio: true, training: trainingDayType === "scheduled_workout" };
}

function weightOutcome(record: DailyRecord): DomainOutcome {
  return record.weight.weightLb !== null ? "complete" : "missed";
}

/**
 * `complete` requires every required domain fully complete. `missed`
 * requires every required domain to have genuinely zero completion. Every
 * other combination — some complete and some not, any domain merely
 * partial, a mix of complete/partial/missed — is `partial`. This three-way
 * partition (complete / missed / everything-else) is exhaustive and
 * gap-free, and is how this module resolves the spec's "at least one
 * domain has meaningful completion but at least one does not" wording for
 * the partial case — documented here as the resolved interpretation.
 *
 * For an "open" (still-live, not yet archived) day, `complete` is reported
 * the same way, but anything short of that is `in_progress` rather than
 * `partial`/`missed` — the day isn't over yet, so "missed" would be
 * premature and "partial" would misrepresent a day still being lived.
 */
export function deriveOverallAdherenceStatus(record: DailyRecord, lifecycle: DayLifecycle): OverallAdherenceStatus {
  const required = deriveRequiredDomains(record.training.trainingDayType);
  const outcomes: DomainOutcome[] = [];
  if (required.weight) outcomes.push(weightOutcome(record));
  if (required.nutrition) outcomes.push(deriveMealPlanAdherence(record).outcome);
  if (required.cardio) outcomes.push(deriveCardioAdherence(record).outcome);
  if (required.training) outcomes.push(deriveTrainingAdherence(record).outcome);

  if (outcomes.length === 0) return "not_applicable";
  if (outcomes.every((o) => o === "complete")) return "complete";
  if (lifecycle === "open") return "in_progress";
  if (outcomes.every((o) => o === "missed")) return "missed";
  return "partial";
}
