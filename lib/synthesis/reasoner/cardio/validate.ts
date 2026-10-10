// Cardio Reasoner V1.1 — deterministic validation and the cross-modality workload summary. Errors reject the output
// (and become the one repair attempt's feedback); quality findings never block but go to the coach. Every rule checks
// something OPTIM can know: the coach's method, the client's availability, session cap and confirmed restrictions, the
// safety gate, the approved resistance week (never changed), the knowledge-backed intensity anchors, and provenance.
// V1.1: EVERY week is checked (not just week 1) and OPTIM totals each week itself; the dose is stated relative to the
// coach's range; optional cardio stays optional; schedule conflicts need prepared coach decisions.
// V1.2: deload weeks never become the progression baseline; growth for recovery-limited clients and optional cardio is
// gated (recovery improving / coach confirming); limited recovery changes the prescription's structure (a stated
// strategy; no new training day without a prepared coach decision); an optional dose never rests on minute guidance.

import { citationErrors } from "../expand.ts";
import { DAY_ORDER } from "../../client-state.ts";
import { cardioModality } from "../../knowledge/cardio/modalities.ts";
import type { DayOfWeek } from "../../../types.ts";
import type { CardioAllowed, CardioReasoningInput } from "./input.ts";
import { DECISION_TOPICS, type CardioPlan, type CardioSession, type CardioWeekSession } from "./contract.ts";

export interface CardioQualityFinding {
  code: string;
  severity: "warning" | "info";
  message: string;
}

/** Perceived effort (0–10) per intensity label — internal curation (concept.cardio.intensity#intensity.rpe_scale). */
export const EFFORT_BANDS: Record<CardioSession["intensity"], [number, number]> = { easy: [1, 3], moderate: [4, 6], vigorous: [7, 9] };
const TALK_FOR: Record<CardioSession["intensity"], NonNullable<CardioSession["talk"]>> = { easy: "full_conversation", moderate: "short_sentences", vigorous: "few_words" };

const isHard = (s: { type: string; intensity: string }) => s.type === "intervals" || s.intensity === "vigorous";
const nextDay = (d: DayOfWeek) => DAY_ORDER[(DAY_ORDER.indexOf(d) + 1) % 7];

export interface WeekLoad {
  week: number;
  deload: boolean;
  gate: CardioPlan["progression"][number]["gate"];
  sessions: number;
  minutes: { easy: number; moderate: number; vigorous: number; total: number };
  hardSessions: number;
  optionalMinutes: number;
}
export interface CardioWorkload {
  weeklyMinutes: { easy: number; moderate: number; vigorous: number; total: number };
  /** Moderate-equivalent minutes (moderate + 2 × vigorous), the equivalence implied by 150 moderate ≈ 75 vigorous. */
  moderateEquivalent: number;
  hardSessions: number;
  /** Lifting days + cardio days in week 1 (distinct days). */
  trainingDays: number;
  resistanceMinutes: number;
  sameVisit: Array<{ day: DayOfWeek; minutes: number }>;
  /** OPTIM's totals for every planned week (week 1 first). */
  weeks: WeekLoad[];
}

const weekLoad = (week: number, sessions: CardioWeekSession[], deload = false, gate: WeekLoad["gate"] = "none"): WeekLoad => {
  const m = { easy: 0, moderate: 0, vigorous: 0, total: 0 };
  for (const s of sessions) {
    m[s.intensity] += s.minutes;
    m.total += s.minutes;
  }
  return { week, deload, gate, sessions: sessions.length, minutes: m, hardSessions: sessions.filter(isHard).length, optionalMinutes: sessions.filter((s) => s.optional).reduce((t, s) => t + s.minutes, 0) };
};

export function cardioWorkload(plan: CardioPlan, ri: CardioReasoningInput): CardioWorkload {
  const weeks = [weekLoad(1, plan.sessions), ...plan.progression.map((w) => weekLoad(w.week, w.sessions, w.deload, w.gate))];
  const w1 = weeks[0];
  const res = new Map((ri.resistance?.days ?? []).map((d) => [d.day, d]));
  const days = new Set<DayOfWeek>([...(ri.resistance?.days ?? []).map((d) => d.day), ...plan.sessions.map((s) => s.day)]);
  return {
    weeklyMinutes: w1.minutes,
    moderateEquivalent: w1.minutes.easy + w1.minutes.moderate + 2 * w1.minutes.vigorous,
    hardSessions: w1.hardSessions,
    trainingDays: days.size,
    resistanceMinutes: (ri.resistance?.days ?? []).reduce((t, d) => t + d.minutes, 0),
    sameVisit: plan.sessions.filter((s) => s.placement === "after_resistance" && res.has(s.day)).map((s) => ({ day: s.day, minutes: s.minutes + res.get(s.day)!.minutes })),
    weeks,
  };
}

