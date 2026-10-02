// Gate 4.0C-1 — ConstraintSet: the boundaries THIS client's plan must
// respect. Derived from the client's intake, the health review and the
// coach's documented limitation. It belongs to the client alone: nothing
// here is ever written to the Coach Brain or to Fitness Knowledge.
//
// Hard constraints can't be silently ignored: validatePlanSpecification
// (plan-spec.ts) rejects a plan that doesn't account for every effective
// hard constraint. Free text is never interpreted into permission — it's
// kept verbatim for the coach; only literal exercise words from it become
// conservative "avoid" tags, marked as unconfirmed interpretations.

import { termsMentionedInRestrictionText } from "../coach/program-directions.ts";
import type { DayOfWeek } from "../types.ts";
import type { BodyPosition, Demand, Level, MovementPatternId } from "./knowledge/taxonomy.ts";
import { isKnown } from "./facts.ts";
import type { ClientState } from "./client-state.ts";

export type ConstraintCategory = "availability" | "session_length" | "equipment" | "injury_or_pain" | "movement_restriction" | "medical_review" | "scope_of_practice";

export type ConstraintTag =
  /** Days the client can train — an upper bound on scheduling, never a target. */
  | { kind: "available_days"; days: DayOfWeek[] }
  | { kind: "max_session_minutes"; minutes: number }
  | { kind: "equipment_available"; equipment: string[] }
  | { kind: "body_area"; area: string }
  | { kind: "avoid_exercise_term"; term: string }
  /** Structured tags below are matched against exercise metadata (exercise-eligibility.ts). */
  | { kind: "avoid_movement_pattern"; pattern: MovementPatternId }
  | { kind: "avoid_demand"; demand: Demand; atOrAbove: Level }
  | { kind: "avoid_position"; position: BodyPosition }
  | { kind: "requires_coach_review" }
  | { kind: "free_text"; text: string; interpretation: "needs_coach_interpretation" };

export type ConstraintConfirmation =
  | "coach_confirmed"
  | "system_derived"
  | "client_reported"
  /** OPTIM's literal reading of free text — conservative, unconfirmed. */
  | "unconfirmed_interpretation";

export interface Constraint {
  id: string;
  clientProfileId: string;
  category: ConstraintCategory;
  source: { kind: "client_onboarding" | "health_review" | "coach_documented" | "system_policy"; ref: string };
  description: string;
  tags: ConstraintTag[];
  enforcement: "hard" | "soft";
  confirmation: ConstraintConfirmation;
  review: { status: "not_required" | "open" | "resolved"; expiresAtIso?: string };
  /** Set when a higher-authority constraint covers the same concern. */
  supersededBy?: string;
  /** Set when a coach-confirmed STRUCTURED restriction expresses this
   * constraint's free text / literal terms. The record stays; planners use
   * the structured version. */
  interpretedBy?: string;
}

/** A coach's structured translation of one or more free-text constraints
 * (e.g. "no squats or ab work" → avoid squat pattern, avoid trunk patterns).
 * Supplied by the coach; never inferred by OPTIM. */
export interface CoachStructuredRestriction {
  id: string;
  /** Constraint ids whose wording this restriction expresses. */
  interprets: string[];
  description: string;
  tags: ConstraintTag[];
  ref: string;
}

export interface ConstraintSet {
  clientProfileId: string;
  constraints: Constraint[];
}

const AUTHORITY: Record<ConstraintConfirmation, number> = { coach_confirmed: 4, system_derived: 3, client_reported: 2, unconfirmed_interpretation: 1 };

/** Screen answers that need qualified review before coaching proceeds. */
const CLINICAL_SCREEN = new Set(["cardiovascular", "chest_dizziness", "blood_pressure", "medication_condition", "advised_limit"]);

