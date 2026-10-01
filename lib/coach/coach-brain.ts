// Gate 3 — Coach Brain: the pure rules of a coach's individualized OPTIM.
//
//   SHARED OPTIM CORE  +  COACH-SPECIFIC BRAIN  =  OPTIM operating like that coach
//
// This file is framework-independent (no Supabase, no React, no clock reads
// — `nowIso` is passed in) so every rule is unit-tested
// (lib/coach/verify-coach-brain.mts). lib/production/coach-brain.ts is the
// one server boundary that persists/reads Brain state and composes the
// canonical CoachIntelligence below; downstream systems read that, never
// coach_playbooks and never a UI-assembled model.
//
// Three kinds of knowledge, never confused:
//   1. CONFIRMED METHODOLOGY — what the coach explicitly told OPTIM or
//      explicitly confirmed. Lives only in immutable coach_method_versions,
//      created only by an explicit confirmation. Authoritative.
//   2. INFERRED TENDENCIES — patterns OPTIM observes (Gate 6). Lives in the
//      separate learning layer (coach_decision_evidence → pattern candidates
//      → coach_learned_rules, and a future tendencies store). Never becomes
//      confirmed methodology on its own; when it conflicts, confirmed wins.
//   3. TEMPORARY CONTEXT — client- or situation-specific exceptions. Never
//      written into the method at all.
//
// System defaults (OPTIM's own starting values) are never coach truth: they
// carry "optim_default" provenance, never count toward calibration, and are
// labelled as system defaults wherever they're surfaced.

import {
  applicableChapters,
  allRequiredVisibleQuestionIds,
  applyCoachAnswersToModel,
  pruneAnswersToVisibleQuestions,
} from "./coach-onboarding-engine.ts";
import {
  createDefaultCoachOperatingModel,
  isCoachOperatingModelConfirmed,
  type CoachOperatingModel,
  type ProvenanceSource,
} from "./operating-model.ts";
import type { CoachOnboardingAnswers, CoachOnboardingChapterId } from "./coach-onboarding-questions.ts";
import type { AiAuthorityConfig, AiAuthorityLevel, CoachAiAuthoritySettings } from "./ai-authority.ts";
import type { CoachPlaybookContent } from "./playbook.ts";

// ---------------------------------------------------------------------------
// Live calibration scope
// ---------------------------------------------------------------------------

/** Survey chapters that depend on systems that don't exist in the live
 * product yet. "existing_work" infers rules from the coach's saved program
 * templates and meal recommendations — demo-only today (Gate 3 builds no
 * imports). Hidden in live calibration; never fabricated; never blocks
 * completion. */
export const LIVE_UNSUPPORTED_CHAPTERS: readonly CoachOnboardingChapterId[] = ["existing_work"];

export function liveCalibrationChapters(answers: CoachOnboardingAnswers): CoachOnboardingChapterId[] {
  return applicableChapters(answers).filter((c) => !LIVE_UNSUPPORTED_CHAPTERS.includes(c));
}

/** Every required question that must have an explicit coach answer before
 * the coach can confirm (question-bank chapters only; conditional questions
 * count only while visible). */
export function requiredCalibrationQuestionIds(answers: CoachOnboardingAnswers): string[] {
  return allRequiredVisibleQuestionIds(answers);
}

function hasAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean" || typeof value === "number") return true;
  return typeof value === "string" && value.trim() !== "";
}

export interface CalibrationReadiness {
  ready: boolean;
  unansweredQuestionIds: string[];
  /** The explicit AI-authority step hasn't been confirmed. */
  authorityUnconfirmed: boolean;
}

/** Calibration may be confirmed only when every required, live-supported
 * question has an explicit answer AND the coach explicitly confirmed their
 * AI authority. Unsupported chapters (LIVE_UNSUPPORTED_CHAPTERS) contribute
 * no required questions. */
export function calibrationReadiness(input: { answers: CoachOnboardingAnswers; aiAuthorityConfirmed: boolean }): CalibrationReadiness {
  const answers = pruneAnswersToVisibleQuestions(input.answers);
  const unansweredQuestionIds = requiredCalibrationQuestionIds(answers).filter((id) => !hasAnswer(answers[id]));
  return { ready: unansweredQuestionIds.length === 0 && input.aiAuthorityConfirmed, unansweredQuestionIds, authorityUnconfirmed: !input.aiAuthorityConfirmed };
}

