// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// "Derive workspace and client identity server-side; never trust a
// client-supplied identity or workspace claim." This module is that rule in
// one place: given nothing but the authenticated Supabase session, it
// resolves which client_profiles row the caller IS, which workspace that
// row belongs to, and who their real assigned coach is.
//
// Deliberately a new module rather than an export added to
// lib/production/programs.ts: that file is Phase 6.0B's program/nutrition
// repository, and chat has no business importing it just to learn who the
// caller is. app/actions/production-programs.ts keeps its own private copy
// of this lookup (Phase 6.0B) — left untouched, since rewriting a shipped,
// verified action surface is not this phase's job.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { getAuthenticatedContext } from "./auth.ts";

export interface OwnClientIdentity {
  userId: string;
  clientProfileId: string;
  workspaceId: string;
  clientDisplayName: string;
  primaryCoachId: string | null;
  /** The REAL assigned coach's display name — every client-facing label
   * ("<Coach> · Coach", "I've flagged this for <Coach>") is built from this,
   * never from a hardcoded name. Falls back to the honest generic "your
   * coach" only when no coach is actually assigned yet. */
  coachDisplayName: string;
  /** Phase 6.0D-B — the real coach's avatar initials, for the same
   * onboarding/setup-status chrome (components/onboarding/onboarding-stage.tsx)
   * demo mode already renders from ALL_COACH_PROFILES. Null when no coach is
   * assigned yet, exactly like coachDisplayName's own fallback case. */
  coachAvatarInitials: string | null;
}

export async function resolveOwnClientIdentity(): Promise<OwnClientIdentity> {
  const ctx = await getAuthenticatedContext();
  const supabase = await getSupabaseServerClient();

  const { data: clientRow, error: clientError } = await supabase
    .from("client_profiles")
    .select("id, workspace_id, display_name")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (clientError) throw new Error(`resolveOwnClientIdentity failed: ${clientError.message}`);
  if (!clientRow) throw new Error(`Authenticated user ${ctx.userId} has no client_profiles row — not a client.`);

  const { data: assignmentRow, error: assignmentError } = await supabase
    .from("coach_client_assignments")
    .select("coach_user_id, profiles:coach_user_id(display_name, avatar_initials)")
    .eq("client_profile_id", clientRow.id)
    .eq("is_primary", true)
    .maybeSingle();
  if (assignmentError) throw new Error(`resolveOwnClientIdentity (coach lookup) failed: ${assignmentError.message}`);

  const coachProfile = assignmentRow?.profiles as unknown as { display_name: string; avatar_initials: string | null } | null;

  return {
    userId: ctx.userId,
    clientProfileId: clientRow.id as string,
    workspaceId: clientRow.workspace_id as string,
    clientDisplayName: clientRow.display_name as string,
    primaryCoachId: (assignmentRow?.coach_user_id as string | undefined) ?? null,
    coachDisplayName: coachProfile?.display_name ?? "your coach",
    coachAvatarInitials: coachProfile?.avatar_initials ?? null,
  };
}

/** Resolves the workspace a given client belongs to, for a STAFF caller.
 * The caller must still prove staff authority in that workspace before
 * acting (every lib/production/chat.ts and campaigns.ts entry point calls
 * requireCoachAuthority itself) — this only answers "which workspace",
 * and RLS on client_profiles already prevents it answering at all for a
 * client outside the caller's reach. */
export async function resolveClientWorkspaceId(clientProfileId: string): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("client_profiles").select("workspace_id").eq("id", clientProfileId).single();
  if (error) throw new Error(`resolveClientWorkspaceId failed: ${error.message}`);
  return data.workspace_id as string;
}
