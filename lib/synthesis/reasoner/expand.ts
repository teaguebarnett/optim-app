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
import type { DecisionTopic, ReasonerExercise, ReasonerPlan, RepZone } from "./contract.ts";
import type { Allowed, ContextOnlyConstraint, ReasoningInput } from "./input.ts";
import { REASONER_VERSION } from "./input.ts";

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

/** Week-by-week schedule from the cycled pattern; deload weeks are explicit. */
export function weekPlan(plan: ReasonerPlan): Array<{ week: number; kind: "build" | "deload"; repZone: RepZone; setsDelta: number }> {
  let build = 0;
  return Array.from({ length: plan.durationWeeks }, (_, i) => {
    const week = i + 1;
    if (plan.progression.deloadWeeks.includes(week)) return { week, kind: "deload" as const, repZone: "as_prescribed" as const, setsDelta: 0 };
    const k = build++;
    return { week, kind: "build" as const, repZone: plan.progression.repZones[k % plan.progression.repZones.length], setsDelta: plan.progression.setsDeltas[k % plan.progression.setsDeltas.length] ?? 0 };
  });
}

const ZONE_NOTE: Record<RepZone, string> = { as_prescribed: "Prescribed rep ranges.", lower_half: "Heavier: lower half of each rep range.", upper_half: "Lighter: upper half of each rep range." };

export function expandReasonerPlan(params: { plan: ReasonerPlan; reasoning: ReasoningInput; contextOnly: ContextOnlyConstraint[]; constraintIdMap: Record<string, string>; method: ResistanceMethod; input: SynthesisInput; model: ModelRef; nowIso: string }): PlanSpecification {
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
    note: w.kind === "deload" ? "Deload week (coach-scheduled): coach's minimum sets, easiest effort." : `${ZONE_NOTE[w.repZone]}${w.setsDelta ? ` Sets ${w.setsDelta > 0 ? "+" : ""}${w.setsDelta}.` : ""}`,
    sessions: plan.sessions.map((s) =>
      s.exercises.map((e): ExercisePrescription => {
        const range = method.sets[e.role].value;
        const sets = w.kind === "deload" ? range.min : Math.min(range.max, Math.max(range.min, e.sets + w.setsDelta));
        const rir = effectiveRir(e, method);
        const coachRir = method.effort.rir?.[e.role].value ?? null;
        const rirTarget = rir ? (w.kind === "deload" ? (coachRir?.max ?? rir.max) : rir.min) : null;
        const rest = effectiveRestSeconds(e, method);
        return {
          sets,
          reps: zone(e.reps, w.repZone),
          effort: rirTarget === null ? { metric: "plain", target: method.effort.plain?.value ?? "as prescribed", rirRange: null } : { metric: usesRpe ? "rpe" : "rir", target: usesRpe ? 10 - rirTarget : rirTarget, rirRange: coachRir ? { min: coachRir.min, max: coachRir.max } : rir },
          restMinutes: rest ? { min: rest.min / 60, max: rest.max / 60 } : null,
        };
      })
    ),
  }));

  const decided = <T>(value: T, topics: DecisionTopic[], fallback: string, rule: string): Decided<T> => {
    const ds = plan.decisions.filter((d) => topics.includes(d.topic));
    const inputs = [...new Set(ds.flatMap((d) => [...d.coachRuleKeys.map((k) => `coach:${k}`), ...d.clientFactRefs.map((r) => `client:${r}`), ...d.knowledgeRefs.map((r) => `knowledge:${r}`)]))];
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
    progression: decided({ model: plan.progression.model, rule: plan.progression.rationale }, ["progression"], plan.progression.rationale, "reasoner.progression"),
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
    unresolved: plan.unresolved,
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

  // Citations: only what was supplied.
  for (const dec of plan.decisions) {
    for (const k of dec.coachRuleKeys) if (!allowed.coachRuleKeys.has(k)) errors.push(`Cites coach rule "${k}", which wasn't provided.`);
    for (const r of dec.clientFactRefs) if (!allowed.clientFactRefs.has(r)) errors.push(`Cites client fact "${r}", which wasn't provided.`);
    for (const r of dec.knowledgeRefs) if (!allowed.knowledgeRefs.has(r)) errors.push(`Cites knowledge "${r}", which wasn't retrieved for this plan.`);
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
  for (const [id, uses] of byId) if (uses.length > 1 && !uses.some((u) => u.note)) quality.push({ code: "exercise_repeated", severity: "warning", message: `${input.knowledge.getExercise(id)?.name ?? id} appears ${uses.length}× without a stated reason.` });
  const wm = spec.resistance?.value.weeklyMuscleSets ?? {};
  const eligibleTargets = new Set(reasoning.exercises.flatMap((row) => row.split("|")[3].split(",")));
  for (const m of MAJOR_TARGETS) if (!(wm[m]?.direct > 0)) quality.push({ code: eligibleTargets.has(m) ? "target_omitted" : "target_excluded", severity: eligibleTargets.has(m) ? "warning" : "info", message: eligibleTargets.has(m) ? `${m.replace(/_/g, " ")} gets no direct work although eligible exercises exist.` : `${m.replace(/_/g, " ")} gets no direct work: no eligible exercise trains it.` });
  const pat = (ps: string[]) => plan.sessions.reduce((t, s) => t + s.exercises.reduce((u, e) => u + (input.knowledge.getExercise(e.exerciseId)?.patterns.some((p) => ps.includes(p)) ? e.sets : 0), 0), 0);
  const push = pat(["horizontal_push", "vertical_push"]);
  const pull = pat(["horizontal_pull", "vertical_pull"]);
  if (push + pull > 0 && (Math.max(push, pull) / Math.max(1, Math.min(push, pull)) > 1.5 || Math.min(push, pull) === 0)) quality.push({ code: "push_pull_balance", severity: "warning", message: `Weekly pushing sets ${push} vs pulling sets ${pull}.` });
  for (const c of plan.conflicts) quality.push({ code: "coach_method_conflict", severity: "warning", message: `Coach method tension (${c.coachRuleKey}): ${c.issue}` });
  return { ok: errors.length === 0, errors: [...new Set(errors)], quality };
}