// ---------------------------------------------------------------------------
// Authority — never silently broad
// ---------------------------------------------------------------------------

/** The level calibration starts at, and the level used whenever a coach has
 * not explicitly chosen one: Advisor — OPTIM only suggests; nothing is
 * auto-executed. (The legacy workspace default, "copilot", auto-executes
 * daily-planning and messaging nudges, so it is never assumed.) */
export const CONSERVATIVE_AUTHORITY_LEVEL: AiAuthorityLevel = "advisor";

export function conservativeAuthorityConfig(): AiAuthorityConfig {
  return { level: CONSERVATIVE_AUTHORITY_LEVEL, domainOverrides: {} };
}

export function authoritySettings(params: { coachUserId: string; workspaceId: string; global: AiAuthorityConfig; nowIso: string }): CoachAiAuthoritySettings {
  return { coachId: params.coachUserId, workspaceId: params.workspaceId, global: params.global, clientOverrides: {}, updatedAtIso: params.nowIso };
}

// ---------------------------------------------------------------------------
// Calibration answers → confirmed method
// ---------------------------------------------------------------------------

export class CalibrationIncompleteError extends Error {
  readonly readiness: CalibrationReadiness;
  constructor(readiness: CalibrationReadiness) {
    super(
      [
        readiness.unansweredQuestionIds.length > 0 ? `${readiness.unansweredQuestionIds.length} required question${readiness.unansweredQuestionIds.length === 1 ? " is" : "s are"} still unanswered.` : null,
        readiness.authorityUnconfirmed ? "Confirm how much OPTIM may do on its own." : null,
      ]
        .filter(Boolean)
        .join(" ")
    );
    this.name = "CalibrationIncompleteError";
    this.readiness = readiness;
  }
}

/**
 * Maps explicit calibration answers into the structured method the coach is
 * about to confirm. Starts from OPTIM's default model so every leaf has a
 * value, then applies the coach's answers through the existing mapper — which
 * marks each answered question coach_selected. Anything the coach didn't
 * answer stays optim_default (and is shown that way); nothing is inferred.
 * Throws if any required answer is missing or didn't map to coach provenance.
 */
export function buildMethodFromCalibration(params: {
  answers: CoachOnboardingAnswers;
  aiAuthority: AiAuthorityConfig;
  aiAuthorityConfirmed: boolean;
  coachUserId: string;
  workspaceId: string;
  businessName: string;
  methodVersion: number;
  nowIso: string;
}): { operatingModel: CoachOperatingModel; aiAuthority: CoachAiAuthoritySettings; answers: CoachOnboardingAnswers } {
  const answers = pruneAnswersToVisibleQuestions(params.answers);
  const readiness = calibrationReadiness({ answers, aiAuthorityConfirmed: params.aiAuthorityConfirmed });
  if (!readiness.ready) throw new CalibrationIncompleteError(readiness);

  const base = createDefaultCoachOperatingModel({ coachId: params.coachUserId, workspaceId: params.workspaceId, nowIso: params.nowIso, businessName: params.businessName });
  const applied = applyCoachAnswersToModel(base, answers, params.nowIso);
  const operatingModel: CoachOperatingModel = {
    ...applied,
    coachId: params.coachUserId,
    workspaceId: params.workspaceId,
    version: params.methodVersion,
    status: "active",
    createdAtIso: params.nowIso,
    activatedAtIso: params.nowIso,
    supersededByVersion: undefined,
  };
  const required = requiredCalibrationQuestionIds(answers);
  if (!isCoachOperatingModelConfirmed(operatingModel, required)) {
    throw new Error("buildMethodFromCalibration: a required answer did not map to coach provenance");
  }
  return {
    operatingModel,
    aiAuthority: authoritySettings({ coachUserId: params.coachUserId, workspaceId: params.workspaceId, global: params.aiAuthority, nowIso: params.nowIso }),
    answers,
  };
}

// ---------------------------------------------------------------------------
// Provenance — what a value is, and where it came from
// ---------------------------------------------------------------------------

