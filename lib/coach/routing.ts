// Phase 5.0A — the one centralized session/role-routing boundary's decision
// logic. Deliberately pure (no React, no navigation side effects) so the
// actual routing rules are independently testable — see
// components/app-shell/role-route-boundary.tsx for the one place these are
// actually applied via a redirect, and lib/coach/verify-coach.mts for the
// routing-matrix tests.
//
// /invite/[token], /onboarding/[clientId], and /setup-status/[clientId] are
// deliberately NOT gated here — they're already scoped by the id in their
// own URL (see those pages), and (this being a no-auth local prototype)
// remain reachable directly regardless of which seeded perspective the
// developer is currently viewing as. See lib/tenancy/session.ts's module
// doc for why the coach/client dev-perspective toggle only ever represents
// the two SEEDED sessions, never an arbitrary coach-created client.

import type { ClientLifecycleStatus } from "./types";
import type { CoachCalibrationStatus } from "./coach-onboarding-engine.ts";
import type { Role } from "../tenancy/types";

export type RouteArea = "coach" | "client-app" | "public";

const CLIENT_APP_PREFIXES = ["/today", "/training", "/nutrition", "/progress", "/chat"];

export function classifyPathname(pathname: string): RouteArea {
  if (pathname === "/coach" || pathname.startsWith("/coach/")) return "coach";
  // Phase 5.4A — dedicated coach onboarding deliberately sits OUTSIDE
  // /coach/* (its own full-bleed desktop shell, not CoachShell's horizontal
  // nav chrome — see app/coach-onboarding/page.tsx), exactly the same
  // reasoning /onboarding/[clientId] already sits outside the client-app
  // prefixes below. Still coach-only access, via this explicit carve-out.
  if (pathname === "/coach-onboarding" || pathname.startsWith("/coach-onboarding/")) return "coach";
  if (CLIENT_APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return "client-app";
  return "public";
}

/** Non-client roles (coach, workspace_owner, platform_admin) are all
 * "coach-capable" for routing purposes — the same grouping
 * lib/tenancy/access.ts's canManageWorkspace/hasAnyRole checks already use
 * for coach-ish permissions. */
function isCoachCapableRole(role: Role): boolean {
  return role === "coach" || role === "workspace_owner" || role === "platform_admin";
}

/**
 * Where a session with this role/lifecycle should land when it can't stay
 * where it is (see isRouteAllowed) or when it lands on a route that isn't
 * scoped to any particular area (e.g. "/"). `clientId` is required to build
 * a lifecycle-appropriate client destination — a coach-capable role never
 * needs one.
 */
export function resolveHomeRoute(role: Role, lifecycle: ClientLifecycleStatus | null, clientId: string | null): string {
  if (isCoachCapableRole(role)) return "/coach";
  if (!clientId) return "/coach"; // a client role with no resolvable client profile is a data-integrity gap, not a real destination
  if (lifecycle === "active") return "/today";
  if (lifecycle === "invited" || lifecycle === "onboarding" || lifecycle === null) return `/onboarding/${clientId}`;
  return `/setup-status/${clientId}`;
}

/**
 * Whether the current session may stay on `pathname` as-is. False means the
 * caller should redirect to resolveHomeRoute's destination instead — never
 * silently render a cross-role page.
 */
export function isRouteAllowed(pathname: string, role: Role, lifecycle: ClientLifecycleStatus | null): boolean {
  const area = classifyPathname(pathname);
  if (area === "coach") return isCoachCapableRole(role);
  if (area === "client-app") return role === "client" && lifecycle === "active";
  return true;
}

/**
 * Phase 5.5B — the local dev-only session's identity (see
 * lib/tenancy/session.ts) when nothing has ever been explicitly chosen in
 * this browser. Before this, an untouched session always defaulted to the
 * seeded client identity regardless of which route was actually opened —
 * so a direct visit to /coach (itself correctly gated coach-capable-only by
 * isRouteAllowed above) was judged against a client identity that could
 * never satisfy it, and got redirected straight back out to a client
 * destination. This makes exactly that one first-ever decision route-aware
 * — every other route keeps resolving to the client default exactly as
 * before, so an untouched session opening any client-app or public route
 * (/today, /onboarding/..., etc.) behaves identically to today. Only used
 * for a session with no stored preference at all (see
 * hasStoredDevPerspective) — an explicit choice, whether made by the
 * developer via DevPerspectiveSwitcher or inferred once here and persisted,
 * always wins from then on.
 */
export function resolveDefaultDevPerspective(pathname: string): "coach" | "client" {
  return classifyPathname(pathname) === "coach" ? "coach" : "client";
}

/**
 * Phase 5.4A corrective pass — new-coach first-run lifecycle (see
 * components/coach/coach-shell.tsx, the one caller). A coach is routed
 * into Coach Calibration BEFORE ever landing on an empty Command Center
 * only when they are genuinely new: no confirmed model AND no clients yet.
 * An existing coach who simply hasn't calibrated (any real workspace with
 * at least one client — including the seeded Teague/Alex/Priya accounts)
 * is deliberately exempt and gets CalibrateOptimBanner's prompt instead —
 * see that component's own doc.
 *
 * Extracted as a pure predicate specifically so this rule is unit-testable
 * on its own (see lib/coach/verify-coach-calibration.mts) independently of
 * whether any of this prototype's three fixed, compile-time coach
 * identities can ever actually reach clientCount === 0 — see this phase's
 * final report for that disclosed limitation: every seeded coach already
 * has at least one assigned client via lib/tenancy/seed.ts's compile-time
 * roster, so this path is real and correct but not live-reachable with
 * today's fixed roster (there is no dynamic coach-signup flow analogous to
 * CREATE_CLIENT).
 */
export function isGenuinelyNewCoach(input: { calibrationStatus: CoachCalibrationStatus; clientCount: number }): boolean {
  return input.calibrationStatus === "not_started" && input.clientCount === 0;
}
