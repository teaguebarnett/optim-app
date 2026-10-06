// Gate 4.0C-5 — constraint-aware proposal lifecycle (production side).
//
//   coach confirms a material fact (limitations, an exercise decision, preflight answers)
//   → the client's authoritative planning state changes (planning-state.ts)
//   → the pending Reasoner draft is assessed against it (lifecycle.ts)
//   → SUPERSEDED: exactly ONE Reasoner revision is queued from the CURRENT state
//     (idempotent per state + superseded lineage; never recursive; never while another job runs)
//   → the revision is saved as the NEXT VERSION of the same program; the superseded drafts
//     are archived unchanged (immutable history), and nothing is approved or published.
//
// The coach's explicit confirmation is the authorization for that one draft revision. Changes
// the coach did not confirm here (client intake edits, a new Coach Brain version) supersede the
// draft too, but the revision then waits for the coach's explicit request.

import "server-only";
import { after } from "next/server";
import { getAuthenticatedContext, isWorkspaceStaffRole, requireWorkspaceRole } from "./auth.ts";
import { UnauthorizedError } from "./errors.ts";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { resolveCoachIntelligenceForClient } from "./coach-brain.ts";
import { getOnboardingProgressForClient } from "./onboarding.ts";
import { resolveHealthReviewRecordForClient } from "./pain-safety.ts";
import { loadSynthesisInputForClient } from "./synthesis.ts";
import { archiveSiblingDraftVersions, createDraftProgramVersion, getGeneratedVersionForJob, getPendingProgramProposal } from "./programs.ts";
import { validateUniversalTrainingProgramContent } from "./validation.ts";
import { getLatestReasonerJob, getReasonerRunForJob, isReasonerProposalEnabled, listRevisionJobs, runReasonerJob, startReasonerJob } from "./reasoner-proposals.ts";
import { extractClientProgrammingProfile } from "../coach/programming-profile.ts";
import { buildGenerationInputs, evaluateGenerationPrerequisites } from "../coach/generation-prerequisites.ts";
import { FOUNDATION_KNOWLEDGE, FOUNDATION_KNOWLEDGE_VERSION } from "../synthesis/knowledge/registry.ts";
import { effectiveExerciseDecisions } from "../synthesis/limitations/exercise-decisions.ts";
import { currentPlanningState, decideGenerationAfterPreflight, decideRevision, type CurrentPlanningInputs, type LifecycleAssessment, type RevisionTrigger } from "../synthesis/reasoner/lifecycle.ts";
import { reasonerReviewModel } from "../synthesis/reasoner/review-gate.ts";
import { reasonerResultToProgramContent } from "../synthesis/reasoner/to-program.ts";
import type { ReasonerResult } from "../synthesis/reasoner/reasoner.ts";
import type { JobIntent, ReasonerJobView } from "../synthesis/reasoner/proposal-job.ts";
import type { SynthesisInput } from "../synthesis/synthesis-input.ts";
import type { PlanningState } from "../synthesis/planning-state.ts";
import type { RevisionProvenance } from "../training/types.ts";
import { isKnown } from "../synthesis/facts.ts";

export async function requireAssignedCoach(workspaceId: string, clientProfileId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  const supabase = await getSupabaseServerClient();
  const { data: profile } = await supabase.from("client_profiles").select("id").eq("id", clientProfileId).eq("workspace_id", workspaceId).maybeSingle();
  if (!profile) throw new UnauthorizedError();
  if (membership.role === "coach") {
    const { data } = await supabase.from("coach_client_assignments").select("coach_user_id").eq("client_profile_id", clientProfileId).eq("coach_user_id", ctx.userId).maybeSingle();
    if (!data) throw new UnauthorizedError();
  }
  return ctx;
}

/** Everything a NEW proposal may be generated from, and whether it is allowed at all (moved from the actions module). */
export async function resolveGenerationContext(workspaceId: string, clientProfileId: string) {
  const [intelligence, onboarding, healthReview] = await Promise.all([resolveCoachIntelligenceForClient({ workspaceId, clientProfileId }), getOnboardingProgressForClient(clientProfileId), resolveHealthReviewRecordForClient(clientProfileId, workspaceId)]);
  const method = intelligence.method;
  const intake = extractClientProgrammingProfile(onboarding, healthReview);
  const prerequisites = evaluateGenerationPrerequisites({ playbook: method ? { version: method.version, operatingModel: method.operatingModel } : null, onboarding, intake, clientProfileId });
  return { intelligence, method, onboarding, prerequisites };
}

