// Gate 4.0C-4 — a PLANNED Fitness Reasoner result → the existing proposal
// content (UniversalTrainingProgramContent, schemaVersion 2), so the draft
// flows through OPTIM's existing review / edit / approve lifecycle unchanged.
//
// Pure and deterministic: every week's prescription comes from the already
// validated PlanSpecification (spec.resistance.weeks — computed from the
// structured phases), never re-derived here. The coach-facing review context
// is grouped NEEDS YOU / WORTH KNOWING / HANDLED; no raw model JSON or
// provider internals are copied into the content.

import type { DayOfWeek, RpeValue } from "../../types.ts";
import type { Block, GenerationInputs, Prescription, ReasonerProvenance, Session, TrainingItemInstance, UniversalProgramDay, UniversalTrainingProgramContent } from "../../training/types.ts";
import type { FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import type { ExercisePrescription } from "../plan-spec.ts";
import { MOVEMENT_PATTERNS } from "../knowledge/taxonomy.ts";
import type { ReasonerResult } from "./reasoner.ts";

type Planned = Extract<ReasonerResult, { status: "PLANNED" }>;

const WEEK: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fmt = (r: { min: number; max: number }) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);
const humanizeFact = (fact: string) => fact.split(".").pop()!.replace(/_/g, " ");

/** Coach-facing text never shows the reasoner's internal codes: constraint
 * aliases (C1…) and constraint-fit codes (K / U). Deterministic presentation only. */
export function plainLanguage(text: string): string {
  return text
    .replace(/\bthe coach-confirmed restriction C\d+\b/g, "your confirmed restrictions")
    .replace(/\b(?:constraint |restriction )?C\d+\b/g, "your confirmed restrictions")
    .replace(/^\s*K\s*[:—-]\s*/i, "Conditional fit: ")
    .replace(/^\s*U\s*[:—-]\s*/i, "Uncertain fit (needs your review): ")
    .replace(/\bK and U\b/g, "conditional- and uncertain-fit")
    .replace(/\bK\/U\b/g, "conditional/uncertain-fit")
    .replace(/\bU-rated\b/g, "uncertain-fit")
    .replace(/\bK-rated\b/g, "conditional-fit")
    .replace(/\(([KU])\)/g, (_m, code: string) => (code === "K" ? "(conditional fit)" : "(uncertain fit)"))
    .replace(/\b(U|K) and repeated\b/g, (_m, code: string) => `${code === "U" ? "Uncertain fit" : "Conditional fit"} and repeated`)
    .replace(/\bS-marked\b/g, "submaximal-only")
    .replace(/\bconstraint fit ([KU])\b/g, (_m, code: string) => (code === "K" ? "conditional fit" : "uncertain fit"))
    .replace(/\bsingle ([KU]) exercise/g, (_m, code: string) => `single ${code === "K" ? "conditional-fit" : "uncertain-fit"} exercise`)
    .replace(/\b([KU]) (variations?|exercises?|lifts?|selections?|work)\b/g, (_m, code: string, noun: string) => `${code === "K" ? "conditional-fit" : "uncertain-fit"} ${noun}`)
    .replace(/\(?\b([KU]) constraint fit\)?/g, (_m, code: string) => (code === "K" ? "(conditional fit)" : "(uncertain fit)"))
    .replace(/\bCoach method tension \(t_[a-z0-9_.]+\)/gi, "Tension with your method")
    .replace(/\s*\(t_[a-z0-9_.]+\)/g, "");
}

/** "no single leg pattern" → plain, exact wording from the taxonomy (never broader than the rule). */
export function describeConfirmedRestrictions(rules: string[]): string {
  const patterns: string[] = [];
  const other: string[] = [];
  for (const r of rules) {
    const p = /^no (.+) pattern$/.exec(r);
    if (p) {
      const id = p[1].replace(/ /g, "_") as keyof typeof MOVEMENT_PATTERNS;
      patterns.push((MOVEMENT_PATTERNS[id]?.name ?? p[1]).replace(/^./, (c) => c.toLowerCase()));
      continue;
    }
    const d = /^no (.+) demand at (\w+) or above$/.exec(r);
    if (d) other.push(`nothing needing ${d[1]} at ${d[2]} or above`);
    else other.push(r);
  }
  const parts = [patterns.length ? `none of these movement patterns: ${patterns.join("; ")}` : "", ...other].filter(Boolean);
  return `Your confirmed restrictions were applied exactly as confirmed — ${parts.join("; ")}.`;
}

