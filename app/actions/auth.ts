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

export async function acceptInvitationAction(invitationId: string): Promise<void> {
  await acceptInvitation(invitationId);
}
