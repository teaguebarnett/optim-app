// Phase 6.0A — Production Foundation.
//
// Handles Supabase's invitation/magic-link confirmation redirect —
// verifies the token_hash, establishes a real session, and (only when the
// link carries our own `invitation` query param — see
// lib/production/invite.ts's inviteToWorkspace, which appends it to
// redirectTo) accepts the invitation via the accept_invitation Postgres
// function. This is the "secure invitation/magic-link confirmation"
// flow Part 2 requires alongside routine OTP sign-in — used only for
// invitation acceptance, not for everyday sign-in (that's
// app/auth/sign-in, six-digit OTP).

import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { acceptInvitation } from "@/lib/production/invite";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const invitationId = searchParams.get("invitation");
  const next = searchParams.get("next") ?? "/auth/account";

  if (!tokenHash || !type) {
    redirect("/auth/error?reason=missing_token");
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    redirect(`/auth/error?reason=${encodeURIComponent(error.message)}`);
  }

  if (invitationId) {
    try {
      await acceptInvitation(invitationId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to accept invitation.";
      redirect(`/auth/error?reason=${encodeURIComponent(message)}`);
    }
  }

  redirect(next);
}
