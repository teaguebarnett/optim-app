// Where a just-completed email sign-in (or accepted invitation) lands.
//
// app/auth/confirm/page.tsx used to fall back to /auth/account whenever no
// `next` was carried through login — and nothing ever carried one, so every
// real sign-in dead-ended on that verification page regardless of role.
// This module is the pure decision half (no Supabase, no React — tested by
// lib/auth/verify-post-sign-in.mts); lib/production/post-sign-in.ts
// resolves the caller's real access server-side and feeds it in here.
//
// The access checks mirror each area's own layout gate exactly, so a
// destination chosen here is never one that layout then refuses:
// - /admin/*            app/admin/layout.tsx — active platform_administrators row
// - /coach/*, /coach-onboarding  app/coach/layout.tsx, app/coach-onboarding/layout.tsx
//                        — a workspace staff membership (isWorkspaceStaffRole)
// - /today, /plan, ...  app/(client)/layout.tsx — an own client_profiles row

import { classifyPathname } from "../coach/routing.ts";

export interface SignInAccess {
  isPlatformStaff: boolean;
  isWorkspaceStaff: boolean;
  isClient: boolean;
}

/** Returns `raw` as a same-origin, path-only destination, or null if it is
 * missing, absolute/protocol-relative (an open redirect), or points back
 * into /auth/* (which would only loop). */
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw, "https://optim.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://optim.invalid") return null;
  if (parsed.pathname === "/auth" || parsed.pathname.startsWith("/auth/")) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Whether `path` (already sanitized) is inside an area this access may
 * enter. Only the three gated areas qualify — anything else falls back to
 * the role's home rather than being honored blindly. */
export function isDestinationAllowed(path: string, access: SignInAccess): boolean {
  const pathname = new URL(path, "https://optim.invalid").pathname;
  if (isAdminPath(pathname)) return access.isPlatformStaff;
  const area = classifyPathname(pathname);
  if (area === "coach") return access.isWorkspaceStaff;
  if (area === "client-app") return access.isClient;
  return false;
}

/** The role's home. Workspace staff win over platform staff so a founder
 * who also owns a workspace lands on their coach dashboard (the Command
 * Center stays reachable via an explicit `next=/admin`). Null means the
 * session holds no usable role at all. */
export function resolveRoleHome(access: SignInAccess): string | null {
  if (access.isWorkspaceStaff) return "/coach";
  if (access.isPlatformStaff) return "/admin";
  if (access.isClient) return "/today";
  return null;
}

/** The final destination: an authorized `next` if one was carried, else the
 * role's home, else /auth/account (which explains a role-less session). */
export function resolvePostSignInDestination(rawNext: string | null | undefined, access: SignInAccess): string {
  const next = sanitizeNextPath(rawNext);
  if (next && isDestinationAllowed(next, access)) return next;
  return resolveRoleHome(access) ?? "/auth/account";
}
