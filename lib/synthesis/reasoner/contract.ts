// Gate 4.0C-3 / 3A — the reasoner's strict output contract and its prompt.
//
// v2 (Reasoner v1.1) is decision-focused: the model returns the plan's
// DECISIONS (structure, session purposes, exercise ids, prescriptions,
// a progression pattern, short rationale with references). Everything
// OPTIM can derive deterministically — default rest/effort from the coach's
// ranges, every week's prescription, week notes, the coach's deload
// triggers in monitoring, constraint bookkeeping — is derived in expand.ts,
// not narrated by the model. The parser is strict: wrong types, unknown
// values or oversized text reject the output; nothing is coerced. Text
// caps only stop runaway prose — the first live v1.1 run showed tighter
// caps rejected otherwise-valid plans (failure taxonomy: SCHEMA_LIMITATION):
// 10 of 25 first attempts failed only on prose length or list size, each
// costing a repair call. Caps now sit well above observed good outputs.

import type { DayOfWeek } from "../../types.ts";
import { DAY_ORDER } from "../client-state.ts";
import { MUSCLES, type MuscleId } from "../knowledge/taxonomy.ts";
import type { CoverageCause, CoverageStatus } from "./adequacy.ts";

export const REASONER_PROMPT_VERSION = "reasoner-resistance-v2.6.0";

export const DECISION_TOPICS = ["frequency", "structure", "schedule", "exercise_selection", "prescription", "effort", "progression", "recovery", "duration", "other"] as const;
export type DecisionTopic = (typeof DECISION_TOPICS)[number];
export type RepZone = "as_prescribed" | "lower_half" | "upper_half";

export interface ReasonerExercise {
  exerciseId: string;
  role: "main" | "accessory";
  sets: number;
  reps: { min: number; max: number };
  /** Inside the coach's RIR range. Required whenever the coach's method uses RIR/RPE (validator): a
   * coach range is a boundary, not an instruction, so effort is always a deliberate per-exercise choice. */
  rir: { min: number; max: number } | null;
  /** Narrower than the coach's rest range (seconds), or null = the coach's range for this role. */
  restSeconds: { min: number; max: number } | null;
  /** Only when it adds information (e.g. why it repeats). */
  note: string | null;
}

export interface ReasonerSession {
  day: DayOfWeek;
  title: string;
  purpose: string;
  /** Gate 4.0C-5 — the muscles this session primarily trains (validated: they get at least half its direct sets).
   * Absent only on runs made before v2.4. */
  targets?: MuscleId[];
  exercises: ReasonerExercise[];
}

/** Gate 4.0C-5 — the plan's declaration for one required function (functions.required). */
export interface ReasonerCoverage {
  target: MuscleId;
  status: CoverageStatus;
  cause: CoverageCause | null;
  why: string | null;
}

export interface ReasonerDecision {
  topic: DecisionTopic;
  decision: string;
  because: string;
  coachRuleKeys: string[];
  clientFactRefs: string[];
  /** Confirmed-constraint aliases from "constraints" (C1…) — their own namespace, never client facts. Absent before v2.6. */
  constraintRefs?: string[];
  knowledgeRefs: string[];
}

/** Gate 4.0C-3B — a goal-specific exercise and whether the plan can train it directly. */
export interface GoalAccess {
  target: string;
  exerciseId: string;
  status: "direct" | "blocked";
  /** Constraint alias or "t_exercises_avoided" — required when blocked. */
  blockedBy: string | null;
  /** What the interim work preserves or develops while direct work is blocked. */
  interim: string | null;
}

/** Gate 4.0C-3B — a departure from OPTIM's structural anchor, with its client/coach-specific reason. */
export interface AnchorDeviation {
  field: "days" | "weeks";
  because: string;
  coachRuleKeys: string[];
  clientFactRefs: string[];
  /** Confirmed-constraint aliases (absent before v2.6). */
  constraintRefs?: string[];
}