export type CoachKnowledgeSource =
  /** An explicit calibration (or method-review) answer. */
  | "calibration_answer"
  /** A value the coach explicitly confirmed (e.g. an offered inference). */
  | "coach_confirmed"
  /** Reserved: a proposal/pattern the coach explicitly approved into the
   * method through a method review (Gate 6). */
  | "coach_approved_proposal"
  /** Observed, not confirmed. Never authoritative. */
  | "inferred"
  /** OPTIM's own default. Never coach truth. */
  | "system_default";

export function knowledgeSourceOf(source: ProvenanceSource | undefined): CoachKnowledgeSource {
  switch (source) {
    case "coach_selected":
      return "calibration_answer";
    case "coach_confirmed":
      return "coach_confirmed";
    case "inferred":
      return "inferred";
    default:
      return "system_default";
  }
}

/** Only these count as the coach's own methodology. */
export function isCoachAuthoredSource(source: CoachKnowledgeSource): boolean {
  return source === "calibration_answer" || source === "coach_confirmed" || source === "coach_approved_proposal";
}

// ---------------------------------------------------------------------------
// The canonical read contract
// ---------------------------------------------------------------------------

export type CoachCalibrationState = "not_started" | "in_progress" | "calibrated";

export interface ConfirmedCoachMethod {
  versionId: string;
  version: number;
  source: "calibration" | "method_review" | "authority_update";
  confirmedAtIso: string;
  operatingModel: CoachOperatingModel;
  aiAuthority: CoachAiAuthoritySettings;
}

/** How the coach whose Brain applies was determined. */
export type CoachOwnerResolution =
  /** The signed-in coach's own Brain (dashboard, settings, calibration). */
  | "self"
  /** The client's primary assigned coach (coach_client_assignments.is_primary). */
  | "primary_coach"
  /** The client has no primary coach — no Brain applies; behave conservatively. */
  | "no_primary_coach";

/** A coach-confirmed learned rule (an explicitly confirmed pattern). Kept
 * separate from the confirmed method; methodology conflicts are resolved in
 * favour of the method at application time (lib/coach/rule-application.ts). */
export interface CoachConfirmedPatternRule {
  id: string;
  scope: "coach_general" | "client_specific";
  clientProfileId: string | null;
  decisionDomain: string;
  field: string;
}

/**
 * Gate 6 contract — an observed tendency. Defined now so the learning layer
 * has a fixed, separate shape to fill; nothing in Gate 3 produces these.
 * A tendency is NEVER methodology: it can only change the method if the coach
 * explicitly confirms a method review that includes it (source
 * "coach_approved_proposal").
 */
export interface CoachTendency {
  id: string;
  /** e.g. "In these situations, this coach tends to reduce volume before intensity." */
  description: string;
  decisionDomain: string;
  evidenceCount: number;
  /** Real coach_decision_evidence ids (or equivalent source-event refs). */
  sourceEventRefs: string[];
  confidence: number;
  lastObservedIso: string;
  scope: { clientProfileId: string | null; context: string | null };
  /** True when acting on it would contradict confirmed methodology — the
   * method wins, and OPTIM may only ask the coach whether to update it. */
  conflictsWithConfirmedMethod: boolean;
  status: "observed" | "surfaced_to_coach" | "dismissed_by_coach" | "promoted_via_method_review";
}

export interface CoachIntelligence {
  owner: { coachUserId: string; workspaceId: string } | null;
  ownerResolution: CoachOwnerResolution;
  calibration: { state: CoachCalibrationState; calibratedAtIso: string | null };
  /** The active coach-confirmed method, or null — never a default stand-in. */
  method: ConfirmedCoachMethod | null;
  /** Explicit coach authority when a method is confirmed; otherwise the
   * conservative system default, labelled as such. */
  authority: { settings: CoachAiAuthoritySettings; source: "coach_confirmed" | "system_default" };
  learning: {
    confirmedPatternRules: CoachConfirmedPatternRule[];
    /** Gate 6 — always empty in Gate 3. */
    inferredTendencies: CoachTendency[];
  };
}

