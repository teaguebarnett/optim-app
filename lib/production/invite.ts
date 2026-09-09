// Phase 6.0A — Production Foundation.
//
// The one server-only invitation service. This — plus the one-time
// bootstrap script at scripts/bootstrap-workspace.mts, run manually by
// Teague with his own credentials, never by the app itself — is the ONLY
// code path in this codebase allowed to create a brand-new Supabase Auth
// user. Every routine sign-in (lib/supabase's signInWithOtp calls from
// app/auth/sign-in) uses shouldCreateUser: false, so a generic sign-in
// attempt against an unrecognized email can never create an account — see
// that page for the enforcement of the other half of this invariant.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server";
import { getSupabaseAdminClient } from "../supabase/admin";
import { getSupabaseServerConfig } from "./env";
import { getAuthenticatedContext, requireWorkspaceRole, type ProductionRole } from "./auth";

export interface InviteToWorkspaceParams {
  workspaceId: string;
  email: string;
  role: ProductionRole;
}

/** Records the invitation (through the ordinary RLS-respecting server
 * client — workspace_invitations' own INSERT policy already requires the
 * caller to be a workspace admin and to be the invited_by value, so this
 * doesn't need the privileged admin client for that half) and then, only
 * for the actual account-creation + email send, uses the service-role
 * admin client via Supabase Auth's inviteUserByEmail — the one privileged
 * operation this whole file exists to narrowly wrap. */
export async function inviteToWorkspace(params: InviteToWorkspaceParams) {
  const context = await getAuthenticatedContext();
  requireWorkspaceRole(context, params.workspaceId, ["platform_admin", "workspace_owner"]);

  const email = params.email.trim().toLowerCase();
  const supabase = await getSupabaseServerClient();

  const { data: invitation, error } = await supabase
    .from("workspace_invitations")
    .insert({ workspace_id: params.workspaceId, email, role: params.role, invited_by: context.userId })
    .select("id")
    .single();

  if (error || !invitation) {
    throw new Error(`Failed to record invitation: ${error?.message ?? "no row returned"}`);
  }

  const { siteUrl } = getSupabaseServerConfig();
  const admin = getSupabaseAdminClient();

  const { error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?invitation=${invitation.id}`,
    data: { display_name: email.split("@")[0] },
  });

  if (authError) {
    // The workspace_invitations row still exists as a pending record even
    // though the email failed to send — surfaced to the caller to retry,
    // never silently swallowed into a false "invited" success state.
    throw new Error(`Invitation recorded (id=${invitation.id}) but the invite email failed to send: ${authError.message}`);
  }

  return invitation;
}

/** Calls the accept_invitation Postgres function (see
 * supabase/migrations/20260909000010_accept_invitation.sql) through the
 * ordinary RLS-respecting server client — the function itself is
 * SECURITY DEFINER and matches the invitation's email against the caller's
 * own authenticated email internally, so no admin/service-role client is
 * needed here at all. */
export async function acceptInvitation(invitationId: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_invitation_id: invitationId });
  if (error) {
    throw new Error(`Failed to accept invitation ${invitationId}: ${error.message}`);
  }
  return data;
}
