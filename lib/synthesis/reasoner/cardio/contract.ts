// Cardio Reasoner V1.1 — the strict output contract and its prompt (versioned; separate from the resistance and
// nutrition prompts). The model returns DECISIONS — whether cardio is warranted, the dose relative to the coach's
// range and why, which sessions (modality, minutes, intensity and its anchor, interval structure, placement, optional),
// every later week's sessions (so OPTIM can check and total each week itself), prepared coach decisions for schedule
// conflicts, monitoring and adjustment criteria, with references. OPTIM computes workload and validates every field
// (validate.ts). Strict: nothing coerced.

import { arr, int, label, obj, oneOf, optStr, pair, SchemaError, str, strList } from "../contract.ts";
import { DAY_ORDER } from "../../client-state.ts";
import type { DayOfWeek } from "../../../types.ts";

export const CARDIO_PROMPT_VERSION = "reasoner-cardio-v1.3.0";

/** optional_low_intensity is the coach's "optional, low-intensity extra" — never turned into required sessions. */
export const CARDIO_PLAN_ROLES = ["fat_loss", "health", "conditioning", "aerobic_base", "optional_low_intensity", "recovery", "none"] as const;
export const DOSE_VS_RANGE = ["within", "below", "no_coach_range", "none"] as const;
/** V1.2 — how a recovery-limited plan protects recovery (required when OPTIM flags limited recovery). */
export const RECOVERY_STRATEGIES = ["no_additional_cardio", "existing_training_days", "reduced_dose", "coach_decision"] as const;
/** V1.2 — what a later week's growth depends on: nothing, the client's recovery improving, or the coach confirming. */
export const WEEK_GATES = ["none", "recovery_improved", "coach_confirmed"] as const;
/** V1.2 — decisions OPTIM may require beyond schedule conflicts. */
export const DECISION_TOPICS = ["optional_dose", "added_training_day"] as const;
export const SESSION_TYPES = ["steady", "intervals"] as const;
export const INTENSITIES = ["easy", "moderate", "vigorous"] as const;
export const TALK_LEVELS = ["full_conversation", "short_sentences", "few_words"] as const;
export const PLACEMENTS = ["separate_day", "after_resistance", "separate_session"] as const;
export const CARDIO_MEASURES = ["talk_test", "rpe", "resting_hr", "session_completion", "steps", "bodyweight", "lifting_performance", "recovery_rating"] as const;
export const CARDIO_TOPICS = ["warranted", "dose", "recovery", "role", "modality", "intensity", "schedule", "interference", "progression", "monitoring", "other"] as const;
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
  /** Optional extra the client may skip — required for the coach's optional low-intensity role. */
  optional: boolean;
  purpose: string;
  note: string | null;
}

/** A later week's session — enough for OPTIM to check feasibility, interference and workload. */
export interface CardioWeekSession {
  day: DayOfWeek;
  type: (typeof SESSION_TYPES)[number];
  modality: string;
  minutes: number;
  intensity: (typeof INTENSITIES)[number];
  placement: (typeof PLACEMENTS)[number];
  optional: boolean;
  /** V1.3 (Gate U2) — an interval session's structure in every week, so it can become an executable session. */
  intervals: { rounds: number; workSeconds: number; recoverySeconds: number } | null;
}

export interface CardioPlan {
  warranted: boolean;
  role: (typeof CARDIO_PLAN_ROLES)[number];
  /** Week 1 relative to the coach's range for the role; "below" is a deliberate, explained start. */
  dose: { vsCoachRange: (typeof DOSE_VS_RANGE)[number]; rationale: string };
  objective: { summary: string; rationale: string };
  intensityMethod: { primary: "talk_test" | "rpe" | "heart_rate" | "simple_words"; rationale: string };
  sessions: CardioSession[];
  steps: { target: Num2; rationale: string } | null;
  /** Weeks 2..N, each with its full sessions (week 1 = the sessions above). Totals are OPTIM's arithmetic. A deload week
   * never becomes the baseline later weeks are measured from; `gate` is what the week's growth depends on. */
  progression: Array<{ week: number; sessions: CardioWeekSession[]; deload: boolean; gate: (typeof WEEK_GATES)[number]; change: string }>;
  /** Required when recovery is limited: how the prescription itself protects recovery. */
  recoveryStrategy: (typeof RECOVERY_STRATEGIES)[number] | null;
  placementRationale: string;
  monitoring: { measures: string[]; reviewAfterWeeks: number };
  adjustments: Array<{ signal: string; afterWeeks: number; what: (typeof CHANGE_WHAT)[number]; direction: (typeof CHANGE_DIRECTION)[number]; change: string }>;
  assumptions: string[];
  uncertainties: Array<{ about: string; impact: string }>;
  coachQuestions: Array<{ question: string; why: string }>;
  /** Prepared coach decisions: one per schedule conflict OPTIM detected (by its id), plus "optional_dose" (an optional
   * cardio amount the coach never set) and "added_training_day" (a new training day despite limited recovery). The
   * approved program is never changed silently. */
  coachDecisions: Array<{ about: string; question: string; options: string[]; recommended: number; why: string }>;
  decisions: Array<{ topic: (typeof CARDIO_TOPICS)[number]; decision: string; because: string; coachRuleKeys: string[]; clientFactRefs: string[]; knowledgeRefs: string[] }>;
}

