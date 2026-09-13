// Phase 9A — Shadow Coach Pattern Analysis.
//
// This is the ONE deterministic, structured-comparison engine this phase
// exists to build. It reads real, already-persisted coach_decision_evidence
// (Phase 8B/8C/8D) and produces PATTERN CANDIDATES — never rules, never
// confirmed methodology, never a mutation of anything.
//
// Non-negotiable (spec section 4/33-38, restated here so this file's own
// contract is unambiguous to any future reader):
//   - This module is READ-ONLY. It never writes to any table.
//   - It NEVER imports, is imported by, or otherwise influences universal
//     generation, program directions, CoachOperatingModel assembly, client
//     execution, forecasts, progression, coach review, or onboarding.
//   - It creates no persistence of its own (see this phase's completion
//     report section 13 for why a derived read model is sufficient).
//   - It never surfaces anything to a client.
//   - It never silently promotes a candidate to a rule — there is no such
//     concept anywhere in this file.
//   - It does not call an LLM. Every candidate here is the output of a
//     plain, auditable structured comparison over already-validated,
//     already-structured decision-evidence fields (spec section 5).
//
// Evidence capability map (spec section 3 — what real decision evidence
// exists today, and how this engine treats each type):
//
//   program_generated (outcome=approved|edited|rejected)
//     -> whole-program-level candidates only ("coach tends to approve
//        proposals unchanged", "coach tends to reject proposals citing
//        reason X"). proposedValue/chosenValue never carry item-level
//        content (just durationWeeks/directionLabel/rationale), so this
//        type can NEVER contribute item-level (sets/rpe/etc.) evidence —
//        a real, documented limitation, not a design choice (see this
//        phase's completion report section 21).
//   health_review_decision
//     -> EXCLUDED entirely from candidate generation (clinical judgment,
//        never methodology — spec section 15). Used ONLY as the source of
//        restriction-window context for excluding/flagging OTHER
//        decisions (see restriction-context.ts).
//   item_prescription_edited
//     -> item-level candidates per changed numeric field (sets, repsLow,
//        repsHigh, rpe, rir, loadValue, restSeconds, warmupSets) and a
//        separate "activityIdentity" substitution candidate when the
//        item's name itself changed (outcome=overridden).
//   continuous_item_edited
//     -> same treatment, continuous fields (durationSeconds, distanceValue,
//        heartRateLow, heartRateHigh, rpe, paceValue) plus
//        "activityIdentity" substitution.
//   training_item_removed / training_item_added
//     -> structural candidates grouped by resolved exercise family (or
//        exact name when unresolved). No linkage between a remove and a
//        later add is attempted — Phase 8D's remove/add actions are
//        independent decision instances with independent source_refs, so
//        a reliable "coach substitutes family X for family Y via
//        remove+add" candidate is NOT derivable without a fragile
//        same-session heuristic this phase deliberately does not invent
//        (spec section 5). True substitution evidence only comes from an
//        item_prescription_edited/continuous_item_edited row where the
//        item's own name changed (isSubstitution).
//   session_renamed
//     -> no structured, comparable field beyond a free-text name — no
//        candidate signal is ever extracted from this type.
//   training_day_converted_to_rest
//     -> one structural candidate ("coach converts training days to
//        rest"). The decision's own stored value never carries a
//        dayOfWeek (only proposedValue={dayType:"training"},
//        chosenValue={dayType:"rest"}) — a real dayOfWeek IS present in
//        the row's source_ref string, but source_ref is documented as an
//        idempotency-provenance pointer, not a stable public data
//        contract for semantic fields, so this engine does not parse it
//        for that purpose (documented limitation).
//   any structural-edit evidence with no numeric/qualitative field this
//   file recognizes -> silently contributes zero signals (never an error,
//   never a fabricated candidate).
//
// Reordering evidence (moveBlock/moveTrainingItem) produces NO decision
// evidence at all (Phase 8D's own deliberate scope boundary) — there is
// nothing for this engine to read there; see spec section 30.