/** Coach-facing review context, grouped the OPTIM way. Every line is plain language. */
export function reviewContext(result: Planned): Pick<ReasonerProvenance, "headline" | "needsYou" | "worthKnowing" | "handled" | "decisions"> {
  const { plan, spec } = result;
  const needsYou: string[] = [];
  const worthKnowing: string[] = [];
  const handled: string[] = [];
  const add = (list: string[], line: string) => {
    const l = plainLanguage(line).trim();
    if (l && !list.includes(l)) list.push(l);
  };
  for (const u of spec.unresolved) {
    if (u.providedBy === "client") add(worthKnowing, `Ask the client — ${humanizeFact(u.fact)}: ${u.why}`);
    else add(needsYou, u.fact.startsWith("coach_decision.") ? u.why : `${humanizeFact(u.fact)}: ${u.why}`);
  }
  // Unresolved coach items already carry the blocked-goal and uncertain-fit decisions.
  const coveredByUnresolved = new Set(["goal_direct_work_blocked", "constraint_fit_uncertain"]);
  for (const q of result.quality) {
    if (q.severity === "warning" && !coveredByUnresolved.has(q.code)) add(needsYou, q.message);
    else if (q.severity === "info") add(worthKnowing, q.message);
  }
  for (const a of spec.assumptions) add(worthKnowing, `Assumption: ${a.statement}`);

  const r = result.reasoning;
  add(handled, `Training days: ${plan.frequency.daysPerWeek} per week (${r.anchors.days.basis}).`);
  if (r.anchors.weeks) add(handled, `Program length: ${plan.durationWeeks} weeks (${plan.durationWeeks === r.anchors.weeks.value ? r.anchors.weeks.basis : "departs from the anchor — reason recorded"}).`);
  for (const d of plan.deviations) add(handled, `Departed from OPTIM's default ${d.field}: ${d.because}`);
  // The structured rules themselves — never the model's paraphrase, which can overstate them.
  if (r.constraints.length) add(handled, describeConfirmedRestrictions(r.constraints.flatMap((c) => c.rules)));
  add(handled, "Availability, session length and equipment were applied as hard limits.");
  add(handled, "Every week stays inside your set, rep, effort and rest ranges (checked deterministically).");
  for (const g of plan.goalAccess.filter((x) => x.status === "direct")) add(handled, `${g.target}: trained directly.`);

  const evidenceLabel = new Map(result.evidence.claims.map((c) => [c.ref, c.support]));
  const decisions = plan.decisions.slice(0, 8).map((d) => ({ decision: plainLanguage(d.decision), because: plainLanguage(d.because), evidence: [...new Set(d.knowledgeRefs.map((ref) => evidenceLabel.get(ref) ?? ref))] }));
  return { headline: `${plan.frequency.daysPerWeek} days/week · ${plan.architecture.name} · ${plan.durationWeeks} weeks`, needsYou, worthKnowing, handled, decisions };
}

/** One exercise's computed weekly prescription → the universal prescription grammar. */
function prescriptionFor(p: ExercisePrescription, rir: { min: number; max: number } | null): { prescription: Prescription; effortCue: string | null } {
  const prescription: Prescription = { family: "resistance", sets: p.sets, reps: { low: p.reps.min, high: p.reps.max } };
  let effortCue: string | null = null;
  if (p.effort.metric === "rpe" && typeof p.effort.target === "number") {
    const rpe = Math.round(p.effort.target);
    if (rpe >= 6 && rpe <= 10) prescription.rpe = rpe as RpeValue;
    if (rir) effortCue = `Effort: RPE ${fmt({ min: 10 - rir.max, max: 10 - rir.min })} (${fmt(rir)} reps in reserve).`;
  } else if (p.effort.metric === "rir" && typeof p.effort.target === "number") {
    prescription.rir = p.effort.target;
    if (rir) effortCue = `Effort: ${fmt(rir)} reps in reserve.`;
  }
  if (p.restMinutes) prescription.restSeconds = Math.round(((p.restMinutes.min + p.restMinutes.max) / 2) * 4) * 15;
  return { prescription, effortCue };
}

