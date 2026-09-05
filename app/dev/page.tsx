import { notFound } from "next/navigation";
import { DevConsole } from "@/components/dev/dev-console";

/**
 * Development-only escape hatch. Deliberately outside /coach* and the
 * client-app prefixes (see lib/coach/routing.ts's classifyPathname), so it
 * falls into the same "public"/always-allowed bucket as /invite,
 * /onboarding, and /setup-status — RoleRouteBoundary never gates it, and
 * this file adds no new routing rule for that. That's what makes it usable
 * from a stuck perspective/lifecycle combination in the first place.
 *
 * Never rendered in a production build — this check runs on the server
 * before DevConsole's client bundle is ever reached.
 */
export default function DevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevConsole />;
}