import type { DecisionEvidenceRecord } from "../decisions/types.ts";
import type { CoachOperatingModel } from "../coach/operating-model.ts";
import { resolveExerciseFamily } from "./exercise-family.ts";
import { buildRestrictionWindows, isPossiblySafetyInfluenced } from "./restriction-context.ts";
import type { ContextSignature, EvidenceStrength, PatternAnalysisResult, PatternCandidate, PatternDirection, PatternScope } from "./types.ts";

// ---------------------------------------------------------------------------
// Eligibility / strength thresholds — conservative, documented, no fake
// precision (spec section 24). All raw decision counts, ratios of real
// evidence — never a statistical p-value or confidence interval, since
// nothing here is a statistical model.
// ---------------------------------------------------------------------------

/** Spec section 25: "two nearly identical decisions for one client should
 * still be treated cautiously" — 2 is not enough for ANY candidate,
 * client-specific or coach-general; 3 is the floor. */
export const MIN_SUPPORT_FOR_CANDIDATE = 3;

/** Spec section 8: raw repetition for ONE client, however large, is
 * client-specific evidence only — 2 distinct clients is the minimum to
 * even attempt calling something coach-general. */
export const MIN_DISTINCT_CLIENTS_FOR_COACH_GENERAL = 2;

/** support / (support + contradiction) must clear this ratio for a
 * direction to be considered genuinely dominant at all (spec tests F/G:
 * 6 supporting edits against 11 contradicting instances is 6/17 ≈ 0.35,
 * nowhere near dominant). Below this, no candidate is emitted for that
 * group, regardless of raw support count. */
export const MIN_DOMINANCE_RATIO_EMERGING = 0.7;

/** The higher bar "strong" requires, on top of MIN_SUPPORT_FOR_STRONG and
 * (for coach_general) MIN_DISTINCT_CLIENTS_FOR_STRONG_COACH_GENERAL. */
export const MIN_DOMINANCE_RATIO_STRONG = 0.85;
export const MIN_SUPPORT_FOR_STRONG = 6;
export const MIN_DISTINCT_CLIENTS_FOR_STRONG_COACH_GENERAL = 3;

/** Pure, directly testable strength derivation — exposed so the test
 * matrix can assert band boundaries without re-deriving a whole candidate.
 * "insufficient" is a real, reachable value here; analyzeCoachDecisionPatterns
 * never emits a candidate at that band (spec test A/B: zero/one decision
 * must never produce a candidate). */
export function deriveEvidenceStrength(scope: PatternScope, supportCount: number, contradictionCount: number, distinctClientCount: number): EvidenceStrength {
  if (supportCount < MIN_SUPPORT_FOR_CANDIDATE) return "insufficient";
  if (scope === "coach_general" && distinctClientCount < MIN_DISTINCT_CLIENTS_FOR_COACH_GENERAL) return "insufficient";
  const total = supportCount + contradictionCount;
  const ratio = total === 0 ? 1 : supportCount / total;
  if (ratio < MIN_DOMINANCE_RATIO_EMERGING) return "insufficient";
  const strongEligible = supportCount >= MIN_SUPPORT_FOR_STRONG && ratio >= MIN_DOMINANCE_RATIO_STRONG && (scope === "client_specific" || distinctClientCount >= MIN_DISTINCT_CLIENTS_FOR_STRONG_COACH_GENERAL);
  return strongEligible ? "strong" : "emerging";
}

// ---------------------------------------------------------------------------
// Signal extraction — turns ONE real decision-evidence row into zero or
// more comparable "signals." A signal is the smallest unit this engine
// groups and compares; one edit that changed both `sets` and `rpe`
// produces two independent signals, never one conflated one (spec section
// 13: "normalize structured deltas... do not compare arbitrary JSON
// strings").
// ---------------------------------------------------------------------------

