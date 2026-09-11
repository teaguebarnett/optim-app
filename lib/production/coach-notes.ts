// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// Personal Coach Note — one-way, coach-to-one-client, never opens a
// permanent thread. A client's reply (if any) goes through the ordinary
// chat pipeline (lib/production/chat.ts's sendClientChatMessage), landing
// in their default OPTIM conversation exactly like any other message —
// this file only ever writes the note itself.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { getAuthenticatedContext, requireWorkspaceRole, isWorkspaceStaffRole } from "./auth.ts";
import { UnauthorizedError } from "./errors.ts";

async function requireCoachAuthority(workspaceId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  return ctx;
}

export interface CoachNoteView {
  id: string;
  clientProfileId: string;
  authorUserId: string;
  body: string;
  publishedAtIso: string;
}

export async function publishCoachNote(params: { workspaceId: string; clientProfileId: string; body: string }): Promise<CoachNoteView> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const trimmed = params.body.trim();
  if (trimmed.length === 0) throw new Error("Coach note body must not be empty.");
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("coach_notes")
    .insert({ workspace_id: params.workspaceId, client_profile_id: params.clientProfileId, author_user_id: ctx.userId, body: trimmed })
    .select("id, client_profile_id, author_user_id, body, published_at")
    .single();
  if (error) throw new Error(`publishCoachNote failed: ${error.message}`);
  return {
    id: data.id as string,
    clientProfileId: data.client_profile_id as string,
    authorUserId: data.author_user_id as string,
    body: data.body as string,
    publishedAtIso: data.published_at as string,
  };
}

export async function getClientCoachNotes(clientProfileId: string): Promise<CoachNoteView[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("coach_notes")
    .select("id, client_profile_id, author_user_id, body, published_at")
    .eq("client_profile_id", clientProfileId)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`getClientCoachNotes failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    clientProfileId: r.client_profile_id as string,
    authorUserId: r.author_user_id as string,
    body: r.body as string,
    publishedAtIso: r.published_at as string,
  }));
}