export type CardioOutput = { status: "PLAN"; plan: CardioPlan } | { status: "NEEDS_INPUT"; needsInput: Array<{ fact: string; why: string; blockedDecision: string; providedBy: "client" | "coach" | "either" }>; summary: string };

const PROVIDERS = ["client", "coach", "either"] as const;
const effort = (v: unknown, at: string) => pair(v, at, 0, 10, false);
const bool = (v: unknown, at: string): boolean => {
  if (typeof v !== "boolean") throw new SchemaError(`${at} must be true or false`);
  return v;
};

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
    const dose = obj(p.dose, "plan.dose");
    const plan: CardioPlan = {
      warranted: bool(p.warranted, "plan.warranted"),
      role: oneOf(p.role, "plan.role", CARDIO_PLAN_ROLES),
      dose: { vsCoachRange: oneOf(dose.vsCoachRange, "dose.vsCoachRange", DOSE_VS_RANGE), rationale: str(dose.why, "dose.why", 500) },
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
          optional: bool(s.optional, `${at}.optional`),
          purpose: label(s.purpose, `${at}.purpose`, 160, 300),
          note: optStr(s.note, `${at}.note`, 240),
        };
      }),
      steps: st ? { target: pair(st.target, "steps.target", 1000, 30000, true), rationale: str(st.why, "steps.why", 300) } : null,
      progression: arr(p.progression, "plan.progression", 7).map((x, i) => {
        const w = obj(x, `progression[${i}]`);
        const at = `progression[${i}]`;
        return {
          week: int(w.week, `${at}.week`, 2, 8),
          sessions: arr(w.sessions, `${at}.sessions`, 7).map((y, j) => {
            const s = obj(y, `${at}.sessions[${j}]`);
            const sat = `${at}.sessions[${j}]`;
            const iv = s.intervals === undefined || s.intervals === null ? null : obj(s.intervals, `${sat}.intervals`);
            return { day: oneOf(s.day, `${sat}.day`, DAY_ORDER), type: oneOf(s.type, `${sat}.type`, SESSION_TYPES), modality: str(s.modality, `${sat}.modality`, 60), minutes: int(s.minutes, `${sat}.minutes`, 5, 180), intensity: oneOf(s.intensity, `${sat}.intensity`, INTENSITIES), placement: oneOf(s.placement, `${sat}.placement`, PLACEMENTS), optional: bool(s.optional, `${sat}.optional`), intervals: iv ? { rounds: int(iv.rounds, `${sat}.intervals.rounds`, 2, 30), workSeconds: int(iv.workSeconds, `${sat}.intervals.workSeconds`, 10, 600), recoverySeconds: int(iv.recoverySeconds, `${sat}.intervals.recoverySeconds`, 10, 600) } : null };
          }),
          deload: bool(w.deload, `${at}.deload`),
          gate: oneOf(w.gate, `${at}.gate`, WEEK_GATES),
          change: str(w.change, `${at}.change`, 240),
        };
      }),
      recoveryStrategy: p.recoveryStrategy === undefined || p.recoveryStrategy === null ? null : oneOf(p.recoveryStrategy, "plan.recoveryStrategy", RECOVERY_STRATEGIES),
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
      coachDecisions: (p.coachDecisions === undefined ? [] : arr(p.coachDecisions, "plan.coachDecisions", 6)).map((x, i) => {
        const d = obj(x, `coachDecisions[${i}]`);
        const options = strList(d.options, `coachDecisions[${i}].options`, 4, 200);
        if (options.length < 2) throw new SchemaError(`coachDecisions[${i}].options needs at least two options`);
        const recommended = int(d.recommended, `coachDecisions[${i}].recommended`, 0, options.length - 1);
        return { about: str(d.about, `coachDecisions[${i}].about`, 60), question: str(d.question, `coachDecisions[${i}].question`, 300), options, recommended, why: str(d.why, `coachDecisions[${i}].why`, 400) };
      }),
      decisions: arr(p.decisions, "plan.decisions", 12).map((x, i) => {
        const d = obj(x, `decisions[${i}]`);
        return { topic: oneOf(d.topic, `decisions[${i}].topic`, CARDIO_TOPICS), decision: str(d.decision, `decisions[${i}].decision`, 300), because: str(d.because, `decisions[${i}].because`, 600), coachRuleKeys: strList(d.coach, `decisions[${i}].coach`, 10, 80), clientFactRefs: strList(d.client, `decisions[${i}].client`, 10, 120), knowledgeRefs: strList(d.evidence, `decisions[${i}].evidence`, 10, 160) };
      }),
    };
    if (!plan.decisions.length) throw new SchemaError("plan.decisions must explain the main decisions");
    if (plan.warranted && !plan.sessions.length) throw new SchemaError("a warranted plan needs sessions");
    if (!plan.warranted && (plan.sessions.length || plan.progression.length)) throw new SchemaError("warranted:false means no sessions and no progression");
    return { ok: true, output: { status, plan } };
  } catch (err) {
    if (err instanceof SchemaError) return { ok: false, errors: [err.message] };
    return { ok: false, errors: ["output could not be read"] };
  }
}

