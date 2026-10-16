// Gate U3B — Unified Coach Review: revalidating the coach's edited drafts and gating approval. Pure (no I/O).
//
// U1/U2 validated what the domain reasoners proposed. Once the coach edits the persisted drafts (a new training or
// nutrition draft version per edit), the program is re-checked from those drafts against the CURRENT client state:
// each domain's own validity, fit with the confirmed restrictions, the coach's own method ranges (findings — the coach
// is the authority, but sees when an edit leaves their stated method), and the same week-level cross-domain rules U1
// uses (weekChecks). Program-level and restriction decisions are recomputed; domain decisions from the reasoners are
// carried. Nothing here invents a target, adds a domain, or edits an approved prescription.

import { sha256 } from "../reasoner/run.ts";
import { isKnown } from "../facts.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import { LOADED_DEMAND_CONDITION, type FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import { readCardioMethod } from "../cardio/method.ts";
import { readNutritionMethod } from "../nutrition/method.ts";
import { proteinGrams } from "../nutrition/energy.ts";
import type { UniversalTrainingProgramContent, Session } from "../../training/types.ts";
import type { AssignedNutritionPlan } from "../../types.ts";
import { validateAssignedNutritionPlanContent, validateUniversalTrainingProgramContent } from "../../production/validation.ts";
import { removeTrainingItem } from "../../training/program-proposal-editing.ts";
import type { CardioReasonerResult } from "../reasoner/cardio/reasoner.ts";
import type { NutritionReasonerResult } from "../reasoner/nutrition/reasoner.ts";
import type { CrossDomainFinding, DomainId, DomainStatus, ProgramDay, ProgramWorkload, UnifiedDecision, UnifiedProgramProposal } from "./contract.ts";
import { conditionalFitViolations, documentedExerciseReview, documentedRuleReview, resistanceContentFit } from "./safety.ts";
import { recoverySignals } from "./assemble.ts";
import { weekChecks, workloadOf } from "./validate.ts";

export type ReviewArea = DomainId | "program";

export interface RecordedAnswer {
  answer: string;
  question: string;
  decidedBy: string;
  decidedAtIso: string;
  /** The exercises this answer excludes (the decision's exclude option was chosen) — binding on the program. */
  excludes?: string[];
  /** The exercises this answer keeps only under an effort limit (the decision's effort-limit option) — binding: they
   * must stay at least EFFORT_LIMIT_MIN_RIR reps short of failure. */
  limitsEffort?: string[];
}

/** "Well short of failure": at least 3 reps in reserve (RPE 7 or easier). */
export const EFFORT_LIMIT_MIN_RIR = 3;

/** Every exercise the coach keeps only under an effort limit through a decision in this review. */
export function effortLimitedExercises(answers: Record<string, RecordedAnswer>): string[] {
  return [...new Set(Object.values(answers).flatMap((a) => a.limitsEffort ?? []))];
}

const harderThanLimit = (p: { family: string; rir?: number; rpe?: number }) => p.family === "resistance" && ((typeof p.rir === "number" && p.rir < EFFORT_LIMIT_MIN_RIR) || (typeof p.rpe === "number" && p.rpe > 10 - EFFORT_LIMIT_MIN_RIR) || (p.rir === undefined && p.rpe === undefined));

/** Where each effort-limited exercise is still prescribed closer to failure than the limit (or with no effort target). */
export function effortLimitViolations(content: UniversalTrainingProgramContent | null, names: string[]): Record<string, string[]> {
  const want = new Map(names.map((n) => [n.toLowerCase(), n]));
  const out: Record<string, string[]> = {};
  for (const w of content?.weeks ?? [])
    for (const d of w.days)
      for (const s of d.sessions ?? [])
        for (const b of s.blocks)
          for (const i of b.items) {
            const n = want.get(i.name.toLowerCase());
            if (n && harderThanLimit(i.prescription as never)) (out[n] ??= []).push(`week ${w.weekNumber} ${d.dayOfWeek}`);
          }
  return out;
}

