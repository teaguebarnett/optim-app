// What a NEW program proposal may be generated (and approved) from.
//
// Generation used to run for any client: an unconfirmed, bootstrapped
// default coach method was described as "your preferred…", and a client
// with no intake got buildPlaceholderProgrammingProfile's invented facts
// (Mon/Wed/Fri, "some experience", 45 min). Now a new proposal requires:
//   1. a coach-confirmed methodology (lib/coach/methodology.ts),
//   2. completed client intake (extractClientProgrammingProfile succeeds —
//      it already refuses incomplete onboarding),
//   3. any required health review resolved.
// When ready, buildGenerationInputs records exactly what was used — the
// confirmed method version and the intake it came from — onto the proposal
// content (UniversalTrainingProgramContent.generationInputs). A proposal
// without that record is unverified and cannot be approved. Adjustment
// proposals are out of scope here: they modify an already-approved active
// plan and are re-checked against it at approval.
//
// Pure — tested by lib/coach/verify-generation-prerequisites.mts.

import { ONBOARDING_STEPS } from "./onboarding-steps.ts";
import { formatFieldValue, NOT_PROVIDED } from "./onboarding-format.ts";
import { resolveProgrammingProfileReadiness, type ClientProgrammingProfile, type ExtractProfileResult } from "./programming-profile.ts";
import { describeMethodField, fieldLabel, getMethodologyConfirmation, requiredMethodQuestionIds, type MethodQuestionId } from "./methodology.ts";
import type { CoachOperatingModel } from "./operating-model.ts";
import { findCalibrationQuestion } from "./calibration/questions.ts";
import { formatByKey } from "./calibration/format.ts";
import type { OnboardingProgress } from "./types";
import type { GenerationInputs } from "../training/types.ts";

export type PrerequisiteId = "coach_method" | "client_intake" | "health_review";

export interface MissingPrerequisite {
  id: PrerequisiteId;
  message: string;
  /** The working screen that resolves it, when one exists. */
  href: string | null;
  linkLabel: string | null;
}

export interface GenerationPrerequisiteInput {
  /** The workspace's approved playbook, or null if it has none. */
  playbook: { version: number; operatingModel: CoachOperatingModel } | null;
  onboarding: OnboardingProgress | null;
  intake: ExtractProfileResult;
  clientProfileId: string;
}

export type GenerationPrerequisiteResult =
  | { ready: true; profile: ClientProgrammingProfile; assumptions: string[] }
  | { ready: false; missing: MissingPrerequisite[] };

/** Thrown when a new proposal is requested (or approved) without its
 * prerequisites; the message lists every missing item in plain language. */
export class GenerationPrerequisitesError extends Error {
  readonly missing: MissingPrerequisite[];
  constructor(missing: MissingPrerequisite[]) {
    super(missing.map((m) => m.message).join(" "));
    this.name = "GenerationPrerequisitesError";
    this.missing = missing;
  }
}

export function evaluateGenerationPrerequisites(input: GenerationPrerequisiteInput): GenerationPrerequisiteResult {
  const missing: MissingPrerequisite[] = [];

  const method = getMethodologyConfirmation(input.playbook?.operatingModel ?? null);
  if (!method.confirmed && method.confirmedAtIso && !method.coversResistance) {
    missing.push({
      id: "coach_method",
      // Gate 3.1 — a confirmed method without resistance-training rules
      // (e.g. endurance-only). OPTIM never fills them in from defaults.
      message: "This client's coach hasn't confirmed a resistance-training method in OPTIM. OPTIM only builds resistance programs from a coach's own confirmed training rules.",
      href: null,
      linkLabel: null,
    });
  } else if (!method.confirmed) {
    missing.push({
      id: "coach_method",
      // Gate 3 — the method is the client's PRIMARY coach's confirmed Coach
      // Brain. No link: the acting coach may not be that coach, and must
      // never be sent to confirm their own method on someone else's behalf.
      message: "This client's coach hasn't confirmed their coaching method in OPTIM yet. OPTIM won't build programs from its defaults.",
      href: null,
      linkLabel: null,
    });
  }

  let profile: ClientProgrammingProfile | null = null;
  let assumptions: string[] = [];
  if ("missing" in input.intake) {
    const notStarted = !input.onboarding;
    missing.push({
      id: "client_intake",
      message: notStarted
        ? "This client hasn't started intake yet."
        : input.onboarding?.completedAtIso
          ? `Intake is missing required answers: ${input.intake.missing.join(", ")}.`
          : "This client hasn't finished intake yet.",
      href: null,
      linkLabel: null,
    });
  } else {
    profile = input.intake.profile;
    const readiness = resolveProgrammingProfileReadiness(input.intake);
    // Any existing, unresolved health review blocks — not only the
    // injury-gated case resolveProgrammingProfileReadiness flags.
    if (readiness.status === "needs_coach_review" || (profile.requiresHealthReview && profile.healthReviewResolved === false)) {
      missing.push({
        id: "health_review",
        message: readiness.reviewReason ?? "A health review for this client is still open. Resolve it before generating a program.",
        href: "/coach/escalations",
        linkLabel: "Open health reviews",
      });
    }
    assumptions = readiness.assumptions;
  }

  if (missing.length > 0 || !profile) return { ready: false, missing };
  return { ready: true, profile, assumptions };
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

const CLIENT_FACT_KEYS: Array<{ step: string; key: string }> = [
  { step: "what_you_want", key: "primaryGoal" },
  { step: "starting_point", key: "trainingExperience" },
  { step: "your_week", key: "availableDays" },
  { step: "your_week", key: "maxSessionLength" },
  { step: "your_week", key: "trainingEnvironment" },
];

/** The client's own intake answers, labelled with the intake form's own
 * wording — never re-derived tiers or engine enums. */
export function describeClientIntakeFacts(onboarding: OnboardingProgress): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [];
  for (const { step, key } of CLIENT_FACT_KEYS) {
    const stepDef = ONBOARDING_STEPS.find((s) => s.id === step);
    const field = stepDef?.fields.find((f) => f.key === key);
    if (!field) continue;
    const answers = (onboarding.answers as Record<string, Record<string, unknown> | undefined>)[step] ?? {};
    const value = formatFieldValue(field, answers[key]);
    if (value !== NOT_PROVIDED) facts.push({ label: field.label, value });
  }
  return facts;
}

