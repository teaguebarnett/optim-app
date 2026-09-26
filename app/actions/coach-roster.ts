"use server";

// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// The client-callable surface over lib/production/roster.ts — mirrors
// app/actions/production-programs.ts's and app/actions/coach-communications.ts's
// own "the only file client components import from" discipline.

import { revalidatePath } from "next/cache";
import {
  listRosterForOwnWorkspace,
  getClientDetail,
  inviteClient,
  setClientLifecycleAction,
  activateClientEnrollment,
  type LiveRoster,
  type LiveClientDetail,
  type LifecycleAction,
} from "../../lib/production/roster";

export async function listRosterAction(): Promise<LiveRoster> {
  return listRosterForOwnWorkspace();
}

export async function getClientDetailAction(clientId: string): Promise<LiveClientDetail> {
  return getClientDetail(clientId);
}

export type InviteClientResult = { ok: true; clientProfileId: string } | { ok: false; message: string };

// Returns a value instead of throwing — Next.js's production build strips
// the message off ANY error that crosses a Server Action boundary via
// throw, replacing it with a generic "Server Components render" digest
// (confirmed live: a real production build, invited-client duplicate-email
// case, reproduced this exact text word-for-word). inviteClient's own
// "already been invited" message is an expected, user-facing outcome, not
// a bug — the caller (InviteClientSheet) needs the real string to show it,
// which only a return value survives production intact. See Next.js's own
// docs/01-app/01-getting-started/10-error-handling.md: "For [expected]
// errors, avoid using try/catch blocks and throw errors. Instead, model
// expected errors as return values."
export async function inviteClientAction(params: { workspaceId: string; email: string; displayName: string; goal: string }): Promise<InviteClientResult> {
  try {
    const result = await inviteClient(params);
    revalidatePath("/coach/clients");
    return { ok: true, clientProfileId: result.clientProfileId };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to invite this client." };
  }
}

export async function setClientLifecycleActionServer(params: { workspaceId: string; clientProfileId: string; action: LifecycleAction }): Promise<void> {
  await setClientLifecycleAction(params);
  revalidatePath("/coach/clients");
  revalidatePath(`/coach/clients/${params.clientProfileId}`);
}

export async function activateClientAction(params: { workspaceId: string; clientProfileId: string }): Promise<void> {
  await activateClientEnrollment(params);
  revalidatePath("/coach/clients");
  revalidatePath(`/coach/clients/${params.clientProfileId}`);
}