/** The coach's explicit "apply the effort limit": every instance of the exercise, all weeks, at least
 * EFFORT_LIMIT_MIN_RIR reps in reserve (an RPE target is capped to match). Never makes anything harder. */
export function applyEffortLimitEverywhere(content: UniversalTrainingProgramContent, name: string): UniversalTrainingProgramContent {
  const target = name.toLowerCase();
  const out = structuredClone(content);
  for (const w of out.weeks)
    for (const d of w.days)
      for (const s of d.sessions ?? [])
        for (const b of s.blocks)
          for (const i of b.items) {
            const p = i.prescription as { family: string; rir?: number; rpe?: number };
            if (i.name.toLowerCase() !== target || p.family !== "resistance") continue;
            if (typeof p.rpe === "number" && p.rir === undefined) p.rpe = Math.min(p.rpe, 10 - EFFORT_LIMIT_MIN_RIR);
            else p.rir = Math.max(p.rir ?? EFFORT_LIMIT_MIN_RIR, EFFORT_LIMIT_MIN_RIR);
          }
  return out;
}

/** Every exercise the coach has excluded through a decision in this review (case-insensitive names). */
export function excludedExercises(answers: Record<string, RecordedAnswer>): string[] {
  return [...new Set(Object.values(answers).flatMap((a) => a.excludes ?? []))];
}

/** Where each named exercise still appears in a program ("week 1 Monday", …), keyed by the name as given. */
export function exerciseLocations(content: UniversalTrainingProgramContent | null, names: string[]): Record<string, string[]> {
  const want = new Map(names.map((n) => [n.toLowerCase(), n]));
  const out: Record<string, string[]> = {};
  for (const w of content?.weeks ?? [])
    for (const d of w.days)
      for (const s of d.sessions ?? [])
        for (const b of s.blocks)
          for (const i of b.items) {
            const n = want.get(i.name.toLowerCase());
            if (n) (out[n] ??= []).push(`week ${w.weekNumber} ${d.dayOfWeek}`);
          }
  return out;
}

/** The coach's explicit "remove this exercise from the program": every instance, all weeks. Refuses (rather than
 * leaving an empty session) when the exercise is a session's only item — then the coach replaces it instead. */
export function removeExerciseEverywhere(content: UniversalTrainingProgramContent, name: string): UniversalTrainingProgramContent {
  const target = name.toLowerCase();
  let out = content;
  let removed = 0;
  for (const w of content.weeks)
    for (const d of w.days)
      for (const [si, s] of (d.sessions ?? []).entries())
        for (const b of s.blocks)
          for (const i of b.items)
            if (i.name.toLowerCase() === target) {
              try {
                out = removeTrainingItem(out, { weekNumber: w.weekNumber, dayOfWeek: d.dayOfWeek, sessionIndex: si, blockId: b.id, itemId: i.id });
              } catch {
                throw new Error(`${name} is the only exercise in ${s.name} (week ${w.weekNumber}, ${d.dayOfWeek}) — replace it with another exercise instead of removing it.`);
              }
              removed++;
            }
  if (!removed) throw new Error(`${name} isn't in this program.`);
  return out;
}

export interface ReviewDecision extends UnifiedDecision {
  key: string;
  /** "proposal" = prepared by a domain reasoner; "revalidation" = recomputed from the current drafts. */
  origin: "proposal" | "revalidation";
  answer: RecordedAnswer | null;
}

export interface Revalidation {
  versions: { training: string | null; nutrition: string | null };
  errors: Array<{ area: ReviewArea; message: string }>;
  findings: Array<CrossDomainFinding & { area: ReviewArea }>;
  decisions: UnifiedDecision[];
  week: ProgramDay[];
  workload: ProgramWorkload;
  domains: Record<DomainId, { status: DomainStatus; edited: boolean; ok: boolean }>;
}

