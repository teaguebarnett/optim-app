// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// The Supabase-mode analog of the demo prototype's SAVE_ONBOARDING_STEP /
// COMPLETE_ONBOARDING platform-store actions (lib/coach/platform-store.ts) —
// real persistence for components/onboarding/onboarding-wizard.tsx's own
// chapter-by-chapter save, reusing that exact same OnboardingProgress shape
// (lib/coach/types.ts) so every existing pure onboarding function
// (lib/coach/onboarding-steps.ts's field logic, lib/coach/activation-brief.ts,
// lib/coach/activation-generation.ts's extractClientSnapshot,
// lib/coach/programming-profile.ts's extractClientProgrammingProfile) keeps
// working unchanged against a Supabase-sourced OnboardingProgress exactly as
// it already does against a demo/platform-store one — see
// getOnboardingProgressAsSharedShape below, the one seam that makes this
// true.
//
// Client-authored only (see 20260911000013_client_onboarding_progress.sql's
// own header): this module never lets a coach write onboarding answers on a
// client's behalf, and a client can only ever write their OWN row
// (resolveOwnClientIdentity, not a client-supplied id).

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { resolveOwnClientIdentity } from "./identity.ts";
import type { OnboardingProgress, OnboardingStepAnswers, OnboardingStepId } from "../coach/types";

interface OnboardingProgressRow {
  current_step_index: number;
  answers: unknown;
  completed_at: string | null;
  updated_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Loose structural check only — every individual chapter's answers are
 * whatever OnboardingFieldInput happened to write (primitives, string
 * arrays, InjuryEntry[]), the same "trust this app's own writer, guard
 * against a foreign/corrupt row" tradeoff lib/production/validation.ts's
 * own header documents for every other jsonb payload in this codebase. */
function toAnswers(raw: unknown): Partial<Record<OnboardingStepId, OnboardingStepAnswers>> {
  if (!isRecord(raw)) return {};
  return raw as Partial<Record<OnboardingStepId, OnboardingStepAnswers>>;
}

function rowToProgress(row: OnboardingProgressRow, clientProfileId: string, workspaceId: string): OnboardingProgress {
  return {
    clientId: clientProfileId,
    workspaceId,
    currentStepIndex: row.current_step_index,
    answers: toAnswers(row.answers),
    completedAtIso: row.completed_at ?? undefined,
    updatedAtIso: row.updated_at,
  };
}

/** The one read every coach-facing surface needs: this client's real
 * onboarding progress, in the exact shared OnboardingProgress shape demo
 * mode's lib/coach/repository.ts's getOnboardingProgress already returns.
 * Staff read access is RLS-enforced (can_access_client); a coach outside
 * this client's workspace/assignment gets zero rows back, never an error
 * that leaks whether the row exists. */
export async function getOnboardingProgressForClient(clientProfileId: string): Promise<OnboardingProgress | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_onboarding_progress")
    .select("current_step_index, answers, completed_at, updated_at, workspace_id")
    .eq("client_profile_id", clientProfileId)
    .maybeSingle();
  if (error) throw new Error(`getOnboardingProgressForClient failed: ${error.message}`);
  if (!data) return null;
  return rowToProgress(data, clientProfileId, data.workspace_id as string);
}

/** The client's own view of their own progress — resolves identity from the
 * authenticated session, never a client-supplied clientId. */
export async function getMyOnboardingProgress(): Promise<{ identity: Awaited<ReturnType<typeof resolveOwnClientIdentity>>; progress: OnboardingProgress | null }> {
  const identity = await resolveOwnClientIdentity();
  const progress = await getOnboardingProgressForClient(identity.clientProfileId);
  return { identity, progress };
}

/** Upserts one completed chapter's answers — mirrors SAVE_ONBOARDING_STEP's
 * merge-in-place semantics (previously answered chapters are preserved,
 * only `stepId`'s chapter is replaced) exactly, so resuming mid-flow never
 * loses an earlier chapter's real answers. */
export async function saveOnboardingStep(params: {
  stepId: OnboardingStepId;
  answers: OnboardingStepAnswers;
  nextStepIndex: number;
}): Promise<OnboardingProgress> {
  const identity = await resolveOwnClientIdentity();
  const supabase = await getSupabaseServerClient();

  const existing = await getOnboardingProgressForClient(identity.clientProfileId);
  const mergedAnswers = { ...(existing?.answers ?? {}), [params.stepId]: params.answers };

  const { data, error } = await supabase
    .from("client_onboarding_progress")
    .upsert(
      {
        workspace_id: identity.workspaceId,
        client_profile_id: identity.clientProfileId,
        current_step_index: params.nextStepIndex,
        answers: mergedAnswers,
      },
      { onConflict: "client_profile_id" }
    )
    .select("current_step_index, answers, completed_at, updated_at, workspace_id")
    .single();
  if (error) throw new Error(`saveOnboardingStep failed: ${error.message}`);
  return rowToProgress(data, identity.clientProfileId, data.workspace_id as string);
}

/** Marks onboarding complete — the moment lib/production/roster.ts's
 * deriveLifecycle starts reporting this client as "coach_setup" ("awaiting
 * coach review") instead of "onboarding". Never touches client_enrollments
 * (client-writable rows never do — see the new table's own header); the
 * coach's own review/activation is a completely separate, staff-only
 * transition (see setClientProgramStartDate / activateClientEnrollment in
 * lib/production/programs.ts). */
export async function completeOnboarding(finalAnswers: OnboardingStepAnswers): Promise<OnboardingProgress> {
  const identity = await resolveOwnClientIdentity();
  const supabase = await getSupabaseServerClient();

  const existing = await getOnboardingProgressForClient(identity.clientProfileId);
  const mergedAnswers = { ...(existing?.answers ?? {}), review: finalAnswers };
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("client_onboarding_progress")
    .upsert(
      {
        workspace_id: identity.workspaceId,
        client_profile_id: identity.clientProfileId,
        answers: mergedAnswers,
        completed_at: nowIso,
      },
      { onConflict: "client_profile_id" }
    )
    .select("current_step_index, answers, completed_at, updated_at, workspace_id")
    .single();
  if (error) throw new Error(`completeOnboarding failed: ${error.message}`);
  return rowToProgress(data, identity.clientProfileId, data.workspace_id as string);
}
