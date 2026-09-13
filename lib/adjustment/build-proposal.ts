// Phase 10B — the one deterministic engine turning an eligible
// ClientStateFinding into a bounded, validated AdjustmentProposal (or,
// far more often, into an explained no_proposal — spec section 3/16).
//
// Deterministic first (spec section 15): every proposal here is built by
// composing EXISTING, already-tested pure primitives
// (applyTrainingItemPatch / convertTrainingDayToRest from Phase 8D,
// resolveExerciseFamily from Phase 9A, computeProgramPhases from Phase
// 5) — never a fresh regeneration, never an LLM call, never unrestricted
// program rewriting. Every adjusted draft is validated against the real
// universal grammar validator and the real safety-restriction check
// before ever being returned as a proposal (spec section 45/46) — an
// internally-invalid or restriction-conflicting draft never surfaces as
// actionable.
//
// Minimum-change principle (spec section 42/43): every adjustment type
// here touches exactly the affected day/exercise, only within the
// client's CURRENT periodization phase ("current_block" — see
// AdjustmentScope's own doc for why this is the only scope V1 ever
// produces) — never the whole remaining program, never unrelated
// content.

import { computeProgramPhases } from "../coach/program-periodization.ts";
import { resolveExerciseFamily } from "../patterns/exercise-family.ts";
import { applyTrainingItemPatch, convertTrainingDayToRest, findRestrictionConflicts, locateTrainingItem, type TrainingItemPath } from "../training/program-proposal-editing.ts";
import { validateUniversalTrainingProgramContent } from "../production/validation.ts";
import { resistanceExerciseSlug } from "../client-state/performance.ts";
import { localDateDayOfWeek } from "../shared/local-date.ts";
import { buildProposalSignature } from "./signature.ts";
import type { ClientStateFinding } from "../client-state/types.ts";
import type { RawObservation } from "../client-state/evidence.ts";
import type { UniversalTrainingProgramContent } from "../training/types.ts";
import type { DayOfWeek } from "../types.ts";
import type { CoachOperatingModel } from "../coach/operating-model.ts";
import type { ApplicableRule } from "../coach/rule-application.ts";
import type { AdjustmentChangeDescription, AdjustmentEngineResult, NoProposalReason } from "./types.ts";

export interface AdjustmentEngineParams {
  finding: ClientStateFinding;
  /** The exact same bounded evidence bundle Phase 9D analyzed this
   * finding from — reused here only to recover WHICH day/exercise the
   * finding's own supporting evidence points at (spec section 4: "evidence
   * is specific enough to justify the proposed direction"), never
   * re-interpreted into a new finding. */
  observations: RawObservation[];
  activeContent: UniversalTrainingProgramContent;
  activeProgramVersionId: string;
  com: CoachOperatingModel;
  applicableRules: ApplicableRule[];
  avoidedTerms: string[];
  /** Null when the client has no resolvable current program week (e.g. no
   * real enrollment) — every finding then degrades to no_active_program. */
  currentProgramWeek: number | null;
  clientProfileId: string;
}

function noProposal(reason: NoProposalReason, detail: string): AdjustmentEngineResult {
  return { outcome: "no_proposal", noProposal: { reason, detail } };
}

function resolveCurrentBlockWeeks(durationWeeks: number, currentWeek: number): number[] {
  const phases = computeProgramPhases(durationWeeks);
  const currentPhase = phases.find((p) => currentWeek >= p.startWeek && currentWeek <= p.endWeek) ?? phases[phases.length - 1];
  const weeks: number[] = [];
  for (let w = currentWeek; w <= currentPhase.endWeek; w++) weeks.push(w);
  return weeks;
}

function validateAdjustedDraft(content: UniversalTrainingProgramContent, avoidedTerms: string[]): { ok: true } | { ok: false; reason: NoProposalReason; detail: string } {
  try {
    validateUniversalTrainingProgramContent(content);
  } catch (err) {
    return { ok: false, reason: "invalid_adjusted_draft", detail: `The adjusted draft failed universal-grammar validation: ${err instanceof Error ? err.message : String(err)}` };
  }
  const conflicts = findRestrictionConflicts(content, avoidedTerms);
  if (conflicts.length > 0) return { ok: false, reason: "safety_restriction_conflict", detail: conflicts[0] };
  return { ok: true };
}

