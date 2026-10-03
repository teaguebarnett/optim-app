// Gate 4.0C-3 — the reasoner's strict output contract and its prompt.
//
// The model returns ONE JSON object: either a resistance plan (a designed
// microcycle + week-by-week progression rules + decision evidence) or
// NEEDS_INPUT. The parser is strict: wrong types, missing fields, unknown
// enum values or oversized text reject the output — it is never coerced.
// Week-by-week prescriptions are expanded deterministically from the
// microcycle and the progression rules (expand.ts), so the model reasons
// and OPTIM's rails compute.

import type { DayOfWeek } from "../../types.ts";
import { DAY_ORDER } from "../client-state.ts";

export const REASONER_PROMPT_VERSION = "reasoner-resistance-v1.3";

export interface ReasonerExercise {
  exerciseId: string;
  role: "main" | "accessory";
  sets: number;
  reps: { min: number; max: number };
  /** Reps in reserve; null only when the coach expresses effort in plain words. */
  rir: { min: number; max: number } | null;
  restSeconds: { min: number; max: number } | null;
  why: string;
}

export interface ReasonerSession {
  day: DayOfWeek;
  title: string;
  purpose: string;
  exercises: ReasonerExercise[];
}

export interface ReasonerWeekRule {
  week: number;
  kind: "build" | "deload";
  repZone: "as_prescribed" | "lower_half" | "upper_half";
  setsDelta: number;
  note: string;
}

export const DECISION_TOPICS = ["frequency", "structure", "schedule", "exercise_selection", "prescription", "progression", "recovery", "duration", "other"] as const;
export type DecisionTopic = (typeof DECISION_TOPICS)[number];

export interface ReasonerDecision {
  topic: DecisionTopic;
  decision: string;
  because: string;
  coachRuleKeys: string[];
  clientFactRefs: string[];
  knowledgeRefs: string[];
}

export interface ReasonerPlan {
  domain: "resistance" | "general_fitness";
  goalEmphasis: { primary: "strength" | "hypertrophy" | "general"; secondary: "strength" | "hypertrophy" | null; rationale: string };
  frequency: { daysPerWeek: number; rationale: string };
  schedule: { days: DayOfWeek[]; rationale: string };
  /** split = one of the coach's allowed split ids for the chosen day count. */
  architecture: { split: string; name: string; rationale: string };
  sessions: ReasonerSession[];
  durationWeeks: number;
  progression: { model: string; rationale: string; weeks: ReasonerWeekRule[] };
  monitoring: string[];
  constraintsApplied: Array<{ constraintId: string; how: string }>;
  assumptions: string[];
  unresolved: Array<{ fact: string; why: string; providedBy: "client" | "coach" | "either" }>;
  conflicts: Array<{ coachRuleKey: string; issue: string }>;
  decisions: ReasonerDecision[];
}

export type ReasonerOutput =
  | { status: "PLAN"; plan: ReasonerPlan }
  | { status: "NEEDS_INPUT"; needsInput: Array<{ fact: string; why: string; blockedDecision: string; providedBy: "client" | "coach" | "either" }>; summary: string };

// ---------------------------------------------------------------------------
// Strict parser
// ---------------------------------------------------------------------------

class SchemaError extends Error {}
const MAX_TEXT = 700;
const obj = (v: unknown, at: string): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new SchemaError(`${at} must be an object`);
  return v as Record<string, unknown>;
};
const arr = (v: unknown, at: string, max = 60): unknown[] => {
  if (!Array.isArray(v)) throw new SchemaError(`${at} must be an array`);
  if (v.length > max) throw new SchemaError(`${at} has too many items`);
  return v;
};
const str = (v: unknown, at: string, max = MAX_TEXT): string => {
  if (typeof v !== "string" || !v.trim()) throw new SchemaError(`${at} must be a non-empty string`);
  if (v.length > max) throw new SchemaError(`${at} is too long`);
  return v.trim();
};
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
const range = (v: unknown, at: string, min: number, max: number, integer: boolean) => {
  const o = obj(v, at);
  const lo = integer ? int(o.min, `${at}.min`, min, max) : num(o.min, `${at}.min`, min, max);
  const hi = integer ? int(o.max, `${at}.max`, min, max) : num(o.max, `${at}.max`, min, max);
  if (lo > hi) throw new SchemaError(`${at}.min must not exceed max`);
  return { min: lo, max: hi };
};
const strList = (v: unknown, at: string, max = 40) => arr(v, at, max).map((x, i) => str(x, `${at}[${i}]`, 200));
const PROVIDERS = ["client", "coach", "either"] as const;

