// Gate U2 closure — Unified Program safety, aligned with OPTIM's CANONICAL coach health-review policy (the one the
// resistance workflow already follows) instead of a blanket "any domain's screen stops everything":
//
//   • Screen answers (cardiovascular, chest pain/dizziness, blood pressure, advised to limit, joint/muscular, medication)
//     always require the coach's health review first — while it is open, the shared readiness check blocks every
//     domain (unchanged). A RESOLVED review authorizes training within the coach's documented boundaries; it is never a
//     medical clearance for cardio: cardio's own screen escalations still block CARDIO (a prepared human decision),
//     but no longer block the domains the review already covers.
//   • Domain checks run only for domains that will actually be planned for this client: a coach whose cardio roles don't
//     apply to this goal gets no cardio planning and no cardio-specific clearance demand.
//   • Every other cross-domain escalation (text flags such as pregnancy, heart condition, fainting; a minor with a weight
//     goal; nutrition's population escalations) still stops the whole program — unchanged.
//   • Review integrity: a structured confirmation that says "no exercise restrictions" while the documented boundary it
//     was confirmed against names exercises (OPTIM's existing literal-term reading) can't establish the limits the review
//     authorizes training within — the program waits for the coach to re-confirm it. Clearance is never manufactured.
//   • A pending (not approved) lifting draft is used only if every exercise still fits the CURRENT confirmed restrictions
//     (the canonical currentFit); an approved program is never changed, but a conflict is surfaced for the coach.

import { isKnown } from "../facts.ts";
import type { SynthesisInput } from "../synthesis-input.ts";
import { termsMentionedInRestrictionText } from "../../coach/program-directions.ts";
import { readCardioMethod } from "../cardio/method.ts";
import { routeCardio } from "../cardio/routing.ts";
import { cardioSafety } from "../cardio/safety.ts";
import { allowedRoles } from "../reasoner/cardio/input.ts";
import { nutritionSafety } from "../nutrition/safety.ts";
import { currentFit } from "../reasoner/lifecycle.ts";
import { resolveEquipmentAccess } from "../planners/resistance/equipment-access.ts";
import type { FitnessKnowledgeRegistry } from "../knowledge/types.ts";
import type { UniversalTrainingProgramContent } from "../../training/types.ts";
import type { DomainId, UnifiedDecision } from "./contract.ts";

export interface UnifiedSafety {
  /** The domain will actually be planned for this client (coach scope AND applicable to this goal). */
  cardioApplicable: boolean;
  cardioNotApplicableReason: string | null;
  review: { status: "none" | "open" | "resolved"; outcome: string | null };
  /** Stop the whole program (not covered by a resolved canonical review). */
  programEscalations: Array<{ source: DomainId; code: string; why: string }>;
  /** Block only this domain; the rest proceeds under the resolved review (each with its prepared decision). */
  domainEscalations: Array<{ source: DomainId; code: string; why: string }>;
  domainDecisions: UnifiedDecision[];
  /** Review-integrity problems: the program waits for the coach (no model call). */
  integrity: Array<{ code: string; why: string; decision: UnifiedDecision }>;
}

const SCREEN_CODES = new Set(["screen_cardiovascular", "screen_chest_dizziness", "screen_blood_pressure", "screen_advised_limit"]);

/** Will cardio actually be planned for this client? (Same reads the Cardio Reasoner uses, before any safety gate.) */
export function cardioApplicability(input: SynthesisInput, inScope: boolean): { applicable: boolean; reason: string | null } {
  if (!inScope || !input.coach) return { applicable: false, reason: "This coach doesn't prescribe cardio." };
  const m = readCardioMethod(input.coach.method);
  if (!m.ok) return m.reason === "not_coached" ? { applicable: false, reason: m.message } : { applicable: true, reason: null }; // incomplete → the runner asks
  const route = routeCardio(input.goal);
  if (route.status !== "ROUTED") return { applicable: true, reason: null }; // UNSUPPORTED / NEEDS_INPUT → the runner reports it
  if (!allowedRoles(m.method, route.purpose).length) return { applicable: false, reason: `This coach's cardio roles (${m.method.roles.value.join(", ")}) don't apply to this client's goal (${route.purpose.replace(/_/g, " ")}), so no cardio is planned — and no cardio-specific clearance is needed.` };
  return { applicable: true, reason: null };
}

