"use server";

// The one client-callable wrapper around lib/production/invite.ts's
// acceptInvitation — needed now that app/auth/confirm/page.tsx (see that
// file's own doc) establishes the session client-side rather than in a
// Route Handler. acceptInvitation itself still does all the real work
// through the caller's own RLS-governed session (getSupabaseServerClient(),
// which reads the cookie this Server Action's request already carries,
// since @supabase/ssr's browser client writes the session cookie the
// moment setSession/exchangeCodeForSession/verifyOtp resolves — before this
// action is ever called).
import { acceptInvitation } from "../../lib/production/invite";
import { resolveSignInAccess } from "../../lib/production/post-sign-in";
import { resolvePostSignInDestination } from "../../lib/auth/post-sign-in";

export async function acceptInvitationAction(invitationId: string): Promise<void> {
  await acceptInvitation(invitationId);
}

/** Where app/auth/confirm/page.tsx sends a just-signed-in browser: the
 * carried `next` only if the caller's real, server-resolved role may enter
 * it, otherwise that role's home (see lib/auth/post-sign-in.ts). Called
 * after acceptInvitationAction, so a freshly accepted membership counts. */
export async function resolvePostSignInDestinationAction(next: string | null): Promise<string> {
  return resolvePostSignInDestination(next, await resolveSignInAccess());
}
