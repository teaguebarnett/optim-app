// Cross-client data integrity — who a client-side write belongs to. Pure; shared by the server actions (which refuse a
// write whose declared owner isn't the authenticated caller) and hooks/use-prototype-state.tsx (which binds its state
// to the identity it was hydrated for, and rebinds on any auth change).
//
// Why both layers: the provider lives in the root layout and survives sign-in/sign-out, and a request's identity comes
// from the cookie at the moment it's sent. Without a declared owner, client A's in-memory day — hydrated, autosaving,
// or simply retained in another tab — is written to whichever client is signed in by then (found in Gate U3A QA:
// opening client B's sign-in link while A was signed in copied A's logged breakfast into B's daily record).
// RLS only proves a caller writes their OWN row; it can't tell that the content came from someone else's session.

export interface ClientOwner {
  clientProfileId: string;
  workspaceId: string;
}

/** The server's check: the write's declared owner is exactly the authenticated caller's client profile + workspace. */
export function ownerMatches(declared: ClientOwner | null | undefined, authenticated: ClientOwner): boolean {
  return !!declared && declared.clientProfileId === authenticated.clientProfileId && declared.workspaceId === authenticated.workspaceId;
}

export type OwnedWriteResult = { ok: true } | { ok: false; reason: "owner_mismatch" };

/** What the provider's state is bound to. `userId: undefined` = not bound yet (hydration hasn't resolved). */
export interface ClientBinding {
  userId: string | null | undefined;
  owner: ClientOwner | null;
}

export const UNBOUND: ClientBinding = { userId: undefined, owner: null };

/**
 * Whether an auth change means the provider's state may no longer belong to the signed-in user — then it must be
 * discarded and re-hydrated. Mid-hydration (unbound), a sign-in/out restarts hydration so the result can't be the
 * previous cookie's; once bound, any different user (or none) rebinds; the same user never does.
 */
export function shouldRebind(binding: ClientBinding, event: string, sessionUserId: string | null): boolean {
  if (binding.userId === undefined) return event === "SIGNED_IN" || event === "SIGNED_OUT";
  return sessionUserId !== binding.userId;
}

/** The owner a write from this state declares — null (never write) unless the state is the bound client's own. */
export function writeOwner(state: { clientId: string; workspaceId: string }, binding: ClientBinding): ClientOwner | null {
  const owner = binding.owner;
  if (!owner || !binding.userId) return null;
  return owner.clientProfileId === state.clientId && owner.workspaceId === state.workspaceId ? owner : null;
}
