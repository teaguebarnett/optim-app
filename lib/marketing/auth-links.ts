import "server-only";
import { resolveAppMode } from "../production/mode";

/** The existing sign-in page with an optional destination hint. The sign-in
 * flow honors a hint only when the signed-in account's own roles allow it;
 * without one, the account's role decides (coach -> /coach, client -> /today). */
export function signInHref(area?: "coach" | "client"): string {
  if (!area) return "/auth/sign-in";
  return `/auth/sign-in?next=${encodeURIComponent(area === "coach" ? "/coach" : "/today")}`;
}

/** The public site's one returning-user entry: a quiet "Beta login".
 * - Real (Supabase) mode: the existing sign-in page with no hint, so each
 *   account lands where its own role says (lib/auth/post-sign-in.ts).
 * - Demo mode: the demo coach (demo mode has no sign-in; see
 *   app/demo-entry/[area]/page.tsx). */
export function publicAuthLinks() {
  const supabase = resolveAppMode() === "supabase";
  return { betaLoginHref: supabase ? signInHref() : "/demo-entry/coach" };
}