export function validateCardioPlan(params: { plan: CardioPlan; reasoning: CardioReasoningInput; allowed: CardioAllowed }): { ok: boolean; errors: string[]; quality: CardioQualityFinding[]; workload: CardioWorkload } {
  const { plan, reasoning: ri, allowed } = params;
  const errors: string[] = [];
  const quality: CardioQualityFinding[] = [];
  const b = ri.bounds;
  const workload = cardioWorkload(plan, ri);
  const range = b.minutesByRole[plan.role];
  const w1 = workload.weeks[0];
  const seen = new Set<string>();
  const err = (m: string) => {
    if (!seen.has(m)) {
      seen.add(m);
      errors.push(m);
    }
  };

  // Role, warrant and dose.
  if (!allowed.roles.has(plan.role)) err(`role "${plan.role}" isn't one this coach's method allows here (${[...allowed.roles].join(", ")}).`);
  if (plan.warranted && plan.role === "none") err('A warranted plan needs a role other than "none".');
  if (!plan.warranted && plan.role !== "none") err('warranted:false means role "none".');
  const expectedDose = !plan.warranted ? "none" : !range ? "no_coach_range" : w1.minutes.total < range[0] ? "below" : "within";
  if (plan.dose.vsCoachRange !== expectedDose) err(`dose.vsCoachRange is "${plan.dose.vsCoachRange}" but week 1 is ${plan.warranted ? `${w1.minutes.total} min against ${range ? `the coach's ${range[0]}–${range[1]}` : "no coach range"}` : "no cardio"} — that's "${expectedDose}".`);

  // Intensity method.
  if (plan.warranted && !allowed.intensityMethods.has(plan.intensityMethod.primary)) err(`intensityMethod "${plan.intensityMethod.primary}" isn't one this coach uses (${[...allowed.intensityMethods].join(", ")}).`);
  if (plan.warranted && plan.intensityMethod.primary === "heart_rate" && !ri.zones) err(ri.safety.noHeartRate ? "No heart-rate targets for this client (a medication or condition may alter heart rate) — use talk test or perceived effort." : "Heart-rate targets need the coach's heart-rate method and the client's age; OPTIM offered no zones.");

  // Week 1 detail: anchors and interval structure.
  for (const [i, s] of plan.sessions.entries()) {
    const at = `sessions[${i}] (${s.day})`;
    if (s.type === "intervals") {
      if (!s.intervals) err(`${at}: interval sessions need rounds, work and recovery.`);
      if (s.talk) err(`${at}: the talk test isn't practical for intervals (concept.cardio.intensity#intensity.talk_test) — anchor them with effort or heart rate.`);
      if (s.intervals && (s.intervals.rounds * (s.intervals.workSeconds + s.intervals.recoverySeconds)) / 60 > s.minutes) err(`${at}: ${s.intervals.rounds} × (${s.intervals.workSeconds}+${s.intervals.recoverySeconds} s) doesn't fit in ${s.minutes} min.`);
      if (s.intervals && (s.intervals.workEffort.min < EFFORT_BANDS.vigorous[0] || s.intervals.recoveryEffort.max > EFFORT_BANDS.moderate[1])) err(`${at}: work bouts are vigorous (effort ≥ ${EFFORT_BANDS.vigorous[0]}) and recoveries easy-to-moderate (≤ ${EFFORT_BANDS.moderate[1]}).`);
    } else if (s.intervals) err(`${at}: a steady session has no interval structure.`);
    const band = EFFORT_BANDS[s.intensity];
    if (s.type === "steady" && (s.effort.min < band[0] || s.effort.max > band[1])) err(`${at}: effort ${s.effort.min}–${s.effort.max} doesn't match "${s.intensity}" (${band[0]}–${band[1]} of 10).`);
    if (s.type === "steady" && plan.intensityMethod.primary === "talk_test" && s.talk !== TALK_FOR[s.intensity]) err(`${at}: with the talk test, "${s.intensity}" means ${TALK_FOR[s.intensity].replace(/_/g, " ")}.`);
    if (s.hrPct && !ri.zones) err(`${at}: no heart-rate zones were offered for this client — drop hrPct.`);
    if (s.hrPct && ri.zones && s.type === "steady") {
      const z = ri.zones.bands[s.intensity];
      if (s.hrPct.min < z[0] - 2 || s.hrPct.max > z[1] + 2) err(`${at}: ${s.hrPct.min}–${s.hrPct.max}% HRmax doesn't match "${s.intensity}" (${z[0]}–${z[1]}%).`);
    }
    if (plan.intensityMethod.primary === "heart_rate" && s.type === "steady" && !s.hrPct && ri.zones) err(`${at}: heart-rate method — give hrPct.`);
    if (isHard(s) && s.placement === "after_resistance") quality.push({ code: "same_visit_hard", severity: "info", message: `${s.day}: hard cardio in the same visit as lifting — explosive-strength gains are attenuated more than with ≥3 h separation.` });
  }

  // Progression shape: weeks 2..N contiguous, N = 4–8.
  if (plan.warranted) {
    const n = plan.progression.length + 1;
    if (n < 4 || n > 8) err(`the plan covers ${n} weeks (week 1 + progression) — give 4–8.`);
    plan.progression.forEach((w, k) => w.week !== k + 2 && err(`progression weeks must run 2, 3, 4… (found ${w.week} at position ${k + 1}).`));
  }

  // EVERY week: availability, capacity (approved lifting fixed), restrictions, placement, interference, workload.
  const res = new Map((ri.resistance?.days ?? []).map((d) => [d.day, d]));
  const cap = new Map(ri.capacity.days.map((d) => [d.day, d]));
  const available = new Set(b.availableDays);
  const strengthPriority = ["hypertrophy", "strength", "recomposition", "weight_gain"].includes(ri.goal.primary ?? "") || ri.hybrid;
  const enduranceDays = ri.coach.rules.find((r) => r[1] === "endurance days/week")?.[2] as number[] | undefined;
  const lowInterferenceOffered = [...allowed.modalities.values()].some((o) => o.modality.lowerBodyInterference === "low" || o.modality.lowerBodyInterference === "none");
  const weeks: Array<{ week: number; sessions: CardioWeekSession[]; deload: boolean; gate: WeekLoad["gate"] }> = [{ week: 1, sessions: plan.sessions, deload: false, gate: "none" }, ...plan.progression];
  /** The most recent NON-deload week — the baseline growth is measured from (week 1 is the first). */
  let baseline: WeekLoad | null = null;
  const decided = new Set(plan.coachDecisions.map((d) => d.about));
  const lifting = new Set((ri.resistance?.days ?? []).map((d) => d.day));
  const w1Load = workload.weeks[0];
  for (const w of weeks) {
    const W = `week ${w.week}`;
    const days = new Set<DayOfWeek>();
    for (const s of w.sessions) {
      const at = `${W} ${s.day}`;
      if (days.has(s.day)) err(`${at}: one cardio session per day.`);
      days.add(s.day);
      if (!available.has(s.day)) err(`${at}: ${s.day} isn't one of the client's available days (${b.availableDays.join(", ")}).`);
      const opt = allowed.modalities.get(s.modality);
      const mod = cardioModality(s.modality);
      if (!opt) err(mod ? `${at}: ${mod.name} doesn't fit the client's confirmed restrictions (or its fit is uncertain) — use a listed modality.` : `${at}: "${s.modality}" isn't a known modality.`);
      if (mod && s.type === "intervals" && !mod.supports.includes("intervals")) err(`${at}: ${mod.name} isn't used for intervals.`);
      if (s.type === "intervals" && s.intensity !== "vigorous") err(`${at}: intervals are vigorous work — label them "vigorous".`);
      // V1.3 — every week's interval session carries its structure (executable content needs it); it must fit.
      if (w.week > 1 && s.type === "intervals") {
        const iv = (s as CardioWeekSession).intervals;
        if (!iv) err(`${at}: an interval session needs its structure (rounds, workSeconds, recoverySeconds) in every week.`);
        else if ((iv.rounds * (iv.workSeconds + iv.recoverySeconds)) / 60 > s.minutes) err(`${at}: ${iv.rounds} × (${iv.workSeconds}+${iv.recoverySeconds} s) doesn't fit in ${s.minutes} min.`);
      }
      if (w.week > 1 && s.type === "steady" && (s as CardioWeekSession).intervals) err(`${at}: a steady session has no interval structure.`);
      if (isHard(s) && ri.safety.noVigorous) err(`${at}: no vigorous or interval work for this client until the coach confirms the reported medication/condition.`);
      if (plan.role === "optional_low_intensity" && (!s.optional || s.intensity !== "easy")) err(`${at}: this coach's cardio is an optional, low-intensity extra — every session optional:true and easy.`);
      // Placement and capacity against the APPROVED lifting (never changed).
      const r = res.get(s.day);
      const c = cap.get(s.day);
      if (r && s.placement === "separate_day") err(`${at}: ${s.day} is a resistance day — place cardio "after_resistance" (same visit) or as a "separate_session" (≥3 h apart).`);
      if (!r && s.placement !== "separate_day") err(`${at}: there's no resistance session on ${s.day} — placement is "separate_day".`);
      if (r && c && s.placement === "after_resistance" && c.sameVisitMax !== null && s.minutes > c.sameVisitMax) err(`${at}: lifting (~${r.minutes} min, approved — not changed) + ${s.minutes} min cardio exceeds the client's ${ri.capacity.sessionCapMinutes}-min cap (room for ${c.sameVisitMax} min) — shorten the cardio or make it a separate session.`);
      if (c && s.placement !== "after_resistance" && c.ownVisitMax !== null && s.minutes > c.ownVisitMax) err(`${at}: ${s.minutes} min exceeds the client's ${c.ownVisitMax}-min session cap.`);
      // Interference with lower-body (or full-body) lifting.
      if (mod && isHard(s) && strengthPriority && mod.lowerBodyInterference !== "none" && mod.lowerBodyInterference !== "low") {
        if (r?.lowerBody) err(`${at}: hard ${mod.name.toLowerCase()} on a lower-body strength day interferes with the lifting this goal prioritizes (concept.cardio.concurrent_training) — move it or use a low-interference modality.`);
        else if (res.get(nextDay(s.day))?.lowerBody) err(`${at}: hard ${mod.name.toLowerCase()} the day before a lower-body strength day (${nextDay(s.day)}) — move it or use a low-interference modality.`);
      }
      if (w.week === 1 && mod && strengthPriority && mod.lowerBodyInterference === "high" && lowInterferenceOffered) quality.push({ code: "high_interference_modality", severity: "info", message: `${s.day}: ${mod.name} interferes with lower-body strength more than cycling (Wilson 2012); reasonable when it's the client's own aim — confirm.` });
      if (w.week === 1 && opt && opt.equipment === "unknown") quality.push({ code: "equipment_unconfirmed", severity: "info", message: `${s.day}: ${mod?.name} needs equipment the coach hasn't confirmed.` });
    }
    const load = weekLoad(w.week, w.sessions);
    if (load.hardSessions > b.maxHardSessions) err(`${W}: ${load.hardSessions} hard sessions — the limit for this client is ${b.maxHardSessions}${b.recoveryLimited ? " (sleep or stress is limiting recovery)" : ""}.`);
    if (w.week <= b.easyStartWeeks && load.hardSessions > 0) err(`${W}: the client is new or returning to training — no hard sessions in the first ${b.easyStartWeeks} weeks.`);
    if (range && load.minutes.total > range[1]) err(`${W}: ${load.minutes.total} min of cardio — above the coach's ${range[0]}–${range[1]} min/week for ${plan.role.replace(/_/g, " ")}.`);
    if (ri.capacity.weeklyMaxMinutes !== null && load.minutes.total > ri.capacity.weeklyMaxMinutes) err(`${W}: ${load.minutes.total} min doesn't fit the client's week (at most ${ri.capacity.weeklyMaxMinutes} min across their available days and session cap).`);
    if (enduranceDays && load.sessions > enduranceDays[1]) err(`${W}: ${load.sessions} endurance days — the coach's maximum is ${enduranceDays[1]}.`);
    const ls = ri.endurance?.longSession;
    const longest = Math.max(0, ...w.sessions.map((s) => s.minutes));
    if (ls && "maxMinutes" in ls && longest > ls.maxMinutes) err(`${W}: a ${longest}-min session exceeds the coach's ${ls.maxMinutes}-min long-session cap.`);
    if (ls && "maxPercent" in ls && load.sessions > 1 && longest > (load.minutes.total * ls.maxPercent) / 100 + 1) err(`${W}: the longest session (${longest} min) is ${Math.round((longest / load.minutes.total) * 100)}% of the week — the coach caps it at ${ls.maxPercent}%.`);
    // Progression against the established baseline: a deload is lighter than it and never replaces it; above the
    // baseline, growth is capped (coach's weekly increase, else OPTIM's pacing default).
    if (w.deload && baseline && load.minutes.total >= baseline.minutes.total) err(`${W}: marked as a deload but isn't lighter than the baseline (week ${baseline.week}, ${baseline.minutes.total} min).`);
    if (!w.deload && baseline && baseline.minutes.total > 0 && load.minutes.total > baseline.minutes.total) {
      const inc = ((load.minutes.total - baseline.minutes.total) / baseline.minutes.total) * 100;
      if (inc > b.maxWeeklyIncreasePct + 0.5) err(`${W}: ${load.minutes.total} min is ${Math.round(inc)}% above the established baseline (week ${baseline.week}, ${baseline.minutes.total} min) — the limit is ${b.maxWeeklyIncreasePct}%.`);
    }
    // Gated growth: recovery-limited clients grow only when recovery improves (or the coach confirms).
    if (w.week > 1 && b.recoveryLimited && load.minutes.total > w1Load.minutes.total && w.gate === "none") err(`${W}: grows above week 1 (${w1Load.minutes.total} → ${load.minutes.total} min) for a recovery-limited client — gate it on "recovery_improved" (or "coach_confirmed").`);
    // Optional cardio the coach never sized: it grows only once the coach confirms a dose.
    if (w.week > 1 && plan.role === "optional_low_intensity" && !range && load.optionalMinutes > w1Load.optionalMinutes) {
      if (w.gate !== "coach_confirmed") err(`${W}: optional cardio grows (${w1Load.optionalMinutes} → ${load.optionalMinutes} min) but the coach never set an amount — keep it flat or gate it on "coach_confirmed".`);
      if (!decided.has("optional_dose")) err(`${W}: growing optional cardio needs a prepared "optional_dose" coach decision.`);
    }
    if (w.gate === "coach_confirmed" && !plan.coachDecisions.length) err(`${W}: gate "coach_confirmed" needs the coach decision it depends on in coachDecisions.`);
    if (!w.deload) baseline = load;
  }
  // Down weeks on the coach's cadence (every a–b weeks): a week lighter than the one before it, by week b.
  const de = ri.endurance?.downEvery;
  if (plan.warranted && de && workload.weeks.length >= de[1]) {
    const down = workload.weeks.some((w) => w.deload && w.week >= de[0] && w.week <= de[1]);
    if (!down) err(`The coach programs a down week every ${de[0]}–${de[1]} weeks — mark one of weeks ${de[0]}–${de[1]} as a deload ("deload":true, lighter than the baseline).`);
  }
  if (range && plan.warranted && workload.weeks.at(-1)!.minutes.total < range[0]) quality.push({ code: "below_coach_range", severity: "info", message: `The plan ends at ${workload.weeks.at(-1)!.minutes.total} min/week, below the coach's ${range[0]}–${range[1]} for ${plan.role.replace(/_/g, " ")} — deliberate (see dose), for the coach to confirm.` });
  if (ri.endurance?.disciplineModalities.length && plan.warranted && !plan.sessions.some((s) => ri.endurance!.disciplineModalities.includes(s.modality))) quality.push({ code: "discipline_not_trained", severity: "warning", message: `No week-1 session trains the client's discipline (${ri.endurance.discipline}).` });

  // Steps, monitoring.
  if (plan.steps && !ri.coach.rules.some((r) => r[1] === "steps/day")) err("The coach sets no step target — omit steps.");
  const sr = ri.coach.rules.find((r) => r[1] === "steps/day")?.[2] as number[] | undefined;
  if (plan.steps && sr && (plan.steps.target.min < sr[0] - 100 || plan.steps.target.max > sr[1] + 100)) err(`steps ${plan.steps.target.min}–${plan.steps.target.max} is outside the coach's ${sr[0]}–${sr[1]}.`);
  for (const x of plan.monitoring.measures) if (!b.measures.includes(x)) err(`Measure "${x}" isn't one OPTIM tracks (${b.measures.join(", ")}).`);
  if (plan.warranted && !plan.monitoring.measures.length) err("monitoring.measures must name how progress is judged.");

  // Limited recovery changes the prescription's STRUCTURE: a stated strategy that the sessions actually follow, and no
  // new training day without a prepared coach decision.
  const allSessions = weeks.flatMap((w) => w.sessions.map((x) => ({ ...x, week: w.week })));
  const newDays = [...new Set(allSessions.filter((x) => !lifting.has(x.day)).map((x) => x.day))];
  if (b.recoveryLimited) {
    const st = plan.recoveryStrategy;
    if (!st) err('Recovery is limited — state "recoveryStrategy" (no_additional_cardio, existing_training_days, reduced_dose or coach_decision).');
    if (st === "no_additional_cardio" && plan.warranted) err('recoveryStrategy "no_additional_cardio" means warranted:false.');
    if (st !== "no_additional_cardio" && st && !plan.warranted) err('A plan with no cardio uses recoveryStrategy "no_additional_cardio".');
    if (st === "existing_training_days" && !ri.resistance?.days.length) err('recoveryStrategy "existing_training_days" needs a known resistance program — none was supplied.');
    if (st === "existing_training_days" && newDays.length) err(`recoveryStrategy "existing_training_days" but cardio is on ${newDays.join(", ")}, where the client doesn't already train.`);
    if (st === "reduced_dose" && plan.dose.vsCoachRange === "within") err('recoveryStrategy "reduced_dose" but week 1 sits inside the coach\'s range — reduce it or choose another strategy.');
    if (newDays.length && !(st === "coach_decision" && decided.has("added_training_day"))) err(`Cardio on ${newDays.join(", ")} adds training day(s) for a recovery-limited client${ri.resistance ? "" : " (no resistance program is known, so every cardio day may be new)"} — use existing training days, reduce or drop the cardio, or prepare an "added_training_day" coach decision (recoveryStrategy "coach_decision").`);
    if (st === "coach_decision" && !decided.has("added_training_day")) err('recoveryStrategy "coach_decision" needs the prepared "added_training_day" coach decision.');
  }
  // An optional dose the coach never set can't rest on minute guidance (another role's volume, not this coach's).
  if (plan.role === "optional_low_intensity" && !range) {
    const minuteRefs = new Set(ri.evidence.filter((e) => Object.values(e.params ?? {}).some((x) => /min\/week/.test((x as { unit?: string }).unit ?? ""))).map((e) => e.ref));
    for (const d of plan.decisions) if (d.topic === "dose" && d.knowledgeRefs.some((r) => minuteRefs.has(r))) err(`The optional cardio dose cites weekly-minute guidance (${d.knowledgeRefs.filter((r) => minuteRefs.has(r)).join(", ")}) — the coach set no amount for optional cardio; offer a small amount or prepare an "optional_dose" coach decision.`);
  }

  // Prepared coach decisions: one per schedule conflict (never resolved by changing the approved program), plus the
  // decisions OPTIM may require.
  const conflictIds = new Set<string>(ri.conflicts.map((c) => c.id));
  for (const c of ri.conflicts) if (!decided.has(c.id)) err(`Conflict "${c.id}" (${c.text}) needs a prepared coach decision in coachDecisions.`);
  for (const d of plan.coachDecisions) if (!conflictIds.has(d.about) && !(DECISION_TOPICS as readonly string[]).includes(d.about)) err(`coachDecisions is about "${d.about}", which OPTIM didn't detect (known: ${[...conflictIds, ...DECISION_TOPICS].join(", ")}) — put other questions in coachQuestions.`);

  // Provenance and the decisions a coach will question.
  for (const d of plan.decisions) for (const e of [...citationErrors("coach", d.coachRuleKeys, allowed), ...citationErrors("client", d.clientFactRefs, allowed), ...citationErrors("evidence", d.knowledgeRefs, allowed)]) err(e);
  const topics = new Set(plan.decisions.map((d) => d.topic));
  const needed = ["warranted", "dose", ...(plan.warranted ? ["intensity", "schedule", "progression"] : []), ...(plan.warranted && ri.resistance?.days.length ? ["interference"] : []), ...(b.recoveryLimited ? ["recovery"] : [])];
  for (const t of needed) if (!topics.has(t as never)) err(`decisions must explain the ${t} decision.`);
  if (!plan.warranted && ri.purpose === "fat_loss_support" && ri.coach.allowedRoles.includes("fat_loss")) quality.push({ code: "no_cardio_for_fat_loss", severity: "warning", message: "No cardio proposed for a fat-loss client whose coach uses cardio for fat loss — confirm that's intended." });
  return { ok: errors.length === 0, errors, quality, workload };
}
