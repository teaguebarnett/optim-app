// Unified Program U1 — deterministic assembly of ONE program from the domain outcomes: the coordinated week, combined
// workload, recovery view, progression and monitoring, assumptions and uncertainties, every prepared coach decision
// (domain and program-level), cross-domain validation, provenance and the program status. No model, no invented
// content: a domain without a proposal contributes its status and reasons, nothing else.

import { isKnown } from "../facts.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import { DAY_ORDER } from "../client-state.ts";
import { sha256 } from "../reasoner/run.ts";
import { cardioModality } from "../knowledge/cardio/modalities.ts";
import type { UniversalTrainingProgramContent } from "../../training/types.ts";
import type { DomainId, DomainOutcome, ProgramDay, ProgramWorkload, UnifiedDecision, UnifiedProgramProposal, UnifiedStatus } from "./contract.ts";
import type { DomainResults } from "./orchestrate.ts";
import { validateCrossDomain } from "./validate.ts";

/** Same definition the Cardio Reasoner uses (bounds.recoveryLimited): short sleep, or sleep/stress named as an obstacle. */
export function recoverySignals(input: SynthesisInput): string[] {
  const c = input.client;
  const out: string[] = [];
  if (isKnown(c.recovery.sleep) && c.recovery.sleep.value === "under_6") out.push("Sleeps under 6 hours.");
  const obs = isKnown(c.recovery.obstacles) ? (c.recovery.obstacles.value as string[]) : [];
  for (const o of ["sleep", "stress"]) if (obs.includes(o)) out.push(`Lists ${o} as an obstacle to consistency.`);
  return out;
}

const PRODUCED = new Set<DomainOutcome["status"]>(["PROPOSED", "APPROVED_EXISTING", "NO_ADDITIONAL", "NEEDS_COACH_REVIEW"]);
const MISSING = new Set<DomainOutcome["status"]>(["NEEDS_INPUT", "UNSUPPORTED", "REJECTED", "PROVIDER_FAILED", "HELD"]);