/** The client's CURRENT authoritative planning inputs and their material fingerprint. */
export async function planningContextFor(clientProfileId: string): Promise<{ input: SynthesisInput; current: CurrentPlanningInputs; state: PlanningState }> {
  const input = await loadSynthesisInputForClient(clientProfileId);
  const current: CurrentPlanningInputs = { client: input.client, goal: input.goal, constraints: input.constraints, coachMethodVersionId: input.coach?.versionId ?? null, knowledgeVersion: FOUNDATION_KNOWLEDGE_VERSION };
  return { input, current, state: currentPlanningState(current, FOUNDATION_KNOWLEDGE) };
}

interface RevisionTarget {
  programId: string;
  provenance: RevisionProvenance;
}

/**
 * Persists a PLANNED Reasoner result as a DRAFT, re-checking everything that could have changed while the
 * Reasoner ran — including the planning state itself (a result solved under a state that no longer holds is
 * never saved). A revision becomes the next version of the superseded program; that program's other drafts are
 * archived unchanged. Never publishes or assigns.
 */
export async function saveReasonerDraft(params: { workspaceId: string; clientProfileId: string; coachId: string; title: string; jobId: string; result: Extract<ReasonerResult, { status: "PLANNED" }>; intent: JobIntent; revision?: RevisionTarget }): Promise<{ versionId: string } | { superseded: true } | { notSaved: string }> {
  const pending = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
  if (params.revision) {
    if (!pending || pending.programId !== params.revision.programId) return { notSaved: "The proposal this revision replaces was approved or rejected while OPTIM was working, so the revision wasn't saved." };
  } else if (pending) return { superseded: true };
  const { method, onboarding, prerequisites } = await resolveGenerationContext(params.workspaceId, params.clientProfileId);
  if (!prerequisites.ready) return { notSaved: `The proposal wasn't saved because something changed while OPTIM was working: ${prerequisites.missing.map((m) => m.message).join(" ")}` };
  if (params.result.run.versions.coachMethod?.versionId !== method!.versionId) return { notSaved: "The proposal wasn't saved because your coaching method changed while OPTIM was working. Prepare a new one." };
  // The solve must match the state it was started for, and that state must still be current.
  const now = await planningContextFor(params.clientProfileId);
  if (params.result.run.planningState?.key !== params.intent.planningKey || now.state.key !== params.intent.planningKey) return { notSaved: "The client's planning state changed while OPTIM was working, so this proposal wasn't saved — it would already be out of date." };
  const nowIso = new Date().toISOString();
  const plan = params.result.plan;
  const generationInputs = buildGenerationInputs({ playbookVersion: method!.version, methodVersionId: method!.versionId, operatingModel: method!.operatingModel, onboarding: onboarding!, profile: prerequisites.profile, assumptions: prerequisites.assumptions, nowIso, rationale: plan.goalEmphasis.rationale, whyThisPlan: [plan.frequency.rationale, plan.architecture.rationale, plan.progression.rationale].filter(Boolean) });
  const content = reasonerResultToProgramContent({ result: params.result, knowledge: FOUNDATION_KNOWLEDGE, programId: `program-${params.jobId}`, workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: params.coachId, title: params.title, jobId: params.jobId, generationInputs, nowIso, ...(params.revision ? { revision: params.revision.provenance } : {}) });
  validateUniversalTrainingProgramContent(content);
  const { versionId } = await createDraftProgramVersion({ workspaceId: params.workspaceId, ...(params.revision ? { programId: params.revision.programId } : {}), title: params.title, content, proposedForClientProfileId: params.clientProfileId });
  if (params.revision) {
    // The superseded drafts stay as history (archived = immutable); the revision is now the pending proposal.
    try {
      await archiveSiblingDraftVersions({ workspaceId: params.workspaceId, programId: params.revision.programId, resolvedVersionId: versionId });
    } catch (err) {
      console.error(`saveReasonerDraft: archiving superseded drafts failed (revision saved; it is the newest draft): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { versionId };
}

/** Single-flight start of ONE Reasoner job (initial or revision); the model runs after the response. */
export async function startReasonerGeneration(params: { workspaceId: string; clientProfileId: string; coachId: string; title: string; intent: JobIntent; revision?: RevisionTarget }): Promise<{ started: boolean; job: ReasonerJobView }> {
  const { started, job } = await startReasonerJob({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, requestedBy: params.coachId, title: params.title, intent: params.intent });
  if (started)
    after(() =>
      runReasonerJob({
        jobId: job.jobId,
        intent: params.intent,
        loadInput: () => loadSynthesisInputForClient(params.clientProfileId),
        saveDraft: (result) => saveReasonerDraft({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: params.coachId, title: params.title, jobId: job.jobId, result, intent: params.intent, revision: params.revision }),
      })
    );
  return { started, job };
}

export type RevisionQueueResult =
  | { queued: true; job: ReasonerJobView; assessment: LifecycleAssessment }
  | { queued: false; reason: "not_enabled" | "no_reasoner_draft" | "run_unavailable" | "not_material" | "already_prepared" | "in_flight" | "already_attempted"; assessment?: LifecycleAssessment };

/**
 * After a coach's explicit confirmation (or explicit request): queue exactly ONE revision when the pending
 * Reasoner draft is superseded by the current authoritative state. Idempotent — the same state never produces a
 * second revision of the same lineage automatically.
 */
export async function queueRevisionIfMaterial(params: { workspaceId: string; clientProfileId: string; coachId: string; trigger: RevisionTrigger }): Promise<RevisionQueueResult> {
  if (!isReasonerProposalEnabled(params.clientProfileId)) return { queued: false, reason: "not_enabled" };
  const pending = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
  const rp = pending?.content.reasonerProvenance;
  if (!pending || !rp || pending.content.clientFacingFrom) return { queued: false, reason: "no_reasoner_draft" };
  const run = await getReasonerRunForJob(params.workspaceId, rp.jobId);
  if (!run) return { queued: false, reason: "run_unavailable" };
  const ctx = await planningContextFor(params.clientProfileId);
  const generated = await getGeneratedVersionForJob(params.workspaceId, pending.programId, rp.jobId);
  const review = reasonerReviewModel({ content: pending.content, run, knowledge: FOUNDATION_KNOWLEDGE, original: generated?.content ?? null, current: ctx.current });
  const assessment = review.lifecycle;
  if (!assessment) return { queued: false, reason: "run_unavailable" };
  const jobs = await listRevisionJobs(params.workspaceId, params.clientProfileId);
  const d = decideRevision({ assessment, draftJobId: rp.jobId, trigger: params.trigger, jobs });
  if (!d.queue) return { queued: false, reason: d.reason, assessment };
  const nowIso = new Date().toISOString();
  const intent: JobIntent = { planningKey: assessment.current.key, trigger: params.trigger, supersedesVersionId: pending.versionId, supersedesJobId: rp.jobId, programId: pending.programId };
  const provenance: RevisionProvenance = { supersedesVersionId: pending.versionId, supersedesJobId: rp.jobId, trigger: params.trigger, previousPlanningKey: assessment.solvedUnder.key, planningKey: assessment.current.key, changes: assessment.changes, reasons: assessment.reasons, requestedBy: params.coachId, requestedAtIso: nowIso };
  const { started, job } = await startReasonerGeneration({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId, coachId: params.coachId, title: pending.content.name, intent, revision: { programId: pending.programId, provenance } });
  return started ? { queued: true, job, assessment } : { queued: false, reason: "in_flight", assessment };
}

/**
 * After the coach answered a preflight's fit questions: ONE generation (or, when a superseded draft exists, one
 * revision) for the new state — the answers are the coach's authorization; nothing repeats for the same state.
 */
export async function queueAfterPreflightAnswers(params: { workspaceId: string; clientProfileId: string; coachId: string }): Promise<{ queued: boolean; job?: ReasonerJobView; reason?: string }> {
  if (!isReasonerProposalEnabled(params.clientProfileId)) return { queued: false, reason: "not_enabled" };
  const pending = await getPendingProgramProposal(params.workspaceId, params.clientProfileId);
  if (pending?.content.reasonerProvenance) {
    const r = await queueRevisionIfMaterial({ ...params, trigger: "preflight_answered" });
    return r.queued ? { queued: true, job: r.job } : { queued: false, reason: r.reason };
  }
  if (pending) return { queued: false, reason: "pending_proposal" };
  const latest = await getLatestReasonerJob(params.workspaceId, params.clientProfileId);
  const questions = latest?.status === "needs_input" ? (latest.outcome.fitQuestions ?? []) : [];
  if (!questions.length) return { queued: false, reason: "no_questions" };
  const ctx = await planningContextFor(params.clientProfileId);
  const structured = ctx.input.client.health.review.coachStructuredLimitations;
  const decided = new Set(effectiveExerciseDecisions(isKnown(structured) ? structured.value.exerciseDecisions : []).map((d) => d.exerciseId));
  const jobs = await listRevisionJobs(params.workspaceId, params.clientProfileId);
  if (!decideGenerationAfterPreflight({ currentKey: ctx.state.key, jobs, questionsLeft: questions.filter((q) => !decided.has(q.exerciseId)).length })) return { queued: false, reason: "not_ready" };
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("reasoner_generation_jobs").select("title").eq("id", latest!.jobId).maybeSingle();
  const { started, job } = await startReasonerGeneration({ ...params, title: (data?.title as string | undefined) ?? "Training program", intent: { planningKey: ctx.state.key, trigger: "preflight_answered" } });
  return { queued: started, job };
}