/** Gate 4.0C-3C — what a phase does to one role's prescriptions, applied deterministically to every week in it. */
export interface PhaseRolePlan {
  /** Cycled week by week inside the phase, applied to each exercise's listed rep range. */
  repZones: RepZone[];
  /** Added to each exercise's listed RIR (−1 = closer to failure). */
  rirDelta: number;
  /** Added to each exercise's listed sets where the coach's set range has headroom; exercises at the boundary keep their listed sets. */
  setsDelta: number;
  /** How loads advance: one of the coach's progression methods for the role, or "hold". */
  progress: string;
}

/** Executable: focus/intent are labels without numbers; the numbers live in main/accessory. */
export interface ProgressionPhase {
  weeks: { min: number; max: number };
  focus: string;
  intent: string;
  main: PhaseRolePlan;
  accessory: PhaseRolePlan;
}

export interface ReasonerPlan {
  domain: "resistance" | "general_fitness";
  goalEmphasis: { primary: "strength" | "hypertrophy" | "general"; secondary: "strength" | "hypertrophy" | null; rationale: string };
  frequency: { daysPerWeek: number; rationale: string };
  schedule: { days: DayOfWeek[]; rationale: string };
  architecture: { split: string; name: string; rationale: string };
  sessions: ReasonerSession[];
  durationWeeks: number;
  /** repZones / setsDeltas cycle week by week; deloadWeeks are explicit. */
  /** Phases ARE the weekly prescription (Gate 4.0C-3C): weeks are expanded from them; deloadWeeks override. */
  progression: { model: string; rationale: string; phases: ProgressionPhase[]; deloadWeeks: number[] };
  goalAccess: GoalAccess[];
  deviations: AnchorDeviation[];
  monitoring: string[];
  constraintsApplied: Array<{ constraintId: string; how: string }>;
  assumptions: string[];
  unresolved: Array<{ fact: string; why: string; providedBy: "client" | "coach" | "either" }>;
  conflicts: Array<{ coachRuleKey: string; issue: string }>;
  decisions: ReasonerDecision[];
  /** Gate 4.0C-5 — absent only on runs made before v2.4. */
  coverage?: ReasonerCoverage[];
}

export type ReasonerOutput =
  | { status: "PLAN"; plan: ReasonerPlan }
  | { status: "NEEDS_INPUT"; needsInput: Array<{ fact: string; why: string; blockedDecision: string; providedBy: "client" | "coach" | "either" }>; summary: string };

// ---------------------------------------------------------------------------
// Strict parser
// ---------------------------------------------------------------------------

class SchemaError extends Error {}
const obj = (v: unknown, at: string): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new SchemaError(`${at} must be an object`);
  return v as Record<string, unknown>;
};
const arr = (v: unknown, at: string, max = 60): unknown[] => {
  if (!Array.isArray(v)) throw new SchemaError(`${at} must be an array`);
  if (v.length > max) throw new SchemaError(`${at} has too many items (max ${max})`);
  return v;
};
const str = (v: unknown, at: string, max: number): string => {
  if (typeof v !== "string" || !v.trim()) throw new SchemaError(`${at} must be a non-empty string`);
  if (v.length > max) throw new SchemaError(`${at} is too long (max ${max} chars)`);
  return v.trim();
};
const optStr = (v: unknown, at: string, max: number): string | null => (v === undefined || v === null || v === "" ? null : str(v, at, max));
/** A display label (architecture name, session title): a model label over `max` is shortened deterministically
 * instead of costing a whole attempt (live 4.0C-5: an 86-char architecture.name rejected an otherwise-parsed plan).
 * A trailing parenthetical goes first ("5-day body-part split (chest/triceps, …)" → "5-day body-part split"), then the
 * label is cut at a word boundary with "…". Beyond `runaway` it is still rejected. The raw output stays in the run. */