export const CARDIO_SYSTEM_PROMPT = `You are OPTIM's Cardio Reasoner. You decide whether this client needs cardiovascular training and, if so, design it as structured decisions for their coach to review. Deterministic validators check every field and reject violations; you never approve or publish.

AUTHORITY — higher always wins
1. Safety: "safety" (no vigorous work when safety.noVigorous; no heart-rate targets when safety.noHeartRate) and the client's confirmed restrictions — only modalities listed in "modalities" may be used.
2. "coach": this coach's cardio method — the roles they use cardio for ("coach.roles", with what each means and its weekly-minute range if they set one), their intensity methods, step target, and (endurance coaches) the sports they coach, days, weekly hours, hard sessions, intensity distribution, long-session cap, weekly increase and down weeks. If the method seems wrong for this client, follow it and say so in "coachQuestions".
3. "client" facts, "capacity" (what each available day can hold), goal, and the APPROVED resistance program ("resistance") — fixed: never shorten, move or replace lifting; if something about it blocks good cardio, prepare a coach decision.
4. "evidence": cite only its refs.
5. Your judgment — only inside all of the above.

DOSE — start from THIS client, not from a template
- First decide whether added cardio is warranted now. warranted:false ("no additional cardio for now", optionally with the coach's step target) is a valid, often correct answer — e.g. when recovery is the limiter, lifting already fills the week, or the client's capacity is very low. Then role, dose, sessions.
- A coach's minute range is where cardio for that role should head, not a mandatory week-1 amount. Never exceed its top. Start below it ("dose.vsCoachRange":"below") when the client's current capacity (experience, recent consistency, current sessions/week, daily activity, cardio preference), recovery (sleep, stress, existing lifting load) or available time justify it — explain which in "dose.why" and in a "dose" decision. Use "within" when week 1 is inside the range, "no_coach_range" when the role has none, "none" when not warranted.
- "optional_low_intensity" means the coach's optional, low-intensity extra: every session optional:true, easy, and kept small — never a required program.
- OPTIONAL CARDIO WITHOUT A COACH DOSE ("optional_low_intensity" with no minutes): offer something small and keep it flat — don't size it from health or fat-loss minute guidance (that's another role's volume, not this coach's). If you think more would help, keep the weeks flat and prepare an "optional_dose" coach decision (options with minutes, your recommendation); any week that grows needs gate "coach_confirmed".
- RECOVERY-LIMITED ("bounds.recoveryLimited"): the prescription itself must protect recovery, not just mention it. Choose "recoveryStrategy": "no_additional_cardio" (warranted:false), "existing_training_days" (short sessions only on days the client already trains — after lifting where "capacity" allows), "reduced_dose" (below the coach's range, no new training day), or "coach_decision" (only if a new training day is genuinely the best option: prepare an "added_training_day" coach decision). Never add a training day without that decision. Any later week that grows above week 1 must carry gate "recovery_improved" (or "coach_confirmed"), so growth happens only when recovery allows. Explain the choice in a "recovery" decision; your prescription must agree with your reasoning.

INTENSITY
- Anchor every session with the coach's intensity method (talk test or perceived effort when the coach set none; heart rate only if the coach uses it AND "zones" are provided). Effort (0–10) must match the label: easy 1–3, moderate 4–6, vigorous 7–9. The talk test isn't practical for intervals — anchor them with effort or heart rate.
- Intervals are vigorous; give rounds, work/recovery seconds and efforts; they must fit inside the session minutes. Hard sessions (vigorous or intervals) never exceed "bounds.maxHardSessions"; none in the first "bounds.easyStartWeeks" weeks.

FITTING THE WEEK
- Days: only "bounds.availableDays", one cardio session per day. Each session must fit "capacity": a non-lifting day or a second visit ≥3 h from lifting ("separate_session") holds at most ownVisitMax minutes; cardio after lifting in the same visit ("after_resistance") at most sameVisitMax (0 = no room). A non-lifting day uses "separate_day".
- Interference: when the goal includes muscle or strength, no hard cardio on a modality with moderate/high lower-body interference on, or the day before, a day with lowerBody:true (lower or full-body lifting); prefer low-interference modalities.
- Every item in "conflicts" needs one entry in "coachDecisions" ("about": its id; the question, 2–4 concrete options, your recommended option index, why). Don't resolve it yourself by changing the approved program.
- Endurance coaches: train the client's discipline when it is known ("endurance.discipline"); if the coach coaches several sports and the client's isn't known, don't assume one — choose general aerobic work and ask.

PROGRESSION — individualized and feasible
- Give weeks 2..N (N = 4–8) with every session spelled out. OPTIM totals each week itself and checks each one like week 1: days, capacity, interference, hard sessions, the coach's range top, long-session cap and down weeks (when the coach sets them). Holding steady is a valid progression; grow only what this client can absorb.
- Deloads: mark a planned lighter week "deload":true (lighter than the week before it). Growth is measured from the most recent NON-deload week (week 1 is the first baseline), so returning to that baseline after a deload is fine; anything above it may rise at most "bounds.maxWeeklyIncreasePct"% over it. The client's pre-plan cardio baseline isn't known — if week 1's size depends on it, say so in "uncertainties".
- Equipment: a modality whose equipment is "unknown" may be planned, but say what the coach must confirm; "assumed" means a standard commercial-gym machine. Never invent client facts.

OUTPUT — one JSON object, no prose. Keep text short.
{"status":"PLAN","plan":{
 "warranted":bool,"role":"fat_loss"|"health"|"conditioning"|"aerobic_base"|"optional_low_intensity"|"recovery"|"none",
 "dose":{"vsCoachRange":"within"|"below"|"no_coach_range"|"none","why":str},
 "objective":{"summary":str,"why":str},
 "intensityMethod":{"primary":"talk_test"|"rpe"|"heart_rate"|"simple_words","why":str},
 "sessions":[{"day":"Monday","type":"steady"|"intervals","modality":<modality id>,"minutes":int,"intensity":"easy"|"moderate"|"vigorous","effort":[lo,hi],"talk":"full_conversation"|"short_sentences"|"few_words" or omit,"hrPct":[lo,hi] or omit,"intervals":{"rounds":int,"workSeconds":int,"recoverySeconds":int,"workEffort":[lo,hi],"recoveryEffort":[lo,hi]} or omit,"placement":"separate_day"|"after_resistance"|"separate_session","optional":bool,"purpose":str,"note":str or omit}],
 "steps":{"target":[lo,hi],"why":str} or omit (only if the coach sets steps),
 "progression":[{"week":2,"sessions":[{"day","type","modality","minutes","intensity","placement","optional","intervals":{"rounds","workSeconds","recoverySeconds"} (required when type is intervals; omit otherwise)}],"deload":bool,"gate":"none"|"recovery_improved"|"coach_confirmed","change":str}, ...],
 "recoveryStrategy":"no_additional_cardio"|"existing_training_days"|"reduced_dose"|"coach_decision" (required when bounds.recoveryLimited; else omit),
 "placementWhy":str,
 "monitoring":{"measures":[<from bounds.measures>],"reviewAfterWeeks":int},
 "adjustments":[{"signal":str,"afterWeeks":int,"what":"minutes"|"intensity"|"frequency"|"modality","direction":"increase"|"decrease"|"hold","change":str}],
 "assumptions":[str],"uncertainties":[{"about":str,"impact":str}],"coachQuestions":[{"question":str,"why":str}],
 "coachDecisions":[{"about":<conflict id>|"optional_dose"|"added_training_day","question":str,"options":[str,...],"recommended":int,"why":str}],
 "decisions":[≤12 {"topic":"warranted"|"dose"|"recovery"|"role"|"modality"|"intensity"|"schedule"|"interference"|"progression"|"monitoring"|"other","decision":str,"because":str,"coach":[keys],"client":[client.facts keys],"evidence":[refs]}]
}}
or {"status":"NEEDS_INPUT","needsInput":[{"fact":str,"why":str,"blockedDecision":str,"providedBy":"client"|"coach"|"either"}],"summary":str}
With warranted:false: role "none", no sessions, no progression. Cover warranted and dose in "decisions" always; intensity, schedule and progression when warranted; interference when there is a resistance program; recovery when bounds.recoveryLimited.`;