/** The dominant real calendar day-of-week among a finding's own
 * supporting evidence — null (never guessed) unless a clear majority
 * (>=60%, and at least 2 real occurrences) of the supporting misses share
 * the exact same day. A schedule-conflict finding whose misses are
 * scattered across different days is NOT specific enough to safely
 * convert any one day to rest (spec section 4). */
function deriveDominantDayOfWeek(finding: ClientStateFinding, observations: RawObservation[]): DayOfWeek | null {
  const supporting = observations.filter((o) => finding.supportingEvidenceRefs.includes(o.id));
  if (supporting.length === 0) return null;
  const counts = new Map<DayOfWeek, number>();
  for (const obs of supporting) {
    const dow = localDateDayOfWeek(obs.observedAtIso.slice(0, 10));
    counts.set(dow, (counts.get(dow) ?? 0) + 1);
  }
  let best: DayOfWeek | null = null;
  let bestCount = 0;
  for (const [dow, count] of counts) {
    if (count > bestCount) {
      best = dow;
      bestCount = count;
    }
  }
  if (!best || bestCount < 2 || bestCount < Math.ceil(supporting.length * 0.6)) return null;
  return best;
}

/** The real exercise-name slug the finding's own supporting evidence is
 * about — reuses the exact same deterministic id-parsing Phase 9D's own
 * comparability model already relies on (lib/client-state/performance.ts)
 * — never a new interpretation. */
function deriveAffectedExerciseSlug(finding: ClientStateFinding, observations: RawObservation[]): string | null {
  const supporting = observations.filter((o) => finding.supportingEvidenceRefs.includes(o.id));
  for (const obs of supporting) {
    const slug = resistanceExerciseSlug(obs.trainingItemInstanceId);
    if (slug) return slug;
  }
  return null;
}

function findItemPathBySlug(content: UniversalTrainingProgramContent, weekNumber: number, slug: string): TrainingItemPath | null {
  const week = content.weeks.find((w) => w.weekNumber === weekNumber);
  if (!week) return null;
  for (const day of week.days) {
    if (day.type !== "training") continue;
    for (const [sessionIndex, session] of (day.sessions ?? []).entries()) {
      for (const block of session.blocks) {
        for (const item of block.items) {
          if (item.category === "resistance" && resistanceExerciseSlug(item.id) === slug) {
            return { weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex, blockId: block.id, itemId: item.id };
          }
        }
      }
    }
  }
  return null;
}

function findContinuousItemPaths(content: UniversalTrainingProgramContent, weekNumber: number): TrainingItemPath[] {
  const week = content.weeks.find((w) => w.weekNumber === weekNumber);
  if (!week) return [];
  const paths: TrainingItemPath[] = [];
  for (const day of week.days) {
    if (day.type !== "training") continue;
    for (const [sessionIndex, session] of (day.sessions ?? []).entries()) {
      for (const block of session.blocks) {
        for (const item of block.items) {
          if (item.category === "continuous") paths.push({ weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex, blockId: block.id, itemId: item.id });
        }
      }
    }
  }
  return paths;
}

/** A real confirmed coach preference to reduce SETS (rather than
 * intensity) for this exercise's real movement-pattern family — refines
 * HOW the proposal is built (spec section 10/33), never whether one is
 * built at all. Matches on the resolved family when possible, or a
 * family-agnostic coach-general "reduce sets" preference otherwise —
 * never a client-specific rule for a DIFFERENT client (already
 * structurally impossible: applicableRules is pre-scoped to this exact
 * client, same as Phase 9C generation). */
function findVolumePreferenceRule(rules: ApplicableRule[], exerciseSlug: string): ApplicableRule | null {
  const itemFamily = resolveExerciseFamily(exerciseSlug.replaceAll("-", " "));
  return rules.find((r) => r.decisionType === "item_prescription_edited" && r.field === "sets" && r.direction === "decrease" && (itemFamily === null || r.itemFamily === itemFamily || r.itemFamily === null)) ?? null;
}

