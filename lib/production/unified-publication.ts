// Gate U3C — publishing an APPROVED unified proposal to its client: the app-side half of atomic publication.
//
// The database function public.publish_unified_proposal does every write in ONE transaction (publish, assign, start
// date, supersession, notification, proposal state) and enforces authority, per-client serialization, idempotency, the
// exact approved versions (database-side fingerprints) and the active-assignment / replacement rules. This module runs
// what only the app can, immediately before it: the full U3B revalidation and approval gate against the CURRENT client
// (decisions resolved, drafts valid, confirmed restrictions satisfied, nothing stale), the app-side content hashes from
// approval, whether the client's Today can show the program, and the client-facing copy of Reasoner lifting.
// Same pattern as the other cores: the caller's RLS-scoped Supabase client, so the local e2e drives exactly this code.

import { sha256 } from "../synthesis/reasoner/run.ts";
import { approvalBlockers } from "../synthesis/unified/review.ts";
import { clientFacingProgramContent, findClientCopyLeaks, sideOnlyNames, supportedSetupNames } from "../synthesis/reasoner/review-gate.ts";
import { universalProgramToTodayProgram } from "../training/legacy-adapter.ts";
import type { Session, UniversalTrainingProgramContent } from "../training/types.ts";
import { insertDraftProgramVersion } from "./draft-versions.ts";
import { getUnifiedReviewById, loadReviewRow, type ReviewEnv, type UnifiedReviewView } from "./unified-review.ts";

export interface PublicationExpectation {
  /** The client's active training / nutrition versions as the coach saw them (null = none). */
  activeTrainingVersionId: string | null;
  activeNutritionVersionId: string | null;
  /** The coach explicitly confirms replacing an active program / nutrition plan. */
  replaceActive: boolean;
  /** Start date (YYYY-MM-DD) for a NEW program that replaces an active one; never for a continuation. */
  startDate: string | null;
}

export interface PublicationPlan {
  canPublish: boolean;
  blockers: string[];
  active: { trainingVersionId: string | null; nutritionVersionId: string | null };
  /** What publishing would replace (only domains this proposal publishes). */
  replaces: { training: boolean; nutrition: boolean };
  /** The approved lifting continues (proposal built around the client's approved program): position preserved. */
  continuesApprovedProgram: boolean;
  needsStartDate: boolean;
  supersedes: { openProposals: number; legacyPendingDrafts: number };
  omits: Array<"training" | "nutrition">;
}

const isCardioSession = (s: Session) => s.blocks.length > 0 && s.blocks.every((b) => b.items.every((i) => i.prescription.family === "continuous" || i.prescription.family === "interval"));

/** The client copy of Reasoner lifting (client-safe names, cues; no internal notes) — cardio sessions keep exactly
 * the copy the coach reviewed (the lifting transform would relabel them "Strength training" and drop their notes). */
export function clientFacingUnifiedContent(content: UniversalTrainingProgramContent, reviewedVersionId: string, run: Parameters<typeof supportedSetupNames>[0], knowledge: Parameters<typeof clientFacingProgramContent>[0]["knowledge"], nowIso: string): UniversalTrainingProgramContent {
  const out = clientFacingProgramContent({ content, reviewedVersionId, knowledge, supportedSetup: supportedSetupNames(run, knowledge), sideOnly: sideOnlyNames(run, knowledge), nowIso });
  for (const [wi, w] of content.weeks.entries())
    for (const [di, d] of w.days.entries())
      for (const [si, s] of (d.sessions ?? []).entries()) if (isCardioSession(s)) out.weeks[wi].days[di].sessions![si] = structuredClone(s);
  return out;
}

async function activeAssignments(env: ReviewEnv, clientProfileId: string) {
  const [t, n] = await Promise.all([
    env.supabase.from("program_assignments").select("program_version_id").eq("client_profile_id", clientProfileId).eq("status", "active").maybeSingle(),
    env.supabase.from("nutrition_plan_assignments").select("plan_version_id").eq("client_profile_id", clientProfileId).eq("status", "active").maybeSingle(),
  ]);
  if (t.error || n.error) throw new Error(`publication: couldn't read the client's active assignments (${(t.error ?? n.error)!.message})`);
  return { trainingVersionId: (t.data?.program_version_id as string | undefined) ?? null, nutritionVersionId: (n.data?.plan_version_id as string | undefined) ?? null };
}

