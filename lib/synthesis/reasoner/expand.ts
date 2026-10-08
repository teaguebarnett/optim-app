// Gate 4.0C-3 / 3A — deterministic expansion + validation of a reasoner plan.
//
// expandReasonerPlan turns the model's decisions into a full
// PlanSpecification: omitted RIR/rest take the coach's range for the role,
// every week's prescription is computed from the cycled rep-zone /
// sets-delta pattern, deload weeks use the coach's minimum sets and the
// easiest end of the coach's effort range, the coach's deload triggers are
// added to monitoring, and context-only constraints are recorded as
// applied. validateReasonerPlan is authoritative: shared validator +
// resistance validator + reasoner-specific checks. Hard failures reject the
// plan; quality findings go to coach review.

import type { DayOfWeek } from "../../types.ts";
import { DAY_ORDER } from "../client-state.ts";
import { hardConstraints } from "../constraints.ts";
import type { Decided, ExercisePrescription, PlanSpecification, QualityFinding, ResistanceSessionPlan, ResistanceWeekPlan } from "../plan-spec.ts";
import { validatePlanSpecification } from "../plan-spec.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import { RESISTANCE_PLANNER } from "../planners/resistance/planner.ts";
import type { ResistanceMethod } from "../planners/resistance/method.ts";
import { MAJOR_TARGETS } from "../planners/resistance/templates.ts";
import type { DecisionTopic, PhaseRolePlan, ProgressionPhase, ReasonerExercise, ReasonerPlan, RepZone } from "./contract.ts";
import type { Allowed, ContextOnlyConstraint, ReasoningInput } from "./input.ts";
import { REASONER_VERSION } from "./input.ts";
import { LOADED_DEMAND_CONDITION } from "../knowledge/types.ts";

export interface ModelRef {
  provider: string;
  modelId: string;
  promptVersion: string;
  attempts: number;
}

const zone = (r: { min: number; max: number }, z: RepZone) => {
  const span = r.max - r.min;
  if (z === "as_prescribed" || span < 2) return { ...r };
  const half = Math.floor(span / 2);
  return z === "lower_half" ? { min: r.min, max: r.min + half } : { min: r.max - half, max: r.max };
};

/** Effective RIR / rest for an exercise: the model's narrower choice, else the coach's range for the role. */
export function effectiveRir(e: ReasonerExercise, method: ResistanceMethod) {
  return e.rir ?? (method.effort.rir ? { min: method.effort.rir[e.role].value.min, max: method.effort.rir[e.role].value.max } : null);
}
export function effectiveRestSeconds(e: ReasonerExercise, method: ResistanceMethod) {
  return e.restSeconds ?? (method.rest ? { min: method.rest[e.role].value.min * 60, max: method.rest[e.role].value.max * 60 } : null);
}

export const phaseOf = (plan: ReasonerPlan, week: number) => plan.progression.phases.find((p) => week >= p.weeks.min && week <= p.weeks.max) ?? null;

export interface PlannedWeek {
  week: number;
  kind: "build" | "deload";
  phase: ProgressionPhase | null;
  /** Build-week index inside the phase (cycles the phase's rep zones). */
  k: number;
}

/** Week-by-week schedule: each build week belongs to a phase; coach-scheduled deload weeks override. */
export function weekPlan(plan: ReasonerPlan): PlannedWeek[] {
  const seen = new Map<ProgressionPhase | null, number>();
  return Array.from({ length: plan.durationWeeks }, (_, i) => {
    const week = i + 1;
    const phase = phaseOf(plan, week);
    if (plan.progression.deloadWeeks.includes(week)) return { week, kind: "deload" as const, phase, k: 0 };
    const k = seen.get(phase) ?? 0;
    seen.set(phase, k + 1);
    return { week, kind: "build" as const, phase, k };
  });
}

/**
 * Gate 4.0C-3C — THE weekly prescription for one exercise, computed from its
 * listed values and the phase. Never clamped after the fact: expansion and
 * validation use the same numbers, so a phase that would push a week outside
 * the coach's RIR range or a constraint-fit minimum is rejected.
 *
 * Set shifts are defined per exercise: a phase's sets ±1 applies to each
 * exercise that has headroom for it inside the coach's set range for its
 * role; an exercise already at that boundary keeps its listed sets. This is
 * decided BEFORE any value is produced (no invalid value is created and then
 * corrected), and the week note states the rule, so the prescription matches
 * the phase definition. Listed sets outside the coach's range are still
 * rejected by the exercise-level check.
 */
export function setsShiftFor(e: ReasonerExercise, delta: number, method: ResistanceMethod): number {
  const r = method.sets[e.role].value;
  return delta !== 0 && e.sets + delta >= r.min && e.sets + delta <= r.max ? delta : 0;
}

