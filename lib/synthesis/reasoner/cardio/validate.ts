// Cardio Reasoner V1 — deterministic validation and the cross-modality workload summary. Errors reject the output
// (and become the one repair attempt's feedback); quality findings never block but go to the coach. Every rule checks
// something OPTIM can know: the coach's method, the client's availability and confirmed restrictions, the safety
// gate, the resistance week, the knowledge-backed intensity anchors, and provenance.

import { citationErrors } from "../expand.ts";
import { DAY_ORDER } from "../../client-state.ts";
import { cardioModality } from "../../knowledge/cardio/modalities.ts";
import type { DayOfWeek } from "../../../types.ts";
import type { CardioAllowed, CardioReasoningInput } from "./input.ts";
import type { CardioPlan, CardioSession } from "./contract.ts";

export interface CardioQualityFinding {
  code: string;
  severity: "warning" | "info";
  message: string;
}

/** Perceived effort (0–10) per intensity label — internal curation (concept.cardio.intensity#intensity.rpe_scale). */
export const EFFORT_BANDS: Record<CardioSession["intensity"], [number, number]> = { easy: [1, 3], moderate: [4, 6], vigorous: [7, 9] };
const TALK_FOR: Record<CardioSession["intensity"], NonNullable<CardioSession["talk"]>> = { easy: "full_conversation", moderate: "short_sentences", vigorous: "few_words" };

const isHard = (s: CardioSession) => s.type === "intervals" || s.intensity === "vigorous";
const dayIndex = (d: DayOfWeek) => DAY_ORDER.indexOf(d);

export interface CardioWorkload {
  weeklyMinutes: { easy: number; moderate: number; vigorous: number; total: number };
  /** Moderate-equivalent minutes (moderate + 2 × vigorous), the equivalence implied by 150 moderate ≈ 75 vigorous. */
  moderateEquivalent: number;
  hardSessions: number;
  trainingDays: number;
  sameVisit: Array<{ day: DayOfWeek; minutes: number }>;
}

export function cardioWorkload(plan: CardioPlan, ri: CardioReasoningInput): CardioWorkload {
  const m = { easy: 0, moderate: 0, vigorous: 0, total: 0 };
  for (const s of plan.sessions) {
    m[s.intensity] += s.minutes;
    m.total += s.minutes;
  }
  const res = new Map((ri.resistance?.days ?? []).map((d) => [d.day, d]));
  const days = new Set<DayOfWeek>([...(ri.resistance?.days ?? []).map((d) => d.day), ...plan.sessions.map((s) => s.day)]);
  return {
    weeklyMinutes: m,
    moderateEquivalent: m.easy + m.moderate + 2 * m.vigorous,
    hardSessions: plan.sessions.filter(isHard).length,
    trainingDays: days.size,
    sameVisit: plan.sessions.filter((s) => s.placement === "after_resistance" && res.has(s.day)).map((s) => ({ day: s.day, minutes: s.minutes + res.get(s.day)!.minutes })),
  };
}