interface Signal {
  evidenceId: string;
  clientProfileId: string;
  decidedAtIso: string;
  sourceRef: string;
  contextSignature: ContextSignature;
  direction: PatternDirection;
  /** The level-2 grouping key within a context-signature group — for
   * numeric fields this is "increase"/"decrease"; for qualitative signals
   * (substitution pair, family, approval outcome, rejection reason) it is
   * a real, deterministic identity string. Two signals in the same
   * context-signature group with the SAME comparisonKey support each
   * other; a DIFFERENT comparisonKey in the same group contradicts. */
  comparisonKey: string;
  /** Only set for a numeric-field signal — the real CHOSEN value (never
   * the proposed one), so a candidate can be checked against explicit
   * CoachOperatingModel bounds (spec section 19) using what the coach
   * actually picked, not what OPTIM proposed. */
  numericChosenValue?: number;
}

const RESISTANCE_NUMERIC_FIELDS = ["sets", "repsLow", "repsHigh", "rpe", "rir", "loadValue", "restSeconds", "warmupSets"] as const;
const CONTINUOUS_NUMERIC_FIELDS = ["durationSeconds", "distanceValue", "heartRateLow", "heartRateHigh", "rpe", "paceValue"] as const;

function numericDirection(from: number, to: number): "increase" | "decrease" | null {
  if (to > from) return "increase";
  if (to < from) return "decrease";
  return null;
}

/** Mechanically extracts the embedded program-version id from a source_ref
 * built by one of lib/decisions/types.ts's `buildProgramVersion*` helpers
 * — every one of those formats is `<prefix>:<versionId>:...`. This is
 * literally undoing a known, stable string-interpolation format (an ID
 * lookup), never an attempt to infer semantic meaning (contrast with why
 * this engine deliberately does NOT parse dayOfWeek out of a day-level
 * source_ref — see this file's header doc). Returns null for a
 * non-program-version source_ref (e.g. a health-review decision's). */
function extractVersionId(sourceRef: string): string | null {
  if (!sourceRef.startsWith("program_version")) return null;
  const parts = sourceRef.split(":");
  return parts[1] ?? null;
}

