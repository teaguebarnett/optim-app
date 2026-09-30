// Public-site entry into the demo coach or client experience.
//
// Why this route exists: in demo mode the app's identity is a stored "dev
// perspective" (lib/tenancy/session.ts), read once when the app provider
// mounts; RoleRouteBoundary then redirects any route that perspective isn't
// allowed on. So a plain link to /today could still end on /coach (or the
// reverse), depending on what that browser last stored. This route
// explicitly selects the demo coach or demo client, then replaces the URL
// with /coach or /today — correct on a click, a new tab, or a direct load.
//
// Real (Supabase) mode: this route grants nothing. It only forwards to the
// existing sign-in page with the intended destination as a hint; access is
// decided there by the real account's roles.

import { notFound, redirect } from "next/navigation";
import { resolveAppMode } from "@/lib/production/mode";
import { signInHref } from "@/lib/marketing/auth-links";
import { DemoEntry } from "@/components/marketing/demo-entry";

export default async function DemoEntryPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (area !== "coach" && area !== "client") notFound();
  if (resolveAppMode() === "supabase") redirect(signInHref(area as "coach" | "client"));
  return <DemoEntry area={area} />;
}
