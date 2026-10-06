// Gate 4.0C-3 — shared fixtures for the reasoner tests and the evaluation
// harness: a real v2 Coach Brain method (built through the calibration
// pipeline) with explicit resistance answers, real ClientState derivation,
// and a scripted "model" that produces schema-valid plans from the input it
// is given (so hard rails can be tested offline, without a provider).

import { answerAllRequired } from "../../../coach/calibration/fixtures.ts";
import { buildMethodFromCalibration, type ConfirmedCoachMethod } from "../../../coach/coach-brain.ts";
import type { HealthReviewRecord, OnboardingProgress } from "../../../coach/types.ts";
import { deriveClientState } from "../../client-state.ts";
import { withCoachConfirmedGoal, type GoalSpec, type PerformanceTargetValue } from "../../goal-contract.ts";
import type { CoachStructuredRestriction } from "../../constraints.ts";
import { FOUNDATION_KNOWLEDGE } from "../../knowledge/registry.ts";
import { buildSynthesisInput, type SynthesisInput } from "../../synthesis-input.ts";
import type { ReasoningInput } from "../input.ts";
import type { ReasonerModel } from "../reasoner.ts";

export const NOW = "2026-10-03T12:00:00.000Z";
const WS = "ws-eval";
const r = (min: number, max: number, unit: string) => ({ min, max, unit });
export const layer = (base: unknown, extra: Record<string, unknown> = {}) => ({ base, varies: "no", ...extra });
export { r as range };

export function coachMethod(over: Record<string, unknown> = {}): ConfirmedCoachMethod {
  const built = buildMethodFromCalibration({
    answers: answerAllRequired({ coaching_areas: ["strength"], strength_specialties: ["general_strength"], experience_levels: ["intermediate"], client_modifiers: ["none"], nutrition_scope: "full", practice_goals: ["get_stronger", "build_muscle"] }),
    aiAuthority: { level: "advisor", domainOverrides: {} },
    aiAuthorityConfirmed: true,
    coachUserId: "coach-eval",
    workspaceId: WS,
    businessName: "OPTIM",
    methodVersion: 7,
    nowIso: NOW,
  });
  const om = structuredClone(built.operatingModel);
  const a = om.calibration!.answers as Record<string, unknown>;
  Object.assign(a, {
    t_days: layer(r(3, 6, "days/week")),
    t_session_length: r(45, 75, "min"),
    t_splits: layer(["full_body", "upper_lower", "push_pull_legs"]),
    t_sets: layer(r(2, 4, "sets"), { varies: "exercise_type", exceptions: { main: r(3, 4, "sets"), accessory: r(2, 3, "sets") } }),
    t_reps: layer(r(5, 15, "reps")),
    t_effort_metric: ["rir"],
    t_effort_rir: layer(r(1, 3, "reps in reserve")),
    t_progression_method: layer(["double_progression"]),
    t_long_term_structure: layer("linear_phases"),
    t_deload_approach: "fixed",
    t_deload_every: r(4, 5, "weeks"),
    t_rest_periods: layer(r(1, 3, "min")),
    program_length: layer(r(8, 12, "weeks")),
    t_warmup: "minimal",
    t_exercises_avoided: [],
  });
  delete a.t_effort_plain;
  delete a.t_deload_triggers;
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete a[k];
    else a[k] = v;
  }
  return { versionId: "mv-eval-7", version: 7, source: "calibration", confirmedAtIso: NOW, operatingModel: om, aiAuthority: built.aiAuthority };
}