export function assembleUnified(a: {
  schema: UnifiedProgramProposal["schema"];
  version: UnifiedProgramProposal["version"];
  runId: string;
  createdAtIso: string;
  status: UnifiedStatus | null;
  input: SynthesisInput;
  scope: Record<DomainId, boolean> | null;
  domains: Record<DomainId, DomainOutcome>;
  results: DomainResults;
  programDecisions: UnifiedDecision[];
  escalations: UnifiedProgramProposal["escalations"];
  approved: { versionId: string; content: UniversalTrainingProgramContent } | null;
  approvedHashBefore: string | null;
  /** Gate U2 — a pending (not approved) resistance draft used unchanged as the proposed lifting. */
  existing?: { versionId: string; content: UniversalTrainingProgramContent } | null;
  existingHashBefore?: string | null;
}): UnifiedProgramProposal {
  const { input, results: r, domains } = a;
  const avail = new Set(isKnown(input.client.schedule.availableDays) ? input.client.schedule.availableDays.value : []);
  const cardio = r.cardio?.status === "PLANNED" && r.cardio.plan.warranted ? r.cardio : null;
  const nutrition = r.nutrition && (r.nutrition.status === "PLANNED" || r.nutrition.status === "NEEDS_COACH_REVIEW") ? r.nutrition : null;
  const resistance = r.resistance?.status === "PLANNED" ? r.resistance : null;

  // The coordinated week (week 1).
  const week: ProgramDay[] = DAY_ORDER.map((day) => {
    const rd = r.resistanceWeek?.days.find((d) => d.day === day) ?? null;
    const cs = cardio?.plan.sessions.find((s) => s.day === day) ?? null;
    const res = rd ? { focus: rd.focus, minutes: rd.minutes, lowerBody: rd.lowerBody, source: r.resistanceWeek!.source } : null;
    const car = cs ? { type: cs.type, modality: cs.modality, minutes: cs.minutes, intensity: cs.intensity, placement: cs.placement, optional: cs.optional } : null;
    const sameVisit = !!(res && car && car.placement === "after_resistance");
    const visits = (res ? 1 : 0) + (car && !sameVisit ? 1 : 0);
    const longest = sameVisit ? res!.minutes + car!.minutes : Math.max(res?.minutes ?? 0, car?.minutes ?? 0);
    return { day, available: avail.has(day), resistance: res, cardio: car, visits, longestVisitMinutes: longest, totalMinutes: (res?.minutes ?? 0) + (car?.minutes ?? 0) };
  });
  const cm = { easy: 0, moderate: 0, vigorous: 0, total: 0 };
  for (const d of week) if (d.cardio) {
    cm[d.cardio.intensity] += d.cardio.minutes;
    cm.total += d.cardio.minutes;
  }
  const trainingDays = week.filter((d) => d.resistance || d.cardio).length;
  const workload: ProgramWorkload = {
    resistanceDays: week.filter((d) => d.resistance).length,
    resistanceMinutes: week.reduce((t, d) => t + (d.resistance?.minutes ?? 0), 0),
    cardioMinutes: cm,
    hardCardioSessions: week.filter((d) => d.cardio && (d.cardio.type === "intervals" || d.cardio.intensity === "vigorous")).length,
    trainingDays,
    restDays: 7 - trainingDays,
    totalMinutes: week.reduce((t, d) => t + d.totalMinutes, 0),
  };

  const signals = recoverySignals(input);
  const recoveryLimited = signals.length > 0;
  const x = a.status ? { errors: [], findings: [], decisions: [], uncertainties: [], alignment: [] } : validateCrossDomain({ input, domains, results: r, week, workload, recoveryLimited, approved: a.approved, approvedHashBefore: a.approvedHashBefore, existing: a.existing ?? null, existingHashBefore: a.existingHashBefore ?? null });

  // Objective — the goal, then each domain's part in it (only domains that produced something).
  const goal = input.goal.primary?.class ?? null;
  const success = isKnown(input.goal.successDefinition) ? input.goal.successDefinition.value : null;
  const byDomain: UnifiedProgramProposal["objective"]["byDomain"] = {};
  if (a.existing && domains.resistance.status === "PROPOSED") byDomain.resistance = domains.resistance.summary;
  else if (resistance) byDomain.resistance = `${resistance.spec.weeklyStructure.value.name}: ${resistance.spec.frequency.value} sessions/week (${resistance.spec.resistance?.value.emphasis.primary ?? "general"} emphasis).`;
  else if (domains.resistance.status === "APPROVED_EXISTING") byDomain.resistance = domains.resistance.summary;
  if (r.cardio?.status === "PLANNED") byDomain.cardio = r.cardio.plan.warranted ? r.cardio.plan.objective.summary : `No additional cardio for now — ${r.cardio.plan.objective.rationale}`;
  if (nutrition) byDomain.nutrition = nutrition.plan.objective.summary;
  const parts = (Object.keys(byDomain) as DomainId[]).map((d) => d);
  const summary = goal ? `${goal.replace(/_/g, " ")} program${parts.length ? ` coordinating ${parts.join(", ")}` : ""}${success ? ` — toward “${success}”` : ""}.` : "No goal recorded.";

  // Progression and monitoring, rendered from each domain's structure.
  const progression: UnifiedProgramProposal["progression"] = {
    resistance: resistance ? (resistance.spec.resistance?.value.weeks ?? []).map((w) => `Week ${w.week}: ${w.kind}${w.note ? ` — ${w.note}` : ""}`) : domains.resistance.status === "APPROVED_EXISTING" && a.approved ? [`Approved program: ${a.approved.content.durationWeeks} weeks, unchanged.`] : a.existing ? [`Pending draft: ${a.existing.content.durationWeeks} weeks, unchanged (not regenerated).`] : [],
    cardio: cardio ? cardio.review.progression : [],
    nutrition: nutrition ? [...nutrition.review.adjustments, `Review after ${nutrition.plan.monitoring.reviewAfterWeeks} weeks (${nutrition.plan.monitoring.cadence}).`] : [],
    alignment: x.alignment,
  };
  const monitoring = [...new Set([...(resistance?.spec.monitoring?.value.metrics ?? []), ...(cardio?.plan.monitoring.measures ?? []), ...(nutrition?.plan.monitoring.measures ?? [])])];
  const tag = (d: string, s: string) => `[${d}] ${s}`;
  const assumptions = [...(resistance?.spec.assumptions.map((x) => tag("resistance", x.statement)) ?? []), ...(cardio?.plan.assumptions.map((s) => tag("cardio", s)) ?? []), ...(nutrition?.plan.assumptions.map((s) => tag("nutrition", s)) ?? [])];
  const uncertainties = [...(r.cardio?.status === "PLANNED" ? r.cardio.plan.uncertainties.map((u) => tag("cardio", `${u.about}: ${u.impact}`)) : []), ...(nutrition?.plan.uncertainties.map((u) => tag("nutrition", `${u.about}: ${u.impact}`)) ?? []), ...x.uncertainties.map((s) => tag("program", s))];

  // Every prepared decision — program, cross-domain and domain — and every open question.
  const decisions: UnifiedDecision[] = [
    ...a.programDecisions,
    ...x.decisions,
    ...(r.cardio?.status === "PLANNED" ? r.cardio.review.coachDecisions.map((d) => ({ source: "cardio" as const, about: d.about, question: d.question ?? d.text, options: d.options, recommended: d.recommended, why: d.why ?? d.text })) : []),
  ];
  const questions = [
    ...(resistance?.spec.unresolved.map((u) => ({ source: "resistance" as const, question: `${u.fact}: ${u.why}` })) ?? []),
    ...(r.cardio?.status === "PLANNED" ? r.cardio.plan.coachQuestions.map((q) => ({ source: "cardio" as const, question: q.question })) : []),
    ...(nutrition ? [...nutrition.review.questions, ...nutrition.plan.coachQuestions.map((q) => q.question)].map((q) => ({ source: "nutrition" as const, question: q })) : []),
  ];

  const considerations = [
    `${workload.trainingDays} training day${workload.trainingDays === 1 ? "" : "s"} and ${workload.restDays} rest day${workload.restDays === 1 ? "" : "s"} in week 1; ${workload.hardCardioSessions} hard cardio session${workload.hardCardioSessions === 1 ? "" : "s"}.`,
    ...(r.cardio?.status === "PLANNED" && r.cardio.review.recoveryStrategy ? [`Cardio's recovery strategy: ${r.cardio.review.recoveryStrategy.replace(/_/g, " ")}.`] : []),
    ...(recoveryLimited && resistance ? ["The resistance frequency comes from the coach's method and availability; the Fitness Reasoner doesn't adjust it for sleep — the coach should confirm it suits this client's recovery."] : []),
    ...week.filter((d) => d.cardio && d.resistance && d.resistance.lowerBody).map((d) => `${d.day}: cardio (${cardioModality(d.cardio!.modality)?.name ?? d.cardio!.modality}, ${d.cardio!.intensity}) on a lower-body lifting day.`),
  ];

  // Status.
  const acknowledged = (d: DomainOutcome) => d.domain === "resistance" && d.reasons.some((x) => /coach chose to proceed without it/.test(x));
  let status: UnifiedStatus;
  if (a.status) status = a.status;
  // A domain escalated under a resolved canonical review (with its prepared clearance decision) doesn't stop the program.
  else if (a.escalations.length || Object.values(domains).some((d) => d.status === "ESCALATE" && !decisions.some((x) => x.about === `${d.domain}_clearance`))) status = "ESCALATE";
  else if (Object.values(domains).some((d) => MISSING.has(d.status) && !acknowledged(d))) status = "INCOMPLETE";
  else if (x.errors.length) status = "INCOHERENT";
  else if (!Object.values(domains).some((d) => PRODUCED.has(d.status))) status = "NEEDS_INPUT";
  else if (decisions.length || Object.values(domains).some((d) => d.status === "NEEDS_COACH_REVIEW")) status = "NEEDS_COACH_DECISION";
  else status = "READY_FOR_REVIEW";

  const domainRuns: UnifiedProgramProposal["provenance"]["domainRuns"] = {};
  for (const d of Object.values(domains)) if (d.run) domainRuns[d.domain] = d.run;
  return {
    schema: a.schema,
    version: a.version,
    runId: a.runId,
    createdAtIso: a.createdAtIso,
    status,
    objective: { goal, successDefinition: success, summary, byDomain },
    domains,
    week,
    workload,
    recovery: { limited: recoveryLimited, signals, considerations },
    progression,
    monitoring,
    assumptions,
    uncertainties,
    crossDomain: { errors: x.errors, findings: x.findings },
    decisions,
    questions,
    escalations: a.escalations,
    provenance: {
      clientState: sha256(input.client),
      goalContract: sha256(input.goal),
      coachMethod: input.coach ? { versionId: input.coach.versionId, version: input.coach.version } : null,
      approvedResistance: a.approved ? { versionId: a.approved.versionId, contentHash: a.approvedHashBefore! } : null,
      existingResistanceDraft: a.existing ? { versionId: a.existing.versionId, contentHash: a.existingHashBefore! } : null,
      domainRuns,
      modelCalls: Object.values(domainRuns).reduce((t, x) => t + (x?.calls ?? 0), 0),
    },
  };
}
