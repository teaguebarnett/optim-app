"use server";

// Gate 2 — a shared sign-out action so the live coach header can offer
// "Sign out" (previously only /auth/account had one, and no coach screen
// linked there). Same behavior as that page's own action: end the Supabase
// session server-side, then land on sign-in.

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function signOutAction(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in");
}