export function validateCardioPlan(params: { plan: CardioPlan; reasoning: CardioReasoningInput; allowed: CardioAllowed }): { ok: boolean; errors: string[]; quality: CardioQualityFinding[]; workload: CardioWorkload } {
  const { plan, reasoning: ri, allowed } = params;
  const errors: string[] = [];
  const quality: CardioQualityFinding[] = [];
  const b = ri.bounds;
  const workload = cardioWorkload(plan, ri);

  // Role and warrant.
  if (!allowed.roles.has(plan.role)) errors.push(`role "${plan.role}" isn't one this coach's method allows here (${[...allowed.roles].join(", ")}).`);
  if (plan.warranted && plan.role === "none") errors.push('A warranted plan needs a role other than "none".');
  if (!plan.warranted && plan.role !== "none") errors.push('warranted:false means role "none".');

  // Intensity method.
  if (plan.warranted && !allowed.intensityMethods.has(plan.intensityMethod.primary)) errors.push(`intensityMethod "${plan.intensityMethod.primary}" isn't one this coach uses (${[...allowed.intensityMethods].join(", ")}).`);
  if (plan.intensityMethod.primary === "heart_rate" && !ri.zones) errors.push(ri.safety.noHeartRate ? "No heart-rate targets for this client (a medication or condition may alter heart rate) — use talk test or perceived effort." : "Heart-rate targets need the coach's heart-rate method and the client's age; OPTIM offered no zones.");

  // Sessions.
  const seen = new Set<DayOfWeek>();
  const res = new Map((ri.resistance?.days ?? []).map((d) => [d.day, d]));
  const available = new Set(b.availableDays);
  const strengthPriority = ["hypertrophy", "strength", "recomposition", "weight_gain"].includes(ri.goal.primary ?? "") || ri.hybrid;
  for (const [i, s] of plan.sessions.entries()) {
    const at = `sessions[${i}] (${s.day})`;
    if (seen.has(s.day)) errors.push(`${at}: one cardio session per day.`);
    seen.add(s.day);
    if (!available.has(s.day)) errors.push(`${at}: ${s.day} isn't one of the client's available days (${b.availableDays.join(", ")}).`);
    const opt = allowed.modalities.get(s.modality);
    const mod = cardioModality(s.modality);
    if (!opt) errors.push(mod ? `${at}: ${mod.name} doesn't fit the client's confirmed restrictions (or its fit is uncertain) — use a listed modality.` : `${at}: "${s.modality}" isn't a known modality.`);
    if (mod && s.type === "intervals" && !mod.supports.includes("intervals")) errors.push(`${at}: ${mod.name} isn't used for intervals.`);
    if (s.type === "intervals") {
      if (!s.intervals) errors.push(`${at}: interval sessions need rounds, work and recovery.`);
      if (s.intensity !== "vigorous") errors.push(`${at}: intervals are vigorous work — label them "vigorous".`);
      if (s.talk) errors.push(`${at}: the talk test isn't practical for intervals (concept.cardio.intensity#intensity.talk_test) — anchor them with effort or heart rate.`);
      if (s.intervals && (s.intervals.rounds * (s.intervals.workSeconds + s.intervals.recoverySeconds)) / 60 > s.minutes) errors.push(`${at}: ${s.intervals.rounds} × (${s.intervals.workSeconds}+${s.intervals.recoverySeconds} s) doesn't fit in ${s.minutes} min.`);
      if (s.intervals && (s.intervals.workEffort.min < EFFORT_BANDS.vigorous[0] || s.intervals.recoveryEffort.max > EFFORT_BANDS.moderate[1])) errors.push(`${at}: work bouts are vigorous (effort ≥ ${EFFORT_BANDS.vigorous[0]}) and recoveries easy-to-moderate (≤ ${EFFORT_BANDS.moderate[1]}).`);
    } else if (s.intervals) errors.push(`${at}: a steady session has no interval structure.`);
    const band = EFFORT_BANDS[s.intensity];
    if (s.type === "steady" && (s.effort.min < band[0] || s.effort.max > band[1])) errors.push(`${at}: effort ${s.effort.min}–${s.effort.max} doesn't match "${s.intensity}" (${band[0]}–${band[1]} of 10).`);
    if (s.type === "steady" && plan.intensityMethod.primary === "talk_test" && s.talk !== TALK_FOR[s.intensity]) errors.push(`${at}: with the talk test, "${s.intensity}" means ${TALK_FOR[s.intensity].replace(/_/g, " ")}.`);
    if (s.hrPct && !ri.zones) errors.push(`${at}: no heart-rate zones were offered for this client — drop hrPct.`);
    if (s.hrPct && ri.zones && s.type === "steady") {
      const z = ri.zones.bands[s.intensity];
      if (s.hrPct.min < z[0] - 2 || s.hrPct.max > z[1] + 2) errors.push(`${at}: ${s.hrPct.min}–${s.hrPct.max}% HRmax doesn't match "${s.intensity}" (${z[0]}–${z[1]}%).`);
    }
    if (plan.intensityMethod.primary === "heart_rate" && s.type === "steady" && !s.hrPct && ri.zones) errors.push(`${at}: heart-rate method — give hrPct.`);
    if (isHard(s) && ri.safety.noVigorous) errors.push(`${at}: no vigorous or interval work for this client until the coach confirms the reported medication/condition.`);
    if (isHard(s) && plan.role === "recovery") errors.push(`${at}: this coach's cardio is optional and low-intensity — no vigorous or interval work.`);
    // Placement relative to resistance.
    const r = res.get(s.day);
    if (r && s.placement === "separate_day") errors.push(`${at}: ${s.day} is a resistance day — place cardio "after_resistance" (same visit) or as a "separate_session" (≥3 h apart).`);
    if (!r && s.placement !== "separate_day") errors.push(`${at}: there's no resistance session on ${s.day} — placement is "separate_day".`);
    if (r && s.placement === "after_resistance" && b.sessionCapMinutes !== null && r.minutes + s.minutes > b.sessionCapMinutes) errors.push(`${at}: resistance (~${r.minutes} min) + cardio (${s.minutes} min) in one visit exceeds the client's ${b.sessionCapMinutes}-min cap — shorten it or make it a separate session.`);
    // Interference with lower-body strength work.
    if (mod && isHard(s) && strengthPriority && mod.lowerBodyInterference !== "none" && mod.lowerBodyInterference !== "low") {
      const tomorrow = DAY_ORDER[(dayIndex(s.day) + 1) % 7];
      if (r?.lowerBody) errors.push(`${at}: hard ${mod.name.toLowerCase()} on a lower-body strength day interferes with the lifting this goal prioritizes (concept.cardio.concurrent_training) — move it or use a low-interference modality.`);
      else if (res.get(tomorrow)?.lowerBody) errors.push(`${at}: hard ${mod.name.toLowerCase()} the day before a lower-body strength day (${tomorrow}) — move it or use a low-interference modality.`);
    }
    if (isHard(s) && s.placement === "after_resistance") quality.push({ code: "same_visit_hard", severity: "info", message: `${s.day}: hard cardio in the same visit as lifting — explosive-strength gains are attenuated more than with ≥3 h separation.` });
    if (mod && strengthPriority && mod.lowerBodyInterference === "high" && [...allowed.modalities.values()].some((o) => o.modality.lowerBodyInterference === "low" || o.modality.lowerBodyInterference === "none")) quality.push({ code: "high_interference_modality", severity: "warning", message: `${s.day}: ${mod.name} interferes with lower-body strength more than cycling (Wilson 2012) and a lower-interference option is available.` });
    if (opt && opt.equipment === "unknown") quality.push({ code: "equipment_unconfirmed", severity: "info", message: `${s.day}: ${mod?.name} needs equipment the coach hasn't confirmed.` });
  }

  // Weekly workload.
  if (workload.hardSessions > b.maxHardSessions) errors.push(`${workload.hardSessions} hard sessions a week — the limit for this client is ${b.maxHardSessions}${b.recoveryLimited ? " (sleep or stress is limiting recovery)" : ""}.`);
  if (b.easyStartWeeks > 0 && workload.hardSessions > 0) errors.push(`The client is new or returning to training: no hard sessions in the first ${b.easyStartWeeks} weeks.`);
  const range = b.minutesByRole[plan.role];
  if (plan.warranted && range && workload.weeklyMinutes.total > range[1]) errors.push(`Week 1 has ${workload.weeklyMinutes.total} min of cardio — above the coach's ${range[0]}–${range[1]} min/week for ${plan.role.replace(/_/g, " ")}.`);

  // Progression: contiguous weeks, week 1 = the sessions, gradual increases, and the coach's ceiling.
  if (plan.warranted) {
    const p = plan.progression;
    if (p.length < 4 || p.length > 8) errors.push(`progression covers ${p.length} weeks — give 4–8.`);
    p.forEach((w, k) => w.week !== k + 1 && errors.push(`progression weeks must run 1, 2, 3… (found ${w.week} at position ${k + 1}).`));
    if (p[0] && Math.abs(p[0].minutes - workload.weeklyMinutes.total) > 5) errors.push(`progression week 1 says ${p[0].minutes} min, but the sessions total ${workload.weeklyMinutes.total}.`);
    if (p[0] && p[0].hardSessions !== workload.hardSessions) errors.push(`progression week 1 says ${p[0].hardSessions} hard sessions, but the sessions have ${workload.hardSessions}.`);
    for (let k = 1; k < p.length; k++) {
      const inc = p[k - 1].minutes > 0 ? ((p[k].minutes - p[k - 1].minutes) / p[k - 1].minutes) * 100 : 0;
      if (inc > b.maxWeeklyIncreasePct + 0.5) errors.push(`progression week ${p[k].week} raises minutes ${Math.round(inc)}% — the limit is ${b.maxWeeklyIncreasePct}% a week.`);
    }
    for (const w of p) {
      if (w.hardSessions > b.maxHardSessions) errors.push(`progression week ${w.week} has ${w.hardSessions} hard sessions (limit ${b.maxHardSessions}).`);
      if (w.week <= b.easyStartWeeks && w.hardSessions > 0) errors.push(`progression week ${w.week}: no hard sessions in the first ${b.easyStartWeeks} weeks for this client.`);
      if (range && w.minutes > range[1]) errors.push(`progression week ${w.week} reaches ${w.minutes} min — above the coach's ${range[1]} min/week.`);
    }
    if (range && p.length && p[p.length - 1].minutes < range[0]) quality.push({ code: "below_coach_range", severity: "info", message: `The progression ends at ${p[p.length - 1].minutes} min/week, below the coach's ${range[0]}–${range[1]} for ${plan.role.replace(/_/g, " ")} — intended for this client's starting point?` });
  } else if (plan.progression.length) errors.push("warranted:false has no progression.");

  // Steps, monitoring.
  if (plan.steps && !ri.coach.rules.some((r) => r[1] === "steps/day")) errors.push("The coach sets no step target — omit steps.");
  const sr = ri.coach.rules.find((r) => r[1] === "steps/day")?.[2] as number[] | undefined;
  if (plan.steps && sr && (plan.steps.target.min < sr[0] - 100 || plan.steps.target.max > sr[1] + 100)) errors.push(`steps ${plan.steps.target.min}–${plan.steps.target.max} is outside the coach's ${sr[0]}–${sr[1]}.`);
  for (const x of plan.monitoring.measures) if (!b.measures.includes(x)) errors.push(`Measure "${x}" isn't one OPTIM tracks (${b.measures.join(", ")}).`);
  if (plan.warranted && !plan.monitoring.measures.length) errors.push("monitoring.measures must name how progress is judged.");

  // Provenance and the decisions a coach will question.
  for (const d of plan.decisions) errors.push(...citationErrors("coach", d.coachRuleKeys, allowed), ...citationErrors("client", d.clientFactRefs, allowed), ...citationErrors("evidence", d.knowledgeRefs, allowed));
  const topics = new Set(plan.decisions.map((d) => d.topic));
  const needed = ["warranted", ...(plan.warranted ? ["intensity", "schedule", "progression"] : []), ...(plan.warranted && ri.resistance?.days.length ? ["interference"] : [])];
  for (const t of needed) if (!topics.has(t as never)) errors.push(`decisions must explain the ${t} decision.`);
  if (!plan.warranted && plan.role === "none" && ri.purpose === "fat_loss_support") quality.push({ code: "no_cardio_for_fat_loss", severity: "warning", message: "No cardio proposed for a fat-loss client whose coach uses cardio for fat loss — confirm that's intended." });
  return { ok: errors.length === 0, errors, quality, workload };
}