export function prescribedWeek(e: ReasonerExercise, w: PlannedWeek, method: ResistanceMethod): { sets: number; reps: { min: number; max: number }; rir: { min: number; max: number } | null; zone: RepZone; setsShift: number } {
  const rir = effectiveRir(e, method);
  if (w.kind === "deload") {
    const coachRir = method.effort.rir?.[e.role].value ?? null;
    return { sets: method.sets[e.role].value.min, reps: { ...e.reps }, rir: rir ? { min: coachRir?.max ?? rir.max, max: coachRir?.max ?? rir.max } : null, zone: "as_prescribed", setsShift: 0 };
  }
  const rp = w.phase?.[e.role];
  const z = rp ? rp.repZones[w.k % rp.repZones.length] : "as_prescribed";
  const setsShift = setsShiftFor(e, rp?.setsDelta ?? 0, method);
  return { sets: e.sets + setsShift, reps: zone(e.reps, z), rir: rir ? { min: rir.min + (rp?.rirDelta ?? 0), max: rir.max + (rp?.rirDelta ?? 0) } : null, zone: z, setsShift };
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const ROLE_ZONE: Record<RepZone, string> = { as_prescribed: "listed rep ranges", lower_half: "heavier end of rep ranges", upper_half: "lighter end of rep ranges" };
/** Week note rendered ONLY from the structure — it can't drift from the prescription. */
export function weekNote(w: PlannedWeek): string {
  if (w.kind === "deload") return `${w.phase ? `${w.phase.focus}. ` : ""}Deload week (coach-scheduled): coach's minimum sets, easiest effort.`;
  if (!w.phase) return "Listed prescriptions.";
  const sets = (d: number) => (d === 0 ? "sets 0" : `sets ${signed(d)} where the coach's set range allows (exercises at the ${d > 0 ? "maximum" : "minimum"} keep their listed sets)`);
  const role = (r: PhaseRolePlan) => `${ROLE_ZONE[r.repZones[w.k % r.repZones.length]]}, RIR ${signed(r.rirDelta)}, ${sets(r.setsDelta)}, progress: ${r.progress.replace(/_/g, " ")}`;
  return `${w.phase.focus}. Mains: ${role(w.phase.main)}. Accessories: ${role(w.phase.accessory)}.`;
}

/** Gate 4.0C-5 — citations are namespaced: a ref is valid only in its own list. A ref that belongs to another list is
 * named as such (exact repair feedback) and never moved or accepted — live: restriction "C1" was cited as a client
 * fact, so a constraint never silently becomes a client fact (or the reverse). Unknown refs fail as before. */
type Citable = Pick<Allowed, "coachRuleKeys" | "clientFactRefs" | "constraintIds" | "knowledgeRefs">;
const CITATION: Record<"coach" | "client" | "constraints" | "evidence", { set: (a: Citable) => Set<string>; what: string; unknown: (r: string) => string }> = {
  coach: { set: (a) => a.coachRuleKeys, what: "coach rule", unknown: (r) => `Cites coach rule "${r}", which wasn't provided.` },
  client: { set: (a) => a.clientFactRefs, what: "client fact", unknown: (r) => `Cites client fact "${r}", which wasn't provided.` },
  constraints: { set: (a) => a.constraintIds, what: "constraint", unknown: (r) => `Cites constraint "${r}", which wasn't provided.` },
  evidence: { set: (a) => a.knowledgeRefs, what: "evidence ref", unknown: (r) => `Cites knowledge "${r}", which wasn't retrieved for this plan.` },
};
export function citationErrors(slot: keyof typeof CITATION, refs: string[], allowed: Citable): string[] {
  const errors: string[] = [];
  for (const r of refs) {
    if (CITATION[slot].set(allowed).has(r)) continue;
    const owner = (Object.keys(CITATION) as Array<keyof typeof CITATION>).find((k) => k !== slot && CITATION[k].set(allowed).has(r));
    errors.push(owner ? `Cites ${CITATION[owner].what} "${r}" in "${slot}", which takes only ${CITATION[slot].what}s — list it in "${owner}".` : CITATION[slot].unknown(r));
  }
  return errors;
}

/** Gate 4.0C-3B — goal targets whose direct work is blocked: declared by the model or resolved by OPTIM from structured goal data. */
export function blockedGoalTargets(plan: ReasonerPlan, reasoning: ReasoningInput): Array<{ target: string; exerciseId: string; blockedBy: string; interim: string | null }> {
  const out = plan.goalAccess.filter((g) => g.status === "blocked").map((g) => ({ target: g.target, exerciseId: g.exerciseId, blockedBy: g.blockedBy ?? "unknown", interim: g.interim ? g.interim.replace(/[.\s]+$/, "") + "." : null }));
  for (const t of reasoning.goal.targets) if (t.exercise && (t.status === "blocked" || t.status === "unavailable") && !out.some((o) => o.exerciseId === t.exercise)) out.push({ target: t.target, exerciseId: t.exercise, blockedBy: t.blockedBy ?? "equipment", interim: null });
  return out;
}

/** Gate 4.0C-3C — used exercises whose constraint fit is conditional or uncertain, with their exact conditions. */
export function fitFindings(plan: ReasonerPlan, allowed: Pick<Allowed, "loadConditions">, knowledge: SynthesisInput["knowledge"]) {
  const used = [...new Set(plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
  return used.flatMap((id) => {
    const conds = allowed.loadConditions.get(id);
    if (!conds?.length) return [];
    const c = conds.find((x) => x.certainty === "uncertain") ?? conds[0];
    return [{ id, name: knowledge.getExercise(id)?.name ?? id, certainty: c.certainty, restriction: `${c.constraintId} (no ${c.demand.replace(/_/g, " ")} demand at ${c.limit} or above)`, conditions: c.conditions }];
  });
}

export function expandReasonerPlan(params: { plan: ReasonerPlan; reasoning: ReasoningInput; contextOnly: ContextOnlyConstraint[]; constraintIdMap: Record<string, string>; method: ResistanceMethod; input: SynthesisInput; model: ModelRef; nowIso: string; allowed?: Pick<Allowed, "loadConditions"> }): PlanSpecification {
  const { plan, method, input } = params;
  const usesRpe = method.effort.metrics.includes("rpe");
  const sessions: ResistanceSessionPlan[] = plan.sessions.map((s) => ({
    day: s.day,
    purpose: `${s.title} — ${s.purpose}`,
    targets: [],
    exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId, role: e.role, target: e.note ?? "", selection: { score: 0, factors: [{ factor: `reasoner${e.note ? `: ${e.note}` : ""}`, points: 0 }], alternatives: [] } })),
    estimatedMinutes: estimateMinutes(s.exercises, method),
  }));
  const weeks: ResistanceWeekPlan[] = weekPlan(plan).map((w) => ({
    week: w.week,
    kind: w.kind,
    note: weekNote(w),
    sessions: plan.sessions.map((s) =>
      s.exercises.map((e): ExercisePrescription => {
        const pw = prescribedWeek(e, w, method);
        const coachRir = method.effort.rir?.[e.role].value ?? null;
        const rirTarget = pw.rir ? pw.rir.min : null;
        const rest = effectiveRestSeconds(e, method);
        return {
          sets: pw.sets,
          reps: pw.reps,
          effort: rirTarget === null ? { metric: "plain", target: method.effort.plain?.value ?? "as prescribed", rirRange: null } : { metric: usesRpe ? "rpe" : "rir", target: usesRpe ? 10 - rirTarget : rirTarget, rirRange: coachRir ? { min: coachRir.min, max: coachRir.max } : pw.rir },
          restMinutes: rest ? { min: rest.min / 60, max: rest.max / 60 } : null,
        };
      })
    ),
  }));

  const decided = <T>(value: T, topics: DecisionTopic[], fallback: string, rule: string): Decided<T> => {
    const ds = plan.decisions.filter((d) => topics.includes(d.topic));
    const inputs = [...new Set(ds.flatMap((d) => [...d.coachRuleKeys.map((k) => `coach:${k}`), ...d.clientFactRefs.map((r) => `client:${r}`), ...(d.constraintRefs ?? []).map((r) => `constraint:${params.constraintIdMap[r] ?? r}`), ...d.knowledgeRefs.map((r) => `knowledge:${r}`)]))];
    return { value, rationale: ds.length ? ds.map((d) => `${d.decision}: ${d.because}`).join(" ") : fallback, rule, basis: "planner_rule", inputs: inputs.length ? inputs : ["reasoner:unattributed"] };
  };
  const weeklyMuscleSets: Record<string, { direct: number; indirect: number }> = {};
  plan.sessions.forEach((s, si) =>
    s.exercises.forEach((e, xi) => {
      const ex = input.knowledge.getExercise(e.exerciseId);
      if (!ex) return;
      const sets = weeks[0]?.sessions[si]?.[xi]?.sets ?? e.sets;
      for (const m of ex.primaryMuscles) (weeklyMuscleSets[m] ??= { direct: 0, indirect: 0 }).direct += sets;
      for (const m of ex.secondaryMuscles) (weeklyMuscleSets[m] ??= { direct: 0, indirect: 0 }).indirect += sets;
    })
  );
  const exerciseIds = [...new Set(plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
  const citedKnowledge = [...new Set(plan.decisions.flatMap((d) => d.knowledgeRefs))];
  const deload = method.deload.value;
  const monitoring = [...plan.monitoring, ...(deload.approach === "as_needed" ? deload.triggers.map((t) => `Deload trigger (coach): ${t.replace(/_/g, " ")}`) : [])];

  return {
    clientProfileId: input.client.clientProfileId,
    domain: plan.domain === "general_fitness" ? "general_fitness" : "resistance",
    goalClass: input.goal.primary!.class,
    frequency: decided(plan.frequency.daysPerWeek, ["frequency"], plan.frequency.rationale, "reasoner.frequency"),
    schedule: decided(plan.schedule.days as DayOfWeek[], ["schedule"], plan.schedule.rationale, "reasoner.schedule"),
    weeklyStructure: decided({ name: plan.architecture.name, sessions: plan.sessions.map((s) => ({ day: s.day, purpose: s.title, domain: "resistance" as const })) }, ["structure"], plan.architecture.rationale, "reasoner.structure"),
    durationWeeks: decided(plan.durationWeeks, ["duration"], `Program of ${plan.durationWeeks} weeks.`, "reasoner.duration"),
    volume: decided({ unit: "sets_per_muscle_per_week" as const, byTarget: Object.fromEntries(Object.entries(weeklyMuscleSets).map(([m, v]) => [m, { min: v.direct, max: v.direct }])) }, ["prescription", "exercise_selection"], "Weekly volume follows from the selected exercises and sets.", "reasoner.volume"),
    intensity: decided({ method: method.effort.rir ? (usesRpe ? ("rpe" as const) : ("rir" as const)) : ("plain_language" as const), range: method.effort.rir ? { min: method.effort.rir.main.value.min, max: method.effort.rir.main.value.max } : null }, ["prescription"], "Effort inside the coach's range.", "reasoner.prescription"),
    progression: decided({ model: plan.progression.model, rule: `${plan.progression.rationale} Phases: ${plan.progression.phases.map((p) => `weeks ${p.weeks.min}–${p.weeks.max} ${p.focus} (${p.intent})`).join("; ")}` }, ["progression"], plan.progression.rationale, "reasoner.progression"),
    recovery: decided({ deloadEveryWeeks: null, approach: plan.progression.deloadWeeks.length ? `deload weeks ${plan.progression.deloadWeeks.join(", ")}` : deload.approach }, ["recovery"], `Deloads per the coach's method (${deload.approach}).`, "reasoner.recovery"),
    monitoring: decided({ metrics: monitoring, cadence: "every session" }, ["recovery", "progression"], "Monitoring per the coach's progression and deload rules.", "reasoner.monitoring"),
    resistance: decided(
      {
        emphasis: { primary: plan.goalEmphasis.primary, secondary: plan.goalEmphasis.secondary },
        sessions,
        weeks,
        weeklyMuscleSets,
        progressionRules: (["main", "accessory"] as const).map((role) => ({ role, methods: method.progression[role].value, rule: plan.progression.rationale })),
      },
      ["other", "exercise_selection"],
      plan.goalEmphasis.rationale,
      "reasoner.program"
    ),
    quality: [],
    constraintsApplied: [...plan.constraintsApplied.map((c) => ({ constraintId: params.constraintIdMap[c.constraintId] ?? c.constraintId, how: c.how })), ...params.contextOnly],
    assumptions: plan.assumptions.map((statement) => ({ statement, basis: "planner_rule" as const })),
    unresolved: [
      ...blockedGoalTargets(plan, params.reasoning).map((g) => {
        const name = input.knowledge.getExercise(g.exerciseId)?.name ?? g.exerciseId;
        const by = params.constraintIdMap[g.blockedBy] ? `the coach-confirmed restriction ${g.blockedBy}` : g.blockedBy === "t_exercises_avoided" ? "the coach's avoided-exercise list" : g.blockedBy;
        return { fact: `coach_decision.resume_direct_work.${g.exerciseId}`, why: `The goal "${g.target}" still stands, but direct ${name} work is blocked by ${by}. ${g.interim ? `Interim: ${g.interim} ` : ""}Coach review is required before direct ${name} progression resumes.`, providedBy: "coach" as const };
      }),
      ...(params.allowed ? fitFindings(plan, params.allowed, input.knowledge) : [])
        .filter((f) => f.certainty === "uncertain")
        .map((f) => ({ fact: `coach_decision.constraint_fit.${f.id}`, why: `OPTIM's knowledge can't establish that ${f.name} stays within ${f.restriction}, even with ${f.conditions.join(" and ")} — its bracing depends on load, setup, execution and the client. Confirm it fits before use, or swap it.`, providedBy: "coach" as const })),
      ...plan.unresolved,
    ],
    provenance: {
      knowledge: { version: input.knowledge.version, entries: [...citedKnowledge.map((r) => r.split("#")[0]), ...exerciseIds].filter((v, i, a) => a.indexOf(v) === i).map((id) => input.knowledge.ref(id)).filter((r): r is NonNullable<typeof r> => !!r) },
      coachBrain: input.coach ? { versionId: input.coach.versionId, version: input.coach.version } : null,
      clientInputs: [...new Set(plan.decisions.flatMap((d) => d.clientFactRefs))],
      goalInputs: [`goal.primary.${input.goal.primary!.class}`, ...input.goal.secondary.map((g) => `goal.secondary.${g.class}`)],
      constraints: hardConstraints(input.constraints).map((c) => ({ id: c.id, confirmation: c.confirmation })),
      rules: ["reasoner.v1", REASONER_VERSION, params.model.promptVersion],
      planner: { id: "fitness-reasoner", version: REASONER_VERSION },
      generatedAtIso: params.nowIso,
      model: { provider: params.model.provider, modelId: params.model.modelId, promptVersion: params.model.promptVersion, reasonerVersion: REASONER_VERSION, attempts: params.model.attempts },
    },
  };
}

/** Same estimate the deterministic planner uses (~3 s/rep, 1 min setup), plus warm-up. */
export function estimateMinutes(exercises: ReasonerExercise[], method: ResistanceMethod): number {
  const warmup = method.warmup?.value === "minimal" ? 5 : 10;
  const work = exercises.reduce((t, e) => {
    const rest = effectiveRestSeconds(e, method);
    const restMid = rest ? (rest.min + rest.max) / 2 / 60 : 2;
    return t + (e.sets * (((e.reps.min + e.reps.max) / 2) * 3 + restMid * 60)) / 60 + 1;
  }, 0);
  return Math.round(warmup + work);
}

export interface ReasonerValidation {
  ok: boolean;
  errors: string[];
  quality: QualityFinding[];
}

export function validateReasonerPlan(params: { plan: ReasonerPlan; spec: PlanSpecification; reasoning: ReasoningInput; allowed: Allowed; method: ResistanceMethod; input: SynthesisInput }): ReasonerValidation {
  const { plan, spec, reasoning, allowed, method, input } = params;
  const errors: string[] = [];
  const quality: QualityFinding[] = [];

  if (plan.domain !== reasoning.domain.primary) errors.push(`Plan domain ${plan.domain} doesn't match the routed domain ${reasoning.domain.primary}.`);
  const allowedSplits = method.splitsFor(plan.frequency.daysPerWeek).value as string[];
  if (!allowedSplits.includes(plan.architecture.split)) errors.push(`Split "${plan.architecture.split}" isn't one the coach allows for ${plan.frequency.daysPerWeek} days (${allowedSplits.join(", ") || "none listed"}).`);
  if (plan.frequency.daysPerWeek !== plan.sessions.length || plan.schedule.days.length !== plan.sessions.length) errors.push("Frequency, schedule and session count disagree.");
  plan.sessions.forEach((s, i) => {
    if (s.day !== plan.schedule.days[i]) errors.push(`Session ${i + 1} is on ${s.day} but the schedule says ${plan.schedule.days[i]}.`);
    const ids = s.exercises.map((e) => e.exerciseId);
    if (new Set(ids).size !== ids.length) errors.push(`${s.title} lists the same exercise twice.`);
    if (!s.exercises.length) errors.push(`${s.title} has no exercises.`);
    for (const e of s.exercises) {
      if (!allowed.exerciseIds.has(e.exerciseId)) errors.push(`${e.exerciseId} wasn't among the eligible candidates supplied.`);
      const rr = method.reps[e.role].value;
      if (e.reps.min < rr.min || e.reps.max > rr.max) errors.push(`${e.exerciseId}: reps ${e.reps.min}–${e.reps.max} outside the coach's ${rr.min}–${rr.max}.`);
      const sr = method.sets[e.role].value;
      if (e.sets < sr.min || e.sets > sr.max) errors.push(`${e.exerciseId}: ${e.sets} sets outside the coach's ${sr.min}–${sr.max}.`);
      const rir = method.effort.rir?.[e.role].value;
      if (rir && e.rir && (e.rir.min < rir.min || e.rir.max > rir.max)) errors.push(`${e.exerciseId}: effort outside the coach's RIR ${rir.min}–${rir.max}.`);
      if (rir && !e.rir) errors.push(`${e.exerciseId}: give an rir — the coach's range is a boundary, not a prescription.`);
      if (allowed.submaximalOnly.has(e.exerciseId)) {
        const eff = effectiveRir(e, method);
        if (e.reps.min < LOADED_DEMAND_CONDITION.minReps || (eff && eff.min < LOADED_DEMAND_CONDITION.minRir)) errors.push(`${e.exerciseId} has conditional/uncertain constraint fit: heavier or closer to failure would breach a confirmed restriction — use reps min ≥ ${LOADED_DEMAND_CONDITION.minReps} and rir min ≥ ${LOADED_DEMAND_CONDITION.minRir} (necessary, not proof of fit).`);
      }
      const rest = method.rest?.[e.role].value;
      if (rest && e.restSeconds && (e.restSeconds.min < rest.min * 60 || e.restSeconds.max > rest.max * 60)) errors.push(`${e.exerciseId}: rest outside the coach's ${rest.min}–${rest.max} min.`);
    }
  });
  const sorted = [...plan.schedule.days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  if (sorted.join() !== plan.schedule.days.join()) errors.push("Schedule days must be in week order.");

  // Program length and the coach's deload rules.
  const pw = reasoning.bounds.weeks;
  if (pw && (plan.durationWeeks < pw[0] || plan.durationWeeks > pw[1])) errors.push(`Program length ${plan.durationWeeks} weeks is outside the coach's ${pw[0]}–${pw[1]}.`);
  const deloads = [...plan.progression.deloadWeeks].sort((a, b) => a - b);
  if (deloads.some((w) => w > plan.durationWeeks)) errors.push("A deload week falls after the end of the program.");
  const d = method.deload.value;
  if (d.approach !== "fixed" && deloads.length) errors.push(`The coach's method doesn't schedule deloads (${d.approach}), but the plan does.`);
  if (d.approach === "fixed" && d.every) {
    const gaps = deloads.map((w, i) => w - (i ? deloads[i - 1] : 0));
    if (plan.durationWeeks >= d.every.min && !deloads.length) errors.push(`The coach schedules a deload every ${d.every.min}–${d.every.max} weeks; the plan has none.`);
    if (gaps.some((g) => g < d.every!.min || g > d.every!.max)) errors.push(`Deload spacing doesn't match the coach's every ${d.every.min}–${d.every.max} weeks.`);
  }

  // Structural anchors: a departure needs a client- or coach-specific reason.
  const anchorFor = { days: reasoning.anchors.days.value, weeks: reasoning.anchors.weeks?.value ?? null };
  const actual = { days: plan.frequency.daysPerWeek, weeks: plan.durationWeeks };
  for (const field of ["days", "weeks"] as const) {
    const anchor = anchorFor[field];
    if (anchor === null || actual[field] === anchor) continue;
    const dev = plan.deviations.find((d) => d.field === field);
    if (!dev) errors.push(`${field === "days" ? "Frequency" : "Program length"} ${actual[field]} departs from OPTIM's anchor (${anchor}) without a "deviations" entry.`);
    else {
      if (!dev.coachRuleKeys.length && !dev.clientFactRefs.length && !dev.constraintRefs?.length) errors.push(`The ${field} deviation cites no client fact or coach rule, nor a confirmed constraint; general guidance alone doesn't justify departing from the anchor.`);
      errors.push(...citationErrors("coach", dev.coachRuleKeys, allowed), ...citationErrors("client", dev.clientFactRefs, allowed), ...citationErrors("constraints", dev.constraintRefs ?? [], allowed));
    }
  }

  // Progression block: phases cover the whole program contiguously.
  const phases = [...plan.progression.phases].sort((a, b) => a.weeks.min - b.weeks.min);
  let nextWeek = 1;
  for (const ph of phases) {
    if (ph.weeks.min !== nextWeek) errors.push(`Progression phases must be contiguous from week 1 (expected a phase starting at week ${nextWeek}).`);
    nextWeek = ph.weeks.max + 1;
  }
  if (nextWeek - 1 !== plan.durationWeeks) errors.push(`Progression phases end at week ${nextWeek - 1}, but the program is ${plan.durationWeeks} weeks.`);

  // Gate 4.0C-3C — phases ARE the prescription: their text carries no numbers, their methods are the coach's,
  // and every computed week stays inside the coach's ranges and each exercise's constraint-fit minimums.
  for (const ph of phases) {
    const label = `Phase "${ph.focus}" (weeks ${ph.weeks.min}–${ph.weeks.max})`;
    if (/\d/.test(`${ph.focus} ${ph.intent}`)) errors.push(`${label}: focus/intent must not contain numbers — reps, effort, sets and loads live in the phase structure, so the text can't contradict the prescription.`);
    for (const role of ["main", "accessory"] as const) {
      const allowedProgress = [...(method.progression[role].value as string[]), "hold"];
      if (!allowedProgress.includes(ph[role].progress)) errors.push(`${label}: ${role} progress "${ph[role].progress}" isn't one of the coach's methods (${allowedProgress.join(", ")}).`);
    }
  }
  if (/\d+\s*(?:[-–]\s*\d+\s*)?(?:reps?|rir|rpe|sets?)\b|\b(?:rir|rpe)\s*\d/i.test(`${plan.progression.model} ${plan.progression.rationale}`)) errors.push("progression model/why must not state reps, RIR/RPE or sets — those come from the phases.");
  const weekIssues = new Set<string>();
  for (const w of weekPlan(plan)) {
    if (w.kind !== "build" || !w.phase) continue;
    const label = `Phase "${w.phase.focus}" (weeks ${w.phase.weeks.min}–${w.phase.weeks.max})`;
    for (const s of plan.sessions)
      for (const e of s.exercises) {
        const pw = prescribedWeek(e, w, method);
        const sr = method.sets[e.role].value;
        const rr = method.effort.rir?.[e.role].value;
        if (pw.sets < sr.min || pw.sets > sr.max) weekIssues.add(`${label} gives ${e.exerciseId} ${pw.sets} sets, outside the coach's ${sr.min}–${sr.max}.`);
        if (rr && pw.rir && (pw.rir.min < rr.min || pw.rir.max > rr.max)) weekIssues.add(`${label} takes ${e.exerciseId} to RIR ${pw.rir.min}–${pw.rir.max}, outside the coach's ${rr.min}–${rr.max}.`);
        if (allowed.submaximalOnly.has(e.exerciseId) && (pw.reps.min < LOADED_DEMAND_CONDITION.minReps || (pw.rir && pw.rir.min < LOADED_DEMAND_CONDITION.minRir))) weekIssues.add(`${label} takes ${e.exerciseId} (constraint fit ${allowed.uncertain.has(e.exerciseId) ? "U" : "K"}) below its minimums (reps ≥ ${LOADED_DEMAND_CONDITION.minReps}, RIR ≥ ${LOADED_DEMAND_CONDITION.minRir}).`);
      }
  }
  errors.push(...weekIssues);

  for (const f of fitFindings(plan, allowed, input.knowledge)) quality.push(f.certainty === "uncertain" ? { code: "constraint_fit_uncertain", severity: "warning", message: `${f.name}: fit with ${f.restriction} is uncertain — knowledge can't establish it even when submaximal. Coach review required before use.` } : { code: "constraint_fit_conditional", severity: "info", message: `${f.name}: fits ${f.restriction} only under these conditions — ${f.conditions.join("; ")}.` });

  // Gate 4.0C-3C — uncertain constraint fit: needs a rationale, and goes to coach review (never silently "safe").
  for (const s of plan.sessions) for (const e of s.exercises) if (allowed.uncertain.has(e.exerciseId) && !e.note) errors.push(`${e.exerciseId} has uncertain constraint fit (U): say in its note why no compatible alternative serves this session.`);
  // Laterality: a side-limited unilateral exercise must say which side it is performed with.
  for (const s of plan.sessions) for (const e of s.exercises) { const side = allowed.sideOnly?.get(e.exerciseId); if (side && !new RegExp(`\\b${side}\\b`, "i").test(e.note ?? "")) errors.push(`${e.exerciseId} is side-limited (S): perform it with the ${side} side only and say so in its note.`); }

  // Goal access: truthful about what is and isn't trainable.
  const usedIds = new Set(plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  for (const g of plan.goalAccess) {
    if (!input.knowledge.getExercise(g.exerciseId)) errors.push(`goalAccess names unknown exercise ${g.exerciseId}.`);
    else if (g.status === "direct" && !usedIds.has(g.exerciseId)) errors.push(`goalAccess says ${g.exerciseId} is trained directly, but no session includes it.`);
    else if (g.status === "blocked") {
      const by = allowed.blockedBy.get(g.exerciseId);
      if (!by) errors.push(`goalAccess says ${g.exerciseId} is blocked, but it isn't in "blocked".`);
      else if (g.blockedBy !== by) errors.push(`goalAccess: ${g.exerciseId} is blocked by ${by}, not ${g.blockedBy ?? "nothing"}.`);
      if (!g.interim) errors.push(`goalAccess: say what the interim work preserves or develops while ${g.exerciseId} is blocked.`);
    }
  }
  for (const t of reasoning.goal.targets) {
    if (!t.exercise || t.status === "unknown_exercise") continue;
    const g = plan.goalAccess.find((x) => x.exerciseId === t.exercise);
    const expected = t.status === "direct" ? "direct" : "blocked";
    if (t.status === "direct" && !usedIds.has(t.exercise)) {
      if (t.source === "performance_target") errors.push(`The structured performance target "${t.target}" is trainable, but no session trains ${t.exercise}.`);
      else quality.push({ code: "goal_target_untrained", severity: "warning", message: `${t.target} is a stated priority and is eligible, but no session trains it.` });
    }
    if (t.source === "performance_target" && t.status === "direct" && g?.status !== "direct") errors.push(`Record the structured performance target "${t.target}" in goalAccess as direct.`);
    if (t.status === "blocked" && (!g || g.status !== expected)) errors.push(`The priority "${t.target}" is blocked by ${t.blockedBy}; record it in goalAccess as blocked with its interim work.`);
  }
  for (const g of blockedGoalTargets(plan, reasoning)) quality.push({ code: "goal_direct_work_blocked", severity: "warning", message: `Goal "${g.target}": direct ${input.knowledge.getExercise(g.exerciseId)?.name ?? g.exerciseId} work is blocked (${g.blockedBy}); the plan is interim work${g.interim ? ` — ${g.interim}` : "."} Coach review before direct progression resumes.` });

  // Citations: only what was supplied.
  for (const dec of plan.decisions) {
    errors.push(...citationErrors("coach", dec.coachRuleKeys, allowed), ...citationErrors("client", dec.clientFactRefs, allowed), ...citationErrors("constraints", dec.constraintRefs ?? [], allowed), ...citationErrors("evidence", dec.knowledgeRefs, allowed));
    for (const r of dec.knowledgeRefs) if (reasoning.evidence.find((c) => c.ref === r)?.source.startsWith("NO SOURCE")) quality.push({ code: "cites_unsourced", severity: "warning", message: `“${dec.decision}” leans on an open question with no source (${r}).` });
  }
  for (const c of plan.constraintsApplied) if (!allowed.constraintIds.has(c.constraintId)) errors.push(`Lists constraint "${c.constraintId}", which wasn't provided.`);
  for (const c of reasoning.constraints) if (!plan.constraintsApplied.some((x) => x.constraintId === c.id)) errors.push(`Doesn't say how constraint "${c.id}" was applied.`);

  // Arithmetic: sessions must fit the time cap.
  const cap = reasoning.bounds.minutes;
  for (const s of spec.resistance?.value.sessions ?? []) {
    if (cap && s.estimatedMinutes > cap * 1.2) errors.push(`${s.purpose.split(" — ")[0]} is estimated at ${s.estimatedMinutes} min, well over the ${cap}-min cap.`);
    else if (cap && s.estimatedMinutes > cap) quality.push({ code: "session_duration", severity: "warning", message: `${s.purpose.split(" — ")[0]} is estimated at ${s.estimatedMinutes} min (cap ${cap}).` });
  }

  // Shared + resistance validators (eligibility by metadata, equipment, coach ranges per week, provenance).
  for (const v of [validatePlanSpecification(spec, input), RESISTANCE_PLANNER.validate!(spec, input)]) if (!v.ok) errors.push(...v.errors);

  // Quality (reviewable, not blocking).
  const byId = new Map<string, ReasonerExercise[]>();
  for (const s of plan.sessions) for (const e of s.exercises) byId.set(e.exerciseId, [...(byId.get(e.exerciseId) ?? []), e]);
  // Gate 4.0C-3C — repeated exposure is normal programming. Flag only UNJUSTIFIED redundancy: identical prescriptions
  // (role, reps, effort), no stated reason, while another eligible exercise for the same pattern and muscles existed.
  for (const [id, uses] of byId) {
    if (uses.length < 2 || uses.some((u) => u.note)) continue;
    const sig = (u: ReasonerExercise) => `${u.role}|${u.reps.min}-${u.reps.max}|${u.rir ? `${u.rir.min}-${u.rir.max}` : "-"}`;
    if (new Set(uses.map(sig)).size > 1) continue; // differentiated exposures (e.g. heavier and lighter days)
    const ex = input.knowledge.getExercise(id);
    const alternatives = ex ? [...allowed.exerciseIds].filter((other) => other !== id && !byId.has(other) && input.knowledge.getExercise(other)?.patterns[0] === ex.patterns[0] && input.knowledge.getExercise(other)!.primaryMuscles.some((m) => ex.primaryMuscles.includes(m))) : [];
    if (!alternatives.length) continue; // the only eligible option for that pattern — repetition is necessary
    quality.push({ code: "exercise_repeated_unjustified", severity: "warning", message: `${ex?.name ?? id} repeats ${uses.length}× with the same prescription and no stated reason, although ${alternatives.map((a) => input.knowledge.getExercise(a)?.name ?? a).slice(0, 3).join(", ")} could vary the stimulus.` });
  }
  const wm = spec.resistance?.value.weeklyMuscleSets ?? {};
  const eligibleTargets = new Set(reasoning.exercises.flatMap((row) => row.split("|")[3].split(",")));
  for (const m of MAJOR_TARGETS) if (!(wm[m]?.direct > 0)) quality.push({ code: eligibleTargets.has(m) ? "target_omitted" : "target_excluded", severity: eligibleTargets.has(m) ? "warning" : "info", message: eligibleTargets.has(m) ? `${m.replace(/_/g, " ")} gets no direct work although eligible exercises exist.` : `${m.replace(/_/g, " ")} gets no direct work: no eligible exercise trains it.` });
  const pat = (ps: string[]) => plan.sessions.reduce((t, s) => t + s.exercises.reduce((u, e) => u + (input.knowledge.getExercise(e.exerciseId)?.patterns.some((p) => ps.includes(p)) ? e.sets : 0), 0), 0);
  const push = pat(["horizontal_push", "vertical_push"]);
  const pull = pat(["horizontal_pull", "vertical_pull"]);
  if (push + pull > 0 && (Math.max(push, pull) / Math.max(1, Math.min(push, pull)) > 1.5 || Math.min(push, pull) === 0)) quality.push({ code: "push_pull_balance", severity: "warning", message: `Weekly pushing sets ${push} vs pulling sets ${pull}.` });
  for (const c of plan.conflicts) quality.push({ code: "coach_method_conflict", severity: "warning", message: `Coach method tension (${c.coachRuleKey}): ${c.issue}` });

  // Effort distribution (reviewable): a coach range used as one blanket setting.
  const efforts = plan.sessions.flatMap((s) => s.exercises.map((e) => ({ e, rir: effectiveRir(e, method), coachMin: method.effort.rir?.[e.role].value.min ?? null })));
  const withRir = efforts.filter((x) => x.rir);
  if (withRir.length >= 6) {
    const counts = new Map<string, number>();
    for (const x of withRir) counts.set(`${x.rir!.min}-${x.rir!.max}`, (counts.get(`${x.rir!.min}-${x.rir!.max}`) ?? 0) + 1);
    const [mode, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (n / withRir.length >= 0.8) quality.push({ code: "effort_uniform", severity: "warning", message: `${n} of ${withRir.length} exercises share the same effort (RIR ${mode}); effort isn't differentiated by role, fatigue cost or priority.` });
    // Near failure = within 1 rep of failure, or the hardest end the coach allows if that is easier.
    const hard = withRir.filter((x) => x.rir!.min <= Math.max(1, x.coachMin ?? 0)).length;
    if (hard / withRir.length >= 0.75) quality.push({ code: "effort_hard_end", severity: "warning", message: `${hard} of ${withRir.length} exercises are taken to within one rep of failure (or the coach's hardest allowed effort).` });
  }
  if (!plan.decisions.some((d) => d.topic === "effort")) quality.push({ code: "effort_unexplained", severity: "warning", message: "No decision explains how effort is distributed across the week." });
  if (reasoning.bounds.weeks && reasoning.bounds.preferredWeeks === null) quality.push({ code: "coach_no_preferred_length", severity: "info", message: `The coach's method has no preferred program length; OPTIM anchored the block at ${reasoning.anchors.weeks?.value} weeks (the shortest allowed).` });
  return { ok: errors.length === 0, errors: [...new Set(errors)], quality };
}
