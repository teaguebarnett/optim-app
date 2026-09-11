// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The Supabase-mode Coach Playbook repository. Same authorization
// discipline as lib/production/programs.ts: every privileged write calls
// getAuthenticatedContext()/requireWorkspaceRole itself first, never relies
// on RLS alone to be the only backstop.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { getAuthenticatedContext, requireWorkspaceRole, isWorkspaceStaffRole } from "./auth.ts";
import { UnauthorizedError } from "./errors.ts";
import { validatePlaybookContent } from "./validation.ts";
import { buildDefaultPlaybookContent, type CoachPlaybook, type CoachPlaybookContent, type PlaybookExample } from "../coach/playbook.ts";

async function requireCoachAuthority(workspaceId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  return ctx;
}

interface PlaybookRow {
  id: string;
  workspace_id: string;
  version: number;
  status: "draft" | "approved";
  content: unknown;
  created_by: string | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
}

function rowToPlaybook(row: PlaybookRow): CoachPlaybook {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    version: row.version,
    status: row.status,
    content: validatePlaybookContent(row.content),
    createdByUserId: row.created_by,
    createdAtIso: row.created_at,
    approvedByUserId: row.approved_by,
    approvedAtIso: row.approved_at,
  };
}

/** Reads the workspace's current (approved) Playbook, or null if this
 * workspace has never had one bootstrapped. Staff-authenticated read —
 * RLS's coach_playbooks_select_staff independently enforces this can never
 * return another workspace's Playbook. */
export async function getApprovedPlaybook(workspaceId: string): Promise<CoachPlaybook | null> {
  await requireCoachAuthority(workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("coach_playbooks")
    .select("id, workspace_id, version, status, content, created_by, created_at, approved_by, approved_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw new Error(`getApprovedPlaybook failed: ${error.message}`);
  return data ? rowToPlaybook(data as PlaybookRow) : null;
}

/** Bootstraps version 1, approved, for a workspace that has never had a
 * Playbook — not a rewrite of an existing one (there isn't one), the same
 * "legacy coach who skips calibration" default posture
 * createDefaultCoachOperatingModel's own doc describes. Idempotent: if a
 * Playbook already exists (approved or draft), returns the current approved
 * one untouched rather than creating a second. */
export async function getOrBootstrapApprovedPlaybook(params: { workspaceId: string; businessName: string }): Promise<CoachPlaybook> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const existing = await getApprovedPlaybook(params.workspaceId);
  if (existing) return existing;

  const supabase = await getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const content = buildDefaultPlaybookContent({
    coachId: ctx.userId,
    workspaceId: params.workspaceId,
    nowIso,
    businessName: params.businessName,
  });

  const { data, error } = await supabase
    .from("coach_playbooks")
    .insert({
      workspace_id: params.workspaceId,
      version: 1,
      status: "approved",
      content,
      created_by: ctx.userId,
      approved_by: ctx.userId,
      approved_at: nowIso,
    })
    .select("id, workspace_id, version, status, content, created_by, created_at, approved_by, approved_at")
    .single();
  if (error) throw new Error(`getOrBootstrapApprovedPlaybook failed: ${error.message}`);
  return rowToPlaybook(data as PlaybookRow);
}

/** Every version this workspace has ever had, newest first — the audit
 * trail behind "structured, editable, and versioned". Content is validated
 * per row, so a corrupt historical version surfaces as a controlled
 * InvalidPersistedContentError rather than silently rendering as blank. */
export async function listPlaybookVersions(workspaceId: string): Promise<CoachPlaybook[]> {
  await requireCoachAuthority(workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("coach_playbooks")
    .select("id, workspace_id, version, status, content, created_by, created_at, approved_by, approved_at")
    .eq("workspace_id", workspaceId)
    .order("version", { ascending: false });
  if (error) throw new Error(`listPlaybookVersions failed: ${error.message}`);
  return (data ?? []).map((row) => rowToPlaybook(row as PlaybookRow));
}

/** Creates a new DRAFT version from arbitrary edited content — never
 * applied until approvePlaybookVersion promotes it. */
export async function createDraftPlaybookVersion(params: { workspaceId: string; content: CoachPlaybookContent }): Promise<CoachPlaybook> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();

  const { data: existingVersions, error: versionsError } = await supabase
    .from("coach_playbooks")
    .select("version")
    .eq("workspace_id", params.workspaceId)
    .order("version", { ascending: false })
    .limit(1);
  if (versionsError) throw new Error(`createDraftPlaybookVersion (version lookup) failed: ${versionsError.message}`);
  const nextVersion = (existingVersions?.[0]?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("coach_playbooks")
    .insert({ workspace_id: params.workspaceId, version: nextVersion, status: "draft", content: params.content, created_by: ctx.userId })
    .select("id, workspace_id, version, status, content, created_by, created_at, approved_by, approved_at")
    .single();
  if (error) throw new Error(`createDraftPlaybookVersion failed: ${error.message}`);
  return rowToPlaybook(data as PlaybookRow);
}

/** Promotes one draft version to approved, superseding whichever version
 * was previously approved (the partial unique index only allows one
 * approved row per workspace, so the old one must be moved out of
 * "approved" status in the same transaction-equivalent pair of statements —
 * Supabase's PostgREST issues these as two requests, so a rare interleaving
 * would violate the unique index and surface as a clear error rather than
 * silently leaving two approved versions; retrying resolves it). */
export async function approvePlaybookVersion(params: { workspaceId: string; versionId: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const { error: demoteError } = await supabase
    .from("coach_playbooks")
    .update({ status: "draft", superseded_at: nowIso })
    .eq("workspace_id", params.workspaceId)
    .eq("status", "approved");
  if (demoteError) throw new Error(`approvePlaybookVersion (demote) failed: ${demoteError.message}`);

  const { error } = await supabase
    .from("coach_playbooks")
    .update({ status: "approved", approved_by: ctx.userId, approved_at: nowIso })
    .eq("id", params.versionId)
    .eq("workspace_id", params.workspaceId);
  if (error) throw new Error(`approvePlaybookVersion failed: ${error.message}`);
}

/** "Resolved decisions become future context for that client and may
 * become proposed Coach Playbook examples" — this always creates a new
 * DRAFT version (current approved content + one appended example), never
 * mutates the active Playbook directly. A coach must still call
 * approvePlaybookVersion to make it real. */
export async function proposePlaybookExampleFromEscalation(params: {
  workspaceId: string;
  escalationId: string;
  situation: string;
  resolution: string;
}): Promise<CoachPlaybook> {
  const current = await getApprovedPlaybook(params.workspaceId);
  if (!current) throw new Error("proposePlaybookExampleFromEscalation: no approved Playbook exists to base a draft on");

  const example: PlaybookExample = {
    id: `example-${params.escalationId}`,
    sourceEscalationId: params.escalationId,
    situation: params.situation,
    resolution: params.resolution,
    addedAtIso: new Date().toISOString(),
  };
  const draftContent: CoachPlaybookContent = { ...current.content, examples: [...current.content.examples, example] };
  return createDraftPlaybookVersion({ workspaceId: params.workspaceId, content: draftContent });
}