export function deriveConstraintSet(state: ClientState): ConstraintSet {
  const id = (suffix: string) => `${state.clientProfileId}:${suffix}`;
  const out: Constraint[] = [];
  const base = { clientProfileId: state.clientProfileId };
  const reviewStatus = state.health.review.status === "none" ? "not_required" : state.health.review.status;

  if (isKnown(state.schedule.availableDays)) {
    const days = state.schedule.availableDays.value;
    out.push({
      ...base,
      id: id("availability"),
      category: "availability",
      source: { kind: "client_onboarding", ref: state.schedule.availableDays.source.ref },
      description: `Available on ${days.length} day${days.length === 1 ? "" : "s"} (${days.join(", ")}) — the most a plan may schedule, not a target.`,
      tags: [{ kind: "available_days", days }],
      enforcement: "hard",
      confirmation: "client_reported",
      review: { status: "not_required" },
    });
  }

  if (isKnown(state.schedule.maxSessionLength)) {
    const s = state.schedule.maxSessionLength.value;
    out.push({
      ...base,
      id: id("session_length"),
      category: "session_length",
      source: { kind: "client_onboarding", ref: state.schedule.maxSessionLength.source.ref },
      description: s.openEnded ? `Sessions can run ${s.minutes}+ minutes.` : `Sessions up to ${s.minutes} minutes.`,
      tags: s.openEnded ? [] : [{ kind: "max_session_minutes", minutes: s.minutes }],
      enforcement: s.openEnded ? "soft" : "hard",
      confirmation: "client_reported",
      review: { status: "not_required" },
    });
  }

  if (isKnown(state.equipment.available)) {
    out.push({
      ...base,
      id: id("equipment"),
      category: "equipment",
      source: { kind: "client_onboarding", ref: "onboarding.your_week.trainingEnvironment" },
      description: `Equipment available: ${state.equipment.available.value.join(", ")}.`,
      tags: [{ kind: "equipment_available", equipment: state.equipment.available.value }],
      enforcement: "hard",
      confirmation: "system_derived",
      review: { status: "not_required" },
    });
  }

  // Client-reported pain / injury: kept verbatim; the coach interprets it.
  const reportsLimitation = isKnown(state.health.reportsCurrentLimitation) && state.health.reportsCurrentLimitation.value;
  const clientRestrictionText = isKnown(state.health.restrictions) ? state.health.restrictions.value : null;
  if (reportsLimitation) {
    const areas = isKnown(state.health.bodyAreas) ? state.health.bodyAreas.value : [];
    const other = isKnown(state.health.bodyAreaOther) ? state.health.bodyAreaOther.value : null;
    const aggravating = isKnown(state.health.aggravatingFactors) ? state.health.aggravatingFactors.value : null;
    out.push({
      ...base,
      id: id("client_reported_limitation"),
      category: "injury_or_pain",
      source: { kind: "client_onboarding", ref: "onboarding.health_finish" },
      description: [`Client reports a current limitation${areas.length ? ` (${areas.filter((a) => a !== "other").concat(other ? [other] : []).join(", ")})` : ""}.`, aggravating ? `Aggravated by: ${aggravating}.` : "", clientRestrictionText ? `Unable/advised not to: ${clientRestrictionText}.` : ""].filter(Boolean).join(" "),
      tags: [
        ...areas.filter((a) => a !== "other").map((area): ConstraintTag => ({ kind: "body_area", area })),
        ...(clientRestrictionText ? [{ kind: "free_text", text: clientRestrictionText, interpretation: "needs_coach_interpretation" } as const] : []),
        ...(aggravating ? [{ kind: "free_text", text: aggravating, interpretation: "needs_coach_interpretation" } as const] : []),
        ...(reviewStatus === "open" ? [{ kind: "requires_coach_review" } as const] : []),
      ],
      enforcement: "hard",
      confirmation: "client_reported",
      review: { status: reviewStatus },
    });
    const literal = termsMentionedInRestrictionText(clientRestrictionText);
    if (literal.length > 0) {
      out.push({
        ...base,
        id: id("client_restriction_terms"),
        category: "movement_restriction",
        source: { kind: "client_onboarding", ref: "onboarding.health_finish.injuryRestrictions" },
        description: `Avoid exercises named: ${literal.join(", ")} (OPTIM's literal reading of the client's own words).`,
        tags: literal.map((term): ConstraintTag => ({ kind: "avoid_exercise_term", term })),
        enforcement: "hard",
        confirmation: "unconfirmed_interpretation",
        review: { status: reviewStatus },
      });
    }
  }

  // The coach's documented limitation outranks the client's wording.
  const coachText = isKnown(state.health.review.coachDocumentedLimitation) ? state.health.review.coachDocumentedLimitation.value : null;
  if (coachText) {
    const literal = termsMentionedInRestrictionText(coachText);
    out.push({
      ...base,
      id: id("coach_documented_limitation"),
      category: "movement_restriction",
      source: { kind: "coach_documented", ref: "health_review.documentedLimitations" },
      description: `Coach-documented limitation: ${coachText}`,
      tags: [{ kind: "free_text", text: coachText, interpretation: "needs_coach_interpretation" }, ...literal.map((term): ConstraintTag => ({ kind: "avoid_exercise_term", term }))],
      enforcement: "hard",
      confirmation: "coach_confirmed",
      review: { status: "resolved" },
    });
  }

  // Safety screen answers that need qualified review.
  const screen = isKnown(state.health.safetyScreen) ? state.health.safetyScreen.value.filter((s) => CLINICAL_SCREEN.has(s)) : [];
  if (screen.length > 0) {
    out.push({
      ...base,
      id: id("medical_review"),
      category: "medical_review",
      source: { kind: "client_onboarding", ref: "onboarding.health_finish.safetyScreen" },
      description: `Pre-participation screen flagged: ${screen.join(", ")}. Requires the coach's review; any medical question goes to a qualified professional.`,
      tags: reviewStatus === "open" || reviewStatus === "not_required" ? [{ kind: "requires_coach_review" }] : [],
      enforcement: "hard",
      confirmation: "client_reported",
      review: { status: reviewStatus === "not_required" ? "open" : reviewStatus },
    });
  }

  return { clientProfileId: state.clientProfileId, constraints: applySupersession(out) };
}

