// The one sign-in page, for coaches and clients alike (the public site's
// "Coach login" and "OPTIM for Clients" both link here with a `next` hint).
//
// An already-signed-in visitor never sees the form again: they go straight
// to their own destination through the same resolver a completed email
// sign-in uses (lib/auth/post-sign-in.ts) — the hinted `next` only when
// their real role may enter it, otherwise their role's home. The form itself
// (components/auth/sign-in-form.tsx) is unchanged apart from carrying
// `next` through the email link.

import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { resolveAppMode } from "@/lib/production/mode";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveSignInAccess } from "@/lib/production/post-sign-in";
import { resolvePostSignInDestination, sanitizeNextPath } from "@/lib/auth/post-sign-in";

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const next = sanitizeNextPath(typeof query.next === "string" ? query.next : null);

  if (resolveAppMode() === "supabase") {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      let destination: string | null = null;
      try {
        destination = resolvePostSignInDestination(next, await resolveSignInAccess());
      } catch {
        destination = null; // a broken session falls through to the form
      }
      if (destination) redirect(destination);
    }
  }

  return <SignInForm next={next} />;
}
