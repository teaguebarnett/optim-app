// Unified Program U1 — deterministic CROSS-DOMAIN validation. Each domain already validated itself; these checks cover
// what no single domain can see: that the three proposals were made for the same client, goal and coach method; that
// cardio was planned around exactly this lifting week and nutrition for exactly this training; that no domain changed
// an approved program; that the combined week fits the client's time; that the domains' directions don't contradict;
// and where the coach must decide something only the whole program reveals. Errors make the program INCOHERENT;
// findings and decisions go to the coach. No new numeric limits — only consistency, the client's own facts, and the
// coach's authority.

import { isKnown } from "../facts.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import { sha256 } from "../reasoner/run.ts";
import type { UniversalTrainingProgramContent } from "../../training/types.ts";
import type { CrossDomainFinding, DomainId, DomainOutcome, ProgramDay, ProgramWorkload, UnifiedDecision } from "./contract.ts";
import type { DomainResults } from "./orchestrate.ts";

export interface CrossDomainResult {
  errors: string[];
  findings: CrossDomainFinding[];
  decisions: UnifiedDecision[];
  uncertainties: string[];
  alignment: string[];
}

export function validateCrossDomain(p: {
  input: SynthesisInput;
  domains: Record<DomainId, DomainOutcome>;
  results: DomainResults;
  week: ProgramDay[];
  workload: ProgramWorkload;
  recoveryLimited: boolean;
  approved: { versionId: string; content: UniversalTrainingProgramContent } | null;
  approvedHashBefore: string | null;
}): CrossDomainResult {
  const { input, results: r } = p;
  const out: CrossDomainResult = { errors: [], findings: [], decisions: [], uncertainties: [], alignment: [] };
  const clientHash = sha256(input.client);
  const goalHash = sha256(input.goal);

  // X1 — one client, one goal, one coach method across every domain run.
  for (const d of Object.values(p.domains)) {
    if (!d.run) continue;
    if (d.run.hashes.clientState !== clientHash) out.errors.push(`${d.domain} was reasoned over a different client state than the program.`);
    if (d.run.hashes.goalContract !== goalHash) out.errors.push(`${d.domain} was reasoned over a different goal contract than the program.`);
    if (input.coach && d.run.versions.coachMethod?.versionId !== input.coach.versionId) out.errors.push(`${d.domain} used coach method ${d.run.versions.coachMethod?.versionId ?? "none"}, not the confirmed ${input.coach.versionId}.`);
  }

  // X2 — cardio was planned around exactly this lifting week (no domain plans around a different program).
  if (r.cardio) {
    const used = r.cardio.run.snapshots.resistance;
    if (sha256(used ?? null) !== sha256(r.resistanceWeek ?? null)) out.errors.push("Cardio was planned around a different lifting week than the one in this program.");
  }
  // X3 — nutrition was prepared for exactly this training.
  if (r.nutrition) {
    const used = r.nutrition.run.training;
    if (r.training && sha256(used) !== sha256(r.training)) out.errors.push(`Nutrition assumed ${used ? `${used.sessionsPerWeek} × ${used.minutesPerSession} min (${used.source})` : "no training"}, but the program's lifting is ${r.training.sessionsPerWeek} × ${r.training.minutesPerSession} min.`);
    if (!r.training && used && used.source !== "client_current") out.errors.push("Nutrition assumed a program's training, but this program has no lifting week.");
  }
  // X4 — an approved program is input, never output: it must be byte-for-byte unchanged.
  if (p.approved && sha256(p.approved.content) !== p.approvedHashBefore) out.errors.push("The approved resistance program changed during planning — approved prescriptions are never modified.");

  // X5 — the combined week fits the client's time.
  const len = isKnown(input.client.schedule.maxSessionLength) ? input.client.schedule.maxSessionLength.value : null;
  const cap = len && !len.openEnded ? len.minutes : null;
  for (const d of p.week) {
    if ((d.resistance || d.cardio) && !d.available) {
      if (d.resistance?.source === "proposed_program" || d.cardio) out.errors.push(`${d.day}: the program trains on a day the client isn't available.`);
      else out.findings.push({ code: "approved_on_unavailable_day", severity: "warning", message: `${d.day}: the approved lifting falls on a day the client didn't list as available (a prepared cardio decision covers it).` });
    }
    if (cap !== null && d.resistance && d.cardio?.placement === "after_resistance" && d.longestVisitMinutes > cap) out.errors.push(`${d.day}: lifting (${d.resistance.minutes} min) + cardio in the same visit (${d.cardio.minutes} min) exceeds the client's ${cap}-min cap.`);
    if (cap !== null && d.resistance && d.resistance.minutes > cap) out.findings.push({ code: "lifting_over_cap", severity: "warning", message: `${d.day}: the ${d.resistance.source === "approved_program" ? "approved" : "proposed"} lifting session (~${d.resistance.minutes} min) is longer than the client's ${cap}-min cap.` });
    if (d.visits > 1) out.findings.push({ code: "two_visits", severity: "info", message: `${d.day}: two visits (lifting and a separate cardio session ≥ 3 h apart) — confirm the client can do that.` });
  }
  // A second visit ≥ 3 h from lifting needs a second time slot; a client who trains at one time of day doesn't have one.
  const times = isKnown(input.client.schedule.preferredTimes) ? (input.client.schedule.preferredTimes.value as string[]) : null;
  const twoVisitDays = p.week.filter((d) => d.visits > 1).map((d) => d.day);
  if (twoVisitDays.length && times && times.length === 1) {
    const free = p.week.filter((d) => d.available && !d.resistance && !d.cardio).map((d) => d.day);
    out.decisions.push({ source: "program", about: "second_visit", question: `The client trains in the ${times[0].replace(/_/g, " ")} only, but ${twoVisitDays.join(", ")} need${twoVisitDays.length === 1 ? "s" : ""} a second visit ≥ 3 h from lifting. How should that cardio fit?`, options: [...(free.length ? [`Move it to a free day (${free.join(", ")})`] : []), "Shorten it to fit after lifting in the same visit", "Keep two visits (the client confirms a second time slot)"], recommended: free.length ? `Move it to a free day (${free.join(", ")})` : "Shorten it to fit after lifting in the same visit", why: "Only one preferred training time is recorded." });
  }

  // X6 — recovery across domains: limited recovery with no rest day is the coach's call, prepared, not decided.
  if (!p.recoveryLimited && p.workload.trainingDays >= 7) out.findings.push({ code: "no_rest_day", severity: "warning", message: `The combined week trains every day (${p.workload.resistanceDays} lifting + ${p.workload.trainingDays - p.workload.resistanceDays} cardio-only days) — no full rest day.` });
  if (p.recoveryLimited && p.workload.trainingDays >= 7) {
    out.decisions.push({ source: "program", about: "no_rest_day", question: "With limited recovery, this program trains every day. Keep it, or protect a rest day?", options: ["Protect a rest day (move or drop the lightest session)", "Keep 7 training days"], recommended: "Protect a rest day (move or drop the lightest session)", why: "Sleep or stress already limits recovery; the combined week leaves none." });
  }

  // X7 — the domains' directions agree: cardio for fat loss next to a nutrition surplus contradicts the program.
  const n = r.nutrition && (r.nutrition.status === "PLANNED" || r.nutrition.status === "NEEDS_COACH_REVIEW") ? r.nutrition : null;
  const c = r.cardio && r.cardio.status === "PLANNED" ? r.cardio : null;
  const energy = n?.run.energy ?? null;
  const kcal = n?.plan.energy.mode === "target" ? n.plan.energy.kcal : null;
  const direction = energy && kcal ? (kcal.min > energy.maintenanceKcal.high ? "surplus" : kcal.max < energy.maintenanceKcal.low ? "deficit" : "near_maintenance") : null;
  if (c?.plan.warranted && c.plan.role === "fat_loss" && direction === "surplus") out.errors.push(`Cardio is prescribed for fat loss while nutrition targets a surplus (${kcal!.min}–${kcal!.max} kcal vs maintenance ${energy!.maintenanceKcal.low}–${energy!.maintenanceKcal.high}).`);
  if (n && c?.plan.warranted && n.plan.objective.focus === "muscle_gain" && c.plan.role === "fat_loss") out.errors.push("Nutrition is set for muscle gain while cardio is set for fat loss.");

  // X8 — no false precision: nutrition's energy covers the lifting component; the cardio is stated, not blended in.
  if (n && c?.plan.warranted && kcal) {
    const m = c.review.workload.weeklyMinutes;
    const t = r.nutrition!.run.training;
    out.uncertainties.push(`Nutrition's energy estimate covers ${t ? `${t.sessionsPerWeek} × ${t.minutesPerSession}-min lifting sessions` : "no structured training"}; the proposed ${m.total} min/week of cardio (${m.easy} easy, ${m.moderate} moderate, ${m.vigorous} vigorous) isn't added to it — the weekly bodyweight trend decides any adjustment.`);
    out.findings.push({ code: "energy_excludes_cardio", severity: "info", message: "Cardio's energy cost isn't included in the nutrition target (stated, not estimated)." });
  }

  // X9 — which days are "training days" for nutrition is a whole-program question.
  const cardioOnlyDays = p.week.filter((d) => d.cardio && !d.resistance).map((d) => d.day);
  if (n?.plan.dayVariation && ["higher_on_training_days", "fuel_for_session"].includes(n.plan.dayVariation.strategy) && cardioOnlyDays.length) {
    out.decisions.push({ source: "program", about: "nutrition_training_days", question: `Nutrition varies by training day. Do cardio-only days (${cardioOnlyDays.join(", ")}) count as training days?`, options: [`Lifting days only (${p.workload.resistanceDays})`, `Lifting and cardio days (${p.workload.trainingDays})`], recommended: `Lifting days only (${p.workload.resistanceDays})`, why: "The nutrition strategy was prepared for the lifting sessions; easy cardio days rarely need the higher day." });
  }

  // X10 — progression alignment: a lifting deload while cardio builds is worth the coach's eye.
  const rDeloads = new Set((r.resistance?.status === "PLANNED" ? r.resistance.spec.resistance?.value.weeks ?? [] : []).filter((w) => w.kind === "deload").map((w) => w.week));
  const cWeeks = c?.review.workload.weeks ?? [];
  for (const w of rDeloads) {
    const cw = cWeeks.find((x) => x.week === w);
    const prev = cWeeks.find((x) => x.week === w - 1);
    if (cw && prev && cw.minutes.total > prev.minutes.total) out.alignment.push(`Week ${w}: lifting deloads while cardio rises (${prev.minutes.total} → ${cw.minutes.total} min) — consider holding cardio that week.`);
    else if (cw) out.alignment.push(`Week ${w}: lifting deloads; cardio ${cw.deload ? "deloads too" : "holds or eases"}.`);
  }
  for (const a of out.alignment.filter((x) => /rises/.test(x))) out.findings.push({ code: "deload_misaligned", severity: "info", message: a });
  return out;
}
