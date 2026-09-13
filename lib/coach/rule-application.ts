// Phase 9C — deterministic, bounded application of ACTIVE, COACH-CONFIRMED
// learned rules (Phase 9B) to real universal program generation
// (universal-program-generation.ts). Pure and framework-independent — no
// Supabase import here; the server-only boundary that fetches real rules
// lives in lib/production/rule-resolution.ts, matching this codebase's
// established "pure logic here, server-only persistence there" split.
//
// FINAL GENERATION AUTHORITY HIERARCHY (spec section 2 — locked here, not
// re-derived elsewhere):
//   0. Hard safety/client constraints (avoidedTerms, equipment, available
//      days, session length) — enforced entirely UPSTREAM of this module,
//      in pickExercise/equipmentForClient/decideContinuousDays and the
//      split's own day/pattern assignment. This module only ever nudges a
//      NUMERIC field on an item that has ALREADY passed every hard
//      constraint — it has no way to violate one, because it never
//      chooses WHICH exercise/day/equipment is used.
//   1. Explicit CoachOperatingModel (methodology) — the base value every
//      nudge starts from is already methodology-derived (e.g. sets starts
//      from setsPerExerciseMin/Max); this module additionally refuses to
//      push a "sets" nudge outside that explicit range (see
//      applyResistanceRules's own doc).
//   2. Active, coach-confirmed learned rules (this module's own subject).
//   3. General OPTIM defaults — whatever the base computation already was
//      before any rule nudges it.
// UNCONFIRMED SHADOW PATTERNS ARE NOT IN THIS HIERARCHY AND NEVER REACH
// THIS MODULE — the only input type here is ApplicableRule, built from a
// real coach_learned_rules row (status='active'), never a PatternCandidate.
//
// Supported rule families (spec section 27/28 — honestly scoped down from
// what Phase 9B *can* produce to what this generator can *safely and
// deterministically apply* today, traced against the real generation code):
//   RESISTANCE: sets, repsLow, repsHigh, rpe, restSeconds, warmupSets.
//   CONTINUOUS: durationSeconds.
// Explicitly NOT applied (documented, not silently ignored — every
// unsupported rule still gets a real "unsupported_rule_family"
// diagnostic):
//   - resistance rir / loadValue: this generator never computes an `rir`
//     or `load` value at all (only `rpe` is set) — there is no
//     deterministic parameter to nudge.
//   - continuous distanceValue / heartRateLow / heartRateHigh / rpe /
//     paceValue: buildUniversalContinuousSessionForDay only ever produces
//     `duration` + a free-text `completionTarget` — none of these other
//     fields are generated at all today.
//   - activityIdentity (substitution): the split's own dayPatterns assign
//     a specific MovementPattern to each slot for a real structural reason
//     (see program-directions.ts's SPLIT_LIBRARY) — swapping in a
//     different-family exercise would silently break that design, not
//     just tweak a number. Not structurally safe to apply yet.
//   - itemRemoved / itemAdded: same reasoning — removing/adding a whole
//     exercise changes session STRUCTURE, which the split plan already
//     owns; a learned tendency here doesn't carry enough context to
//     override it safely.
//   - dayConvertedToRest: the confirmed rule's own stored value never
//     carries a dayOfWeek (see Phase 9A/9B's own documented limitation) —
//     there is no way to know WHICH day it should apply to.
//   - wholeProgramApproval / wholeProgramRejection:<reason>: spec section
//     29 — these are evidence of alignment/friction, never an executable
//     generation policy.
//
// Directional vs exact (spec section 17): every rule Phase 9B can
// currently produce is DIRECTIONAL ONLY — `behavior.comparisonKey` for a
// numeric field is always "increase"/"decrease", never a stored exact
// preferred value. This module therefore only ever implements a small,
// conservative, DOCUMENTED nudge in the confirmed direction — never
// "sets = 3" from a rule that only ever said "decrease". "Exact value"
// application is unreachable with today's rule data and is left for a
// future phase that captures a real preferredValue.

