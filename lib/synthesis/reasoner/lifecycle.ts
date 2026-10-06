// Gate 4.0C-5 — the proposal lifecycle under a changing authoritative state.
//
//   A Reasoner draft is the current best solution ONLY for the planning
//   state it was solved under (run.planningState — derived from the run's
//   own snapshots for older runs). When the client's material state changes:
//
//   current     — same planning-state key: nothing to do.
//   unaffected  — the key changed but nothing the plan relies on did
//                 (e.g. a restriction that hits no planned exercise, a
//                 schedule change the plan still fits): revalidate only.
//   loosened    — something became newly available (restriction removed,
//                 exercise cleared, equipment added): the draft stays valid;
//                 a better plan MAY be possible — offered, never automatic.
//   superseded  — an assumption or the objective changed: a planned exercise
//                 is now excluded / uncertain / unavailable, the schedule no
//                 longer fits, the goal or the coach's method changed, or an
//                 exercise the plan was solved with is now excluded and the
//                 draft's local accommodation left a real consequence. The
//                 draft stays immutable for the record; the next proposal is
//                 a fresh Reasoner solve from the CURRENT state (never a
//                 patch of this one), saved as the next version of the same
//                 program.
//
// Pure (no I/O): the production actions supply the run, the draft and the
// current state; tests drive it offline.

import { demandCompatibility, eligibilityBasis, exerciseEligibility } from "../exercise-eligibility.ts";
import type { ConstraintSet } from "../constraints.ts";
import type { ClientState } from "../client-state.ts";
import type { GoalContract } from "../goal-contract.ts";
import type { FitnessKnowledgeRegistry, ExerciseEntry } from "../knowledge/types.ts";
import { resolveEquipmentAccess, type EquipmentAccess } from "../planners/resistance/equipment-access.ts";
import { diffPlanningState, planningState, PART_LABEL, type PlanningState, type PlanningStateChange, type PlanningStatePart } from "../planning-state.ts";
import type { ReasonerRun } from "./run.ts";
import type { UniversalTrainingProgramContent } from "../../training/types.ts";
import { isKnown } from "../facts.ts";
import { existedIn } from "../knowledge/history.ts";

export type LifecycleStatus = "current" | "unaffected" | "loosened" | "superseded";

export interface LifecycleHit {
  exerciseId: string;
  exerciseName: string;
  why: string;
  /** Still in the draft (true) or already removed from it (planned in the solve only). */
  inDraft: boolean;
}

export interface LifecycleAssessment {
  status: LifecycleStatus;
  solvedUnder: PlanningState;
  current: PlanningState;
  changes: PlanningStateChange[];
  /** Why the draft is superseded (plain language), empty otherwise. */
  reasons: string[];
  hits: LifecycleHit[];
  /** Exercises newly usable since the solve (loosened). */
  newlyAvailable: string[];
}

export interface CurrentPlanningInputs {
  client: ClientState;
  goal: GoalContract;
  constraints: ConstraintSet;
  coachMethodVersionId: string | null;
  knowledgeVersion: string;
}

const OBJECTIVE: PlanningStatePart[] = ["goal", "method"];
const FEASIBILITY: PlanningStatePart[] = ["restrictions", "exerciseFit", "equipment", "knowledge"];

/** The planning state a run solved under: recorded on new runs; derived from the run's own snapshots for older ones. */
export function solvedUnderState(run: ReasonerRun, knowledge: FitnessKnowledgeRegistry): PlanningState {
  return (
    run.planningState ??
    planningState({ client: run.snapshots.clientState, goal: run.snapshots.goalContract, constraints: run.snapshots.constraintSet, coachMethodVersionId: run.versions.coachMethod?.versionId ?? null, knowledgeVersion: run.versions.knowledge, exerciseName: (id) => knowledge.getExercise(id)?.name ?? id })
  );
}

export function currentPlanningState(cur: CurrentPlanningInputs, knowledge: FitnessKnowledgeRegistry): PlanningState {
  return planningState({ ...cur, exerciseName: (id) => knowledge.getExercise(id)?.name ?? id });
}