export function assessUnifiedSafety(input: SynthesisInput, scope: Record<DomainId, boolean>): UnifiedSafety {
  const c = input.client;
  const review = { status: c.health.review.status, outcome: c.health.review.outcome };
  const cardio = cardioApplicability(input, scope.cardio);
  const out: UnifiedSafety = { cardioApplicable: cardio.applicable, cardioNotApplicableReason: cardio.reason, review, programEscalations: [], domainEscalations: [], domainDecisions: [], integrity: [] };

  // Review integrity: "no exercise restrictions" confirmed against a boundary that names exercises.
  const structured = c.health.review.coachStructuredLimitations;
  const documented = isKnown(c.health.review.coachDocumentedLimitation) ? c.health.review.coachDocumentedLimitation.value : null;
  const named = termsMentionedInRestrictionText(documented);
  if (isKnown(structured) && structured.value.noExerciseRestrictions && named.length) {
    out.integrity.push({
      code: "structured_limitations_contradict_review",
      why: `The coach's health review (${review.outcome ?? "resolved"}) documents exercise boundaries naming ${named.join(", ")}, but its structured confirmation says the limitation doesn't restrict exercises. OPTIM can't tell which limits the review authorizes training within, so it plans nothing until the coach re-confirms them.`,
      decision: { source: "program", about: "confirm_structured_limitations", question: "Your health review's documented limitations name specific exercises, but the structured confirmation says there are no exercise restrictions. Which is right?", options: ["Re-confirm the restrictions to match the documented limitations", "Keep 'no exercise restrictions' and update the documented limitations to say so"], recommended: "Re-confirm the restrictions to match the documented limitations", why: "Exercise selection must follow the limits the review actually authorizes." },
    });
  }

  // Cardio — only when cardio will be planned.
  if (cardio.applicable) {
    for (const e of cardioSafety(c, input.goal).escalations) {
      if (SCREEN_CODES.has(e.code) && review.status === "resolved") out.domainEscalations.push({ source: "cardio", code: e.code, why: `${e.why} The coach's health review (${review.outcome}) authorizes training within its documented limits; it isn't a clearance for cardio.` });
      else out.programEscalations.push({ source: "cardio", code: e.code, why: e.why });
    }
    if (out.domainEscalations.some((e) => e.source === "cardio"))
      out.domainDecisions.push({ source: "cardio", about: "cardio_clearance", question: "The client's screen flagged answers that need clearance before OPTIM prescribes cardio. How should cardio proceed?", options: ["No cardio until the client provides clearance (the rest of the program proceeds)", "Record your clearance decision for cardio, then rerun cardio"], recommended: "No cardio until the client provides clearance (the rest of the program proceeds)", why: "A health review authorizes training within documented limits; cardio clearance is a separate human decision." });
  }
  // Nutrition — only when nutrition is coached; its population escalations stay program-wide (unchanged).
  if (scope.nutrition) for (const e of nutritionSafety(c, input.goal).escalations) out.programEscalations.push({ source: "nutrition", code: e.code, why: e.why });
  return out;
}

/** Does every lifting exercise in this content still fit the CURRENT confirmed restrictions? (canonical currentFit) */
export function resistanceContentFit(content: UniversalTrainingProgramContent, input: SynthesisInput, knowledge: FitnessKnowledgeRegistry): Array<{ exercise: string; state: string; why: string }> {
  const byName = new Map(knowledge.exercises().flatMap((e) => [e.name, ...e.aliases].map((n) => [n.toLowerCase(), e] as const)));
  const access = resolveEquipmentAccess(input.client);
  const names = new Set(content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.prescription.family === "resistance").map((i) => i.name))))));
  const problems: Array<{ exercise: string; state: string; why: string }> = [];
  for (const n of names) {
    const ex = byName.get(n.toLowerCase());
    if (!ex) {
      problems.push({ exercise: n, state: "uncertain", why: "not in OPTIM's exercise catalog, so its fit with the confirmed restrictions can't be checked" });
      continue;
    }
    const fit = currentFit(ex, input.constraints, access);
    if (fit.state === "incompatible" || fit.state === "uncertain") problems.push({ exercise: n, state: fit.state, why: fit.why });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------
// Exercises the coach's DOCUMENTED limitations name that the confirmed structured restrictions still allow (e.g. "no
// high-effort lat pull downs or tricep push downs" while the catalog tags those exercises as low-bracing, or "single leg
// pushing" next to a single-leg calf raise). OPTIM never decides these are safe and never edits the confirmed
// restrictions — each becomes an explicit coach-review item. Deterministic name matching against the documented text:
// the exercise's core name (equipment words dropped) appearing in the text, or a two-word phrase they share.
const EQUIPMENT_WORDS = new Set(["cable", "machine", "dumbbell", "barbell", "band", "kettlebell", "seated", "standing", "smith", "lying", "incline", "decline", "assisted", "bodyweight", "plate", "loaded"]);
const STOP_PHRASES = new Set(["lower body", "upper body"]);
const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean).map(singular);

export function documentedExerciseMentions(exerciseName: string, documented: string | null): string | null {
  if (!documented) return null;
  const text = tokens(documented);
  const collapsedText = text.join("");
  const name = tokens(exerciseName).filter((w) => !EQUIPMENT_WORDS.has(w));
  if (name.length >= 2 && collapsedText.includes(name.join(""))) return name.join(" ");
  const phrases = new Set(text.slice(0, -1).map((w, i) => `${w} ${text[i + 1]}`));
  for (let i = 0; i < name.length - 1; i++) {
    const p = `${name[i]} ${name[i + 1]}`;
    if (phrases.has(p) && !STOP_PHRASES.has(p)) return p;
  }
  return null;
}

/** Lifting exercises that are eligible under the confirmed restrictions but named in the documented limitations. */
export function documentedExerciseReview(input: SynthesisInput, exerciseNames: string[]): UnifiedDecision | null {
  const documented = isKnown(input.client.health.review.coachDocumentedLimitation) ? input.client.health.review.coachDocumentedLimitation.value : null;
  const hits = [...new Set(exerciseNames)].map((n) => ({ n, m: documentedExerciseMentions(n, documented) })).filter((x) => x.m);
  if (!hits.length) return null;
  return {
    source: "resistance",
    about: "documented_limitation_exercise_review",
    question: `These exercises fit the confirmed restrictions but are named in the documented limitations: ${hits.map((h) => `${h.n} (“${h.m}”)`).join("; ")}. Keep them, limit them, or exclude them for this client?`,
    options: ["Keep them as prescribed", "Keep them with an effort limit (e.g. stay well short of failure)", "Exclude them for this client (exercise decision)"],
    recommended: null,
    why: "The documented limitations name these movements; OPTIM doesn't decide whether they're safe and doesn't change the confirmed restrictions.",
  };
}