import { applyRpeOffset } from "./program-periodization.ts";
import type { RpeValue } from "../types";
import type { CoachOperatingModel } from "./operating-model.ts";

export type RuleDirection = "increase" | "decrease" | "qualitative_change" | "structural_add" | "structural_remove" | "structural_day_to_rest" | "whole_program_approved_unchanged" | "whole_program_rejected";

/** The trimmed, structural view of one real, active coach_learned_rules
 * row that generation actually needs — never the coach-facing summary
 * text (spec section 7: "do not re-parse human summaries... use the
 * machine-readable fields"). Built exclusively in
 * lib/production/rule-resolution.ts from a real row; nothing in this pure
 * module ever fabricates one. */
export interface ApplicableRule {
  id: string;
  scope: "coach_general" | "client_specific";
  clientProfileId: string | null;
  decisionDomain: string;
  decisionType: string;
  field: string;
  itemFamily: string | null;
  direction: RuleDirection;
}

export type SkippedRuleReason = "explicit_methodology_conflict" | "context_mismatch" | "unsupported_rule_family" | "outranked_by_more_specific_rule";

export interface SkippedRule {
  ruleId: string;
  reason: SkippedRuleReason;
}

/** Bounded, product-safe provenance for one generated proposal — never
 * chain-of-thought, never raw evidence dumps (spec section 14/30/39):
 * just which real confirmed rules were used, and which were considered
 * but not, with one honest categorical reason each. */
export interface RuleApplicationDiagnostics {
  appliedRuleIds: string[];
  skippedRules: SkippedRule[];
}

export function emptyDiagnostics(): RuleApplicationDiagnostics {
  return { appliedRuleIds: [], skippedRules: [] };
}