/** What publishing this proposal would do, and what still blocks it — the coach confirms from this. */
export async function planUnifiedPublication(env: ReviewEnv, rowId: string): Promise<{ plan: PublicationPlan; view: UnifiedReviewView }> {
  const row = await loadReviewRow(env, rowId);
  const view = await getUnifiedReviewById(env, rowId);
  const active = await activeAssignments(env, row.client_profile_id);
  const blockers: string[] = [];
  if (row.approval_state === "published") blockers.push("This proposal is already published.");
  else if (row.approval_state !== "approved") blockers.push(row.approval_state === "proposed" ? "Approve the proposal before publishing it." : `This proposal was ${row.approval_state}.`);
  else {
    // The full U3B gate again, against the CURRENT client, restrictions and method (an approval can go stale).
    blockers.push(...approvalBlockers({ approvalState: "proposed", status: row.status, hasDrafts: !!(view.training || view.nutrition), revalidation: view.revalidation, decisions: view.decisions, staleReasons: view.staleReasons, escalations: row.proposal.escalations.length }));
    const h = row.approved_content_hashes;
    if (view.training && h?.training !== sha256(view.training.content)) blockers.push("The training changed after approval — review and approve again.");
    if (view.nutrition && h?.nutrition !== sha256(view.nutrition.content)) blockers.push("The nutrition changed after approval — review and approve again.");
    // The client app must be able to SHOW what it receives: Today renders one session per training day today.
    if (view.training && !universalProgramToTodayProgram(view.training.content)) blockers.push("The client's Today screen can't show this program yet (it has more than one session on a day, or cardio-only days). Publishing it would leave the client without a usable Today — it's held until Today supports multi-session programs.");
  }
  const continues = row.resistance_source === "approved_program" && !!view.training && active.trainingVersionId === row.source_resistance_version_id;
  const replaces = { training: !!view.training && !!active.trainingVersionId, nutrition: !!view.nutrition && !!active.nutritionVersionId };
  const [{ count: openProposals }, { count: legacy }] = await Promise.all([
    env.supabase.from("unified_program_proposals").select("id", { count: "exact", head: true }).eq("client_profile_id", row.client_profile_id).in("approval_state", ["proposed", "approved"]).neq("id", row.id),
    env.supabase.from("training_program_versions").select("id", { count: "exact", head: true }).eq("proposed_for_client_profile_id", row.client_profile_id).eq("status", "draft"),
  ]);
  return {
    view,
    plan: {
      canPublish: blockers.length === 0,
      blockers,
      active,
      replaces,
      continuesApprovedProgram: continues,
      needsStartDate: replaces.training && !continues,
      supersedes: { openProposals: openProposals ?? 0, legacyPendingDrafts: legacy ?? 0 },
      omits: [...(view.training ? [] : (["training"] as const)), ...(view.nutrition ? [] : (["nutrition"] as const))],
    },
  };
}

/** Publishes the approved proposal atomically. Retrying a published proposal returns the same publication. */
export async function publishUnifiedProposal(env: ReviewEnv, p: { rowId: string; expected: PublicationExpectation }): Promise<{ publication: Record<string, unknown>; view: UnifiedReviewView }> {
  const row = await loadReviewRow(env, p.rowId);
  if (row.approval_state === "published") {
    // Idempotent: the database returns the recorded publication without repeating anything.
    const { data, error } = await env.supabase.rpc("publish_unified_proposal", { p_proposal_id: row.id, p_training_version_id: null, p_expected: {} });
    if (error) throw new Error(error.message);
    return { publication: data as Record<string, unknown>, view: await getUnifiedReviewById(env, row.id) };
  }
  const { plan, view } = await planUnifiedPublication(env, p.rowId);
  if (!plan.canPublish) throw new Error(`This proposal can't be published: ${plan.blockers.join(" ")}`);

  // Client copy of Reasoner lifting, as a draft in the same program (the database verifies it derives from the approved version).
  let copyId: string | null = null;
  let publishTrainingId: string | null = view.training?.versionId ?? null;
  if (view.training?.content.reasonerProvenance) {
    const a = row.domain_runs;
    const run = a.resistance?.source === "proposed_program" ? a.resistance.result.run : null;
    const client = clientFacingUnifiedContent(view.training.content, view.training.versionId, run, env.knowledge, env.nowIso);
    const leaks = findClientCopyLeaks(client);
    if (leaks.length) throw new Error(`Some session names still contain internal planning notes (${leaks.join("; ")}). Rename them in review, approve again, then publish.`);
    const { data: v } = await env.supabase.from("training_program_versions").select("program_id").eq("id", view.training.versionId).single();
    const created = await insertDraftProgramVersion(env.supabase, env.userId, { workspaceId: row.workspace_id, programId: (v as { program_id: string }).program_id, title: client.name, content: client });
    copyId = created.versionId;
    publishTrainingId = copyId;
  }

  const { data, error } = await env.supabase.rpc("publish_unified_proposal", { p_proposal_id: row.id, p_training_version_id: publishTrainingId, p_expected: p.expected });
  const publication = data as Record<string, unknown> | null;
  if (error || !publication || (copyId && publication.trainingVersionId !== copyId)) {
    // Nothing was published by THIS attempt (rolled back, or a concurrent publish won): never leave its copy behind.
    if (copyId) await env.supabase.from("training_program_versions").update({ status: "archived" }).eq("id", copyId).eq("status", "draft");
    if (error) throw new Error(error.message.replace(/^publish_unified_proposal: /, ""));
  }
  return { publication: publication!, view: await getUnifiedReviewById(env, row.id) };
}