/** Decisions recomputed from the current drafts on every revalidation (the proposal's copies are superseded). */
const RECOMPUTED = new Set(["second_visit", "no_rest_day", "nutrition_training_days", "documented_limitation_exercise_review", "exercise_fit_uncertain", "nutrition_training_basis"]);

/** Stable key: the same question about the same thing keeps its recorded answer; a changed question needs a new one. */
export function decisionKey(d: UnifiedDecision): string {
  return `${d.source}:${d.about}:${sha256(d.question).slice(0, 10)}`;
}

const isCardioSession = (s: Session) => s.blocks.length > 0 && s.blocks.every((b) => b.items.every((i) => i.prescription.family === "continuous" || i.prescription.family === "interval"));
const isLiftingSession = (s: Session) => s.blocks.some((b) => b.items.some((i) => i.prescription.family === "resistance"));
const week1Sessions = (c: UniversalTrainingProgramContent | null, day: string) => c?.weeks.find((w) => w.weekNumber === 1)?.days.find((d) => d.dayOfWeek === day)?.sessions ?? [];
const liftingPart = (c: UniversalTrainingProgramContent | null) => (c ? c.weeks.map((w) => ({ w: w.weekNumber, d: w.days.map((d) => ({ day: d.dayOfWeek, s: (d.sessions ?? []).filter((s) => !isCardioSession(s)) })) })) : null);
const cardioPart = (c: UniversalTrainingProgramContent | null) => (c ? c.weeks.map((w) => ({ w: w.weekNumber, d: w.days.map((d) => ({ day: d.dayOfWeek, s: (d.sessions ?? []).filter(isCardioSession) })) })) : null);

function cardioMinutes(s: Session): number | null {
  const p = s.blocks[0]?.items[0]?.prescription;
  if (!p) return null;
  if (p.family === "continuous" && p.duration) return Math.round(p.duration.seconds / 60);
  if (p.family === "interval" && p.rounds && p.workInterval) return (p.rounds * (p.workInterval.seconds + (p.recoveryInterval?.seconds ?? 0))) / 60;
  return null;
}

/** Week 1 as it stands in the current drafts. Placement, modality and lifting focus come from the proposal's
 * coordinated week (edits change prescriptions, never days); minutes and intensity come from the current content. */
export function currentWeek(p: { proposalWeek: ProgramDay[]; original: UniversalTrainingProgramContent | null; current: UniversalTrainingProgramContent | null }): ProgramDay[] {
  return p.proposalWeek.map((d) => {
    const cur = week1Sessions(p.current, d.day);
    const orig = week1Sessions(p.original, d.day);
    const lift = cur.filter(isLiftingSession);
    const res = d.resistance && lift.length ? { ...d.resistance, minutes: lift.reduce((t, s) => t + s.estimatedDurationMin, 0) } : null;
    const cs = cur.find(isCardioSession) ?? null;
    let car: ProgramDay["cardio"] = null;
    if (d.cardio && cs) {
      const os = orig.find(isCardioSession) ?? null;
      const [now, before] = [cardioMinutes(cs), os ? cardioMinutes(os) : null];
      // Interval minutes count warm-up and cool-down in the proposal; carry that difference rather than re-deriving it.
      const minutes = now !== null && before !== null ? Math.round(d.cardio.minutes + (now - before)) : d.cardio.minutes;
      const p0 = cs.blocks[0]?.items[0]?.prescription;
      const intensity = p0?.effort?.label ?? d.cardio.intensity;
      car = { ...d.cardio, minutes, intensity, type: p0?.family === "interval" ? "intervals" : "steady" };
    }
    const sameVisit = !!(res && car && car.placement === "after_resistance");
    return {
      ...d,
      resistance: res,
      cardio: car,
      visits: (res ? 1 : 0) + (car && !sameVisit ? 1 : 0),
      longestVisitMinutes: sameVisit ? res!.minutes + car!.minutes : Math.max(res?.minutes ?? 0, car?.minutes ?? 0),
      totalMinutes: (res?.minutes ?? 0) + (car?.minutes ?? 0),
    };
  });
}