function dedupeSkipped(skipped: SkippedRule[]): SkippedRule[] {
  const seen = new Set<string>();
  const out: SkippedRule[] = [];
  for (const s of skipped) {
    const key = `${s.ruleId}:${s.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function mergeDiagnostics(entries: RuleApplicationDiagnostics[]): RuleApplicationDiagnostics {
  const appliedRuleIds = [...new Set(entries.flatMap((e) => e.appliedRuleIds))];
  const skippedRules = dedupeSkipped(entries.flatMap((e) => e.skippedRules));
  // A rule that was ever actually applied is never ALSO reported as
  // skipped — applied is the stronger, more useful signal, and a rule
  // legitimately applies to some items/weeks while its context simply
  // doesn't recur elsewhere (that's not a skip, it's just not relevant
  // there).
  return { appliedRuleIds, skippedRules: skippedRules.filter((s) => !appliedRuleIds.includes(s.ruleId)) };
}

/** Final reconciliation pass, called once after a whole program has
 * finished generating (spec section 39 — auditability for every real
 * active rule the coach brought into this generation run, not a
 * per-item×rule noise dump): any rule that survived precedence resolution
 * (so it WAS eligible to apply) but never actually matched any item in
 * this specific program — e.g. a "hinge exercises" rule when this cycle's
 * split never includes hinge work — is reported "context_mismatch" rather
 * than silently vanishing from the diagnostics entirely. */
export function reconcileContextMismatches(effectiveRules: ApplicableRule[], diagnostics: RuleApplicationDiagnostics): RuleApplicationDiagnostics {
  const accountedFor = new Set([...diagnostics.appliedRuleIds, ...diagnostics.skippedRules.map((s) => s.ruleId)]);
  const contextMismatches: SkippedRule[] = effectiveRules.filter((r) => !accountedFor.has(r.id)).map((r) => ({ ruleId: r.id, reason: "context_mismatch" as const }));
  return { appliedRuleIds: diagnostics.appliedRuleIds, skippedRules: [...diagnostics.skippedRules, ...contextMismatches] };
}

const SUPPORTED_RESISTANCE_FIELDS = new Set(["sets", "repsLow", "repsHigh", "rpe", "restSeconds", "warmupSets"]);
const SUPPORTED_CONTINUOUS_FIELDS = new Set(["durationSeconds"]);

function isSupportedField(decisionType: string, field: string): boolean {
  if (decisionType === "item_prescription_edited") return SUPPORTED_RESISTANCE_FIELDS.has(field);
  if (decisionType === "continuous_item_edited") return SUPPORTED_CONTINUOUS_FIELDS.has(field);
  return false;
}

/** Partitions the coach's real active applicable rules into ones this
 * generator can actually consume vs ones it honestly cannot yet — every
 * unsupported rule gets a real diagnostic (spec section 28: "leave the
 * confirmed rule stored but not generation-active yet... report it
 * honestly"), and client-specific rules always take precedence over a
 * coach-general rule addressing the exact same (decisionType, field,
 * itemFamily) context (spec section 13 case B) — resolved ONCE, up front,
 * so no per-item logic needs to re-derive precedence. */
export function resolveRulePrecedence(rules: ApplicableRule[]): { effective: ApplicableRule[]; skipped: SkippedRule[] } {
  const supported = rules.filter((r) => isSupportedField(r.decisionType, r.field));
  const unsupportedSkips: SkippedRule[] = rules.filter((r) => !isSupportedField(r.decisionType, r.field)).map((r) => ({ ruleId: r.id, reason: "unsupported_rule_family" as const }));

  const byContext = new Map<string, ApplicableRule[]>();
  for (const r of supported) {
    const key = `${r.decisionType}|${r.field}|${r.itemFamily ?? ""}`;
    const list = byContext.get(key) ?? [];
    list.push(r);
    byContext.set(key, list);
  }

  const effective: ApplicableRule[] = [];
  const precedenceSkips: SkippedRule[] = [];
  for (const [, group] of byContext) {
    const clientSpecific = group.filter((r) => r.scope === "client_specific");
    const coachGeneral = group.filter((r) => r.scope === "coach_general");
    if (clientSpecific.length > 0) {
      effective.push(...clientSpecific);
      for (const r of coachGeneral) precedenceSkips.push({ ruleId: r.id, reason: "outranked_by_more_specific_rule" });
    } else {
      effective.push(...coachGeneral);
    }
  }

  return { effective, skipped: [...unsupportedSkips, ...precedenceSkips] };
}

// ---------------------------------------------------------------------------
// Conservative, documented nudge magnitudes — small, safe, directional
// steps only. Never a large swing; never claims false precision about a
// magnitude Phase 9B never actually confirmed (spec section 17).
// ---------------------------------------------------------------------------

const NUDGE = {
  sets: 1,
  repsLow: 1,
  repsHigh: 1,
  rpeOffset: 1,
  restSeconds: 15,
  warmupSets: 1,
  durationSeconds: 300, // 5 minutes
} as const;

function findRuleFor(rules: ApplicableRule[], decisionType: string, field: string, itemFamily: string | null): ApplicableRule | null {
  return rules.find((r) => r.decisionType === decisionType && r.field === field && r.itemFamily === itemFamily) ?? null;
}

export interface ResistanceNudgeInput {
  sets: number;
  repsLow: number;
  repsHigh: number;
  rpe: RpeValue;
  restSeconds: number;
  warmupSets: number;
}

/** Applies every supported resistance-field rule matching this exact item
 * family to one item's already-methodology-derived base prescription
 * values. The "sets" field is the only one with a real explicit-methodology
 * bound to respect (ProgramArchitectureProfile.setsPerExerciseMin/Max) —
 * every other supported field has no corresponding explicit numeric bound
 * in CoachOperatingModel today, so there is nothing to conflict with there
 * (documented, not silently assumed safe). */
export function applyResistanceRules(base: ResistanceNudgeInput, itemFamily: string | null, rules: ApplicableRule[], com: CoachOperatingModel): { result: ResistanceNudgeInput; diagnostics: RuleApplicationDiagnostics } {
  const applied: string[] = [];
  const skipped: SkippedRule[] = [];
  const result = { ...base };

  const setsRule = findRuleFor(rules, "item_prescription_edited", "sets", itemFamily);
  if (setsRule && (setsRule.direction === "increase" || setsRule.direction === "decrease")) {
    const delta = setsRule.direction === "decrease" ? -NUDGE.sets : NUDGE.sets;
    const nudged = Math.max(1, result.sets + delta);
    const { setsPerExerciseMin, setsPerExerciseMax } = com.programArchitecture;
    if (nudged < setsPerExerciseMin || nudged > setsPerExerciseMax) {
      skipped.push({ ruleId: setsRule.id, reason: "explicit_methodology_conflict" });
    } else {
      result.sets = nudged;
      applied.push(setsRule.id);
    }
  }

  const repsLowRule = findRuleFor(rules, "item_prescription_edited", "repsLow", itemFamily);
  if (repsLowRule && (repsLowRule.direction === "increase" || repsLowRule.direction === "decrease")) {
    const delta = repsLowRule.direction === "decrease" ? -NUDGE.repsLow : NUDGE.repsLow;
    result.repsLow = Math.max(1, result.repsLow + delta);
    applied.push(repsLowRule.id);
  }

  const repsHighRule = findRuleFor(rules, "item_prescription_edited", "repsHigh", itemFamily);
  if (repsHighRule && (repsHighRule.direction === "increase" || repsHighRule.direction === "decrease")) {
    const delta = repsHighRule.direction === "decrease" ? -NUDGE.repsHigh : NUDGE.repsHigh;
    result.repsHigh = Math.max(result.repsLow + 1, result.repsHigh + delta);
    applied.push(repsHighRule.id);
  }

  const rpeRule = findRuleFor(rules, "item_prescription_edited", "rpe", itemFamily);
  if (rpeRule && (rpeRule.direction === "increase" || rpeRule.direction === "decrease")) {
    const offset = rpeRule.direction === "decrease" ? -NUDGE.rpeOffset : NUDGE.rpeOffset;
    result.rpe = applyRpeOffset(result.rpe, offset);
    applied.push(rpeRule.id);
  }

  const restRule = findRuleFor(rules, "item_prescription_edited", "restSeconds", itemFamily);
  if (restRule && (restRule.direction === "increase" || restRule.direction === "decrease")) {
    const delta = restRule.direction === "decrease" ? -NUDGE.restSeconds : NUDGE.restSeconds;
    result.restSeconds = Math.max(30, result.restSeconds + delta);
    applied.push(restRule.id);
  }

  const warmupRule = findRuleFor(rules, "item_prescription_edited", "warmupSets", itemFamily);
  if (warmupRule && (warmupRule.direction === "increase" || warmupRule.direction === "decrease")) {
    const delta = warmupRule.direction === "decrease" ? -NUDGE.warmupSets : NUDGE.warmupSets;
    result.warmupSets = Math.max(0, result.warmupSets + delta);
    applied.push(warmupRule.id);
  }

  return { result, diagnostics: { appliedRuleIds: applied, skippedRules: skipped } };
}

/** Continuous items have no real family taxonomy in this codebase (spec
 * section 12's hierarchy stops at "exact activity" for resistance only) —
 * every continuous rule this generator can apply is matched on
 * (decisionType, field) alone, with itemFamily always null. Since
 * generation currently produces exactly ONE continuous item per day
 * ("Easy Cardio"), applying a duration rule broadly here is not an
 * overgeneralization — it is the only continuous item there is. */
export function applyContinuousRules(baseDurationSeconds: number, rules: ApplicableRule[]): { durationSeconds: number; diagnostics: RuleApplicationDiagnostics } {
  const rule = findRuleFor(rules, "continuous_item_edited", "durationSeconds", null);
  if (!rule || (rule.direction !== "increase" && rule.direction !== "decrease")) {
    return { durationSeconds: baseDurationSeconds, diagnostics: emptyDiagnostics() };
  }
  const delta = rule.direction === "decrease" ? -NUDGE.durationSeconds : NUDGE.durationSeconds;
  const durationSeconds = Math.max(300, baseDurationSeconds + delta);
  return { durationSeconds, diagnostics: { appliedRuleIds: [rule.id], skippedRules: [] } };
}