function buildScheduleRedistribution(finding: ClientStateFinding, ctx: AdjustmentEngineParams): AdjustmentEngineResult {
  if (finding.strength !== "strong") return noProposal("insufficient_evidence", "A schedule change is only proposed once the pattern is clearly established.");
  const dayOfWeek = deriveDominantDayOfWeek(finding, ctx.observations);
  if (!dayOfWeek) return noProposal("ambiguous_evidence", "Schedule-related misses don't consistently fall on the same day — OPTIM does not propose a specific schedule change without a clear pattern.");

  const scopeWeeks = resolveCurrentBlockWeeks(ctx.activeContent.durationWeeks, ctx.currentProgramWeek!);
  let adjusted = ctx.activeContent;
  const changeDescriptions: AdjustmentChangeDescription[] = [];
  for (const weekNumber of scopeWeeks) {
    const week = adjusted.weeks.find((w) => w.weekNumber === weekNumber);
    const day = week?.days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!day || day.type !== "training") continue;
    adjusted = convertTrainingDayToRest(adjusted, weekNumber, dayOfWeek);
    changeDescriptions.push({ weekNumber, dayOfWeek, description: `${dayOfWeek} converted to a rest day` });
  }
  if (changeDescriptions.length === 0) return noProposal("no_compatible_action", `${dayOfWeek} is already a rest day in the current block — the active program already accounts for this.`);

  const validation = validateAdjustedDraft(adjusted, ctx.avoidedTerms);
  if (!validation.ok) return noProposal(validation.reason, validation.detail);

  const rationale = `${finding.summary} OPTIM proposes converting ${dayOfWeek} to a rest day for the remainder of the current training block, rather than reducing your long-term progression target.`;
  const signature = buildProposalSignature({ clientProfileId: ctx.clientProfileId, activeProgramVersionId: ctx.activeProgramVersionId, findingDomain: finding.domain, findingType: finding.findingType, affectedTargetKey: dayOfWeek, direction: "convert_to_rest" });

  return {
    outcome: "proposal",
    proposal: { adjustmentType: "schedule_redistribution", scope: "current_block", rationale, content: adjusted, changeDescriptions, proposalSignature: signature, sourceFindingDomain: finding.domain, sourceFindingType: finding.findingType, sourceEvidenceRefs: finding.supportingEvidenceRefs, activeProgramVersionId: ctx.activeProgramVersionId, learnedRuleIdsUsed: [] },
  };
}