/** After a cardio item edit, its single-item cardio session must say the same thing as its prescription: the session
 * name's intensity word ("Walking — moderate") and its estimated minutes follow the edited effort and duration, so the
 * client never sees "moderate · ~30 min" over an easy 45-min prescription. Lifting sessions are left exactly as they are. */
export function syncCardioSession(content: UniversalTrainingProgramContent, path: { weekNumber: number; dayOfWeek: string; sessionIndex: number }): UniversalTrainingProgramContent {
  const out = structuredClone(content);
  const s = out.weeks.find((w) => w.weekNumber === path.weekNumber)?.days.find((d) => d.dayOfWeek === path.dayOfWeek)?.sessions?.[path.sessionIndex];
  if (!s || !isCardioSession(s)) return content;
  const items = s.blocks.flatMap((b) => b.items);
  if (items.length !== 1) return content;
  const p = items[0].prescription;
  if (p.family === "continuous" && p.duration) s.estimatedDurationMin = Math.round(p.duration.seconds / 60);
  if (p.family === "continuous" && p.effort?.label) s.name = s.name.replace(/ — (easy|moderate|vigorous)$/, ` — ${p.effort.label}`);
  return out;
}

const resistanceNames = (c: UniversalTrainingProgramContent | null) => (c ? [...new Set(c.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.prescription.family === "resistance").map((i) => i.name))))))] : []);
const KEYS = ["calories", "proteinG", "carbsG", "fatG"] as const;
const LABEL: Record<(typeof KEYS)[number], string> = { calories: "calories", proteinG: "protein", carbsG: "carbohydrate", fatG: "fat" };

