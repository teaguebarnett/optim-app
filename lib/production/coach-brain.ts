// Gate 3 — Coach Brain: the one server-side boundary that persists and reads
// a coach's Brain (coach_brains / coach_method_versions /
// coach_calibration_progress — supabase/migrations/20261001000029) and
// composes the canonical CoachIntelligence every downstream system reads
// (lib/coach/coach-brain.ts holds the pure rules).
//
// Identity is always server-derived: the coach comes from the authenticated
// session (resolveOwnStaffWorkspace), never from a browser-supplied id. Own-
// Brain reads/writes run as the caller's session, so RLS
// (coach_user_id = auth.uid() + workspace staff) is enforced by the database.
//
// Client-context reads ("which Brain applies to THIS client?") resolve the
// client's PRIMARY assigned coach and read that coach's Brain through the
// service role — the acting user may be the client (chat) or a different
// staff member, and their own identity must never select the methodology.
// Callers must authorize the client first (exactly like the existing admin
// reads in lib/production/chat.ts); this module never decides who may act.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { getSupabaseAdminClient } from "../supabase/admin.ts";
import { resolveOwnStaffWorkspace } from "./auth.ts";
import {
  buildMethodFromCalibration,
  conservativeAuthorityConfig,
  noConfirmedBrainIntelligence,
  authoritySettings,
  type CoachCalibrationState,
  type CoachConfirmedPatternRule,
  type CoachIntelligence,
  type ConfirmedCoachMethod,
} from "../coach/coach-brain.ts";
import type { CoachOnboardingAnswers } from "../coach/coach-onboarding-questions.ts";
import { CHAPTER_ORDER } from "../coach/calibration/questions.ts";
import { validateCalibrationAnswers } from "../coach/calibration/validate.ts";
import { isV2Answers, mapV1AnswersToV2 } from "../coach/calibration/v1-migration.ts";
import type { CalibrationAnswers, CalibrationChapterId } from "../coach/calibration/types.ts";
import type { AiAuthorityConfig, AiAuthorityLevel, CoachAiAuthoritySettings } from "../coach/ai-authority.ts";
import { AI_AUTHORITY_LEVELS } from "../coach/ai-authority.ts";
import type { CoachOperatingModel } from "../coach/operating-model.ts";

type Db = Awaited<ReturnType<typeof getSupabaseServerClient>> | ReturnType<typeof getSupabaseAdminClient>;

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface BrainRow {
  id: string;
  workspace_id: string;
  coach_user_id: string;
  calibration_status: CoachCalibrationState;
  active_method_version_id: string | null;
  calibrated_at: string | null;
}

interface MethodVersionRow {
  id: string;
  version: number;
  source: ConfirmedCoachMethod["source"];
  operating_model: CoachOperatingModel;
  ai_authority: CoachAiAuthoritySettings;
  /** v2 answers for methods confirmed since Gate 3.1; v1 answers before. */
  calibration_answers: CalibrationAnswers | CoachOnboardingAnswers;
  confirmed_at: string;
}

export interface CalibrationProgress {
  mode: "initial" | "review";
  baseMethodVersionId: string | null;
  answers: CalibrationAnswers;
  aiAuthority: AiAuthorityConfig | null;
  aiAuthorityConfirmedAtIso: string | null;
  currentChapterId: CalibrationChapterId | null;
  currentQuestionIndex: number;
  startedAtIso: string;
  updatedAtIso: string;
  reviewReachedAtIso: string | null;
  completedAtIso: string | null;
}

const BRAIN_COLUMNS = "id, workspace_id, coach_user_id, calibration_status, active_method_version_id, calibrated_at";
const VERSION_COLUMNS = "id, version, source, operating_model, ai_authority, calibration_answers, confirmed_at";
const PROGRESS_COLUMNS =
  "mode, base_method_version_id, answers, ai_authority, ai_authority_confirmed_at, current_chapter_id, current_question_index, started_at, updated_at, review_reached_at, completed_at";