export type ParsedOutput = { ok: true; output: ReasonerOutput } | { ok: false; errors: string[] };

export function parseReasonerOutput(raw: unknown): ParsedOutput {
  try {
    const o = obj(raw, "output");
    const status = oneOf(o.status, "status", ["PLAN", "NEEDS_INPUT"] as const);
    if (status === "NEEDS_INPUT") {
      const needsInput = arr(o.needsInput, "needsInput", 20).map((x, i) => {
        const n = obj(x, `needsInput[${i}]`);
        return { fact: str(n.fact, `needsInput[${i}].fact`, 200), why: str(n.why, `needsInput[${i}].why`), blockedDecision: str(n.blockedDecision, `needsInput[${i}].blockedDecision`), providedBy: oneOf(n.providedBy, `needsInput[${i}].providedBy`, PROVIDERS) };
      });
      if (!needsInput.length) throw new SchemaError("needsInput must list at least one missing input");
      return { ok: true, output: { status, needsInput, summary: str(o.summary, "summary") } };
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
        title: str(s.title, `sessions[${i}].title`, 80),
        purpose: str(s.purpose, `sessions[${i}].purpose`),
        exercises: arr(s.exercises, `sessions[${i}].exercises`, 12).map((y, j): ReasonerExercise => {
          const e = obj(y, `sessions[${i}].exercises[${j}]`);
          const at = `sessions[${i}].exercises[${j}]`;
          return {
            exerciseId: str(e.exerciseId, `${at}.exerciseId`, 120),
            role: oneOf(e.role, `${at}.role`, ["main", "accessory"] as const),
            sets: int(e.sets, `${at}.sets`, 1, 12),
            reps: range(e.reps, `${at}.reps`, 1, 50, true),
            rir: e.rir === null ? null : range(e.rir, `${at}.rir`, 0, 10, false),
            restSeconds: e.restSeconds === null ? null : range(e.restSeconds, `${at}.restSeconds`, 0, 900, true),
            why: str(e.why, `${at}.why`, 300),
          };
        }),
      };
    });
    const plan: ReasonerPlan = {
      domain: oneOf(p.domain, "plan.domain", ["resistance", "general_fitness"] as const),
      goalEmphasis: { primary: oneOf(ge.primary, "goalEmphasis.primary", ["strength", "hypertrophy", "general"] as const), secondary: ge.secondary === null ? null : oneOf(ge.secondary, "goalEmphasis.secondary", ["strength", "hypertrophy"] as const), rationale: str(ge.rationale, "goalEmphasis.rationale") },
      frequency: { daysPerWeek: int(fr.daysPerWeek, "frequency.daysPerWeek", 1, 7), rationale: str(fr.rationale, "frequency.rationale") },
      schedule: { days: arr(sc.days, "schedule.days", 7).map((d, i) => oneOf(d, `schedule.days[${i}]`, DAY_ORDER)), rationale: str(sc.rationale, "schedule.rationale") },
      architecture: { split: str(ar.split, "architecture.split", 40), name: str(ar.name, "architecture.name", 80), rationale: str(ar.rationale, "architecture.rationale") },
      sessions,
      durationWeeks: int(p.durationWeeks, "plan.durationWeeks", 1, 52),
      progression: {
        model: str(pr.model, "progression.model", 120),
        rationale: str(pr.rationale, "progression.rationale"),
        weeks: arr(pr.weeks, "progression.weeks", 52).map((x, i): ReasonerWeekRule => {
          const w = obj(x, `progression.weeks[${i}]`);
          return { week: int(w.week, `weeks[${i}].week`, 1, 52), kind: oneOf(w.kind, `weeks[${i}].kind`, ["build", "deload"] as const), repZone: oneOf(w.repZone, `weeks[${i}].repZone`, ["as_prescribed", "lower_half", "upper_half"] as const), setsDelta: int(w.setsDelta, `weeks[${i}].setsDelta`, -4, 4), note: str(w.note, `weeks[${i}].note`, 200) };
        }),
      },
      monitoring: strList(p.monitoring, "plan.monitoring", 12),
      constraintsApplied: arr(p.constraintsApplied, "plan.constraintsApplied", 30).map((x, i) => {
        const c = obj(x, `constraintsApplied[${i}]`);
        return { constraintId: str(c.constraintId, `constraintsApplied[${i}].constraintId`, 200), how: str(c.how, `constraintsApplied[${i}].how`) };
      }),
      assumptions: strList(p.assumptions, "plan.assumptions", 15),
      unresolved: arr(p.unresolved, "plan.unresolved", 15).map((x, i) => {
        const u = obj(x, `unresolved[${i}]`);
        return { fact: str(u.fact, `unresolved[${i}].fact`, 200), why: str(u.why, `unresolved[${i}].why`), providedBy: oneOf(u.providedBy, `unresolved[${i}].providedBy`, PROVIDERS) };
      }),
      conflicts: arr(p.conflicts, "plan.conflicts", 15).map((x, i) => {
        const c = obj(x, `conflicts[${i}]`);
        return { coachRuleKey: str(c.coachRuleKey, `conflicts[${i}].coachRuleKey`, 120), issue: str(c.issue, `conflicts[${i}].issue`) };
      }),
      decisions: arr(p.decisions, "plan.decisions", 25).map((x, i): ReasonerDecision => {
        const d = obj(x, `decisions[${i}]`);
        return { topic: oneOf(d.topic, `decisions[${i}].topic`, DECISION_TOPICS), decision: str(d.decision, `decisions[${i}].decision`, 200), because: str(d.because, `decisions[${i}].because`), coachRuleKeys: strList(d.coachRuleKeys, `decisions[${i}].coachRuleKeys`), clientFactRefs: strList(d.clientFactRefs, `decisions[${i}].clientFactRefs`), knowledgeRefs: strList(d.knowledgeRefs, `decisions[${i}].knowledgeRefs`) };
      }),
    };
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