export const shortenLabel = (v: string, max: number): string => {
  if (v.length <= max) return v;
  let t = v;
  while (t.length > max && /\s*[(\[][^()[\]]*[)\]]\s*$/.test(t)) t = t.replace(/\s*[(\[][^()[\]]*[)\]]\s*$/, "").trim();
  if (t.length >= 3 && t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.search(/\s\S*$/);
  return `${(space >= max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:/(+–—-]+$/, "")}…`;
};
const label = (v: unknown, at: string, max: number, runaway: number): string => shortenLabel(str(v, at, runaway), max);
const int = (v: unknown, at: string, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new SchemaError(`${at} must be an integer ${min}–${max}`);
  return v;
};
const num = (v: unknown, at: string, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new SchemaError(`${at} must be a number ${min}–${max}`);
  return v;
};
const oneOf = <T extends string>(v: unknown, at: string, allowed: readonly T[]): T => {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) throw new SchemaError(`${at} must be one of ${allowed.join(", ")}`);
  return v as T;
};
/** [min, max] pair. */
const pair = (v: unknown, at: string, min: number, max: number, integer: boolean) => {
  const a = arr(v, at, 2);
  if (a.length !== 2) throw new SchemaError(`${at} must be [min, max]`);
  const lo = integer ? int(a[0], `${at}[0]`, min, max) : num(a[0], `${at}[0]`, min, max);
  const hi = integer ? int(a[1], `${at}[1]`, min, max) : num(a[1], `${at}[1]`, min, max);
  if (lo > hi) throw new SchemaError(`${at}: min must not exceed max`);
  return { min: lo, max: hi };
};
const strList = (v: unknown, at: string, maxItems: number, maxLen: number) => (v === undefined ? [] : arr(v, at, maxItems).map((x, i) => str(x, `${at}[${i}]`, maxLen)));
const PROVIDERS = ["client", "coach", "either"] as const;
const MUSCLE_IDS = Object.keys(MUSCLES) as MuscleId[];
const COVERAGE_STATUS = ["trained", "reduced", "not_trained"] as const;
const COVERAGE_CAUSE = ["goal_priority", "time", "constraints", "available_exercises"] as const;
const ZONES = ["as_prescribed", "lower_half", "upper_half"] as const;

export type ParsedOutput = { ok: true; output: ReasonerOutput } | { ok: false; errors: string[] };

