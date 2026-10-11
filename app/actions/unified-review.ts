"use server";

// Gate U3B — the coach-callable surface over lib/production/unified-review.ts. Every action re-derives the caller
// server-side (the client's assigned coach or a workspace admin — requireAssignedCoach), loads the client's CURRENT
// planning input, coach method and active program, and returns either the refreshed review or a plain error message
// (Server Action errors are masked in production, so failures are returned, never thrown). Nothing here publishes,
// assigns or notifies.

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireAssignedCoach, resolveGenerationContext } from "@/lib/production/reasoner-lifecycle";
import { loadSynthesisInputForClient } from "@/lib/production/synthesis";
import { getActiveProgramAssignment, getPendingProgramProposal } from "@/lib/production/programs";
import { FOUNDATION_KNOWLEDGE } from "@/lib/synthesis/knowledge/registry";
import { createUnifiedDraftForClient } from "@/lib/production/unified-proposals";
import { prepareUnifiedProposalForClient, type PrepareOutcome } from "@/lib/production/unified-prepare";
import { UnauthenticatedError, UnauthorizedError } from "@/lib/production/errors";
import { planUnifiedPublication, publishUnifiedProposal, type PublicationExpectation, type PublicationPlan } from "@/lib/production/unified-publication";
import {
  approveUnifiedProposal,
  editUnifiedNutrition,
  editUnifiedTraining,
  getUnifiedReview,
  recordUnifiedDecision,
  rejectUnifiedProposal,
  withdrawUnifiedExclusion,
  type NutritionEdit,
  type ReviewEnv,
  type TrainingEdit,
  type UnifiedReviewView,
} from "@/lib/production/unified-review";

export type UnifiedReviewResult = { ok: true; view: UnifiedReviewView } | { ok: false; error: string };

interface Scope {
  workspaceId: string;
  clientProfileId: string;
}

async function reviewEnv(scope: Scope): Promise<ReviewEnv> {
  const ctx = await requireAssignedCoach(scope.workspaceId, scope.clientProfileId);
  const [supabase, input, generation, active] = await Promise.all([
    getSupabaseServerClient(),
    loadSynthesisInputForClient(scope.clientProfileId),
    resolveGenerationContext(scope.workspaceId, scope.clientProfileId),
    getActiveProgramAssignment(scope.clientProfileId),
  ]);
  return { supabase, userId: ctx.userId, clientProfileId: scope.clientProfileId, input, knowledge: FOUNDATION_KNOWLEDGE, currentMethodVersionId: generation.method?.versionId ?? null, activeProgramVersionId: active?.versionId ?? null, nowIso: new Date().toISOString() };
}