function toMethod(row: MethodVersionRow): ConfirmedCoachMethod {
  return { versionId: row.id, version: row.version, source: row.source, confirmedAtIso: row.confirmed_at, operatingModel: row.operating_model, aiAuthority: row.ai_authority };
}

/** In-progress answers saved before Gate 3.1 (v1) are carried forward into
 * v2 with the same mapping a method refinement uses — changed meanings are
 * flagged for the coach to confirm; nothing is defaulted. */
function normalizeProgressAnswers(raw: Record<string, unknown>): CalibrationAnswers {
  if (Object.keys(raw).length === 0 || isV2Answers(raw)) return raw as CalibrationAnswers;
  return mapV1AnswersToV2(raw as CoachOnboardingAnswers).answers;
}

function toProgress(row: Record<string, unknown>): CalibrationProgress {
  const chapter = row.current_chapter_id as string | null;
  return {
    mode: row.mode as CalibrationProgress["mode"],
    baseMethodVersionId: (row.base_method_version_id as string | null) ?? null,
    answers: normalizeProgressAnswers((row.answers as Record<string, unknown>) ?? {}),
    aiAuthority: (row.ai_authority as AiAuthorityConfig | null) ?? null,
    aiAuthorityConfirmedAtIso: (row.ai_authority_confirmed_at as string | null) ?? null,
    currentChapterId: chapter && (CHAPTER_ORDER as readonly string[]).includes(chapter) ? (chapter as CalibrationChapterId) : null,
    currentQuestionIndex: (row.current_question_index as number) ?? 0,
    startedAtIso: row.started_at as string,
    updatedAtIso: row.updated_at as string,
    reviewReachedAtIso: (row.review_reached_at as string | null) ?? null,
    completedAtIso: (row.completed_at as string | null) ?? null,
  };
}

async function readBrain(db: Db, workspaceId: string, coachUserId: string): Promise<BrainRow | null> {
  const { data, error } = await db.from("coach_brains").select(BRAIN_COLUMNS).eq("workspace_id", workspaceId).eq("coach_user_id", coachUserId).maybeSingle();
  if (error) throw new Error(`coach brain read failed: ${error.message}`);
  return (data as BrainRow | null) ?? null;
}

async function readVersion(db: Db, versionId: string): Promise<MethodVersionRow | null> {
  const { data, error } = await db.from("coach_method_versions").select(VERSION_COLUMNS).eq("id", versionId).maybeSingle();
  if (error) throw new Error(`coach method version read failed: ${error.message}`);
  return (data as MethodVersionRow | null) ?? null;
}

/** Calibrated only with a real, readable, active coach-confirmed version. */
function calibrationStateOf(brain: BrainRow | null, active: MethodVersionRow | null, progress: CalibrationProgress | null): CoachCalibrationState {
  if (brain?.calibration_status === "calibrated" && active) return "calibrated";
  if (progress && (Object.keys(progress.answers).length > 0 || progress.aiAuthorityConfirmedAtIso)) return "in_progress";
  return "not_started";
}

// ---------------------------------------------------------------------------
// The signed-in coach's own Brain
// ---------------------------------------------------------------------------

export interface OwnCoachBrainState {
  workspaceId: string;
  coachUserId: string;
  coachDisplayName: string;
  calibration: { state: CoachCalibrationState; calibratedAtIso: string | null };
  activeMethod: ConfirmedCoachMethod | null;
  /** The explicit answers the active method was confirmed from (v1 or v2). */
  activeCalibrationAnswers: CalibrationAnswers | CoachOnboardingAnswers | null;
  progress: CalibrationProgress | null;
}