const BASE = {
  about_you: { age: 30, sex: "female", heightFeet: 5, heightInchesRemainder: 6, weightLb: 150, weightDirection: "stable" },
  your_week: { availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"] },
  starting_point: { trainingExperience: "comfortable_common", recentConsistency: "very_consistent", weeklyFrequency: 4 },
  fuel_recovery: { typicalSleep: "7_8", hasDietaryRestrictions: "none" },
  what_you_want: { primaryGoal: "build_muscle", secondaryGoals: [] },
  health_finish: { hasInjuryHistory: false, safetyScreen: ["none"] },
};
export type Patch = Record<string, Record<string, unknown> | undefined>;

export function scenarioInput(opts: { patch?: Patch; coach?: ConfirmedCoachMethod | null; restrictions?: CoachStructuredRestriction[]; healthReview?: HealthReviewRecord | null; coachConfirmedGoal?: GoalSpec; coachConfirmedTargets?: PerformanceTargetValue[]; clientId?: string; /** Coach-confirmed specific equipment (apparatus id → state). */ equipment?: Record<string, "available" | "unavailable"> } = {}): SynthesisInput {
  const id = opts.clientId ?? "client-eval";
  const answers = structuredClone(BASE) as Record<string, Record<string, unknown>>;
  for (const [step, values] of Object.entries(opts.patch ?? {})) {
    if (values === undefined) delete answers[step];
    else answers[step] = { ...(answers[step] ?? {}), ...values };
  }
  const onboarding = { clientId: id, workspaceId: WS, currentStepIndex: 6, answers, completedAtIso: NOW, updatedAtIso: NOW } as unknown as OnboardingProgress;
  const client = deriveClientState({ clientProfileId: id, workspaceId: WS, onboarding, healthReview: opts.healthReview ?? null, equipmentProfile: opts.equipment ? { apparatus: opts.equipment, confirmedAtIso: NOW } : null });
  const input = buildSynthesisInput({ knowledge: FOUNDATION_KNOWLEDGE, coachMethod: opts.coach === undefined ? coachMethod() : opts.coach, client, coachStructuredRestrictions: opts.restrictions });
  return opts.coachConfirmedGoal ? { ...input, goal: withCoachConfirmedGoal(input.goal, opts.coachConfirmedGoal, opts.coachConfirmedTargets) } : input;
}

export const restrict = (tags: CoachStructuredRestriction["tags"], id = "eval"): CoachStructuredRestriction[] => [{ id, interprets: [], description: "Coach-confirmed restriction (eval)", tags, ref: "eval" }];

// ---------------------------------------------------------------------------
// Scripted model: builds a schema-valid (v2) plan from the reasoning input.
// ---------------------------------------------------------------------------

const rule = (ri: ReasoningInput, label: string) => ri.coach.rules.find((x) => x[1] === label);
const rangeOf = (v: unknown) => {
  const [min, max] = v as [number, number];
  return { min, max };
};

/** The v2 wire shape (what a model returns) — loose on purpose so tests can corrupt any field. */
export interface WireExercise { id: string; role: string; sets: number; reps: number[]; rir?: number[]; rest?: number[]; note?: string }
export interface WireSession { day: string; title: string; purpose: string; targets?: string[]; exercises: WireExercise[] }
export interface WireCoverage { target: string; status: string; cause?: string; why?: string }
export interface WireRolePlan { zones: string[]; rir?: number; sets?: number; progress: string }
export interface WirePhase { weeks: number[]; focus: string; intent: string; main: WireRolePlan; accessory: WireRolePlan }
export interface WirePlan {
  domain: string;
  goalEmphasis: { primary: string; secondary: string | null; why: string };
  frequency: { days: number | string; why: string };
  schedule: { days: string[]; why: string };
  architecture: { split: string; name: string; why: string };
  sessions: WireSession[];
  weeks: number;
  progression: { model: string; why: string; phases: WirePhase[]; deloadWeeks: number[] };
  deviations?: Array<{ field: string; because: string; coach: string[]; client: string[] }>;
  goalAccess?: Array<{ target: string; exercise: string; status: string; blockedBy?: string; interim?: string }>;
  constraintsApplied: Array<{ id: string; how: string }>;
  conflicts?: Array<{ rule: string; issue: string }>;
  decisions: Array<{ topic: string; decision: string; because: string; coach: string[]; client: string[]; evidence: string[] }>;
  coverage?: WireCoverage[];
}

export function scriptedOutput(ri: ReasoningInput, tweak?: (p: WirePlan) => void): { status: "PLAN"; plan: WirePlan } {
  const days = ri.anchors.days.value;
  const schedule = ri.bounds.available.slice(0, days);
  const split = (rule(ri, `splits allowed at ${days} days`)?.[2] as string[] | undefined)?.[0] ?? "full_body";
  const sets = { main: rangeOf(rule(ri, "sets main")![2]), accessory: rangeOf(rule(ri, "sets accessory")![2]) };
  const reps = { main: rangeOf(rule(ri, "reps main")![2]), accessory: rangeOf(rule(ri, "reps accessory")![2]) };
  const deload = String(rule(ri, "deloads")![2]);
  const every = /^fixed every (\d+)/.exec(deload)?.[1];
  const weeks = ri.anchors.weeks?.value ?? 8;
  const rirRule = (role: "main" | "accessory") => rule(ri, `RIR ${role}`);
  const progressFor = (role: "main" | "accessory") => ((rule(ri, `progression order ${role}`) ?? rule(ri, "progression order main"))?.[2] as string[] | undefined)?.[0] ?? "hold";
  const rows = ri.exercises.map((r) => r.split("|"));
  let cursor = 0;
  const sessions = schedule.map((day, i) => ({
    day,
    title: `Session ${String.fromCharCode(65 + i)}`,
    purpose: `Scripted session ${i + 1}`,
    exercises: [0, 1, 2].map((k) => {
      const row = rows[cursor++ % rows.length];
      const role = k === 0 && row[5] === "C" ? "main" : "accessory";
      const fit = row.at(-1);
      const side = /on the (left|right) side only/.exec(ri.constraints.flatMap((c) => c.rules).join(" "))?.[1];
      const submax = fit === "K" || fit === "U";
      const coachRir = rirRule(role) ? rangeOf(rirRule(role)![2]) : null;
      // Differentiated effort: mains near the hard end, accessories further from failure; S rows stay submaximal.
      // Differentiated: the last accessory slot sits furthest from failure (keeps the default plan's effort varied
      // whatever rows the pool lists first).
      const lo = coachRir ? Math.min(coachRir.max, Math.max(coachRir.min + (role === "accessory" ? (k === 2 ? 2 : 1) : 0), submax ? 2 : 0)) : 0;
      const rir = coachRir ? [lo, Math.max(lo, coachRir.max)] : undefined;
      const repMin = submax ? Math.min(reps[role].max, Math.max(reps[role].min, 6)) : reps[role].min;
      return { id: row[0], role, sets: sets[role].min, reps: [repMin, reps[role].max], ...(rir ? { rir } : {}), note: fit === "U" ? "Scripted: no compatible alternative in the pool for this slot." : fit === "S" ? `Scripted: ${side ?? "unaffected"} side only.` : "Scripted; repeats only when the pool is small." };
    }),
  }));
  const coachKey = ri.coach.rules[0][0];
  const factRef = Object.keys(ri.client.facts)[0];
  const claimRef = ri.evidence[0]?.ref;
  const plan: WirePlan = {
    domain: ri.domain.primary === "general_fitness" ? "general_fitness" : "resistance",
    goalEmphasis: { primary: ri.domain.emphasis ?? "general", secondary: null, why: "Scripted." },
    frequency: { days, why: "Scripted: lowest allowed frequency." },
    schedule: { days: schedule, why: "Scripted: first available days." },
    architecture: { split, name: "Scripted", why: "Scripted." },
    sessions,
    weeks,
    goalAccess: ri.goal.targets.filter((t) => t.exercise && t.status !== "unknown_exercise").map((t) => (t.status === "direct" ? { target: t.target, exercise: t.exercise!, status: "direct" } : { target: t.target, exercise: t.exercise!, status: "blocked", ...(t.blockedBy ? { blockedBy: t.blockedBy } : {}), interim: "Scripted interim: trains the muscles involved." })),
    progression: { model: "scripted", why: "Scripted.", phases: [{ weeks: [1, weeks], focus: "Scripted build", intent: "Scripted: one phase.", main: { zones: ["as_prescribed"], rir: 0, sets: 0, progress: progressFor("main") }, accessory: { zones: ["as_prescribed"], rir: 0, sets: 0, progress: progressFor("accessory") } }], deloadWeeks: every ? Array.from({ length: Math.floor(weeks / Number(every)) }, (_, i) => (i + 1) * Number(every)) : [] },
    constraintsApplied: ri.constraints.map((c) => ({ id: c.id, how: "Respected (scripted)." })),
    decisions: (["frequency", "structure", "schedule", "exercise_selection", "prescription", "effort", "progression", "recovery", "duration"] as const).map((topic) => ({ topic, decision: `Scripted ${topic}`, because: "Scripted.", coach: [coachKey], client: factRef ? [factRef] : [], evidence: claimRef ? [claimRef] : [] })),
  };
  tweak?.(plan);
  finalizeDeclarations(ri, plan);
  return { status: "PLAN", plan };
}

/**
 * Gate 4.0C-5 — fills session targets and coverage HONESTLY from the plan's actual exercises (after any tweak),
 * unless a test set them explicitly: targets = the session's most-trained primary muscles; coverage = trained when
 * a target gets direct sets, otherwise not_trained (infeasible → available_exercises); an unbalanced push/pull week
 * declares its lower side reduced.
 */
export function finalizeDeclarations(ri: ReasoningInput, plan: WirePlan) {
  const rows = new Map(ri.exercises.map((r) => r.split("|")).map((r) => [r[0], r]));
  const primary = (id: string) => (rows.get(id)?.[3] ?? "").split(",").filter(Boolean);
  const patterns = (id: string) => (rows.get(id)?.[2] ?? "").split(",").filter(Boolean);
  for (const s of plan.sessions) {
    if (s.targets) continue;
    const by = new Map<string, number>();
    for (const e of s.exercises) for (const m of primary(e.id)) by.set(m, (by.get(m) ?? 0) + e.sets);
    s.targets = [...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([m]) => m);
    if (!s.targets.length) s.targets = ["chest"];
  }
  if (plan.coverage || !ri.functions) return;
  const sets = new Map<string, number>();
  for (const s of plan.sessions) for (const e of s.exercises) for (const m of primary(e.id)) sets.set(m, (sets.get(m) ?? 0) + e.sets);
  const infeasible = new Set(ri.functions.unavailable.map((f) => f.target));
  plan.coverage = ri.functions.considered.map((t) => (infeasible.has(t) ? { target: t, status: "not_trained", cause: "available_exercises", why: "Scripted: no eligible exercise trains it." } : (sets.get(t) ?? 0) > 0 ? { target: t, status: "trained" } : { target: t, status: "not_trained", cause: "goal_priority", why: "Scripted: not selected this block." }));
  const side = (ps: string[]) => plan.sessions.reduce((t, s) => t + s.exercises.reduce((u, e) => u + (patterns(e.id).some((p) => ps.includes(p)) ? e.sets : 0), 0), 0);
  const push = side(["horizontal_push", "vertical_push"]);
  const pull = side(["horizontal_pull", "vertical_pull"]);
  if (push + pull > 0 && (Math.max(push, pull) / Math.max(1, Math.min(push, pull)) > 1.5 || Math.min(push, pull) === 0)) {
    const lower = pull < push ? ["lats", "mid_back"] : ["chest"];
    for (const c of plan.coverage) if (lower.includes(c.target) && c.status === "trained") Object.assign(c, { status: "reduced", cause: "goal_priority", why: "Scripted: lower side of the push/pull balance this block." });
    if (!plan.coverage.some((c) => lower.includes(c.target) && c.status !== "trained")) {
      const c = plan.coverage.find((x) => lower.includes(x.target));
      if (c) Object.assign(c, { status: "reduced", cause: "goal_priority", why: "Scripted: lower side of the push/pull balance this block." });
    }
  }
}

/** A fake model (ReasonerModel): calls `respond` with the parsed reasoning input; counts calls. */
export function fakeModel(respond: (ri: ReasoningInput, attempt: number) => unknown): ReasonerModel & { calls: number; lastInput: ReasoningInput | null; lastUserMessage: string } {
  const m = {
    provider: "scripted",
    modelId: "scripted-model",
    calls: 0,
    lastInput: null as ReasoningInput | null,
    lastUserMessage: "",
    async generate(req: { userMessage: string }) {
      m.calls++;
      m.lastUserMessage = req.userMessage;
      const json = req.userMessage.split("\n\nYour previous output was rejected")[0];
      const ri = JSON.parse(json) as ReasoningInput;
      m.lastInput = ri;
      return { json: respond(ri, m.calls), usage: { inputTokens: Math.ceil(req.userMessage.length / 4), outputTokens: 1000 }, latencyMs: 1, requestId: `req_scripted_${m.calls}` };
    },
  };
  return m;
}