function extractSignals(decision: DecisionEvidenceRecord): Signal[] {
  const base = { evidenceId: decision.id, clientProfileId: decision.clientProfileId, decidedAtIso: decision.decidedAtIso, sourceRef: decision.sourceRef };
  const signals: Signal[] = [];

  if (decision.decisionType === "item_prescription_edited" || decision.decisionType === "continuous_item_edited") {
    const isContinuous = decision.decisionType === "continuous_item_edited";
    const proposed = decision.proposedValue ?? {};
    const chosen = decision.chosenValue ?? {};
    const identityField = isContinuous ? "activityName" : "exerciseName";
    const family = resolveExerciseFamily((chosen[identityField] as string | undefined) ?? (proposed[identityField] as string | undefined));

    if (typeof proposed[identityField] === "string" && typeof chosen[identityField] === "string" && proposed[identityField] !== chosen[identityField]) {
      const fromFamily = resolveExerciseFamily(proposed[identityField] as string);
      const toFamily = resolveExerciseFamily(chosen[identityField] as string);
      const comparisonKey = fromFamily && toFamily ? `${fromFamily}->${toFamily}` : `${(proposed[identityField] as string).toLowerCase()}->${(chosen[identityField] as string).toLowerCase()}`;
      signals.push({
        ...base,
        contextSignature: { decisionDomain: decision.decisionDomain, decisionType: decision.decisionType, field: "activityIdentity", itemFamily: fromFamily },
        direction: "qualitative_change",
        comparisonKey,
      });
    }

    const numericFields = isContinuous ? CONTINUOUS_NUMERIC_FIELDS : RESISTANCE_NUMERIC_FIELDS;
    for (const field of numericFields) {
      const from = proposed[field];
      const to = chosen[field];
      if (typeof from !== "number" || typeof to !== "number") continue;
      const direction = numericDirection(from, to);
      if (!direction) continue;
      signals.push({
        ...base,
        contextSignature: { decisionDomain: decision.decisionDomain, decisionType: decision.decisionType, field, itemFamily: family },
        direction,
        comparisonKey: direction,
        numericChosenValue: to,
      });
    }
    return signals;
  }

  if (decision.decisionType === "training_item_removed") {
    const exerciseName = decision.proposedValue?.exerciseName;
    if (typeof exerciseName !== "string") return [];
    const family = resolveExerciseFamily(exerciseName);
    signals.push({
      ...base,
      contextSignature: { decisionDomain: decision.decisionDomain, decisionType: decision.decisionType, field: "itemRemoved", itemFamily: family },
      direction: "structural_remove",
      comparisonKey: family ?? exerciseName.toLowerCase(),
    });
    return signals;
  }

  if (decision.decisionType === "training_item_added") {
    const exerciseName = decision.chosenValue?.exerciseName;
    if (typeof exerciseName !== "string") return [];
    const family = resolveExerciseFamily(exerciseName);
    signals.push({
      ...base,
      contextSignature: { decisionDomain: decision.decisionDomain, decisionType: decision.decisionType, field: "itemAdded", itemFamily: family },
      direction: "structural_add",
      comparisonKey: family ?? exerciseName.toLowerCase(),
    });
    return signals;
  }

  if (decision.decisionType === "training_day_converted_to_rest") {
    signals.push({
      ...base,
      contextSignature: { decisionDomain: decision.decisionDomain, decisionType: decision.decisionType, field: "dayConvertedToRest", itemFamily: null },
      direction: "structural_day_to_rest",
      comparisonKey: "dayConvertedToRest",
    });
    return signals;
  }

  if (decision.decisionType === "program_generated") {
    // Whole-program approval-alignment signal — every real outcome
    // contributes (approved/edited/rejected), so an "approves unchanged"
    // candidate has real contradiction evidence to weigh against (edited
    // and rejected outcomes), never a synthesized "silent approval" the
    // stored value can't actually prove (see this file's header doc).
    signals.push({
      ...base,
      contextSignature: { decisionDomain: decision.decisionDomain, decisionType: decision.decisionType, field: "wholeProgramApproval", itemFamily: null },
      direction: decision.outcome === "approved" ? "whole_program_approved_unchanged" : "whole_program_rejected",
      comparisonKey: decision.outcome,
    });
    // Reason-specific rejection signal — only when a real structured quick
    // reason is present (spec section 29: never interpret free text; the
    // UI's reason dropdown is a small fixed vocabulary, so exact-match
    // grouping on it is a real structured comparison, not text inference).
    if (decision.outcome === "rejected" && decision.reason) {
      signals.push({
        ...base,
        contextSignature: { decisionDomain: decision.decisionDomain, decisionType: decision.decisionType, field: `wholeProgramRejection:${decision.reason}`, itemFamily: null },
        direction: "whole_program_rejected",
        comparisonKey: decision.reason,
      });
    }
    return signals;
  }

  return [];
}

function contextSignatureKey(sig: ContextSignature): string {
  return `${sig.decisionDomain}|${sig.decisionType}|${sig.field}|${sig.itemFamily ?? ""}`;
}

// ---------------------------------------------------------------------------
// Summary sentence — deterministically templated, never LLM-authored,
// always phrased as a candidate/tendency, never a settled rule (spec
// section 5/20).
// ---------------------------------------------------------------------------

function humanizeField(field: string): string {
  const known: Record<string, string> = {
    sets: "sets", repsLow: "the low end of the rep range", repsHigh: "the high end of the rep range", rpe: "target RPE", rir: "target RIR",
    loadValue: "load", restSeconds: "rest duration", warmupSets: "warm-up sets", durationSeconds: "duration", distanceValue: "distance",
    heartRateLow: "the low end of the heart-rate target", heartRateHigh: "the high end of the heart-rate target", paceValue: "pace",
  };
  return known[field] ?? field;
}

