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

export async function inviteClientAction(params: { workspaceId: string; email: string; displayName: string; goal: string }): Promise<{ clientProfileId: string }> {
  const result = await inviteClient(params);
  revalidatePath("/coach/clients");
  return result;
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