/** A coach-confirmed movement restriction supersedes OPTIM's unconfirmed
 * literal reading of the client's text (both are kept for the record). */
function applySupersession(constraints: Constraint[]): Constraint[] {
  const coach = constraints.find((c) => c.category === "movement_restriction" && c.confirmation === "coach_confirmed");
  if (!coach) return constraints;
  return constraints.map((c) => (c.category === "movement_restriction" && c.confirmation === "unconfirmed_interpretation" ? { ...c, supersededBy: coach.id } : c));
}

export function applyCoachStructuredRestrictions(set: ConstraintSet, restrictions: CoachStructuredRestriction[]): ConstraintSet {
  if (restrictions.length === 0) return set;
  const structured: Constraint[] = restrictions.map((r) => ({
    id: `${set.clientProfileId}:coach_structured:${r.id}`,
    clientProfileId: set.clientProfileId,
    category: "movement_restriction",
    source: { kind: "coach_documented", ref: r.ref },
    description: r.description,
    tags: r.tags,
    enforcement: "hard",
    confirmation: "coach_confirmed",
    review: { status: "resolved" },
  }));
  const interpreter = new Map<string, string>();
  restrictions.forEach((r, i) => r.interprets.forEach((cid) => interpreter.set(cid, structured[i].id)));
  return {
    clientProfileId: set.clientProfileId,
    constraints: [...set.constraints.map((c) => (interpreter.has(c.id) ? { ...c, interpretedBy: interpreter.get(c.id) } : c)), ...structured],
  };
}

const NAME_OR_TEXT_TAGS = new Set<ConstraintTag["kind"]>(["avoid_exercise_term", "free_text"]);

/**
 * Effective hard constraints that still need a coach's structured
 * translation before exercises can be chosen against them: they carry free
 * text or literal exercise words and nothing structured expresses them. A
 * client-reported limitation whose health review the coach has resolved is
 * considered reviewed (the coach's own documentation, if any, governs).
 */
export function constraintsNeedingStructure(set: ConstraintSet): Constraint[] {
  return effectiveConstraints(set).filter(
    (c) =>
      c.enforcement === "hard" &&
      !c.interpretedBy &&
      c.tags.some((t) => NAME_OR_TEXT_TAGS.has(t.kind)) &&
      !(c.confirmation === "client_reported" && c.review.status === "resolved")
  );
}

/** The constraints a planner must respect, highest authority first. */
export function effectiveConstraints(set: ConstraintSet): Constraint[] {
  return set.constraints.filter((c) => !c.supersededBy).sort((a, b) => AUTHORITY[b.confirmation] - AUTHORITY[a.confirmation]);
}

export function hardConstraints(set: ConstraintSet): Constraint[] {
  return effectiveConstraints(set).filter((c) => c.enforcement === "hard");
}
