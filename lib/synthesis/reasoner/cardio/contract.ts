// Cardio Reasoner V1 — the strict output contract and its prompt (versioned; separate from the resistance and
// nutrition prompts). The model returns DECISIONS — whether cardio is warranted, which sessions (modality, minutes,
// intensity and its anchor, interval structure, placement), a week-by-week progression, monitoring and adjustment
// criteria, with references. OPTIM computes workload and validates every field (validate.ts). Strict: nothing coerced.

import { arr, int, label, obj, oneOf, optStr, pair, SchemaError, str, strList } from "../contract.ts";
import { DAY_ORDER } from "../../client-state.ts";
import type { DayOfWeek } from "../../../types.ts";

export const CARDIO_PROMPT_VERSION = "reasoner-cardio-v1.0.0";

export const CARDIO_PLAN_ROLES = ["fat_loss", "health", "conditioning", "aerobic_base", "recovery", "none"] as const;
export const SESSION_TYPES = ["steady", "intervals"] as const;
export const INTENSITIES = ["easy", "moderate", "vigorous"] as const;
export const TALK_LEVELS = ["full_conversation", "short_sentences", "few_words"] as const;
export const PLACEMENTS = ["separate_day", "after_resistance", "separate_session"] as const;
export const CARDIO_MEASURES = ["talk_test", "rpe", "resting_hr", "session_completion", "steps", "bodyweight", "lifting_performance", "recovery_rating"] as const;
export const CARDIO_TOPICS = ["warranted", "role", "modality", "intensity", "schedule", "interference", "progression", "monitoring", "other"] as const;
export const CHANGE_WHAT = ["minutes", "intensity", "frequency", "modality"] as const;
export const CHANGE_DIRECTION = ["increase", "decrease", "hold"] as const;

export type Num2 = { min: number; max: number };

export interface CardioSession {
  day: DayOfWeek;
  type: (typeof SESSION_TYPES)[number];
  modality: string;
  minutes: number;
  intensity: (typeof INTENSITIES)[number];
  /** Perceived effort, 0–10. */
  effort: Num2;
  talk: (typeof TALK_LEVELS)[number] | null;
  /** % of age-predicted HRmax — only when the coach uses heart rate and OPTIM offers zones. */
  hrPct: Num2 | null;
  intervals: { rounds: number; workSeconds: number; recoverySeconds: number; workEffort: Num2; recoveryEffort: Num2 } | null;
  placement: (typeof PLACEMENTS)[number];
  purpose: string;
  note: string | null;
}

export interface CardioPlan {
  warranted: boolean;
  role: (typeof CARDIO_PLAN_ROLES)[number];
  objective: { summary: string; rationale: string };
  intensityMethod: { primary: "talk_test" | "rpe" | "heart_rate" | "simple_words"; rationale: string };
  sessions: CardioSession[];
  steps: { target: Num2; rationale: string } | null;
  /** Week-by-week weekly totals, from week 1 (week 1 = the sessions above). */
  progression: Array<{ week: number; minutes: number; hardSessions: number; change: string }>;
  placementRationale: string;
  monitoring: { measures: string[]; reviewAfterWeeks: number };
  adjustments: Array<{ signal: string; afterWeeks: number; what: (typeof CHANGE_WHAT)[number]; direction: (typeof CHANGE_DIRECTION)[number]; change: string }>;
  assumptions: string[];
  uncertainties: Array<{ about: string; impact: string }>;
  coachQuestions: Array<{ question: string; why: string }>;
  decisions: Array<{ topic: (typeof CARDIO_TOPICS)[number]; decision: string; because: string; coachRuleKeys: string[]; clientFactRefs: string[]; knowledgeRefs: string[] }>;
}

export type CardioOutput = { status: "PLAN"; plan: CardioPlan } | { status: "NEEDS_INPUT"; needsInput: Array<{ fact: string; why: string; blockedDecision: string; providedBy: "client" | "coach" | "either" }>; summary: string };

const PROVIDERS = ["client", "coach", "either"] as const;
const effort = (v: unknown, at: string) => pair(v, at, 0, 10, false);