export function reasonerResultToProgramContent(params: {
  result: Planned;
  knowledge: FitnessKnowledgeRegistry;
  programId: string;
  workspaceId: string;
  clientProfileId: string;
  coachId: string;
  title: string;
  jobId: string;
  generationInputs: GenerationInputs;
  nowIso: string;
}): UniversalTrainingProgramContent {
  const { result, knowledge } = params;
  const { plan, spec } = result;
  const weeksSpec = spec.resistance?.value.weeks ?? [];
  const sessionsSpec = spec.resistance?.value.sessions ?? [];
  const weeks = weeksSpec.map((w) => ({
    weekNumber: w.week,
    days: WEEK.map((day): UniversalProgramDay => {
      const si = plan.sessions.findIndex((s) => s.day === day);
      if (si < 0) return { dayOfWeek: day, type: "rest" };
      const s = plan.sessions[si];
      const items: TrainingItemInstance[] = s.exercises.map((e, xi) => {
        const name = knowledge.getExercise(e.exerciseId)?.name ?? e.exerciseId;
        const p = w.sessions[si][xi];
        // The week's actual RIR range (listed range + phase shift) for the cue; the spec target is its hard end.
        const target = typeof p.effort.target === "number" ? (p.effort.metric === "rpe" ? 10 - p.effort.target : p.effort.target) : null;
        const rir = e.rir && target !== null ? { min: target, max: target + (e.rir.max - e.rir.min) } : null;
        const { prescription, effortCue } = prescriptionFor(p, w.kind === "deload" ? null : rir);
        return { id: `item-w${w.week}-${slug(day)}-${xi + 1}-${slug(name)}`, order: xi + 1, name, category: "resistance", coachCue: [effortCue, e.note ? plainLanguage(e.note) : null].filter(Boolean).join(" ") || undefined, prescription };
      });
      const blocks: Block[] = items.map((item, i) => ({ id: `block-${item.id}`, kind: "straight", order: i + 1, items: [item] }));
      const session: Session = { id: `session-w${w.week}-${slug(day)}`, name: plainLanguage(s.title), focus: plainLanguage(s.purpose), estimatedDurationMin: sessionsSpec[si]?.estimatedMinutes ?? 60, coachNote: w.note, blocks };
      return { dayOfWeek: day, type: "training", sessions: [session] };
    }),
  }));
  const run = result.run;
  const reasonerProvenance: ReasonerProvenance = {
    version: 1,
    jobId: params.jobId,
    runId: run.runId,
    reasonerVersion: run.versions.reasoner,
    promptVersion: run.versions.prompt,
    knowledgeVersion: run.versions.knowledge,
    modelId: run.versions.model?.modelId ?? result.modelId,
    inputHash: run.hashes.input ?? "",
    generatedAtIso: params.nowIso,
    ...reviewContext(result),
  };
  return {
    schemaVersion: 2,
    id: params.programId,
    workspaceId: params.workspaceId,
    clientId: params.clientProfileId,
    coachId: params.coachId,
    name: params.title,
    durationWeeks: plan.durationWeeks,
    weeks,
    generationRationale: plainLanguage(plan.architecture.rationale),
    generationInputs: params.generationInputs,
    directionLabel: `Fitness Reasoner — ${plan.architecture.name}`,
    reasonerProvenance,
    status: "draft",
    createdAtIso: params.nowIso,
    updatedAtIso: params.nowIso,
  };
}