function buildResistanceAdjustment(finding: ClientStateFinding, ctx: AdjustmentEngineParams, mode: "prefer_volume" | "prefer_rule"): AdjustmentEngineResult {
  const slug = deriveAffectedExerciseSlug(finding, ctx.observations);
  if (!slug) return noProposal("ambiguous_evidence", "The affected exercise isn't clearly identifiable from the supporting evidence.");

  const anchorPath = findItemPathBySlug(ctx.activeContent, ctx.currentProgramWeek!, slug);
  if (!anchorPath) return noProposal("no_compatible_action", "The affected exercise is no longer part of the current program.");

  const ruleMatch = mode === "prefer_rule" ? findVolumePreferenceRule(ctx.applicableRules, slug) : null;
  const useVolume = mode === "prefer_volume" || ruleMatch !== null;

  const scopeWeeks = resolveCurrentBlockWeeks(ctx.activeContent.durationWeeks, ctx.currentProgramWeek!);
  let adjusted = ctx.activeContent;
  const changeDescriptions: AdjustmentChangeDescription[] = [];
  for (const weekNumber of scopeWeeks) {
    const path: TrainingItemPath = { ...anchorPath, weekNumber };
    const located = locateTrainingItem(adjusted, path);
    if (!located) continue;
    if (useVolume) {
      const currentSets = located.item.prescription.sets ?? 1;
      const nudged = Math.max(1, currentSets - 1);
      if (nudged < ctx.com.programArchitecture.setsPerExerciseMin) return noProposal("explicit_methodology_conflict", `Reducing sets below the coach's own configured minimum (${ctx.com.programArchitecture.setsPerExerciseMin}) is not proposed — explicit methodology takes priority.`);
      if (nudged === currentSets) continue;
      adjusted = applyTrainingItemPatch(adjusted, path, { sets: nudged });
      changeDescriptions.push({ weekNumber, dayOfWeek: anchorPath.dayOfWeek, description: `${located.item.name}: ${currentSets} sets → ${nudged} sets` });
    } else {
      const currentRpe = located.item.prescription.rpe ?? 7;
      const nudged = Math.max(6, currentRpe - 1) as typeof currentRpe;
      if (nudged === currentRpe) continue;
      adjusted = applyTrainingItemPatch(adjusted, path, { rpe: nudged });
      changeDescriptions.push({ weekNumber, dayOfWeek: anchorPath.dayOfWeek, description: `${located.item.name}: RPE ${currentRpe} → ${nudged}` });
    }
  }
  if (changeDescriptions.length === 0) return noProposal("no_compatible_action", "No real change was possible within the coach's own configured bounds for the current block.");

  const validation = validateAdjustedDraft(adjusted, ctx.avoidedTerms);
  if (!validation.ok) return noProposal(validation.reason, validation.detail);

  const readableName = slug.replaceAll("-", " ");
  const rationale = useVolume
    ? `${finding.summary} OPTIM proposes reducing ${readableName} volume for the remainder of the current block${ruleMatch ? ", consistent with your confirmed preference to reduce volume before intensity" : ""}.`
    : `${finding.summary} OPTIM proposes reducing the target RPE for ${readableName} for the remainder of the current block.`;
  const signature = buildProposalSignature({ clientProfileId: ctx.clientProfileId, activeProgramVersionId: ctx.activeProgramVersionId, findingDomain: finding.domain, findingType: finding.findingType, affectedTargetKey: slug, direction: useVolume ? "reduce_sets" : "reduce_rpe" });

  return {
    outcome: "proposal",
    proposal: {
      adjustmentType: useVolume ? "volume_reduction" : "intensity_reduction",
      scope: "current_block",
      rationale,
      content: adjusted,
      changeDescriptions,
      proposalSignature: signature,
      sourceFindingDomain: finding.domain,
      sourceFindingType: finding.findingType,
      sourceEvidenceRefs: finding.supportingEvidenceRefs,
      activeProgramVersionId: ctx.activeProgramVersionId,
      learnedRuleIdsUsed: ruleMatch ? [ruleMatch.id] : [],
    },
  };
}

function buildContinuousDurationReduction(finding: ClientStateFinding, ctx: AdjustmentEngineParams): AdjustmentEngineResult {
  const scopeWeeks = resolveCurrentBlockWeeks(ctx.activeContent.durationWeeks, ctx.currentProgramWeek!);
  let adjusted = ctx.activeContent;
  const changeDescriptions: AdjustmentChangeDescription[] = [];
  const DURATION_REDUCTION_SECONDS = 300;
  const MIN_DURATION_SECONDS = 300;
  for (const weekNumber of scopeWeeks) {
    for (const path of findContinuousItemPaths(adjusted, weekNumber)) {
      const located = locateTrainingItem(adjusted, path);
      if (!located || !located.item.prescription.duration) continue;
      const currentSeconds = located.item.prescription.duration.seconds;
      const nudged = Math.max(MIN_DURATION_SECONDS, currentSeconds - DURATION_REDUCTION_SECONDS);
      if (nudged === currentSeconds) continue;
      adjusted = applyTrainingItemPatch(adjusted, path, { durationSeconds: nudged });
      changeDescriptions.push({ weekNumber, dayOfWeek: path.dayOfWeek, description: `${located.item.name}: ${Math.round(currentSeconds / 60)} min → ${Math.round(nudged / 60)} min` });
    }
  }
  if (changeDescriptions.length === 0) return noProposal("no_compatible_action", "No continuous-training item in the current block could be safely reduced further.");

  const validation = validateAdjustedDraft(adjusted, ctx.avoidedTerms);
  if (!validation.ok) return noProposal(validation.reason, validation.detail);

  const rationale = `${finding.summary} OPTIM proposes reducing the target duration for the remainder of the current block, rather than assuming a motivation issue.`;
  const signature = buildProposalSignature({ clientProfileId: ctx.clientProfileId, activeProgramVersionId: ctx.activeProgramVersionId, findingDomain: finding.domain, findingType: finding.findingType, affectedTargetKey: "continuous", direction: "reduce_duration" });

  return {
    outcome: "proposal",
    proposal: { adjustmentType: "continuous_duration_reduction", scope: "current_block", rationale, content: adjusted, changeDescriptions, proposalSignature: signature, sourceFindingDomain: finding.domain, sourceFindingType: finding.findingType, sourceEvidenceRefs: finding.supportingEvidenceRefs, activeProgramVersionId: ctx.activeProgramVersionId, learnedRuleIdsUsed: [] },
  };
}