export const REASONER_SYSTEM_PROMPT = `You are OPTIM's Fitness Reasoner for RESISTANCE TRAINING (strength / hypertrophy / general resistance support). You design one client's training plan as structured data for their coach to review. You do not approve or publish anything; deterministic validators check everything you return and reject violations.

AUTHORITY (in order)
1. Client constraints marked hard are absolute. Never use an exercise outside "evidence.exercises" (those are the only eligible candidates — everything else is already excluded for this client). Never loosen a restriction.
2. The coach's method ("coachMethod.rules") is how THIS coach coaches. Stay inside every range they set (sets, reps, reps-in-reserve, rest, days, splits, program length, deload approach). Where the coach left discretion, choose using the client facts and the evidence. If following the method seems wrong for this client, still follow it and report the tension in "conflicts" — never silently choose against it.
3. Fitness Knowledge ("evidence.claims") is general support. Cite only refs that appear there. A claim whose support says "NO SOURCE" is an open question — never present it as evidence.

FREQUENCY AND STRUCTURE
- Available days are a ceiling, not a target. Choose days per week inside "bounds.frequency" using goal, experience, current habit, recovery and session length — and explain why.
- Design the week as a coached microcycle: every session needs a specific purpose (what it trains and why it sits on that day). Don't mechanically rotate labels; place sessions to manage recovery between sessions that load the same muscles.
- Use only splits the coach allows for the chosen day count, unless none fits — then return NEEDS_INPUT.
- Respect the session time cap ("bounds.sessionMinutesCap") including rest and warm-up.
- Repeat an exercise within the week only on purpose (e.g. practising a main lift) and say so in its "why".
- If restrictions remove whole muscle groups, plan the best coherent week with what is eligible and record the gap in "assumptions" or "unresolved" — don't pretend it is covered.

PROGRESSION
- Provide "progression.weeks" with exactly "durationWeeks" entries (week 1..N). repZone shifts reps within the prescribed range (lower_half = heavier, upper_half = lighter); setsDelta adjusts sets but every week must stay inside the coach's set range (a deload week may go below it).
- Deload weeks only as the coach's method defines them: "none" → no deload weeks; "as_needed" → no scheduled deload weeks (put the coach's triggers in "monitoring"); "fixed" → deloads on the coach's interval.
- durationWeeks must be inside "bounds.programWeeks".

MISSING INFORMATION
- If a fact needed for a decision is missing or contradictory and you would have to guess, return NEEDS_INPUT naming the fact, why it matters, the blocked decision and who should provide it (client / coach / either). Never invent client facts.
- You are not a clinician. If something requires medical judgment, return NEEDS_INPUT for the coach.

EVIDENCE OF REASONING
- "decisions" holds concise decision evidence (no step-by-step thinking): what you decided, because…, and the exact coachRuleKeys, clientFactRefs and knowledgeRefs used (copied from the input). Give every decision a "topic"; cover at least frequency, structure, schedule, exercise_selection, prescription, progression and recovery.
- "constraintsApplied" must list EVERY constraint id from "constraints" with how it shaped the plan.

OUTPUT
Be concise: every text field is one short sentence (exercise "why" and week "note" under 120 characters). At most 12 decisions.
Return ONLY one JSON object, no prose, matching exactly:
{"status":"PLAN","plan":{
 "domain":"resistance"|"general_fitness",
 "goalEmphasis":{"primary":"strength"|"hypertrophy"|"general","secondary":"strength"|"hypertrophy"|null,"rationale":string},
 "frequency":{"daysPerWeek":int,"rationale":string},
 "schedule":{"days":["Monday",...],"rationale":string},
 "architecture":{"split":<one of the coach's allowed split ids for the chosen days>,"name":string,"rationale":string},
 "sessions":[{"day":"Monday","title":string,"purpose":string,"exercises":[{"exerciseId":string,"role":"main"|"accessory","sets":int,"reps":{"min":int,"max":int},"rir":{"min":number,"max":number}|null,"restSeconds":{"min":int,"max":int}|null,"why":string}]}],
 "durationWeeks":int,
 "progression":{"model":string,"rationale":string,"weeks":[{"week":int,"kind":"build"|"deload","repZone":"as_prescribed"|"lower_half"|"upper_half","setsDelta":int,"note":string}]},
 "monitoring":[string],
 "constraintsApplied":[{"constraintId":string,"how":string}],
 "assumptions":[string],
 "unresolved":[{"fact":string,"why":string,"providedBy":"client"|"coach"|"either"}],
 "conflicts":[{"coachRuleKey":string,"issue":string}],
 "decisions":[{"topic":"frequency"|"structure"|"schedule"|"exercise_selection"|"prescription"|"progression"|"recovery"|"duration"|"other","decision":string,"because":string,"coachRuleKeys":[string],"clientFactRefs":[string],"knowledgeRefs":[string]}]
}}
or {"status":"NEEDS_INPUT","needsInput":[{"fact":string,"why":string,"blockedDecision":string,"providedBy":"client"|"coach"|"either"}],"summary":string}
Sessions must be listed in the same order as schedule.days, one session per scheduled day.`;
