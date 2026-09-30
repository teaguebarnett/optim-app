import "server-only";
import { resolveAppMode } from "../production/mode";

/** The existing sign-in page with the intended destination as a hint. The
 * sign-in flow honors it only when the signed-in account's own roles allow
 * that destination; otherwise it uses the account's own home. */
export function signInHref(area: "coach" | "client"): string {
  return `/auth/sign-in?next=${encodeURIComponent(area === "coach" ? "/coach" : "/today")}`;
}

/** Where the public site's returning-user links go (every header, mobile
 * menu, footer, and inline Client login uses these).
 * - Real (Supabase) mode: straight to sign-in with the destination hint.
 * - Demo mode: /demo-entry/…, which explicitly selects the demo coach or
 *   demo client before opening /coach or /today (see that route's doc for
 *   why a plain link to /today isn't enough). */
export function publicAuthLinks() {
  const supabase = resolveAppMode() === "supabase";
  return {
    coachLoginHref: supabase ? signInHref("coach") : "/demo-entry/coach",
    clientLoginHref: supabase ? signInHref("client") : "/demo-entry/client",
  };
}