const V2_SUMMARY_KEYS = ["t_days", "t_session_length", "t_splits", "t_sets", "t_reps", "t_effort_rir", "t_effort_plain", "t_progression_method", "t_deload_approach", "t_deload_every"];

/** Gate 3.1 — the v2 method values generation reads, in the coach's terms
 * (ranges as ranges). */
function v2MethodSummary(model: CoachOperatingModel): Array<{ label: string; value: string }> {
  const answers = model.calibration?.answers ?? {};
  return V2_SUMMARY_KEYS.filter((k) => answers[k] !== undefined).map((k) => ({ label: findCalibrationQuestion(k)?.summaryLabel ?? k, value: formatByKey(k, answers) }));
}

const METHOD_SUMMARY_FIELDS: MethodQuestionId[] = ["program_splits", "program_rep_philosophy", "program_rpe_rir", "program_proximity_to_failure", "program_progression", "program_deload"];

export function buildGenerationInputs(params: {
  playbookVersion: number;
  /** Gate 3 — the confirmed Coach Brain method version used. */
  methodVersionId?: string;
  operatingModel: CoachOperatingModel;
  onboarding: OnboardingProgress;
  profile: ClientProgrammingProfile;
  assumptions: string[];
  nowIso: string;
  rationale?: string;
  whyThisPlan?: string[];
}): GenerationInputs {
  const method = getMethodologyConfirmation(params.operatingModel);
  if (!method.confirmed || !method.confirmedAtIso) throw new Error("buildGenerationInputs: coach method is not confirmed");
  if (!params.onboarding.completedAtIso) throw new Error("buildGenerationInputs: client intake is not complete");
  const applicable = new Set(requiredMethodQuestionIds(params.operatingModel.programArchitecture.usesRpeOrRir));
  return {
    version: 1,
    recordedAtIso: params.nowIso,
    ...(params.rationale ? { rationale: params.rationale } : {}),
    ...(params.whyThisPlan && params.whyThisPlan.length > 0 ? { whyThisPlan: params.whyThisPlan } : {}),
    coachMethod: {
      ...(params.methodVersionId ? { methodVersionId: params.methodVersionId } : {}),
      playbookVersion: params.playbookVersion,
      operatingModelVersion: method.operatingModelVersion,
      confirmedAtIso: method.confirmedAtIso,
      summary: params.operatingModel.calibration?.schema === 2 ? v2MethodSummary(params.operatingModel) : METHOD_SUMMARY_FIELDS.filter((id) => applicable.has(id)).map((id) => ({ label: fieldLabel(id), value: describeMethodField(params.operatingModel, id) })),
    },
    clientIntake: {
      source: "client_onboarding",
      completedAtIso: params.onboarding.completedAtIso,
      healthReview: params.profile.healthReviewResolved === "no_review_needed" ? "not_required" : "resolved",
      summary: describeClientIntakeFacts(params.onboarding),
      assumptions: params.assumptions,
    },
  };
}

/** True only for a proposal carrying a complete, well-formed provenance
 * record. A fresh-generation proposal without one predates these checks
 * (or was built from placeholders) and must be regenerated. */
export function hasVerifiedGenerationInputs(content: { generationInputs?: unknown }): boolean {
  const g = content.generationInputs as Partial<GenerationInputs> | undefined;
  return (
    !!g &&
    g.version === 1 &&
    !!g.coachMethod &&
    typeof g.coachMethod.confirmedAtIso === "string" &&
    typeof g.coachMethod.playbookVersion === "number" &&
    !!g.clientIntake &&
    g.clientIntake.source === "client_onboarding" &&
    typeof g.clientIntake.completedAtIso === "string"
  );
}

/** The approval rule for a pending proposal, shared by
 * approveProgramProposalAction. A fresh-generation proposal needs verified
 * generation inputs AND its prerequisites must still hold now. An
 * adjustment proposal is governed by the existing active-plan staleness
 * check instead (it can only modify the plan the coach already approved). */
export function checkProposalApproval(
  content: { generationInputs?: unknown; adjustmentProvenance?: unknown },
  currentPrerequisites: GenerationPrerequisiteResult
): { ok: true } | { ok: false; message: string } {
  if (content.adjustmentProvenance) return { ok: true };
  if (!hasVerifiedGenerationInputs(content)) {
    return { ok: false, message: "This proposal was generated before OPTIM verified its inputs (coach method and client intake). Reject it and generate a new one." };
  }
  if (!currentPrerequisites.ready) return { ok: false, message: currentPrerequisites.missing.map((m) => m.message).join(" ") };
  return { ok: true };
}

/** A still-pending fresh-generation proposal that can never be approved
 * (no verified inputs). Rejecting a proposal also archives any other such
 * draft for the same client, so a hidden duplicate can't resurface as "the
 * pending proposal." Adjustment proposals are never matched. */
export function isUnverifiedFreshProposal(content: { generationInputs?: unknown; adjustmentProvenance?: unknown }): boolean {
  return !content.adjustmentProvenance && !hasVerifiedGenerationInputs(content);
}