function namesIn(content: UniversalTrainingProgramContent): Set<string> {
  const out = new Set<string>();
  for (const w of content.weeks) for (const d of w.days) for (const s of d.sessions ?? []) for (const b of s.blocks) for (const i of b.items) out.add(i.name.toLowerCase());
  return out;
}

/** Only a CONFIRMED absence makes a planned exercise unavailable; unknown equipment never supersedes a draft. */
const equipmentProblem = (ex: ExerciseEntry, access: EquipmentAccess | null): string | null => {
  if (!access) return null;
  if (access.equipment[ex.equipment] !== "available") return `needs ${ex.equipment.replace(/_/g, " ")}, which isn't available`;
  const missing = ex.apparatus.find((a) => access.apparatus[a] === "unavailable");
  return missing ? `needs a ${missing.replace(/_/g, " ")}, which isn't available` : null;
};

/** Fit + availability of one exercise under the CURRENT state ("ok" | why it no longer fits). */
export function currentFit(ex: ExerciseEntry, constraints: ConstraintSet, access: EquipmentAccess | null): { state: "ok" | "incompatible" | "uncertain" | "unavailable"; why: string; basis: string } {
  const elig = exerciseEligibility(ex, constraints);
  const basis = eligibilityBasis(elig);
  const compat = demandCompatibility(elig);
  if (compat === "incompatible") return { state: "incompatible", why: elig.violations.some((v) => v.reason === "excluded by the coach") ? "you excluded it for this client" : `conflicts with the confirmed restrictions (${[...new Set(elig.violations.filter((v) => v.enforcement === "hard").map((v) => v.reason.replace(/_/g, " ")))].join("; ")})`, basis };
  const eq = equipmentProblem(ex, access);
  if (eq) return { state: "unavailable", why: eq, basis };
  if (compat === "uncertain") return { state: "uncertain", why: "OPTIM can't confirm it fits the current confirmed restrictions", basis };
  return { state: "ok", why: "", basis };
}

/** The eligible candidate space under the CURRENT state, the way the planner builds it (equipment and apparatus must be
 * known-available, constraint-eligible, rep-prescribed) — for current-state adequacy. */
export function currentCandidatePool(knowledge: FitnessKnowledgeRegistry, constraints: ConstraintSet, client: ClientState): { pool: ExerciseEntry[]; loadConditions: Map<string, ReturnType<typeof exerciseEligibility>["loadConditions"]> } {
  const access = resolveEquipmentAccess(client);
  const pool: ExerciseEntry[] = [];
  const loadConditions = new Map<string, ReturnType<typeof exerciseEligibility>["loadConditions"]>();
  for (const e of knowledge.exercises()) {
    if (!e.prescription.includes("reps")) continue;
    if (access && (access.equipment[e.equipment] !== "available" || e.apparatus.some((a) => access.apparatus[a] !== "available"))) continue;
    const elig = exerciseEligibility(e, constraints);
    if (!elig.eligible) continue;
    pool.push(e);
    const hard = elig.loadConditions.filter((l) => l.enforcement === "hard");
    if (hard.length) loadConditions.set(e.id, hard);
  }
  return { pool, loadConditions };
}

/**
 * Assesses a Reasoner draft against the CURRENT authoritative state.
 * `openConsequence`: the draft currently has an unresolved program-integrity or adequacy problem (computed by the
 * review model) — decides whether a removed-but-planned exercise that is now excluded supersedes the draft.
 */