export function parseCardioOutput(raw: unknown): { ok: true; output: CardioOutput } | { ok: false; errors: string[] } {
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
    const ob = obj(p.objective, "plan.objective");
    const im = obj(p.intensityMethod, "plan.intensityMethod");
    const mo = obj(p.monitoring, "plan.monitoring");
    const st = p.steps === undefined || p.steps === null ? null : obj(p.steps, "plan.steps");
    const plan: CardioPlan = {
      warranted: p.warranted === true,
      role: oneOf(p.role, "plan.role", CARDIO_PLAN_ROLES),
      objective: { summary: str(ob.summary, "objective.summary", 240), rationale: str(ob.why, "objective.why", 500) },
      intensityMethod: { primary: oneOf(im.primary, "intensityMethod.primary", ["talk_test", "rpe", "heart_rate", "simple_words"] as const), rationale: str(im.why, "intensityMethod.why", 400) },
      sessions: arr(p.sessions, "plan.sessions", 10).map((x, i): CardioSession => {
        const s = obj(x, `sessions[${i}]`);
        const at = `sessions[${i}]`;
        const iv = s.intervals === undefined || s.intervals === null ? null : obj(s.intervals, `${at}.intervals`);
        return {
          day: oneOf(s.day, `${at}.day`, DAY_ORDER),
          type: oneOf(s.type, `${at}.type`, SESSION_TYPES),
          modality: str(s.modality, `${at}.modality`, 60),
          minutes: int(s.minutes, `${at}.minutes`, 5, 180),
          intensity: oneOf(s.intensity, `${at}.intensity`, INTENSITIES),
          effort: effort(s.effort, `${at}.effort`),
          talk: s.talk === undefined || s.talk === null ? null : oneOf(s.talk, `${at}.talk`, TALK_LEVELS),
          hrPct: s.hrPct === undefined || s.hrPct === null ? null : pair(s.hrPct, `${at}.hrPct`, 40, 100, true),
          intervals: iv ? { rounds: int(iv.rounds, `${at}.intervals.rounds`, 2, 30), workSeconds: int(iv.workSeconds, `${at}.intervals.workSeconds`, 10, 600), recoverySeconds: int(iv.recoverySeconds, `${at}.intervals.recoverySeconds`, 10, 600), workEffort: effort(iv.workEffort, `${at}.intervals.workEffort`), recoveryEffort: effort(iv.recoveryEffort, `${at}.intervals.recoveryEffort`) } : null,
          placement: oneOf(s.placement, `${at}.placement`, PLACEMENTS),
          purpose: label(s.purpose, `${at}.purpose`, 160, 300),
          note: optStr(s.note, `${at}.note`, 240),
        };
      }),
      steps: st ? { target: pair(st.target, "steps.target", 1000, 30000, true), rationale: str(st.why, "steps.why", 300) } : null,
      progression: arr(p.progression, "plan.progression", 16).map((x, i) => {
        const w = obj(x, `progression[${i}]`);
        return { week: int(w.week, `progression[${i}].week`, 1, 16), minutes: int(w.minutes, `progression[${i}].minutes`, 0, 1200), hardSessions: int(w.hardSessions ?? 0, `progression[${i}].hardSessions`, 0, 7), change: str(w.change, `progression[${i}].change`, 240) };
      }),
      placementRationale: str(p.placementWhy, "plan.placementWhy", 500),
      monitoring: { measures: strList(mo.measures, "monitoring.measures", 6, 40), reviewAfterWeeks: int(mo.reviewAfterWeeks, "monitoring.reviewAfterWeeks", 1, 12) },
      adjustments: arr(p.adjustments ?? [], "plan.adjustments", 6).map((x, i) => {
        const a = obj(x, `adjustments[${i}]`);
        return { signal: str(a.signal, `adjustments[${i}].signal`, 240), afterWeeks: int(a.afterWeeks, `adjustments[${i}].afterWeeks`, 1, 12), what: oneOf(a.what, `adjustments[${i}].what`, CHANGE_WHAT), direction: oneOf(a.direction, `adjustments[${i}].direction`, CHANGE_DIRECTION), change: str(a.change, `adjustments[${i}].change`, 240) };
      }),
      assumptions: strList(p.assumptions, "plan.assumptions", 10, 300),
      uncertainties: (p.uncertainties === undefined ? [] : arr(p.uncertainties, "plan.uncertainties", 10)).map((x, i) => {
        const u = obj(x, `uncertainties[${i}]`);
        return { about: str(u.about, `uncertainties[${i}].about`, 200), impact: str(u.impact, `uncertainties[${i}].impact`, 300) };
      }),
      coachQuestions: (p.coachQuestions === undefined ? [] : arr(p.coachQuestions, "plan.coachQuestions", 10)).map((x, i) => {
        const q = obj(x, `coachQuestions[${i}]`);
        return { question: str(q.question, `coachQuestions[${i}].question`, 240), why: str(q.why, `coachQuestions[${i}].why`, 300) };
      }),
      decisions: arr(p.decisions, "plan.decisions", 12).map((x, i) => {
        const d = obj(x, `decisions[${i}]`);
        return { topic: oneOf(d.topic, `decisions[${i}].topic`, CARDIO_TOPICS), decision: str(d.decision, `decisions[${i}].decision`, 300), because: str(d.because, `decisions[${i}].because`, 600), coachRuleKeys: strList(d.coach, `decisions[${i}].coach`, 10, 80), clientFactRefs: strList(d.client, `decisions[${i}].client`, 10, 120), knowledgeRefs: strList(d.evidence, `decisions[${i}].evidence`, 10, 160) };
      }),
    };
    if (!plan.decisions.length) throw new SchemaError("plan.decisions must explain the main decisions");
    if (plan.warranted && !plan.sessions.length) throw new SchemaError("a warranted plan needs sessions");
    if (!plan.warranted && plan.sessions.length) throw new SchemaError("warranted:false means no sessions");
    return { ok: true, output: { status, plan } };
  } catch (err) {
    if (err instanceof SchemaError) return { ok: false, errors: [err.message] };
    return { ok: false, errors: ["output could not be read"] };
  }
}