function buildSummary(scope: PatternScope, sig: ContextSignature, direction: PatternDirection, comparisonKey: string): string {
  const familyPart = sig.itemFamily ? ` for ${sig.itemFamily.replace(/_/g, " ")} exercises` : "";
  const who = scope === "coach_general" ? "Across multiple clients, this coach" : "For this client, this coach";
  switch (sig.field) {
    case "activityIdentity": {
      const [from, to] = comparisonKey.split("->");
      return `${who} has repeatedly substituted "${from}" with "${to}"${familyPart} (candidate, not a confirmed rule).`;
    }
    case "itemRemoved":
      return `${who} has repeatedly removed proposed exercises${familyPart} (candidate, not a confirmed rule).`;
    case "itemAdded":
      return `${who} has repeatedly added exercises${familyPart} not originally proposed (candidate, not a confirmed rule).`;
    case "dayConvertedToRest":
      return `${who} has repeatedly converted a proposed training day to rest (candidate, not a confirmed rule).`;
    case "wholeProgramApproval":
      return direction === "whole_program_approved_unchanged"
        ? `${who} has repeatedly approved generated proposals unchanged (candidate — evidence of alignment, not a confirmed rule).`
        : `${who} has repeatedly NOT approved generated proposals unchanged (candidate, not a confirmed rule).`;
    default: {
      if (sig.field.startsWith("wholeProgramRejection:")) {
        const reason = sig.field.split(":")[1];
        return `${who} has repeatedly rejected generated proposals citing "${reason}" (candidate, not a confirmed rule).`;
      }
      const dirWord = direction === "increase" ? "higher" : "lower";
      return `${who} tends to choose ${dirWord} ${humanizeField(sig.field)} than initially proposed${familyPart} (candidate, not a confirmed rule).`;
    }
  }
}

// ---------------------------------------------------------------------------
// Methodology-conflict check — narrow and deterministic (spec section 19).
// Only ever checked for a "sets" candidate against the coach's own
// explicit CoachOperatingModel.programArchitecture.setsPerExerciseMin/Max.
// This is NOT a general methodology-diff engine — every other field never
// sets this flag, and that absence must never be read as "no conflict
// exists," only "this narrow check doesn't apply here."
// ---------------------------------------------------------------------------

function checkMethodologyConflict(sig: ContextSignature, supportingChosenValues: number[], operatingModel: CoachOperatingModel | null | undefined): { conflicts: boolean; note: string | null } {
  if (sig.field !== "sets" || !operatingModel || supportingChosenValues.length === 0) return { conflicts: false, note: null };
  const { setsPerExerciseMin, setsPerExerciseMax } = operatingModel.programArchitecture;
  const outsideRange = supportingChosenValues.filter((v) => v < setsPerExerciseMin || v > setsPerExerciseMax).length;
  const conflicts = outsideRange > supportingChosenValues.length / 2;
  return {
    conflicts,
    note: conflicts
      ? `The majority of chosen "sets" values in this candidate's supporting evidence (${outsideRange}/${supportingChosenValues.length}) fall outside this coach's own explicit setsPerExerciseMin/Max range (${setsPerExerciseMin}-${setsPerExerciseMax}). This may mean a client-specific exception, evidence not yet sufficient, a philosophy change, or a current context that matters — it is not resolved automatically.`
      : null,
  };
}

// ---------------------------------------------------------------------------
// Main entry point.
// ---------------------------------------------------------------------------

export interface AnalyzeCoachDecisionPatternsParams {
  coachUserId: string;
  evidence: DecisionEvidenceRecord[];
  /** Optional — enables the narrow "sets" methodology-conflict check (spec
   * section 19). Never mutated; never required. */
  operatingModel?: CoachOperatingModel | null;
  /** Injectable for deterministic tests only — defaults to
   * `() => new Date().toISOString()`. */
  nowIso?: string;
}

