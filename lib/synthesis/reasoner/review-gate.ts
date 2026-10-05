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
import type { DecisionResolution, ReasonerProvenance, UniversalTrainingProgramContent } from "../../training/types.ts";
import { describeConfirmedRestrictions, plainLanguage } from "./to-program.ts";
export { describeConfirmedRestrictions };

export type FitDecisionStatus = "unresolved" | "accepted_with_conditions" | "removed" | "removed_by_edit";

export interface FitDecision {
  kind: "BLOCKING_COACH_DECISION";
  key: string;
  exerciseId: string;
  exerciseName: string;
  /** The confirmed restriction it may not fit, in plain language. */
  restriction: string;
  /** What staying submaximal requires — necessary, not proof of fit. */
  conditions: string[];
  status: FitDecisionStatus;
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
  decisions: FitDecision[];
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

export function reasonerReviewModel(params: { content: UniversalTrainingProgramContent; run: ReasonerRun | null; knowledge: FitnessKnowledgeRegistry }): ReasonerReviewModel {
  const rp = params.content.reasonerProvenance!;
  const reference = { runId: rp.runId, reasonerVersion: rp.reasonerVersion, promptVersion: rp.promptVersion, knowledgeVersion: rp.knowledgeVersion };
  const clean = (s: string) => plainLanguage(s).trim();
  if (!params.run?.input || !params.run.result.plan) {
    return { headline: rp.headline, available: false, decisions: [], unresolvedCount: 0, approvalBlockedReason: "OPTIM couldn't load this proposal's review record, so it can't confirm nothing needs your decision. Reject it and prepare a new one.", needsYou: rp.needsYou.map((t) => ({ kind: "acknowledgement", text: clean(t) })), worthKnowing: rp.worthKnowing.map(clean), handled: rp.handled.map(clean), why: rp.decisions, reference };
  }
  const run = params.run;
  const plan = run.result.plan!;
  const input = run.input!;
  const planned = new Set(plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  const present = namesInContent(params.content);
  const resolutions = rp.decisionResolutions ?? [];
  const demandRule = input.constraints.flatMap((c) => c.rules.filter((r) => / demand at /.test(r)).map((r) => `${c.id}: ${r}`))[0] ?? "";
  const restriction = describeConfirmedRestrictions(demandRule ? [demandRule.split(": ")[1]] : []).replace(/^Your confirmed restrictions were applied exactly as confirmed — /, "your confirmed restriction (").replace(/\.$/, ")");

  // One decision per uncertain-fit exercise in the plan (dedupes every mention of it).
  const decisions: FitDecision[] = input.exercises
    .filter((row) => fitCodeOf(row) === "U" && planned.has(row.split("|")[0]))
    .map((row) => {
      const exerciseId = row.split("|")[0];
      const exerciseName = params.knowledge.getExercise(exerciseId)?.name ?? row.split("|")[1];
      const key = `constraint_fit:${exerciseId}`;
      const resolution = [...resolutions].reverse().find((r) => r.key === key) ?? null;
      const status: FitDecisionStatus = resolution ? resolution.resolution : present.has(exerciseName.toLowerCase()) ? "unresolved" : "removed_by_edit";
      return { kind: "BLOCKING_COACH_DECISION" as const, key, exerciseId, exerciseName, restriction, conditions: [`at least ${LOADED_DEMAND_CONDITION.minReps} reps per set`, `at least ${LOADED_DEMAND_CONDITION.minRir} reps in reserve`], status, resolution };
    });
  // An accepted exercise that was later removed is simply gone; a removed one that was re-added needs a decision again.
  for (const d of decisions) if (d.status === "removed" && present.has(d.exerciseName.toLowerCase())) d.status = "unresolved";
  const unresolved = decisions.filter((d) => d.status === "unresolved");

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
    decisions,
    unresolvedCount: unresolved.length,
    approvalBlockedReason: unresolved.length ? `Decide first: ${unresolved.map((d) => d.exerciseName).join(", ")} — OPTIM couldn't confirm ${unresolved.length === 1 ? "it fits" : "they fit"} the client's confirmed restrictions.` : null,
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