export const CARDIO_SYSTEM_PROMPT = `You are OPTIM's Cardio Reasoner. You decide whether this client needs cardiovascular training and, if so, design it as structured decisions for their coach to review. Deterministic validators check every field and reject violations; you never approve or publish.

AUTHORITY — higher always wins
1. Safety: "safety" (no vigorous work when safety.noVigorous; no heart-rate targets when safety.noHeartRate) and the client's confirmed restrictions — only modalities listed in "modalities" with fit "-" may be used.
2. "coach": this coach's cardio method — the roles cardio plays and weekly minutes per role, the intensity methods they use, steps target, and (endurance coaches) days, weekly hours, hard sessions, intensity distribution and weekly increase. If the method seems wrong for this client, follow it and say so in "coachQuestions".
3. "client" facts, goal, availability and the resistance program cardio must fit around ("resistance").
4. "evidence": cite only its refs.
5. Your judgment — only inside all of the above.

DESIGN PRINCIPLES
- First decide whether cardio is warranted for this client now (warranted:false is a valid answer — say why, e.g. recovery is the limiter). Then the role, then sessions.
- Dose: weekly minutes inside the coach's range for the role (the sum of session minutes is week 1). Health guidance gives context; the coach's minutes govern.
- Intensity: anchor every session with the coach's intensity method (talk test or perceived effort when the coach set none; heart rate only if the coach uses it AND "zones" are provided). Effort (0–10) must match the intensity label: easy 1–3, moderate 4–6, vigorous 7–9. The talk test isn't practical for intervals — anchor intervals with effort or heart rate.
- Intervals are vigorous by definition; give rounds, work/recovery seconds and efforts; their total time must fit the session minutes.
- Workload and recovery: hard sessions (vigorous or intervals) are few — never more than "bounds.maxHardSessions" a week; none in the first weeks for a beginner ("bounds.easyStartWeeks"). Respect "resistance": never put hard, leg-dominant cardio (modality interference moderate or high) on, or on the day before, a lower-body resistance day when the client's goal includes muscle or strength; prefer low-interference modalities then.
- Placement: on a resistance day use "after_resistance" (same visit) or "separate_session" (≥3 h apart); otherwise "separate_day". Same-visit totals must fit the client's session cap (bounds.sessionCapMinutes).
- Days: only days in "bounds.availableDays". Count total training days honestly.
- Progression: weeks 1..N (N = 4–8) of weekly totals; increase gradually (never more than bounds.maxWeeklyIncreasePct % per week) and add intensity only after duration is tolerated.
- Equipment: a modality whose equipment is "unknown" may be planned, but say what the coach must confirm; "assumed" means a standard commercial-gym machine.
- Address every item in "conflicts" in coachQuestions. Never invent client facts.

OUTPUT — one JSON object, no prose. Keep text short.
{"status":"PLAN","plan":{
 "warranted":bool,"role":"fat_loss"|"health"|"conditioning"|"aerobic_base"|"recovery"|"none",
 "objective":{"summary":str,"why":str},
 "intensityMethod":{"primary":"talk_test"|"rpe"|"heart_rate"|"simple_words","why":str},
 "sessions":[{"day":"Monday","type":"steady"|"intervals","modality":<modality id>,"minutes":int,"intensity":"easy"|"moderate"|"vigorous","effort":[lo,hi],"talk":"full_conversation"|"short_sentences"|"few_words" or omit,"hrPct":[lo,hi] or omit,"intervals":{"rounds":int,"workSeconds":int,"recoverySeconds":int,"workEffort":[lo,hi],"recoveryEffort":[lo,hi]} or omit,"placement":"separate_day"|"after_resistance"|"separate_session","purpose":str,"note":str or omit}],
 "steps":{"target":[lo,hi],"why":str} or omit (only if the coach sets steps),
 "progression":[{"week":1,"minutes":int,"hardSessions":int,"change":str}, ...],
 "placementWhy":str,
 "monitoring":{"measures":[<from bounds.measures>],"reviewAfterWeeks":int},
 "adjustments":[{"signal":str,"afterWeeks":int,"what":"minutes"|"intensity"|"frequency"|"modality","direction":"increase"|"decrease"|"hold","change":str}],
 "assumptions":[str],"uncertainties":[{"about":str,"impact":str}],"coachQuestions":[{"question":str,"why":str}],
 "decisions":[≤12 {"topic":"warranted"|"role"|"modality"|"intensity"|"schedule"|"interference"|"progression"|"monitoring"|"other","decision":str,"because":str,"coach":[keys],"client":[client.facts keys],"evidence":[refs]}]
}}
or {"status":"NEEDS_INPUT","needsInput":[{"fact":str,"why":str,"blockedDecision":str,"providedBy":"client"|"coach"|"either"}],"summary":str}
Cover at least warranted, intensity, schedule and progression in "decisions" (and interference when there is a resistance program).`;