async function run(scope: Scope, f: (env: ReviewEnv) => Promise<UnifiedReviewView>): Promise<UnifiedReviewResult> {
  try {
    return { ok: true, view: await f(await reviewEnv(scope)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong — reload the review and try again." };
  }
}

/** The client's current unified proposal for review, or null when there is none. */
export async function getUnifiedReviewAction(scope: Scope): Promise<UnifiedReviewView | null> {
  return getUnifiedReview(await reviewEnv(scope), scope);
}

export async function recordUnifiedDecisionAction(scope: Scope, p: { rowId: string; key: string; answer: string }): Promise<UnifiedReviewResult> {
  return run(scope, (env) => recordUnifiedDecision(env, p));
}

/** Withdraws an exclusion decision — the original question opens again for the coach. */
export async function withdrawUnifiedExclusionAction(scope: Scope, p: { rowId: string; key: string }): Promise<UnifiedReviewResult> {
  return run(scope, (env) => withdrawUnifiedExclusion(env, p));
}

export async function editUnifiedTrainingAction(scope: Scope, p: { rowId: string; expectedVersionId: string; edit: TrainingEdit }): Promise<UnifiedReviewResult> {
  return run(scope, (env) => editUnifiedTraining(env, p));
}

export async function editUnifiedNutritionAction(scope: Scope, p: { rowId: string; expectedVersionId: string; edit: NutritionEdit }): Promise<UnifiedReviewResult> {
  return run(scope, (env) => editUnifiedNutrition(env, p));
}

/** Records the coach's approval of exactly the reviewed versions. Publishes, assigns and notifies nothing (U3C). */
export async function approveUnifiedProposalAction(scope: Scope, p: { rowId: string; expected: { training: string | null; nutrition: string | null } }): Promise<UnifiedReviewResult> {
  return run(scope, (env) => approveUnifiedProposal(env, p));
}

export async function rejectUnifiedProposalAction(scope: Scope, p: { rowId: string; reason?: string }): Promise<UnifiedReviewResult> {
  return run(scope, (env) => rejectUnifiedProposal(env, p));
}

/** Gate U3C — what publishing would do (replacements, start date, supersession) and what still blocks it. */
export async function planUnifiedPublicationAction(scope: Scope, p: { rowId: string }): Promise<{ ok: true; plan: PublicationPlan } | { ok: false; error: string }> {
  try {
    return { ok: true, plan: (await planUnifiedPublication(await reviewEnv(scope), p.rowId)).plan };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't prepare publication — reload and try again." };
  }
}

/** Gate U3C — publishes the approved proposal to the client atomically (training + nutrition, assignments, start
 * date, supersession, in-app notification) — all or nothing; a retry returns the same publication. */
export async function publishUnifiedProposalAction(scope: Scope, p: { rowId: string; expected: PublicationExpectation }): Promise<UnifiedReviewResult> {
  return run(scope, async (env) => (await publishUnifiedProposal(env, p)).view);
}

/** Production: the coach prepares ONE unified proposal for this client — their existing lifting + OPTIM's cardio and
 * nutrition, as drafts for review. Allowlisted clients only, one open proposal at a time, idempotent, with a hard
 * model-call budget (lib/production/unified-prepare-policy.ts). Never approves, publishes or notifies. */
export async function prepareUnifiedProposalAction(scope: Scope, p?: { title?: string }): Promise<PrepareOutcome> {
  try {
    return await prepareUnifiedProposalForClient({ ...scope, title: p?.title?.trim() || "Unified program" });
  } catch (err) {
    console.error("prepareUnifiedProposalAction failed", err);
    if (err instanceof UnauthenticatedError) return { ok: false, code: "unauthenticated", message: "Your session has ended — sign in again.", modelCalls: 0 };
    if (err instanceof UnauthorizedError) return { ok: false, code: "forbidden", message: "You can only prepare proposals for your own clients.", modelCalls: 0 };
    return { ok: false, code: "error", message: "Couldn't prepare the proposal — try again.", modelCalls: 0 };
  }
}

/** LOCAL QA ONLY — prepares a unified proposal through the real server pipeline with OPTIM's scripted domain models
 * (no provider call). Refuses unless the local test provider is enabled AND Supabase is the local stack — the same
 * guard lib/production/reasoner-proposals.ts uses for its local test provider. There is no UI for it. */
export async function prepareUnifiedProposalLocalQaAction(scope: Scope, p: { title: string }): Promise<{ ok: boolean; message: string }> {
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (!process.env.OPTIM_REASONER_TEST_PROVIDER || !local) return { ok: false, message: "Not available." };
  const { routerModel } = await import("@/lib/synthesis/unified/eval/fixtures");
  // Like the planned production prepare: the coach's existing pending lifting draft is used unchanged when there is one.
  const pending = await getPendingProgramProposal(scope.workspaceId, scope.clientProfileId);
  const out = await createUnifiedDraftForClient({ workspaceId: scope.workspaceId, clientProfileId: scope.clientProfileId, title: p.title, model: routerModel(), existingResistanceDraft: pending ? { versionId: pending.versionId, content: pending.content } : null });
  return { ok: true, message: out.kind === "completed" ? `completed ${out.rowId} → ${out.result.status}` : out.kind };
}