export function assessPlanningState(params: { run: ReasonerRun; content: UniversalTrainingProgramContent; current: CurrentPlanningInputs; knowledge: FitnessKnowledgeRegistry; openConsequence: boolean }): LifecycleAssessment {
  const { run, content, current, knowledge } = params;
  const solvedUnder = solvedUnderState(run, knowledge);
  const now = currentPlanningState(current, knowledge);
  const base = { solvedUnder, current: now, hits: [] as LifecycleHit[], newlyAvailable: [] as string[] };
  if (solvedUnder.key === now.key) return { ...base, status: "current", changes: [], reasons: [] };
  const changes = diffPlanningState(solvedUnder, now);
  const changed = new Set(changes.map((c) => c.part));
  const reasons: string[] = [];
  const line = (c: PlanningStateChange) => `${PART_LABEL[c.part]} changed${c.added.length || c.removed.length ? ` (${[...c.added.map((x) => `now: ${x}`), ...c.removed.map((x) => `was: ${x}`)].join("; ")})` : ""}.`;

  // Objective changed → the problem itself is different.
  for (const c of changes) if (OBJECTIVE.includes(c.part)) reasons.push(line(c));

  // Schedule: the draft's training days must still be available.
  if (changed.has("schedule")) {
    const days = isKnown(current.client.schedule.availableDays) ? new Set(current.client.schedule.availableDays.value) : null;
    const used = new Set(content.weeks.flatMap((w) => w.days.filter((d) => (d.sessions ?? []).length > 0).map((d) => d.dayOfWeek)));
    const outside = days ? [...used].filter((d) => !days.has(d as never)) : [];
    const cap = isKnown(current.client.schedule.maxSessionLength) && !current.client.schedule.maxSessionLength.value.openEnded ? current.client.schedule.maxSessionLength.value.minutes : null;
    const tooLong = cap ? content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).filter((s) => (s.estimatedDurationMin ?? 0) > cap))).length : 0;
    if (outside.length) reasons.push(`Training availability changed: the plan trains on ${outside.join(", ")}, which the client can no longer do.`);
    if (tooLong) reasons.push(`Training availability changed: sessions now must fit ${cap} min, and this plan's run longer.`);
  }

  // Feasibility: every exercise the plan was solved with, and every exercise in the draft now.
  const hits: LifecycleHit[] = [];
  if (FEASIBILITY.some((p) => changed.has(p))) {
    const access = resolveEquipmentAccess(current.client);
    const present = namesIn(content);
    const planned = new Set((run.result.plan?.sessions ?? []).flatMap((s) => s.exercises.map((e) => e.exerciseId)));
    const byName = new Map(knowledge.exercises().map((e) => [e.name.toLowerCase(), e]));
    const ids = new Set<string>([...planned, ...[...present].map((n) => byName.get(n)?.id).filter((x): x is string => !!x)]);
    const accepted = (content.reasonerProvenance?.decisionResolutions ?? []).filter((r) => r.resolution === "accepted_with_conditions" && r.fitBasis);
    for (const id of [...ids].sort()) {
      const ex = knowledge.getExercise(id);
      if (!ex) continue;
      const f = currentFit(ex, current.constraints, access);
      if (f.state === "ok") continue;
      // A draft-level acceptance under the same eligibility basis (pre-4.0C-5 drafts) still holds.
      if (f.state === "uncertain" && accepted.some((r) => r.exerciseId === id && r.fitBasis === f.basis)) continue;
      // Uncertain at solve time and planned under the legacy policy: not a CHANGE (the review's fit decision covers it).
      if (f.state === "uncertain" && solvedUncertain(run, id)) continue;
      hits.push({ exerciseId: id, exerciseName: ex.name, why: f.why, inDraft: present.has(ex.name.toLowerCase()) });
    }
    const inDraft = hits.filter((h) => h.inDraft);
    const removed = hits.filter((h) => !h.inDraft);
    if (inDraft.length) reasons.push(`${inDraft.map((h) => `${h.exerciseName} (${h.why})`).join("; ")} — still in this plan, so the plan no longer fits the client's current state.`);
    if (removed.length && params.openConsequence) reasons.push(`${removed.map((h) => `${h.exerciseName} (${h.why})`).join("; ")} — the plan was built around ${removed.length > 1 ? "them" : "it"}, and removing ${removed.length > 1 ? "them" : "it"} left the program short.`);
  }
  if (reasons.length) return { ...base, status: "superseded", changes, reasons, hits };

  // Loosened: exercises usable now that the solve couldn't use.
  if (FEASIBILITY.some((p) => changed.has(p))) {
    const access = resolveEquipmentAccess(current.client);
    const offered = new Set((run.input?.exercises ?? []).filter((r) => r.split("|").at(-1) !== "U").map((r) => r.split("|")[0]));
    const newly = knowledge
      .exercises()
      .filter((e) => !offered.has(e.id) && e.prescription.includes("reps") && currentFit(e, current.constraints, access).state === "ok" && (!access || e.apparatus.every((a) => access.apparatus[a] === "available")) && wasUnusable(e, run))
      .map((e) => e.name);
    if (newly.length) return { ...base, status: "loosened", changes, reasons: [], hits, newlyAvailable: newly };
  }
  return { ...base, status: "unaffected", changes, reasons: [], hits };
}