export async function getOwnCoachBrainState(): Promise<OwnCoachBrainState> {
  const { workspaceId, coachUserId, coachDisplayName } = await resolveOwnStaffWorkspace();
  const supabase = await getSupabaseServerClient();
  const brain = await readBrain(supabase, workspaceId, coachUserId);
  const [activeRow, progressRes] = await Promise.all([
    brain?.active_method_version_id ? readVersion(supabase, brain.active_method_version_id) : Promise.resolve(null),
    supabase.from("coach_calibration_progress").select(PROGRESS_COLUMNS).eq("workspace_id", workspaceId).eq("coach_user_id", coachUserId).maybeSingle(),
  ]);
  if (progressRes.error) throw new Error(`calibration progress read failed: ${progressRes.error.message}`);
  const progress = progressRes.data ? toProgress(progressRes.data as Record<string, unknown>) : null;
  const state = calibrationStateOf(brain, activeRow, progress);
  return {
    workspaceId,
    coachUserId,
    coachDisplayName,
    calibration: { state, calibratedAtIso: state === "calibrated" ? (brain?.calibrated_at ?? null) : null },
    activeMethod: state === "calibrated" && activeRow ? toMethod(activeRow) : null,
    activeCalibrationAnswers: state === "calibrated" && activeRow ? activeRow.calibration_answers : null,
    progress,
  };
}

/** The guard's question. True only for a confirmed, active Coach Brain. */
export async function isOwnCoachCalibrated(): Promise<boolean> {
  return (await getOwnCoachBrainState()).calibration.state === "calibrated";
}

async function ensureOwnBrain(workspaceId: string, coachUserId: string): Promise<BrainRow> {
  const supabase = await getSupabaseServerClient();
  const existing = await readBrain(supabase, workspaceId, coachUserId);
  if (existing) return existing;
  const { error } = await supabase.from("coach_brains").insert({ workspace_id: workspaceId, coach_user_id: coachUserId });
  // A concurrent first save may have created it — re-read either way.
  if (error && !/duplicate key/i.test(error.message)) throw new Error(`coach brain create failed: ${error.message}`);
  const created = await readBrain(supabase, workspaceId, coachUserId);
  if (!created) throw new Error("coach brain create failed: not readable after insert");
  return created;
}

// ---------------------------------------------------------------------------
// Calibration progress — save after every answer
// ---------------------------------------------------------------------------

/** Re-validates every answer against its own question (shape, options,
 * units, ranges, decision structure). A malformed answer is refused — the UI
 * must not treat it as saved. */
function sanitizeAnswers(raw: CalibrationAnswers): CalibrationAnswers {
  const result = validateCalibrationAnswers(raw);
  if (!result.ok) throw new Error(result.message);
  return result.answers;
}

function sanitizeAuthority(config: AiAuthorityConfig | null | undefined): AiAuthorityConfig | null {
  if (!config || !(AI_AUTHORITY_LEVELS as readonly string[]).includes(config.level)) return null;
  const overrides: AiAuthorityConfig["domainOverrides"] = {};
  for (const [domain, level] of Object.entries(config.domainOverrides ?? {})) {
    if ((AI_AUTHORITY_LEVELS as readonly string[]).includes(level as string)) (overrides as Record<string, AiAuthorityLevel>)[domain] = level as AiAuthorityLevel;
  }
  return { level: config.level, domainOverrides: overrides };
}

export interface SaveCalibrationInput {
  answers?: CalibrationAnswers;
  position?: { chapterId: CalibrationChapterId; questionIndex: number };
  aiAuthority?: AiAuthorityConfig;
  aiAuthorityConfirmed?: boolean;
  reviewReached?: boolean;
}

/** Persists the coach's own calibration progress. Throws on any failure —
 * the UI must not advance on an unsaved answer. Refuses to write into a
 * completed initial calibration (a calibrated coach edits through an
 * explicit method review instead). */