function buildCandidatesForGroup(scope: PatternScope, clientProfileId: string | null, coachUserId: string, signals: Signal[], operatingModel: CoachOperatingModel | null | undefined): PatternCandidate | null {
  if (signals.length === 0) return null;
  const sig = signals[0].contextSignature;

  const byComparisonKey = new Map<string, Signal[]>();
  for (const s of signals) {
    const list = byComparisonKey.get(s.comparisonKey) ?? [];
    list.push(s);
    byComparisonKey.set(s.comparisonKey, list);
  }
  let dominantKey = "";
  let dominantList: Signal[] = [];
  for (const [key, list] of byComparisonKey) {
    if (list.length > dominantList.length) {
      dominantKey = key;
      dominantList = list;
    }
  }
  const contradicting = signals.filter((s) => s.comparisonKey !== dominantKey);

  const distinctClients = new Set(signals.map((s) => s.clientProfileId)).size;
  const strength = deriveEvidenceStrength(scope, dominantList.length, contradicting.length, distinctClients);
  if (strength === "insufficient") return null;

  const distinctVersions = new Set([...dominantList, ...contradicting].map((s) => extractVersionId(s.sourceRef)).filter((v): v is string => v !== null)).size;
  const allIso = signals.map((s) => s.decidedAtIso).sort();

  const numericChosenValues = dominantList.map((s) => s.numericChosenValue).filter((v): v is number => typeof v === "number");
  const direction = dominantList[0]?.direction ?? "qualitative_change";
  const { conflicts, note } = checkMethodologyConflict(sig, numericChosenValues, operatingModel);

  return {
    coachUserId,
    scope,
    clientProfileId,
    contextSignature: sig,
    direction,
    dominantComparisonKey: dominantKey,
    summary: buildSummary(scope, sig, direction, dominantKey),
    supportingEvidenceIds: dominantList.map((s) => s.evidenceId),
    contradictingEvidenceIds: contradicting.map((s) => s.evidenceId),
    supportCount: dominantList.length,
    contradictionCount: contradicting.length,
    distinctClientCount: distinctClients,
    distinctVersionCount: distinctVersions,
    firstObservedIso: allIso[0],
    lastObservedIso: allIso[allIso.length - 1],
    evidenceStrength: strength,
    conflictsWithExplicitMethodology: conflicts,
    methodologyConflictNote: note,
    possibleSafetyInfluence: false,
  };
}

export function analyzeCoachDecisionPatterns(params: AnalyzeCoachDecisionPatternsParams): PatternAnalysisResult {
  const { coachUserId, evidence, operatingModel } = params;
  const generatedAtIso = params.nowIso ?? new Date().toISOString();

  const mine = evidence.filter((e) => e.coachUserId === coachUserId);
  const restrictionWindows = buildRestrictionWindows(mine);

  const eligible = mine.filter((e) => e.decisionDomain !== "safety");
  const totalEvidenceExcludedFromAnalysis = mine.length - eligible.length;

  const safetyInfluenced = new Map<string, boolean>();
  for (const d of eligible) safetyInfluenced.set(d.id, isPossiblySafetyInfluenced(d, restrictionWindows));

  const allSignals: Signal[] = [];
  for (const d of eligible) allSignals.push(...extractSignals(d));

  const byContextKey = new Map<string, Signal[]>();
  for (const s of allSignals) {
    const key = contextSignatureKey(s.contextSignature);
    const list = byContextKey.get(key) ?? [];
    list.push(s);
    byContextKey.set(key, list);
  }

  const candidates: PatternCandidate[] = [];

  for (const [, groupSignals] of byContextKey) {
    // Coach-general: pool every client's signals for this context, EXCLUDING
    // anything possibly safety-influenced entirely (spec section 16 — not
    // merely flagged, removed from the coach-general pool).
    const generalPool = groupSignals.filter((s) => !safetyInfluenced.get(s.evidenceId));
    const generalCandidate = buildCandidatesForGroup("coach_general", null, coachUserId, generalPool, operatingModel);
    if (generalCandidate) candidates.push(generalCandidate);

    // Client-specific: one candidate per client, including
    // safety-influenced evidence but flagging it (spec section 16 — stays
    // included, never silently generalized).
    const byClient = new Map<string, Signal[]>();
    for (const s of groupSignals) {
      const list = byClient.get(s.clientProfileId) ?? [];
      list.push(s);
      byClient.set(s.clientProfileId, list);
    }
    for (const [clientProfileId, clientSignals] of byClient) {
      const clientCandidate = buildCandidatesForGroup("client_specific", clientProfileId, coachUserId, clientSignals, operatingModel);
      if (clientCandidate) {
        clientCandidate.possibleSafetyInfluence = clientSignals.some((s) => safetyInfluenced.get(s.evidenceId) === true);
        candidates.push(clientCandidate);
      }
    }
  }

  return {
    coachUserId,
    generatedAtIso,
    totalEvidenceConsidered: mine.length,
    totalEvidenceExcludedFromAnalysis,
    candidates,
  };
}