/** Whether coaching-specific behavior may rely on a coach's method. */
export function hasConfirmedMethod(intel: CoachIntelligence): intel is CoachIntelligence & { method: ConfirmedCoachMethod } {
  return intel.method !== null && intel.calibration.state === "calibrated";
}

/** The conservative intelligence used when no confirmed Brain applies. The
 * operating model inside is OPTIM's defaults, used only for technical
 * plumbing (e.g. chat formatting); it is never presented or stored as the
 * coach's method, and plan-changing decisions are blocked/escalated. */
export function noConfirmedBrainIntelligence(params: {
  owner: { coachUserId: string; workspaceId: string } | null;
  ownerResolution: CoachOwnerResolution;
  calibrationState: CoachCalibrationState;
  nowIso: string;
}): CoachIntelligence {
  return {
    owner: params.owner,
    ownerResolution: params.ownerResolution,
    calibration: { state: params.calibrationState, calibratedAtIso: null },
    method: null,
    authority: {
      settings: authoritySettings({ coachUserId: params.owner?.coachUserId ?? "", workspaceId: params.owner?.workspaceId ?? "", global: conservativeAuthorityConfig(), nowIso: params.nowIso }),
      source: "system_default",
    },
    learning: { confirmedPatternRules: [], inferredTendencies: [] },
  };
}

/** Legacy-shape adapter: existing consumers (chat pipeline, generation,
 * adjustments) take a CoachPlaybookContent. Built from the confirmed method
 * only. */
export function methodAsPlaybookContent(method: ConfirmedCoachMethod): CoachPlaybookContent {
  return { operatingModel: method.operatingModel, aiAuthority: method.aiAuthority, examples: [] };
}

/** System-default content for the no-confirmed-Brain chat path. Clearly not
 * coach truth: the model keeps optim_default provenance and authority is the
 * conservative level. Never persisted. */
export function systemDefaultPlaybookContent(params: { workspaceId: string; nowIso: string; businessName: string }): CoachPlaybookContent {
  const operatingModel = createDefaultCoachOperatingModel({ coachId: "system-default", workspaceId: params.workspaceId, nowIso: params.nowIso, businessName: params.businessName });
  return {
    operatingModel,
    aiAuthority: authoritySettings({ coachUserId: "system-default", workspaceId: params.workspaceId, global: conservativeAuthorityConfig(), nowIso: params.nowIso }),
    examples: [],
  };
}

// ---------------------------------------------------------------------------
// Stale-draft protection
// ---------------------------------------------------------------------------

export type MethodDraftStaleness =
  | { stale: false }
  | { stale: true; reason: "no_method_version" | "method_changed"; message: string };

/**
 * A program/adjustment draft records the method version it was prepared
 * under. If that isn't the coach's active version, approving it would
 * silently apply an old method — so it's stale and must be regenerated.
 * Drafts from before Gate 3 (no recorded version) are stale too: they were
 * built from legacy workspace scaffolding, not a confirmed Coach Brain.
 */
/** The coach-method version a program/adjustment draft was prepared under.
 * Drafts saved before Gate 3 carry none (undefined) — methodDraftStaleness
 * treats those as stale, so a legacy draft can never be approved as though
 * it reflects the coach's confirmed Brain. Nothing about the draft or the
 * client's plan is changed; the coach rejects and regenerates. */
export function draftMethodVersionIdOf(content: {
  adjustmentProvenance?: { methodVersionId?: string } | null;
  generationInputs?: { coachMethod?: { methodVersionId?: string } | null } | null;
}): string | undefined {
  if (content.adjustmentProvenance) return content.adjustmentProvenance.methodVersionId ?? undefined;
  return content.generationInputs?.coachMethod?.methodVersionId ?? undefined;
}

export function methodDraftStaleness(draftMethodVersionId: string | null | undefined, activeMethodVersionId: string | null): MethodDraftStaleness {
  if (!draftMethodVersionId) {
    return { stale: true, reason: "no_method_version", message: "This draft was prepared before your coaching method was confirmed in OPTIM. Reject it and generate a new one from your current method." };
  }
  if (draftMethodVersionId !== activeMethodVersionId) {
    return { stale: true, reason: "method_changed", message: "This draft was prepared under your previous coaching method. Reject it and generate a new one so it reflects your current method." };
  }
  return { stale: false };
}