export async function saveOwnCalibrationProgress(input: SaveCalibrationInput): Promise<{ updatedAtIso: string }> {
  const { workspaceId, coachUserId } = await resolveOwnStaffWorkspace();
  const supabase = await getSupabaseServerClient();
  const brain = await ensureOwnBrain(workspaceId, coachUserId);
  const nowIso = new Date().toISOString();

  const { data: existingRow, error: readError } = await supabase.from("coach_calibration_progress").select(PROGRESS_COLUMNS).eq("workspace_id", workspaceId).eq("coach_user_id", coachUserId).maybeSingle();
  if (readError) throw new Error(`calibration progress read failed: ${readError.message}`);
  const existing = existingRow ? toProgress(existingRow as Record<string, unknown>) : null;
  if (existing?.completedAtIso) throw new Error("This calibration is already confirmed. Start a method review to make changes.");
  if (!existing && brain.calibration_status === "calibrated") throw new Error("Your method is already confirmed. Start a method review to make changes.");

  const patch: Record<string, unknown> = { updated_at: nowIso };
  if (input.answers) patch.answers = sanitizeAnswers(input.answers);
  if (input.position && (CHAPTER_ORDER as readonly string[]).includes(input.position.chapterId) && Number.isInteger(input.position.questionIndex) && input.position.questionIndex >= 0) {
    patch.current_chapter_id = input.position.chapterId;
    patch.current_question_index = input.position.questionIndex;
  }
  if (input.aiAuthority) {
    const authority = sanitizeAuthority(input.aiAuthority);
    if (!authority) throw new Error("That AI authority setting isn't valid.");
    patch.ai_authority = authority;
  }
  if (input.aiAuthorityConfirmed) patch.ai_authority_confirmed_at = nowIso;
  if (input.reviewReached) patch.review_reached_at = existing?.reviewReachedAtIso ?? nowIso;

  if (existing) {
    const { data, error } = await supabase.from("coach_calibration_progress").update(patch).eq("workspace_id", workspaceId).eq("coach_user_id", coachUserId).is("completed_at", null).select("updated_at");
    if (error) throw new Error(`calibration save failed: ${error.message}`);
    if (!data || data.length === 0) throw new Error("calibration save failed: nothing was saved");
  } else {
    const { error } = await supabase.from("coach_calibration_progress").insert({ workspace_id: workspaceId, coach_user_id: coachUserId, mode: "initial", answers: {}, ...patch });
    if (error) throw new Error(`calibration save failed: ${error.message}`);
  }

  if (brain.calibration_status === "not_started") {
    await supabase.from("coach_brains").update({ calibration_status: "in_progress", updated_at: nowIso }).eq("id", brain.id).eq("calibration_status", "not_started");
  }
  return { updatedAtIso: nowIso };
}

/** Opens (or resumes) a method-review draft prefilled from the active
 * method. The active method stays active and unchanged until the coach
 * explicitly confirms the review. */
export async function startOwnMethodReview(): Promise<void> {
  const state = await getOwnCoachBrainState();
  if (state.calibration.state !== "calibrated" || !state.activeMethod) throw new Error("Finish calibration before reviewing your method.");
  const open = state.progress && !state.progress.completedAtIso && state.progress.mode === "review" && state.progress.baseMethodVersionId === state.activeMethod.versionId;
  if (open) return;
  const supabase = await getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  // Gate 3.1 — a v1 method is refined into v2: answers with the same
  // meaning carry over, changed meanings are flagged for confirmation, and
  // questions v2 adds stay unanswered. The active method is untouched.
  const activeAnswers = (state.activeCalibrationAnswers ?? {}) as Record<string, unknown>;
  const draftAnswers = isV2Answers(activeAnswers) ? (activeAnswers as CalibrationAnswers) : mapV1AnswersToV2(activeAnswers as CoachOnboardingAnswers).answers;
  const draft = {
    mode: "review",
    base_method_version_id: state.activeMethod.versionId,
    answers: draftAnswers,
    ai_authority: state.activeMethod.aiAuthority.global,
    // Prefilled from the coach's own confirmed authority — already explicit.
    ai_authority_confirmed_at: nowIso,
    current_chapter_id: "review",
    current_question_index: 0,
    started_at: nowIso,
    updated_at: nowIso,
    review_reached_at: nowIso,
    completed_at: null,
    confirmed_method_version_id: null,
  };
  const { data, error } = await supabase.from("coach_calibration_progress").update(draft).eq("workspace_id", state.workspaceId).eq("coach_user_id", state.coachUserId).select("id");
  if (error) throw new Error(`method review start failed: ${error.message}`);
  if (!data || data.length === 0) {
    const { error: insertError } = await supabase.from("coach_calibration_progress").insert({ workspace_id: state.workspaceId, coach_user_id: state.coachUserId, ...draft });
    if (insertError) throw new Error(`method review start failed: ${insertError.message}`);
  }
}

