// Training-adherence derivation — Phase 4 Required Derivation Correction #2:
// a justified skip is resolved (the client explained why) but that is NOT
// the same as training adherence. A skip always contributes zero adherence
// regardless of how good the reason was; a partial/ended-early session
// contributes its real completed/prescribed proportion when derivable.

import type { DailyRecord } from "./types";
import type { DomainOutcome } from "./derive-day-status";

export interface TrainingAdherenceResult {
  outcome: DomainOutcome;
  /** Completed/prescribed working sets, capped at 1. Null only when the day
   * wasn't a scheduled_workout day at all (not_applicable). */
  ratio: number | null;
  /** True when a skip or ended-early session carries an explicit client
   * reason — tracked separately from adherence itself, per the correction:
   * being "resolved with context" never inflates the adherence number. */
  resolvedWithContext: boolean;
}

export function deriveTrainingAdherence(record: DailyRecord): TrainingAdherenceResult {
  const training = record.training;

  if (training.trainingDayType !== "scheduled_workout") {
    return { outcome: "not_applicable", ratio: null, resolvedWithContext: false };
  }

  const prescribed = training.workingSetsPrescribed;
  const completed = training.workingSetsCompleted;
  const ratio = prescribed > 0 ? Math.min(1, completed / prescribed) : 0;
  const resolvedWithContext =
    (training.sessionStatus === "skipped" || training.sessionStatus === "ended-early") && !!training.skipReason;

  if (ratio >= 1) return { outcome: "complete", ratio: 1, resolvedWithContext };
  if (ratio > 0) return { outcome: "partial", ratio, resolvedWithContext };
  return { outcome: "missed", ratio: 0, resolvedWithContext };
}
