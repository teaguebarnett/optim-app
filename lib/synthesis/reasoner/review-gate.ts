// Gate 4.0C-4 (dogfood fixes) — the coach-review model and approval gate for
// Reasoner-prepared drafts, plus the client-facing serialization.
//
// Source of truth: the persisted ReasonerRun (reasoner_generation_jobs.run),
// linked from the draft by reasonerProvenance.jobId. Nothing is parsed from
// prose to decide what blocks approval.
//
//   BLOCKING_COACH_DECISION — an exercise whose constraint fit OPTIM could not
//     establish ("U" in the run's candidate rows) and that is still in the
//     draft. One decision per exercise, however many times it is mentioned.
//     Resolved only by an explicit, persisted coach action: accept under the
//     stated conditions, or remove/replace it (it is then absent from the draft).
//     Approve is never an implicit resolution.
//   NON_BLOCKING — acknowledgements (e.g. a blocked goal lift), method
//     tensions and information. Shown, never blocking.
//
// Client copy: approval publishes a client-facing version — execution
// guidance only; all reasoning, review language and provenance stay in the
// coach's reviewed draft (staff-only history).

import { LOADED_DEMAND_CONDITION, type FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import { MUSCLES } from "../knowledge/taxonomy.ts";
import type { ReasonerRun } from "./run.ts";
import type { DecisionResolution, ReasonerProvenance, RepairRecommendationRecord, UniversalTrainingProgramContent } from "../../training/types.ts";
import { analyzeProgramIntegrity, type IntegrityAnalysis } from "./edit-impact.ts";
import { demandCompatibility, exerciseEligibility, type ExerciseEligibility } from "../exercise-eligibility.ts";
import { effectiveConstraints, type ConstraintSet } from "../constraints.ts";
import { canonicalJson, sha256 } from "./run.ts";

/** The restriction facts in force (effective hard constraints' categories and tags), independent of ids/timestamps. */
export function constraintFingerprint(cs: ConstraintSet): string {
  return sha256(effectiveConstraints(cs).filter((c) => c.enforcement === "hard").map((c) => `${c.category}:${c.confirmation}:${c.tags.map((t) => canonicalJson(t)).sort().join(",")}`).sort());
}

/** Stable fingerprint of an exercise's eligibility (what blocks it, under which conditions). */
export function eligibilityBasis(e: ExerciseEligibility): string {
  return sha256({ v: e.violations.filter((x) => x.enforcement === "hard").map((x) => x.reason).sort(), l: e.loadConditions.filter((x) => x.enforcement === "hard").map((x) => `${x.demand}:${x.limit}:${x.certainty}`).sort() });
}
const plainReason = (r: string) => r.replace(/^movement pattern (\w+)$/, (_m, p: string) => `${p.replace(/_/g, " ")} pattern`).replace(/ \(limit: below (\w+)\)$/, (_m, l: string) => ` — limit is below ${l}`).replace(/_/g, " ");
import { describeConfirmedRestrictions, plainLanguage } from "./to-program.ts";
export { describeConfirmedRestrictions };

export type FitDecisionStatus = "unresolved" | "accepted_with_conditions" | "removed" | "removed_by_edit";

export interface FitDecision {
  kind: "BLOCKING_COACH_DECISION";
  key: string;
  exerciseId: string;
  exerciseName: string;
  /** Against the CURRENT confirmed restrictions: uncertain (keep-under-conditions or remove), incompatible
   * (remove/replace only — confirmed restrictions are authoritative), unverifiable (not in Fitness Knowledge). */
  fit: "uncertain" | "incompatible" | "unverifiable";
  /** Fingerprint of this exercise's eligibility under the current restrictions; an acceptance recorded under a
   * different basis is stale and reopens. */
  fitBasis: string;
  /** The confirmed restriction it may not fit, in plain language. */
  restriction: string;
  /** What staying submaximal requires — necessary, not proof of fit. */
  conditions: string[];
  status: FitDecisionStatus;
  resolution: DecisionResolution | null;
}

/** A post-edit program-integrity consequence (one per distinct set of lost functions — deduplicated). */
export interface IntegrityDecision {
  kind: "BLOCKING_COACH_DECISION";
  key: string;
  analysis: IntegrityAnalysis;
  /** OPTIM's latest repair recommendation for exactly this consequence (stale ones are ignored). */
  recommendation: RepairRecommendationRecord | null;
  status: "unresolved" | "accepted_tradeoff";
  resolution: DecisionResolution | null;
}

export interface ReviewNote {
  kind: "acknowledgement" | "method_tension" | "information";
  text: string;
}

export interface ReasonerReviewModel {
  headline: string;
  /** False when the run record couldn't be loaded — approval then fails closed. */
  available: boolean;
  /** The confirmed restrictions changed since OPTIM prepared the draft — it was revalidated against the current ones. */
  constraintsChanged: boolean;
  decisions: FitDecision[];
  /** Post-edit consequence of the coach's changes vs the generated plan (null when nothing meaningful was lost). */
  integrity: IntegrityDecision | null;
  /** Every explicit coach resolution so far, oldest first (provenance). */
  history: DecisionResolution[];
  unresolvedCount: number;
  approvalBlockedReason: string | null;
  needsYou: ReviewNote[];
  worthKnowing: string[];
  handled: string[];
  why: ReasonerProvenance["decisions"];
  reference: { runId: string; reasonerVersion: string; promptVersion: string; knowledgeVersion: string };
}

const fitCodeOf = (row: string) => row.split("|").at(-1);

/** All item names in the draft (every week/day/session). */
function namesInContent(content: UniversalTrainingProgramContent): Set<string> {
  const names = new Set<string>();
  for (const w of content.weeks) for (const d of w.days) for (const s of d.sessions ?? []) for (const b of s.blocks) for (const i of b.items) names.add(i.name.toLowerCase());
  return names;
}

export function reasonerReviewModel(params: {
  content: UniversalTrainingProgramContent;
  run: ReasonerRun | null;
  knowledge: FitnessKnowledgeRegistry;
  /** The generated version 1 (immutable). Absent/identical = no edits yet. */
  original?: UniversalTrainingProgramContent | null;
  /** The CURRENT authoritative ConstraintSet (Gate 4.0C-4). The whole draft — every exercise, every week — is
   * revalidated against it. Absent = the run's own snapshot (no change known). */
  currentConstraints?: ConstraintSet | null;
}): ReasonerReviewModel {
  const rp = params.content.reasonerProvenance!;
  const reference = { runId: rp.runId, reasonerVersion: rp.reasonerVersion, promptVersion: rp.promptVersion, knowledgeVersion: rp.knowledgeVersion };
  const clean = (s: string) => plainLanguage(s).trim();
  // Never evaluate one client's draft against another client's restrictions (fail closed).
  const wrongClient = !!params.currentConstraints && !!params.run && params.currentConstraints.clientProfileId !== (params.run.snapshots.constraintSet as ConstraintSet).clientProfileId;
  if (!params.run?.input || !params.run.result.plan || wrongClient) {
    return { headline: rp.headline, available: false, constraintsChanged: false, decisions: [], integrity: null, history: rp.decisionResolutions ?? [], unresolvedCount: 0, approvalBlockedReason: "OPTIM couldn't load this proposal's review record, so it can't confirm nothing needs your decision. Reject it and prepare a new one.", needsYou: rp.needsYou.map((t) => ({ kind: "acknowledgement", text: clean(t) })), worthKnowing: rp.worthKnowing.map(clean), handled: rp.handled.map(clean), why: rp.decisions, reference };
  }
  const run = params.run;
  const plan = run.result.plan!;
  const input = run.input!;
  const planned = new Set(plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  const present = namesInContent(params.content);
  const resolutions = rp.decisionResolutions ?? [];
  const snapshot = run.snapshots.constraintSet as ConstraintSet;
  const constraints = params.currentConstraints ?? snapshot;
  // Changed = the restriction FACTS differ (re-confirming the same facts later isn't a change).
  const constraintsChanged = !!params.currentConstraints && constraintFingerprint(params.currentConstraints) !== constraintFingerprint(snapshot);
  const hasStructured = effectiveConstraints(constraints).some((c) => c.enforcement === "hard" && c.confirmation === "coach_confirmed" && c.tags.length > 0);
  const structuredBasis = sha256(effectiveConstraints(constraints).filter((c) => c.confirmation === "coach_confirmed").map((c) => c.tags));

  // FULL revalidation: every exercise in the current draft (all weeks/sessions — names dedupe repeats) against
  // the CURRENT restrictions, plus planned uncertain exercises the coach has since removed (kept for the record).
  const byName = new Map(params.knowledge.exercises().map((e) => [e.name.toLowerCase(), e]));
  const candidates = new Map<string, { id: string | null; name: string }>();
  for (const name of present) {
    const ex = byName.get(name);
    candidates.set(ex ? ex.id : `custom:${name}`, { id: ex?.id ?? null, name: ex?.name ?? name });
  }
  for (const row of input.exercises) {
    const id = row.split("|")[0];
    if (fitCodeOf(row) === "U" && planned.has(id) && !candidates.has(id)) candidates.set(id, { id, name: params.knowledge.getExercise(id)?.name ?? row.split("|")[1] });
  }
  // Exercises the coach already decided on stay visible (provenance), even once removed.
  for (const r of resolutions) {
    if (!r.key.startsWith("constraint_fit:")) continue;
    const id = r.key.slice("constraint_fit:".length);
    if (!candidates.has(id)) candidates.set(id, { id: id.startsWith("custom:") ? null : id, name: r.exerciseName });
  }
  const decidedKeys = new Set(resolutions.filter((r) => r.key.startsWith("constraint_fit:")).map((r) => r.key));
  const decisions: FitDecision[] = [];
  for (const [keyId, c] of candidates) {
    const isPresent = present.has(c.name.toLowerCase());
    const ex = c.id ? params.knowledge.getExercise(c.id) : undefined;
    let fit: FitDecision["fit"] | null = null;
    let restriction = "";
    let conditions: string[] = [];
    let fitBasis = "";
    if (ex) {
      const elig = exerciseEligibility(ex, constraints);
      const compat = demandCompatibility(elig);
      fitBasis = eligibilityBasis(elig);
      if (compat === "incompatible") {
        fit = "incompatible";
        restriction = `the client's confirmed restrictions (${[...new Set(elig.violations.filter((v) => v.enforcement === "hard").map((v) => plainReason(v.reason)))].join("; ")})`;
      } else if (compat === "uncertain") {
        fit = "uncertain";
        const lc = elig.loadConditions.find((l) => l.enforcement === "hard" && l.certainty === "uncertain")!;
        restriction = `your confirmed restriction (nothing needing ${lc.demand.replace(/_/g, " ")} at ${lc.limit} or above)`;
        conditions = lc.conditions;
      } else if (!isPresent && (fitCodeOf(input.exercises.find((r) => r.startsWith(`${keyId}|`)) ?? "") === "U" || decidedKeys.has(`constraint_fit:${keyId}`))) {
        // Removed earlier after a fit decision; under the current restrictions it would fit — keep the history row.
        fit = "uncertain";
        restriction = "your confirmed restriction";
        conditions = [`at least ${LOADED_DEMAND_CONDITION.minReps} reps per set`, `at least ${LOADED_DEMAND_CONDITION.minRir} reps in reserve`];
      }
    } else if (hasStructured && isPresent) {
      fit = "unverifiable";
      fitBasis = structuredBasis;
      restriction = "the client's confirmed restrictions (it isn't in OPTIM's exercise knowledge, so OPTIM can't check it)";
    }
    if (!fit) continue;
    const key = `constraint_fit:${keyId}`;
    const recorded = [...resolutions].reverse().find((r) => r.key === key && (r.resolution === "accepted_with_conditions" || r.resolution === "removed")) ?? null;
    let status: FitDecisionStatus;
    if (!isPresent) status = recorded?.resolution === "removed" ? "removed" : "removed_by_edit";
    else if (recorded?.resolution === "accepted_with_conditions" && fit !== "incompatible") {
      // Valid only under the same eligibility basis it was accepted under (legacy records: the run's snapshot basis).
      const acceptedBasis = recorded.fitBasis ?? (ex ? eligibilityBasis(exerciseEligibility(ex, snapshot)) : "");
      status = acceptedBasis === fitBasis ? "accepted_with_conditions" : "unresolved";
    } else status = "unresolved"; // never resolved, removed-then-re-added, or now incompatible
    decisions.push({ kind: "BLOCKING_COACH_DECISION", key, exerciseId: c.id ?? keyId, exerciseName: c.name, fit, fitBasis, restriction, conditions, status, resolution: status === "unresolved" ? null : recorded });
  }
  const unresolved = decisions.filter((d) => d.status === "unresolved");

  // Post-edit program integrity: what the coach's changes removed from the generated plan's intent.
  let integrity: IntegrityDecision | null = null;
  if (params.original && params.original !== params.content) {
    const analysis = analyzeProgramIntegrity({ original: params.original, current: params.content, run, knowledge: params.knowledge, constraints });
    if (analysis.key) {
      const tradeoff = [...resolutions].reverse().find((r) => r.key === analysis.key && r.resolution === "accepted_tradeoff") ?? null;
      // A conscious tradeoff stays valid only while the program is no worse than when it was accepted.
      const stillValid = !!tradeoff?.tradeoff && analysis.deficiencies.every((d) => (tradeoff.tradeoff!.find((t) => t.dimension === `${d.dimension.kind}:${d.dimension.id}`)?.minAfter ?? Infinity) <= d.minAfter);
      const recommendation = [...(rp.repairRecommendations ?? [])].reverse().find((x) => x.key === analysis.key) ?? null;
      integrity = { kind: "BLOCKING_COACH_DECISION", key: analysis.key, analysis, recommendation, status: stillValid ? "accepted_tradeoff" : "unresolved", resolution: stillValid ? tradeoff : null };
    }
  }
  const integrityOpen = integrity?.status === "unresolved";

  const mentionsDecision = (t: string) => decisions.some((d) => t.toLowerCase().includes(d.exerciseName.toLowerCase()));
  const needsYou: ReviewNote[] = rp.needsYou
    .filter((t) => !mentionsDecision(t)) // the decision card represents it once
    .map((t) => clean(t))
    .map((text): ReviewNote => ({ kind: /^Tension with your method|Coach method tension/i.test(text) ? "method_tension" : /still stands, but direct/.test(text) ? "acknowledgement" : "information", text }));
  const restrictionsLine = describeConfirmedRestrictions(input.constraints.flatMap((c) => c.rules));
  const handled = rp.handled.map((t) => (/^Your confirmed restrictions/.test(t) ? restrictionsLine : clean(t)));

  return {
    headline: rp.headline,
    available: true,
    constraintsChanged,
    decisions,
    integrity,
    history: resolutions,
    unresolvedCount: unresolved.length + (integrityOpen ? 1 : 0),
    approvalBlockedReason:
      [
        unresolved.length ? `Decide first: ${unresolved.map((d) => d.exerciseName).join(", ")} — ${unresolved.some((d) => d.fit === "incompatible") ? "conflicts with or can't be confirmed against" : "OPTIM couldn't confirm it fits"} the client's confirmed restrictions.` : "",
        integrityOpen ? `Your changes left ${integrity!.analysis.deficiencies.map((d) => d.label.toLowerCase()).join(", ")} underrepresented — choose a replacement or accept the reduced stimulus.` : "",
      ]
        .filter(Boolean)
        .join(" ") || null,
    needsYou,
    worthKnowing: rp.worthKnowing.map(clean),
    handled,
    why: rp.decisions.map((d) => ({ ...d, decision: clean(d.decision), because: clean(d.because) })),
    reference,
  };
}

/** Removes every occurrence of an exercise from the draft (all weeks), refusing to empty a session. */
export function removeExerciseEverywhere(content: UniversalTrainingProgramContent, exerciseName: string): { ok: true; content: UniversalTrainingProgramContent; removed: number } | { ok: false; message: string } {
  const next = structuredClone(content);
  let removed = 0;
  const name = exerciseName.toLowerCase();
  for (const w of next.weeks)
    for (const d of w.days)
      for (const s of d.sessions ?? []) {
        const before = s.blocks.length;
        s.blocks = s.blocks.filter((b) => !b.items.some((i) => i.name.toLowerCase() === name));
        removed += before - s.blocks.length;
        if (!s.blocks.length) return { ok: false, message: `Removing ${exerciseName} would leave ${d.dayOfWeek} in week ${w.weekNumber} empty — edit that session instead.` };
        s.blocks.forEach((b, i) => (b.order = i + 1));
      }
  return removed ? { ok: true, content: next, removed } : { ok: false, message: `${exerciseName} isn't in this draft any more.` };
}

// ---------------------------------------------------------------------------
// Client-facing serialization
// ---------------------------------------------------------------------------

/** Words that must never reach a client's workout copy. */
const INTERNAL = /coach review|review|constraint|uncertain|conditional|\bfit\b|validator|reasoner|optim|provenance|restriction|flagged|sign-?off|\bK\b|\bU\b|\bC\d\b|phase|accumulation|intensification|re-?entry|progress:|sets [+-]?\d|RIR [+-]?\d,|anchor|submaximal only|deload trigger/i;

/** Every client-visible string in a program's content (names, focus, notes, cues). */
export function clientVisibleStrings(content: UniversalTrainingProgramContent): string[] {
  const out: string[] = [content.name];
  for (const w of content.weeks)
    for (const d of w.days)
      for (const s of d.sessions ?? []) {
        out.push(s.name, s.focus, s.coachNote ?? "", s.warmupOverview ?? "");
        for (const b of s.blocks) {
          out.push(b.name ?? "");
          for (const i of b.items) out.push(i.name, i.coachCue ?? "");
        }
      }
  return out.filter(Boolean);
}

export function findClientCopyLeaks(content: UniversalTrainingProgramContent): string[] {
  return [...new Set(clientVisibleStrings(content).filter((t) => INTERNAL.test(t)))];
}

/**
 * The version a client receives once the coach approves: identical training
 * (days, exercises, sets, reps, effort, rest), client-safe copy only. Coach
 * reasoning, review context, Reasoner provenance and planning commentary are
 * dropped (they remain in the reviewed draft, which clients never see).
 */
export function clientFacingProgramContent(params: { content: UniversalTrainingProgramContent; reviewedVersionId: string; knowledge: FitnessKnowledgeRegistry; supportedSetup: Set<string>; nowIso: string }): UniversalTrainingProgramContent {
  const c = structuredClone(params.content);
  const byName = new Map(params.knowledge.exercises().map((e) => [e.name.toLowerCase(), e]));
  for (const w of c.weeks)
    for (const d of w.days)
      for (const s of d.sessions ?? []) {
        const muscles = [...new Set(s.blocks.flatMap((b) => b.items.flatMap((i) => byName.get(i.name.toLowerCase())?.primaryMuscles ?? [])))].slice(0, 4);
        s.focus = muscles.length ? muscles.map((m) => (MUSCLES[m as keyof typeof MUSCLES]?.name ?? m.replace(/_/g, " ")).replace(/\s*\([^)]*\)/g, "")).join(" · ") : "Strength training";
        s.name = s.name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
        delete s.coachNote;
        for (const b of s.blocks)
          for (const i of b.items) {
            const p = i.prescription;
            const effort = typeof p.rir === "number" ? `Stop each set with about ${p.rir} rep${p.rir === 1 ? "" : "s"} left in the tank.` : typeof p.rpe === "number" ? `Stop each set with about ${10 - p.rpe} rep${10 - p.rpe === 1 ? "" : "s"} left in the tank (RPE ${p.rpe}).` : "";
            const setup = params.supportedSetup.has(i.name.toLowerCase()) ? "Keep your back or chest against the pad or bench the whole set." : "";
            const cue = [effort, setup].filter(Boolean).join(" ");
            if (cue) i.coachCue = cue;
            else delete i.coachCue;
          }
      }
  c.clientFacingFrom = { reviewedVersionId: params.reviewedVersionId, jobId: params.content.reasonerProvenance?.jobId ?? "" };
  c.id = c.id.replace(/^reasoner-/, "program-");
  delete c.reasonerProvenance;
  delete c.generationRationale;
  if (c.directionLabel) c.directionLabel = c.directionLabel.replace(/^Fitness Reasoner — /, "");
  if (c.generationInputs) {
    delete c.generationInputs.rationale;
    delete c.generationInputs.whyThisPlan;
  }
  c.updatedAtIso = params.nowIso;
  return c;
}

/** Exercise names whose conditional fit relies on the pad/bench (client setup cue). */
export function supportedSetupNames(run: ReasonerRun | null): Set<string> {
  return new Set((run?.input?.exercises ?? []).filter((row) => fitCodeOf(row) === "K").map((row) => row.split("|")[1].toLowerCase()));
}