export function revalidateDrafts(p: {
  input: SynthesisInput;
  knowledge: FitnessKnowledgeRegistry;
  proposal: UnifiedProgramProposal;
  resistanceSource: "approved_program" | "proposed_program" | "existing_draft" | "none" | null;
  cardio: CardioReasonerResult | null;
  nutrition: NutritionReasonerResult | null;
  original: { training: UniversalTrainingProgramContent | null; nutrition: AssignedNutritionPlan | null };
  current: { training: UniversalTrainingProgramContent | null; nutrition: AssignedNutritionPlan | null };
  versions: { training: string | null; nutrition: string | null };
  /** Exercises the coach excluded through a decision — none may remain in the training draft. */
  excluded?: string[];
  /** Exercises the coach keeps only under an effort limit — none may be prescribed closer to failure than the limit. */
  effortLimited?: string[];
}): Revalidation {
  const { input, proposal: u } = p;
  const out: Revalidation = { versions: p.versions, errors: [], findings: [], decisions: [], week: [], workload: u.workload, domains: { resistance: { status: u.domains.resistance.status, edited: false, ok: true }, cardio: { status: u.domains.cardio.status, edited: false, ok: true }, nutrition: { status: u.domains.nutrition.status, edited: false, ok: true } } };
  const err = (area: ReviewArea, message: string) => out.errors.push({ area, message });
  const find = (area: ReviewArea, f: CrossDomainFinding) => out.findings.push({ ...f, area });

  // Domains a coach can't force: no nutrition draft unless nutrition was proposed; no training draft without one.
  const nutritionProposed = u.domains.nutrition.status === "PROPOSED" || u.domains.nutrition.status === "NEEDS_COACH_REVIEW";
  if (p.current.nutrition && !nutritionProposed) err("nutrition", `Nutrition is ${u.domains.nutrition.status.toLowerCase().replace(/_/g, " ")} for this program — a nutrition plan can't be added in review.`);
  if (p.current.training && !p.original.training) err("program", "A training draft appeared that the proposal didn't contain.");

  // --- Training (lifting + cardio) -----------------------------------------------------------------------------
  const t = p.current.training;
  if (t) {
    try {
      validateUniversalTrainingProgramContent(t);
    } catch (e) {
      err("resistance", `The training draft is no longer valid: ${(e as Error).message}`);
    }
    out.domains.resistance.edited = sha256(liftingPart(t)) !== sha256(liftingPart(p.original.training));
    out.domains.cardio.edited = sha256(cardioPart(t)) !== sha256(cardioPart(p.original.training));
    // An approved program is fixed input — its prescriptions change only through the program-adjustment workflow.
    if (p.resistanceSource === "approved_program" && out.domains.resistance.edited) err("resistance", "The lifting comes from the client's approved program; approved prescriptions can't be changed in this review (use a program adjustment).");
    for (const x of resistanceContentFit(t, input, p.knowledge)) {
      if (x.state === "incompatible") err("resistance", `${x.exercise} conflicts with the confirmed restrictions: ${x.why}.`);
    }
    const uncertain = resistanceContentFit(t, input, p.knowledge).filter((x) => x.state === "uncertain");
    if (uncertain.length) out.decisions.push({ source: "resistance", about: "exercise_fit_uncertain", question: `OPTIM can't confirm these fit the confirmed restrictions: ${uncertain.map((x) => `${x.exercise} (${x.why})`).join("; ")}. Keep or exclude them?`, options: ["Keep them (the coach confirms they fit)", "Exclude them for this client"], recommended: null, why: "Restriction fit couldn't be checked; OPTIM doesn't decide that.", exercises: uncertain.map((x) => x.exercise), excludeOption: "Exclude them for this client" });
    // The coach's exclusion decisions are binding: an excluded exercise still in the draft blocks approval.
    for (const [name, where] of Object.entries(exerciseLocations(t, p.excluded ?? [])))
      err("resistance", `${name} is excluded by your decision but is still in the program (${where.length > 3 ? `${where.slice(0, 3).join(", ")} and ${where.length - 3} more` : where.join(", ")}) — remove or replace it, or change your decision.`);
    // The coach's effort-limit decisions are binding too.
    for (const [name, where] of Object.entries(effortLimitViolations(t, p.effortLimited ?? [])))
      err("resistance", `${name} is limited by your decision to stay well short of failure (${EFFORT_LIMIT_MIN_RIR}+ reps in reserve) but is prescribed harder (${where.length > 3 ? `${where.slice(0, 3).join(", ")} and ${where.length - 3} more` : where.join(", ")}) — apply the effort limit, or change your decision.`);
    // Exercises already excluded don't raise the documented-limitation question again.
    const excludedSet = new Set((p.excluded ?? []).map((n) => n.toLowerCase()));
    const doc = documentedExerciseReview(input, resistanceNames(t).filter((n) => !excludedSet.has(n.toLowerCase())));
    if (doc) out.decisions.push(doc);
    // What the documented limitation reaches beyond its literal names (its effort rule; named families) — each an
    // explicit coach decision. Exercises the coach already limited keep that decision and aren't asked again.
    const limitedSet = new Set((p.effortLimited ?? []).map((n) => n.toLowerCase()));
    out.decisions.push(...documentedRuleReview(input, p.knowledge, resistanceNames(t).filter((n) => !excludedSet.has(n.toLowerCase()) && !limitedSet.has(n.toLowerCase())), doc?.exercises ?? []));
    // A conditional fit holds only at its minimums (the rule the Fitness Reasoner is held to) — edits included.
    for (const [name, where] of Object.entries(conditionalFitViolations(t, input, p.knowledge)))
      err("resistance", `${name} fits the confirmed restrictions only at ${LOADED_DEMAND_CONDITION.minReps}+ reps and ${LOADED_DEMAND_CONDITION.minRir}+ reps in reserve, but is prescribed harder (${where.length > 3 ? `${where.slice(0, 3).join(", ")} and ${where.length - 3} more` : where.join(", ")}).`);
  }

  // Coach Brain authority — cardio minutes against the coach's own weekly range for this role (finding, not error).
  const week = currentWeek({ proposalWeek: u.week, original: p.original.training, current: t });
  const workload = workloadOf(week);
  out.week = week;
  out.workload = workload;
  const cardioPlan = p.cardio?.status === "PLANNED" && p.cardio.plan.warranted ? p.cardio.plan : null;
  if (cardioPlan && input.coach && out.domains.cardio.edited) {
    const m = readCardioMethod(input.coach.method);
    const range = m.ok ? (m.method.minutesByRole as Partial<Record<string, { value: { min: number; max: number } }>>)[cardioPlan.role]?.value ?? null : null;
    if (range && (workload.cardioMinutes.total < range.min || workload.cardioMinutes.total > range.max)) find("cardio", { code: "cardio_outside_method_range", severity: "warning", message: `Cardio is now ${workload.cardioMinutes.total} min/week — outside your stated ${range.min}–${range.max} min for ${cardioPlan.role.replace(/_/g, " ")}.` });
  }

  // --- Nutrition --------------------------------------------------------------------------------------------------
  const n = p.current.nutrition;
  const o = p.original.nutrition;
  if (n) {
    try {
      validateAssignedNutritionPlanContent(n);
    } catch (e) {
      err("nutrition", `The nutrition draft is no longer valid: ${(e as Error).message}`);
    }
    out.domains.nutrition.edited = sha256(n) !== sha256(o);
    const nm = n.method;
    const om = o?.method;
    if (nm && om) {
      if (nm.approach !== om.approach || nm.energyMode !== om.energyMode) err("nutrition", "The nutrition approach can't change in review — it follows the coach's method.");
      for (const k of KEYS) if (om.prescribed[k] === null && nm.prescribed[k] !== null) err("nutrition", `A ${LABEL[k]} target was added, but the coach's method doesn't prescribe one for this plan.`);
      const cal = nm.prescribed.calories;
      const calRange = om.ranges.calories;
      if (cal !== null && calRange && (cal < calRange[0] || cal > calRange[1])) find("nutrition", { code: "calories_outside_proposed_range", severity: "info", message: `Calories (${cal}) are outside the proposed ${calRange[0]}–${calRange[1]} kcal range.` });
    }
    // Coach Brain authority — protein against the coach's own range for this client (finding, not error).
    const protein = nm?.prescribed.proteinG ?? n.targets?.proteinG ?? null;
    if (protein !== null && input.coach) {
      const read = readNutritionMethod(input.coach.method, input.goal.primary?.class ?? null);
      const g = read.ok ? proteinGrams({ client: input.client, method: read.method }) : null;
      if (g && g.ok && (protein < g.grams.low || protein > g.grams.high)) find("nutrition", { code: "protein_outside_method_range", severity: "warning", message: `Protein (${protein} g) is outside your method's ${g.grams.low}–${g.grams.high} g for this client (${g.basis}).` });
    }
    // The program's directions still agree (U1 X7) after a calorie edit.
    const energy = p.nutrition?.run.energy ?? null;
    const kcal = nm?.prescribed.calories ?? n.targets?.calories ?? null;
    if (cardioPlan?.role === "fat_loss" && energy && kcal !== null && kcal > energy.maintenanceKcal.high) err("program", `Cardio is prescribed for fat loss while nutrition is now ${kcal} kcal — above the estimated maintenance ${energy.maintenanceKcal.low}–${energy.maintenanceKcal.high}.`);
  }

  // Nutrition was prepared for the proposal's lifting; if the coach changed it, nutrition is the coach's call.
  if (n && t) {
    const before = u.week.filter((d) => d.resistance);
    const after = week.filter((d) => d.resistance);
    const avg = (ds: ProgramDay[]) => (ds.length ? Math.round(ds.reduce((s, d) => s + d.resistance!.minutes, 0) / ds.length) : 0);
    if (before.length !== after.length || Math.abs(avg(before) - avg(after)) >= 10) out.decisions.push({ source: "program", about: "nutrition_training_basis", question: `Nutrition was prepared for ${before.length} × ~${avg(before)}-min lifting sessions; the edited program has ${after.length} × ~${avg(after)} min. Keep the nutrition as it is, or adjust it?`, options: ["Keep the nutrition as it is", "Adjust the nutrition (edit it before approving)"], recommended: null, why: "Nutrition's energy estimate assumed the original lifting." });
  }

  // --- Week-level cross-domain rules (exactly U1's) ----------------------------------------------------------------
  const nutritionPlan = p.nutrition && (p.nutrition.status === "PLANNED" || p.nutrition.status === "NEEDS_COACH_REVIEW") ? p.nutrition.plan : null;
  const wk = weekChecks({ input, week, workload, recoveryLimited: recoverySignals(input).length > 0, nutritionDayVariation: n ? nutritionPlan?.dayVariation?.strategy ?? null : null });
  for (const e of wk.errors) err("program", e);
  for (const f of wk.findings) find("program", f);
  out.decisions.push(...wk.decisions);

  for (const d of Object.keys(out.domains) as DomainId[]) out.domains[d].ok = !out.errors.some((e) => e.area === d);
  return out;
}