/** Abandons an open method-review draft. The active method is untouched. */
export async function discardOwnMethodReview(): Promise<void> {
  const { workspaceId, coachUserId } = await resolveOwnStaffWorkspace();
  const supabase = await getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("coach_calibration_progress")
    .update({ completed_at: nowIso, updated_at: nowIso })
    .eq("workspace_id", workspaceId)
    .eq("coach_user_id", coachUserId)
    .eq("mode", "review")
    .is("completed_at", null);
  if (error) throw new Error(`method review discard failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Explicit confirmation — the only way methodology changes
// ---------------------------------------------------------------------------

async function businessNameFor(workspaceId: string): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("workspaces").select("business_name").eq("id", workspaceId).maybeSingle();
  return (data?.business_name as string | undefined) ?? "OPTIM";
}

/** Validates the coach's explicit answers, maps them into a structured method
 * with coach provenance, and confirms it atomically (confirm_coach_method):
 * new immutable version, brain → calibrated with it active, progress closed.
 * Throws — and changes nothing — if any step fails. */
export async function confirmOwnCalibration(): Promise<{ versionId: string; version: number }> {
  const state = await getOwnCoachBrainState();
  const progress = state.progress;
  if (!progress || progress.completedAtIso) throw new Error("There's no calibration in progress to confirm.");
  const isReview = progress.mode === "review";
  if (isReview && progress.baseMethodVersionId !== (state.activeMethod?.versionId ?? null)) throw new Error("Your method changed since this review started. Start the review again.");

  const nowIso = new Date().toISOString();
  const nextVersion = (state.activeMethod?.version ?? 0) + 1;
  const built = buildMethodFromCalibration({
    answers: progress.answers,
    aiAuthority: progress.aiAuthority ?? conservativeAuthorityConfig(),
    aiAuthorityConfirmed: !!progress.aiAuthorityConfirmedAtIso,
    coachUserId: state.coachUserId,
    workspaceId: state.workspaceId,
    businessName: await businessNameFor(state.workspaceId),
    methodVersion: nextVersion,
    nowIso,
  });

  const supabase = await getSupabaseServerClient();
  await ensureOwnBrain(state.workspaceId, state.coachUserId);
  const { data, error } = await supabase.rpc("confirm_coach_method", {
    p_workspace_id: state.workspaceId,
    p_source: isReview ? "method_review" : "calibration",
    p_operating_model: built.operatingModel,
    p_ai_authority: built.aiAuthority,
    p_calibration_answers: built.answers,
    p_expected_active_version_id: state.activeMethod?.versionId ?? null,
  });
  if (error || !data) throw new Error(`Couldn't confirm your coaching method: ${error?.message ?? "no version returned"}`);
  return { versionId: data as string, version: nextVersion };
}

/** A calibrated coach's explicit authority change (Settings). Creates a new
 * confirmed version with the same methodology and the new authority — never
 * mutates history, never applies to another coach. */
export async function updateOwnAuthority(config: AiAuthorityConfig): Promise<CoachAiAuthoritySettings> {
  const state = await getOwnCoachBrainState();
  if (!state.activeMethod) throw new Error("Finish calibration before changing OPTIM's authority.");
  const authority = sanitizeAuthority(config);
  if (!authority) throw new Error("That AI authority setting isn't valid.");
  const nowIso = new Date().toISOString();
  const settings = authoritySettings({ coachUserId: state.coachUserId, workspaceId: state.workspaceId, global: authority, nowIso });
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("confirm_coach_method", {
    p_workspace_id: state.workspaceId,
    p_source: "authority_update",
    p_operating_model: { ...state.activeMethod.operatingModel, version: state.activeMethod.version + 1, activatedAtIso: nowIso, createdAtIso: nowIso },
    p_ai_authority: settings,
    p_calibration_answers: state.activeCalibrationAnswers ?? {},
    p_expected_active_version_id: state.activeMethod.versionId,
  });
  if (error) throw new Error(`Couldn't save OPTIM's authority: ${error.message}`);
  return settings;
}

// ---------------------------------------------------------------------------
// Canonical CoachIntelligence
// ---------------------------------------------------------------------------

async function confirmedPatternRules(db: Db, workspaceId: string, coachUserId: string, clientProfileId: string | null): Promise<CoachConfirmedPatternRule[]> {
  let query = db.from("coach_learned_rules").select("id, scope, client_profile_id, decision_domain, field").eq("workspace_id", workspaceId).eq("coach_user_id", coachUserId).eq("status", "active");
  query = clientProfileId ? query.or(`scope.eq.coach_general,and(scope.eq.client_specific,client_profile_id.eq.${clientProfileId})`) : query.eq("scope", "coach_general");
  const { data, error } = await query;
  if (error) throw new Error(`learned rules read failed: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id as string, scope: r.scope as CoachConfirmedPatternRule["scope"], clientProfileId: (r.client_profile_id as string | null) ?? null, decisionDomain: r.decision_domain as string, field: r.field as string }));
}

async function composeIntelligence(db: Db, owner: { coachUserId: string; workspaceId: string }, resolution: CoachIntelligence["ownerResolution"], clientProfileId: string | null): Promise<CoachIntelligence> {
  const nowIso = new Date().toISOString();
  const brain = await readBrain(db, owner.workspaceId, owner.coachUserId);
  const active = brain?.active_method_version_id ? await readVersion(db, brain.active_method_version_id) : null;
  const state = calibrationStateOf(brain, active, null);
  if (state !== "calibrated" || !active || !brain) {
    return noConfirmedBrainIntelligence({ owner, ownerResolution: resolution, calibrationState: brain?.calibration_status === "in_progress" ? "in_progress" : "not_started", nowIso });
  }
  const method = toMethod(active);
  let rules: CoachConfirmedPatternRule[] = [];
  try {
    rules = await confirmedPatternRules(db, owner.workspaceId, owner.coachUserId, clientProfileId);
  } catch (err) {
    console.error(`composeIntelligence: learned rules unavailable — ${err instanceof Error ? err.message : String(err)}`);
  }
  return {
    owner,
    ownerResolution: resolution,
    calibration: { state: "calibrated", calibratedAtIso: brain.calibrated_at },
    method,
    authority: { settings: method.aiAuthority, source: "coach_confirmed" },
    learning: { confirmedPatternRules: rules, inferredTendencies: [] },
  };
}

/** The signed-in coach's own intelligence (dashboard, settings, pattern
 * analysis). Runs under the coach's own RLS. */
export async function getOwnCoachIntelligence(): Promise<CoachIntelligence> {
  const { workspaceId, coachUserId } = await resolveOwnStaffWorkspace();
  const supabase = await getSupabaseServerClient();
  return composeIntelligence(supabase, { coachUserId, workspaceId }, "self", null);
}

/**
 * The intelligence that applies to a client: their PRIMARY assigned coach's
 * Brain — regardless of who is acting. Reads via the service role; the
 * CALLER must already have authorized access to this client (assigned
 * coach / workspace staff / the client themself). A client with no primary
 * coach gets the conservative no-Brain intelligence — never a guess at
 * "some other assigned coach".
 */
export async function resolveCoachIntelligenceForClient(params: { workspaceId: string; clientProfileId: string }): Promise<CoachIntelligence> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("coach_client_assignments")
    .select("coach_user_id")
    .eq("workspace_id", params.workspaceId)
    .eq("client_profile_id", params.clientProfileId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) throw new Error(`primary coach lookup failed: ${error.message}`);
  if (!data) {
    return noConfirmedBrainIntelligence({ owner: null, ownerResolution: "no_primary_coach", calibrationState: "not_started", nowIso: new Date().toISOString() });
  }
  return composeIntelligence(admin, { coachUserId: data.coach_user_id as string, workspaceId: params.workspaceId }, "primary_coach", params.clientProfileId);
}