export function parseReasonerOutput(raw: unknown): ParsedOutput {
  try {
    const o = obj(raw, "output");
    const status = oneOf(o.status, "status", ["PLAN", "NEEDS_INPUT"] as const);
    if (status === "NEEDS_INPUT") {
      const needsInput = arr(o.needsInput, "needsInput", 10).map((x, i) => {
        const n = obj(x, `needsInput[${i}]`);
        return { fact: str(n.fact, `needsInput[${i}].fact`, 160), why: str(n.why, `needsInput[${i}].why`, 300), blockedDecision: str(n.blockedDecision, `needsInput[${i}].blockedDecision`, 200), providedBy: oneOf(n.providedBy, `needsInput[${i}].providedBy`, PROVIDERS) };
      });
      if (!needsInput.length) throw new SchemaError("needsInput must list at least one missing input");
      return { ok: true, output: { status, needsInput, summary: str(o.summary, "summary", 300) } };
    }
    const p = obj(o.plan, "plan");
    const ge = obj(p.goalEmphasis, "plan.goalEmphasis");
    const fr = obj(p.frequency, "plan.frequency");
    const sc = obj(p.schedule, "plan.schedule");
    const ar = obj(p.architecture, "plan.architecture");
    const pr = obj(p.progression, "plan.progression");
    const sessions = arr(p.sessions, "plan.sessions", 7).map((x, i): ReasonerSession => {
      const s = obj(x, `sessions[${i}]`);
      return {
        day: oneOf(s.day, `sessions[${i}].day`, DAY_ORDER),
        title: label(s.title, `sessions[${i}].title`, 80, 240),
        purpose: str(s.purpose, `sessions[${i}].purpose`, 240),
        targets: (() => {
          const t = arr(s.targets, `sessions[${i}].targets`, 4).map((m, j) => oneOf(m, `sessions[${i}].targets[${j}]`, MUSCLE_IDS));
          if (!t.length) throw new SchemaError(`sessions[${i}].targets must name at least one muscle`);
          return [...new Set(t)];
        })(),
        exercises: arr(s.exercises, `sessions[${i}].exercises`, 10).map((y, j): ReasonerExercise => {
          const e = obj(y, `sessions[${i}].exercises[${j}]`);
          const at = `sessions[${i}].exercises[${j}]`;
          return {
            exerciseId: str(e.id, `${at}.id`, 80),
            role: oneOf(e.role, `${at}.role`, ["main", "accessory"] as const),
            sets: int(e.sets, `${at}.sets`, 1, 12),
            reps: pair(e.reps, `${at}.reps`, 1, 50, true),
            rir: e.rir === undefined || e.rir === null ? null : pair(e.rir, `${at}.rir`, 0, 10, false),
            restSeconds: e.rest === undefined || e.rest === null ? null : pair(e.rest, `${at}.rest`, 0, 900, true),
            note: optStr(e.note, `${at}.note`, 200),
          };
        }),
      };
    });
    const rolePlan = (v: unknown, at: string): PhaseRolePlan => {
      const r = obj(v, at);
      const repZones = arr(r.zones, `${at}.zones`, 8).map((z, i) => oneOf(z, `${at}.zones[${i}]`, ZONES));
      if (!repZones.length) throw new SchemaError(`${at}.zones must have at least one entry`);
      return { repZones, rirDelta: int(r.rir ?? 0, `${at}.rir`, -1, 1), setsDelta: int(r.sets ?? 0, `${at}.sets`, -1, 1), progress: str(r.progress, `${at}.progress`, 40) };
    };
    const phases = arr(pr.phases, "progression.phases", 6).map((x, i): ProgressionPhase => {
      const ph = obj(x, `progression.phases[${i}]`);
      const at = `progression.phases[${i}]`;
      return { weeks: pair(ph.weeks, `${at}.weeks`, 1, 52, true), focus: str(ph.focus, `${at}.focus`, 60), intent: str(ph.intent, `${at}.intent`, 300), main: rolePlan(ph.main, `${at}.main`), accessory: rolePlan(ph.accessory, `${at}.accessory`) };
    });
    if (!phases.length) throw new SchemaError("progression.phases must describe the block");
    const plan: ReasonerPlan = {
      domain: oneOf(p.domain, "plan.domain", ["resistance", "general_fitness"] as const),
      goalEmphasis: { primary: oneOf(ge.primary, "goalEmphasis.primary", ["strength", "hypertrophy", "general"] as const), secondary: ge.secondary === null || ge.secondary === undefined ? null : oneOf(ge.secondary, "goalEmphasis.secondary", ["strength", "hypertrophy"] as const), rationale: str(ge.why, "goalEmphasis.why", 400) },
      frequency: { daysPerWeek: int(fr.days, "frequency.days", 1, 7), rationale: str(fr.why, "frequency.why", 400) },
      schedule: { days: arr(sc.days, "schedule.days", 7).map((d, i) => oneOf(d, `schedule.days[${i}]`, DAY_ORDER)), rationale: str(sc.why, "schedule.why", 400) },
      architecture: { split: str(ar.split, "architecture.split", 40), name: label(ar.name, "architecture.name", 80, 240), rationale: str(ar.why, "architecture.why", 400) },
      sessions,
      durationWeeks: int(p.weeks, "plan.weeks", 1, 52),
      progression: {
        model: str(pr.model, "progression.model", 300),
        rationale: str(pr.why, "progression.why", 400),
        phases,
        deloadWeeks: pr.deloadWeeks === undefined ? [] : arr(pr.deloadWeeks, "progression.deloadWeeks", 12).map((w, i) => int(w, `progression.deloadWeeks[${i}]`, 1, 52)),
      },
      goalAccess: (p.goalAccess === undefined ? [] : arr(p.goalAccess, "plan.goalAccess", 4)).map((x, i): GoalAccess => {
        const g = obj(x, `goalAccess[${i}]`);
        return { target: str(g.target, `goalAccess[${i}].target`, 120), exerciseId: str(g.exercise, `goalAccess[${i}].exercise`, 80), status: oneOf(g.status, `goalAccess[${i}].status`, ["direct", "blocked"] as const), blockedBy: optStr(g.blockedBy, `goalAccess[${i}].blockedBy`, 40), interim: optStr(g.interim, `goalAccess[${i}].interim`, 400) };
      }),
      deviations: (p.deviations === undefined ? [] : arr(p.deviations, "plan.deviations", 2)).map((x, i): AnchorDeviation => {
        const d = obj(x, `deviations[${i}]`);
        return { field: oneOf(d.field, `deviations[${i}].field`, ["days", "weeks"] as const), because: str(d.because, `deviations[${i}].because`, 400), coachRuleKeys: strList(d.coach, `deviations[${i}].coach`, 6, 80), clientFactRefs: strList(d.client, `deviations[${i}].client`, 6, 120), constraintRefs: strList(d.constraints, `deviations[${i}].constraints`, 6, 40) };
      }),
      monitoring: strList(p.monitoring, "plan.monitoring", 6, 200),
      constraintsApplied: (p.constraintsApplied === undefined ? [] : arr(p.constraintsApplied, "plan.constraintsApplied", 15)).map((x, i) => {
        const c = obj(x, `constraintsApplied[${i}]`);
        // 600 (Gate 4.0C-3C live evidence): accounting for conditional/uncertain constraint fit made a valid plan's
        // "how" run past 300 chars — a SCHEMA_LIMITATION rejection, the same class 3A fixed for other text fields.
        return { constraintId: str(c.id, `constraintsApplied[${i}].id`, 200), how: str(c.how, `constraintsApplied[${i}].how`, 600) };
      }),
      assumptions: strList(p.assumptions, "plan.assumptions", 10, 300),
      unresolved: (p.unresolved === undefined ? [] : arr(p.unresolved, "plan.unresolved", 10)).map((x, i) => {
        const u = obj(x, `unresolved[${i}]`);
        return { fact: str(u.fact, `unresolved[${i}].fact`, 160), why: str(u.why, `unresolved[${i}].why`, 400), providedBy: oneOf(u.from, `unresolved[${i}].from`, PROVIDERS) };
      }),
      conflicts: (p.conflicts === undefined ? [] : arr(p.conflicts, "plan.conflicts", 10)).map((x, i) => {
        const c = obj(x, `conflicts[${i}]`);
        return { coachRuleKey: str(c.rule, `conflicts[${i}].rule`, 80), issue: str(c.issue, `conflicts[${i}].issue`, 400) };
      }),
      decisions: arr(p.decisions, "plan.decisions", 12).map((x, i): ReasonerDecision => {
        const d = obj(x, `decisions[${i}]`);
        return {
          topic: oneOf(d.topic, `decisions[${i}].topic`, DECISION_TOPICS),
          decision: str(d.decision, `decisions[${i}].decision`, 300),
          because: str(d.because, `decisions[${i}].because`, 600),
          coachRuleKeys: strList(d.coach, `decisions[${i}].coach`, 10, 80),
          clientFactRefs: strList(d.client, `decisions[${i}].client`, 10, 120),
          constraintRefs: strList(d.constraints, `decisions[${i}].constraints`, 10, 40),
          knowledgeRefs: strList(d.evidence, `decisions[${i}].evidence`, 10, 120),
        };
      }),
    };
    plan.coverage = arr(p.coverage, "plan.coverage", 16).map((x, i): ReasonerCoverage => {
      const c = obj(x, `coverage[${i}]`);
      const status = oneOf(c.status, `coverage[${i}].status`, COVERAGE_STATUS);
      const limited = status !== "trained";
      return { target: oneOf(c.target, `coverage[${i}].target`, MUSCLE_IDS), status, cause: limited ? oneOf(c.cause, `coverage[${i}].cause`, COVERAGE_CAUSE) : null, why: limited ? str(c.why, `coverage[${i}].why`, 300) : null };
    });
    if (!plan.decisions.length) throw new SchemaError("plan.decisions must explain the main decisions");
    return { ok: true, output: { status, plan } };
  } catch (err) {
    if (err instanceof SchemaError) return { ok: false, errors: [err.message] };
    return { ok: false, errors: ["output could not be read"] };
  }
}