/** The decisions the coach sees: the reasoners' prepared decisions (minus the recomputed kinds) + the recomputed ones,
 * each with its recorded answer when the coach already answered exactly that question. */
export function reviewDecisions(proposal: UnifiedProgramProposal, revalidation: Revalidation, answers: Record<string, RecordedAnswer>): ReviewDecision[] {
  const carried = proposal.decisions.filter((d) => !RECOMPUTED.has(d.about)).map((d) => ({ ...d, origin: "proposal" as const }));
  const fresh = revalidation.decisions.map((d) => ({ ...d, origin: "revalidation" as const }));
  const seen = new Set<string>();
  const out: ReviewDecision[] = [];
  for (const d of [...carried, ...fresh]) {
    const key = decisionKey(d);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...d, key, answer: answers[key] ?? null });
  }
  return out;
}

/** What still stands between this proposal and the coach's approval. Empty = approvable. */
export function approvalBlockers(p: {
  approvalState: string;
  status: string;
  hasDrafts: boolean;
  revalidation: Revalidation;
  decisions: ReviewDecision[];
  staleReasons: string[];
  escalations: number;
}): string[] {
  const b: string[] = [];
  if (p.approvalState !== "proposed") b.push(`This proposal was already ${p.approvalState}.`);
  if (p.status !== "draft_ready" && p.status !== "needs_coach_decision") b.push(p.status === "incomplete" ? "The program is incomplete — a coached domain couldn't be produced. Review it, but it can't be approved as one program." : `The proposal is ${p.status.replace(/_/g, " ")} and can't be approved.`);
  if (!p.hasDrafts) b.push("There's nothing to approve — no training or nutrition draft.");
  if (p.escalations) b.push("A safety escalation is open on this proposal.");
  b.push(...p.staleReasons);
  for (const e of p.revalidation.errors) b.push(e.message);
  const open = p.decisions.filter((d) => !d.answer);
  if (open.length) b.push(`${open.length} coach decision${open.length === 1 ? "" : "s"} still need${open.length === 1 ? "s" : ""} an answer.`);
  return b;
}

/** Whether the client's documented limitation text exists (the review shows it next to the restriction decisions). */
export function documentedLimitations(input: SynthesisInput): string | null {
  return isKnown(input.client.health.review.coachDocumentedLimitation) ? input.client.health.review.coachDocumentedLimitation.value : null;
}
