// Cardio-adherence derivation — Phase 4 Required Derivation Correction #4:
// a true partial state exists (not just complete/skipped); the completed/
// prescribed duration ratio is capped at full credit; a coach-approved
// alternative gets full credit measured against its OWN target duration
// (never the default option's target); a skip is always zero.

import type { DailyRecord } from "./types";
import type { DomainOutcome } from "./derive-day-status";

export interface CardioAdherenceResult {
  outcome: DomainOutcome;
  ratio: number;
}

export function deriveCardioAdherence(record: DailyRecord): CardioAdherenceResult {
  const cardio = record.cardio;

  if (cardio.status === "skipped" || cardio.status === "not-started") {
    return { outcome: "missed", ratio: 0 };
  }

  // Ratio is always against whichever option was actually used — a coach-
  // approved alternative's own (often shorter) target, never the default
  // option's — so choosing an approved alternative is never penalized.
  const target = cardio.selectedOptionSnapshot?.targetDurationMin ?? 0;
  const ratio = target > 0 ? Math.min(1, cardio.durationMin / target) : cardio.durationMin > 0 ? 1 : 0;

  if (cardio.status === "completed" || ratio >= 1) return { outcome: "complete", ratio: 1 };
  if (ratio > 0) return { outcome: "partial", ratio };
  return { outcome: "missed", ratio: 0 };
}