/** The one entry point: dispatches on domain + finding type to whichever
 * bounded V1 family (if any) applies — see this phase's own completion
 * report, "adaptation capability map," for the exhaustive finding-type →
 * outcome table this function implements. */
export function evaluateAdjustmentForFinding(ctx: AdjustmentEngineParams): AdjustmentEngineResult {
  const { finding } = ctx;
  if (ctx.currentProgramWeek === null) return noProposal("no_active_program", "No active program with a resolvable current week exists for this client.");
  if (finding.strength === "insufficient") return noProposal("insufficient_evidence", "Evidence strength is insufficient to justify any adjustment.");

  switch (finding.domain) {
    case "adherence": {
      if (finding.findingType === "isolated_disruption" || finding.findingType === "illness_related_disruption") {
        return noProposal("temporary_disruption", "This is a temporary, explained disruption — OPTIM does not propose a structural program change for a short-term event.");
      }
      if (finding.findingType === "stable_adherence") return noProposal("stable_or_normal", "Adherence is currently stable — no adjustment is needed.");
      if (finding.findingType === "recurring_unexplained_skips") return noProposal("ambiguous_evidence", "The reason for these misses isn't clearly established — OPTIM does not propose a specific structural change without a clear cause.");
      if (finding.findingType === "recurring_schedule_conflict") return buildScheduleRedistribution(finding, ctx);
      return noProposal("unsupported_finding_type", "This adherence finding type has no supported adjustment in the current product.");
    }
    case "training_performance": {
      if (finding.findingType === "performance_improving") return noProposal("stable_or_normal", "Performance is improving — OPTIM does not propose an automatic progression increase.");
      if (finding.findingType === "performance_stable" || finding.findingType === "insufficient_evidence") return noProposal("stable_or_normal", "Performance is stable — no adjustment is needed.");
      if (finding.findingType === "performance_inconsistent") return noProposal("ambiguous_evidence", "Performance direction is inconsistent — OPTIM does not propose a specific adjustment without a clear direction.");
      if (finding.findingType === "performance_declining") return buildResistanceAdjustment(finding, ctx, "prefer_rule");
      return noProposal("unsupported_finding_type", "This performance finding type has no supported adjustment in the current product.");
    }
    case "continuous_performance": {
      if (finding.findingType === "performance_improving" || finding.findingType === "performance_stable" || finding.findingType === "insufficient_evidence") return noProposal("stable_or_normal", "No adjustment is needed.");
      if (finding.findingType === "performance_inconsistent") return noProposal("ambiguous_evidence", "Continuous performance direction is inconsistent — OPTIM does not propose a specific adjustment without a clear direction.");
      if (finding.findingType === "performance_declining") return buildContinuousDurationReduction(finding, ctx);
      return noProposal("unsupported_finding_type", "This continuous-performance finding type has no supported adjustment in the current product.");
    }
    case "prescription_completion": {
      if (finding.findingType !== "repeated_under_completion") return noProposal("stable_or_normal", "No adjustment is needed.");
      const supporting = ctx.observations.filter((o) => finding.supportingEvidenceRefs.includes(o.id));
      const isContinuous = supporting.some((o) => o.metricKey === "performed_as_prescribed");
      return isContinuous ? buildContinuousDurationReduction(finding, ctx) : buildResistanceAdjustment(finding, ctx, "prefer_volume");
    }
    case "recovery":
      return noProposal("unsupported_finding_type", "No real recovery signal source exists yet — no adjustment is ever proposed from this domain.");
  }
}
