// Phase 6.0A — Production Foundation.
//
// The repository/data-access boundary Part 6 requires: a small typed seam
// so Phase 6.0B can migrate the live workout/nutrition engines onto real
// Supabase data without any visual component ever importing
// @supabase/supabase-js or lib/tenancy/seed.ts directly. Scoped to exactly
// the foundation entities this phase proves — identity, workspace
// membership, client roster, and enrollment position anchors — NOT the
// full program/nutrition/communications/import surface, which is
// Phase 6.0B/6.0C's job to wire up through this same seam.
//
// Two adapters, one interface: DemoFoundationRepository (delegates to the
// existing localStorage/seed-backed prototype — lib/tenancy/seed.ts,
// unchanged) and SupabaseFoundationRepository (real queries through the
// authenticated, RLS-governed server client). getFoundationRepository()
// picks the right one from resolveAppMode() — the only place in this
// module that branches on mode; every caller downstream just holds a
// FoundationRepository and never checks the mode itself, exactly what
// "components consume domain-level data ... not raw-row authorization
// decisions" requires.

import "server-only";
import { resolveAppMode } from "./mode";
import { getAuthenticatedContext, type ProductionAuthContext } from "./auth";
import { getSupabaseServerClient } from "../supabase/server";
import { ALL_CLIENT_PROFILES, resolveAssignedCoachId } from "../tenancy/seed";
import { getDemoCoachSession } from "../tenancy/session";
import { resolveActiveContext } from "../tenancy/context";

export interface ClientSummary {
  id: string;
  displayName: string;
  primaryCoachId: string | null;
}

export interface ClientEnrollmentSummary {
  clientProfileId: string;
  status: string;
  currentPhase: string | null;
  currentWeekIndex: number | null;
  asOfDateIso: string | null;
  positionNativelyObserved: boolean;
}

export interface FoundationRepository {
  /** Resolves the current caller's identity/workspace context. In demo
   * mode this is the existing seeded coach/client session (see
   * lib/tenancy/session.ts) — completely unchanged behavior. In Supabase
   * mode this is a real, server-verified session — see
   * lib/production/auth.ts. */
  getCurrentContext(): Promise<ProductionAuthContext>;
  listClientsForWorkspace(workspaceId: string): Promise<ClientSummary[]>;
  getClientEnrollment(clientProfileId: string): Promise<ClientEnrollmentSummary | null>;
}

/** Demo adapter — a thin, read-only wrapper around the EXISTING
 * lib/tenancy fixture/seed data. Deliberately does not touch or duplicate
 * any of that logic; it only reshapes its output to this interface's
 * shape, so a future 6.0B caller written against FoundationRepository gets
 * identical behavior in demo mode to importing lib/tenancy directly. */
class DemoFoundationRepository implements FoundationRepository {
  async getCurrentContext(): Promise<ProductionAuthContext> {
    // The demo prototype has two independent seeded sessions (coach and
    // client — see lib/tenancy/session.ts's module doc). This repository
    // seam is used by server-only production code, which has no concept
    // of "which dev-perspective toggle is active" (that's a client-side,
    // localStorage-driven concern) — so it resolves the coach session,
    // the one lib/tenancy/session.ts itself calls "the one this prototype
    // ever needed a second entry point for."
    const ctx = resolveActiveContext(getDemoCoachSession());
    return {
      userId: ctx.user.id,
      profile: {
        id: ctx.user.id,
        displayName: ctx.user.displayName,
        email: ctx.user.email ?? null,
        avatarInitials: ctx.coachProfile?.avatarInitials ?? null,
      },
      memberships: [{ workspaceId: ctx.workspace.id, role: ctx.role, status: "active" }],
    };
  }

  async listClientsForWorkspace(workspaceId: string): Promise<ClientSummary[]> {
    return ALL_CLIENT_PROFILES.filter((c) => c.workspaceId === workspaceId).map((c) => ({
      id: c.id,
      displayName: c.name,
      primaryCoachId: c.primaryCoachId,
    }));
  }

  async getClientEnrollment(clientProfileId: string): Promise<ClientEnrollmentSummary | null> {
    const client = ALL_CLIENT_PROFILES.find((c) => c.id === clientProfileId);
    if (!client) return null;
    // The demo prototype has no separate "enrollment" record — program
    // week/phase live directly on ClientProfile (see lib/tenancy/types.ts).
    // Reshaped here, not duplicated: resolveAssignedCoachId still comes
    // from the one real seed function, not a second copy of the lookup.
    resolveAssignedCoachId(clientProfileId); // throws if the client is unknown, same invariant as the real seed layer
    return {
      clientProfileId: client.id,
      status: "active",
      currentPhase: null,
      currentWeekIndex: client.programWeek,
      asOfDateIso: null,
      positionNativelyObserved: true,
    };
  }
}

/** Supabase adapter — every query goes through the RLS-governed server
 * client, never the service-role admin client (see
 * lib/supabase/admin.ts's own doc on why that client is reserved for
 * narrowly-scoped admin ops only). RLS is the backstop; getAuthenticatedContext
 * is the primary, server-verified gate — see lib/production/auth.ts. */
class SupabaseFoundationRepository implements FoundationRepository {
  async getCurrentContext(): Promise<ProductionAuthContext> {
    return getAuthenticatedContext();
  }

  async listClientsForWorkspace(workspaceId: string): Promise<ClientSummary[]> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("client_profiles")
      .select("id, display_name, coach_client_assignments(coach_user_id, is_primary)")
      .eq("workspace_id", workspaceId);

    if (error) throw new Error(`listClientsForWorkspace failed: ${error.message}`);

    return (data ?? []).map((row) => {
      const assignments = (row.coach_client_assignments ?? []) as { coach_user_id: string; is_primary: boolean }[];
      const primary = assignments.find((a) => a.is_primary) ?? assignments[0];
      return {
        id: row.id as string,
        displayName: row.display_name as string,
        primaryCoachId: primary?.coach_user_id ?? null,
      };
    });
  }

  async getClientEnrollment(clientProfileId: string): Promise<ClientEnrollmentSummary | null> {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("client_enrollments")
      .select("client_profile_id, status, current_phase, current_week_index, as_of_date, position_natively_observed")
      .eq("client_profile_id", clientProfileId)
      .maybeSingle();

    if (error) throw new Error(`getClientEnrollment failed: ${error.message}`);
    if (!data) return null;

    return {
      clientProfileId: data.client_profile_id as string,
      status: data.status as string,
      currentPhase: data.current_phase as string | null,
      currentWeekIndex: data.current_week_index as number | null,
      asOfDateIso: data.as_of_date as string | null,
      positionNativelyObserved: data.position_natively_observed as boolean,
    };
  }
}

let cached: FoundationRepository | null = null;

export function getFoundationRepository(): FoundationRepository {
  if (cached) return cached;
  cached = resolveAppMode() === "supabase" ? new SupabaseFoundationRepository() : new DemoFoundationRepository();
  return cached;
}

/** Test-only: lets verify scripts exercise both adapters deterministically
 * without relying on module-load-order caching. */
export function __resetFoundationRepositoryForTests(): void {
  cached = null;
}