/** The exercise was offered as uncertain ("U") when the run solved (legacy policy). */
function solvedUncertain(run: ReasonerRun, id: string): boolean {
  return (run.input?.exercises ?? []).some((r) => r.startsWith(`${id}|`) && r.split("|").at(-1) === "U");
}

/** Under the solve's own state, the exercise was excluded, withheld, uncertain — or didn't exist in the knowledge the
 * run used (so "now usable" is a real change). */
function wasUnusable(e: ExerciseEntry, run: ReasonerRun): boolean {
  if (!existedIn(run.versions.knowledge, e.id)) return true;
  if (run.preflight?.withheld.includes(e.id)) return true;
  const snap = run.snapshots.constraintSet as ConstraintSet;
  const access = resolveEquipmentAccess(run.snapshots.clientState);
  // Specific apparatus that was unknown when the run solved (never planned around) counts as unusable then.
  if (access && e.apparatus.some((a) => access.apparatus[a] !== "available")) return true;
  return currentFit(e, snap, access).state !== "ok";
}

// ---------------------------------------------------------------------------
// Revision orchestration (pure decision; the production action performs it)
// ---------------------------------------------------------------------------

export type RevisionTrigger = "limitations_confirmed" | "fit_decision" | "preflight_answered" | "equipment_confirmed" | "coach_requested";

export interface RevisionJobRecord {
  jobId: string;
  status: "preparing" | "ready_for_review" | "needs_input" | "unsupported" | "failed";
  planningKey: string | null;
  supersedesVersionId: string | null;
  /** The Reasoner job whose draft lineage this revision supersedes (stable across the coach's local edits). */
  supersedesJobId: string | null;
}

export interface RevisionIntent {
  planningKey: string;
  supersedes: { versionId: string; jobId: string; programId: string } | null;
  trigger: RevisionTrigger;
  changes: PlanningStateChange[];
  reasons: string[];
  previousKey: string | null;
}

/**
 * Whether to queue ONE Reasoner revision now. Automatic triggers (a coach confirmation that changed the planning
 * state) queue only for a SUPERSEDED draft and never twice for the same state + draft — whatever happened to the
 * first attempt; retrying needs the coach's explicit request. Nothing ever queues while another job is preparing.
 */
export function decideRevision(params: { assessment: LifecycleAssessment; draftJobId: string; trigger: RevisionTrigger; jobs: RevisionJobRecord[] }): { queue: true } | { queue: false; reason: "not_material" | "already_prepared" | "in_flight" | "already_attempted" } {
  const { assessment, trigger, jobs } = params;
  if (jobs.some((j) => j.status === "preparing")) return { queue: false, reason: "in_flight" };
  const automatic = trigger !== "coach_requested";
  const material = assessment.status === "superseded" || (!automatic && assessment.status === "loosened");
  if (!material) return { queue: false, reason: "not_material" };
  // Same state + same superseded lineage (a local edit to the old draft doesn't make it "new").
  const same = jobs.filter((j) => j.planningKey === assessment.current.key && j.supersedesJobId === params.draftJobId);
  if (same.some((j) => j.status === "ready_for_review")) return { queue: false, reason: "already_prepared" };
  if (automatic && same.length) return { queue: false, reason: "already_attempted" };
  return { queue: true };
}

/** After the coach answered every preflight question, ONE generation for the new state (never twice per state). */
export function decideGenerationAfterPreflight(params: { currentKey: string; jobs: RevisionJobRecord[]; questionsLeft: number }): boolean {
  if (params.questionsLeft > 0) return false;
  if (params.jobs.some((j) => j.status === "preparing")) return false;
  return !params.jobs.some((j) => j.planningKey === params.currentKey);
}