// ---------------------------------------------------------------------------
// Prompt (versioned; separate from chat)
// ---------------------------------------------------------------------------

export const REASONER_SYSTEM_PROMPT = `You are OPTIM's Fitness Reasoner for resistance training (strength, hypertrophy, general resistance support). You design one client's plan as structured decisions for their coach to review. Deterministic validators check every field and reject violations; you never approve or publish.

AUTHORITY — higher always wins
1. System safety rules.
2. "constraints": the coach-confirmed, client-specific boundary. It is COMPLETE: do not add, widen or narrow restrictions from anything else. Only exercises listed in "exercises" are eligible.
3. "coach": this coach's method. Stay inside every range and rule (days, splits allowed for the chosen day count, sets, reps, RIR, rest, progression order, long-term structure, program length, deload approach). Where the coach leaves discretion, decide from client facts and evidence. If the method seems wrong for this client, follow it and report the tension in "conflicts".
4. "client" facts and goal.
5. "evidence": general support. Cite only its refs. A claim marked NO SOURCE is an open question, not evidence.
6. Your own judgement — only inside all of the above.

DESIGN PRINCIPLES
- Decide the architecture before choosing exercises: days per week (available days are a ceiling, not a target), split, then each session's purpose and placement for recovery between sessions that load the same muscles.
- Every session has one clear purpose. Repeat an exercise in the week only on purpose, and say why in its note.
- Solve for the strongest program the CURRENT state allows: if the constraints remove the usual way to train something, rethink the whole week (split, session composition, exercise selection, volume distribution) rather than filling the gap with unrelated work.
- COVERAGE: report each muscle in "functions.considered" exactly once in "coverage": "trained" (it gets direct sets), or "reduced"/"not_trained" with a "cause" — goal_priority or time (your deliberate choice), constraints or available_exercises (the current restrictions/eligible exercises prevent adequate work) — and a one-sentence "why". "functions.required" are muscles the client's goal requires: train them, or say why you can't. "functions.unavailable" lists muscles no offered exercise trains: declare them not_trained. Which other muscles to train, and how much, is your judgment from the goal and the coach's method — but never declare something trained that isn't, and never hide a constraint-caused gap: the coach decides on every constraints/available_exercises limitation.
- SESSION TARGETS: give each session the 1–4 muscles it primarily trains ("targets"); each must actually be trained in that session. A session whose usual main work is unavailable is rebuilt or relabelled honestly, never padded.
- Balance weekly pushing and pulling unless the goal or the constraints justify otherwise — then say why in a decision.
- Fit each session inside bounds.minutes, including rest and warm-up.
- STRUCTURAL ANCHORS: use anchors.days and anchors.weeks unless a fact or coach rule specific to this client requires otherwise — general population guidance alone is not a reason to depart. Record any departure in "deviations" with the client/coach refs that require it.
- GOAL ACCESS: every entry in goal.targets (structured — prefer these) and any specific lift or skill named only in the goal's free text goes in "goalAccess". If its exercise appears in "blocked", the goal still stands but direct progression toward it is paused: status "blocked", blockedBy = the key it is listed under, interim = the qualities the plan preserves or develops meanwhile. Never describe interim exercises as progressing the blocked lift itself; resuming direct work is the coach's call.
- EFFORT: coach effort ranges are boundaries, not targets. Choose each exercise's rir from its role, the session's purpose and priority, its fatigue cost (demands), how often those muscles are trained that week, and recovery — keep high-fatigue and repeated work further from failure and reserve the hard end for few, low-fatigue, high-priority sets. Explain the distribution in an "effort" decision. Exercises marked K or U (constraint-fit column) need reps min ≥ 6 and rir min ≥ 2 in every week.
- EXERCISE SELECTION: choose from the candidates by the training function a session needs, not by name — use "emphasis" (what a variation actually trains, e.g. lats vs upper back), "path", "trunk support" and "role". When the usual exercise for a function is excluded, look for candidates that preserve that function (same muscles/emphasis, a pattern that trains them) and say which function each choice serves; if none preserves it adequately, declare the shortfall in "coverage" rather than filling the slot with unrelated work.
- CONSTRAINT FIT: "-" fits the constraints; K fits only under its stated conditions (submaximal; where it has a pad/bench, trunk kept against it — or as the coach cleared it). Exercises whose fit OPTIM can't establish are not offered. Never describe K work as proven safe.
- PROGRESSION is a designed, executable block: contiguous phases covering week 1 to the last week. OPTIM computes every week's prescription from them, starting from each exercise as you list it: per role, "zones" (cycled weekly inside the phase: lower_half = heavier end of the listed rep range, upper_half = lighter end), "rir" (−1/0/+1 added to the listed RIR), "sets" (−1/0/+1 added to the listed sets of each exercise that has room inside the coach's set range; exercises at that boundary keep their listed sets) and "progress" (one of the coach's progression methods for that role, or "hold"). Every resulting week must stay inside the coach's ranges and each exercise's constraint-fit minimums. "focus" and "intent" are short labels with NO numbers — all numbers live in the structure, so the text can't contradict the prescription.
- If a decision-critical fact is missing or contradictory, return NEEDS_INPUT instead of guessing. Never invent client facts. Medical questions go to the coach.
- REFERENCES — four separate namespaces; each id goes only in its own list: "coach" = coach rule keys; "client" = keys of client.facts ONLY; "constraints" = ids from "constraints" (C1, C2, …) — a restriction is never a client fact; "evidence" = evidence refs.

OUTPUT — one JSON object, no prose. Keep text short (one sentence per field; "decision" ≤ 150 characters); OPTIM renders explanations from your references. Every open question belongs in "unresolved" (up to 10) — never drop one to stay brief.
{"status":"PLAN","plan":{
 "domain":"resistance"|"general_fitness",
 "goalEmphasis":{"primary":"strength"|"hypertrophy"|"general","secondary":"strength"|"hypertrophy"|null,"why":str},
 "frequency":{"days":int,"why":str},
 "schedule":{"days":["Monday",...in week order],"why":str},
 "architecture":{"split":<coach-allowed split id for that day count>,"name":str,"why":str},
 "sessions":[{"day":"Monday","title":str,"purpose":str,"targets":[muscle ids],"exercises":[{"id":<exercise id>,"role":"main"|"accessory","sets":int,"reps":[min,max],"rir":[min,max] (required when the coach uses RIR/RPE),"rest":[minSec,maxSec] or omit for the coach's range,"note":str or omit}]}],
 "weeks":int,
 "deviations":[{"field":"days"|"weeks","because":str,"coach":[keys],"client":[client.facts keys],"constraints":[constraint ids]}] (only when departing from an anchor),
 "goalAccess":[{"target":str,"exercise":<exercise id>,"status":"direct"|"blocked","blockedBy":<key from "blocked"> or omit,"interim":str or omit}],
 "progression":{"model":str,"why":str,"phases":[{"weeks":[from,to],"focus":str,"intent":str,"main":{"zones":["as_prescribed"|"lower_half"|"upper_half",...],"rir":-1|0|1,"sets":-1|0|1,"progress":<coach method or "hold">},"accessory":{same}}],"deloadWeeks":[ints, only if the coach schedules deloads]},
 "monitoring":[≤4 str, optional — OPTIM adds the coach's deload triggers itself],
 "constraintsApplied":[{"id":<constraint id from "constraints">,"how":str}],
 "coverage":[{"target":<muscle id from functions.considered>,"status":"trained"|"reduced"|"not_trained","cause":"goal_priority"|"time"|"constraints"|"available_exercises" (unless trained),"why":str (unless trained)}],
 "assumptions":[str],"unresolved":[{"fact":str,"why":str,"from":"client"|"coach"|"either"}],"conflicts":[{"rule":<coach key>,"issue":str}],
 "decisions":[≤12 {"topic":"frequency"|"structure"|"schedule"|"exercise_selection"|"prescription"|"effort"|"progression"|"recovery"|"duration"|"other","decision":str,"because":str,"coach":[keys],"client":[client.facts keys],"constraints":[constraint ids],"evidence":[refs]}]
}}
or {"status":"NEEDS_INPUT","needsInput":[{"fact":str,"why":str,"blockedDecision":str,"providedBy":"client"|"coach"|"either"}],"summary":str}
One session per scheduled day, in schedule order. Cover at least frequency, structure, schedule, exercise_selection, prescription, effort, progression and duration in "decisions", each with the exact refs you used.`;
