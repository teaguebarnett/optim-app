// Phase 6.1A — Secure Founder Command Center.
//
// The ONE typed platform-operations repository/service boundary — every
// /admin page reads through PlatformOperationsRepository, never a raw
// Supabase query of its own, mirroring lib/production/repository.ts's and
// lib/production/coach-operations.ts's own established "one interface, a
// Demo adapter and a Supabase adapter, one factory keyed on resolveAppMode()"
// pattern exactly.
//
// THREAT MODEL — why this file uses the service-role admin client at all:
// every other repository in this codebase reads through the caller's own
// RLS-governed session (getSupabaseServerClient), because RLS's own
// workspace-membership predicates already scope that caller correctly. A
// platform_owner/platform_admin is different by design: they hold NO
// workspace_memberships row at all in the general case (see
// lib/production/platform-auth.ts's own doc — platform authority is
// deliberately independent of workspace membership, so ownership is
// transferable without ever granting a new owner membership in every
// workspace). That means the ordinary RLS-governed client would show a
// platform owner ZERO rows in any workspace's tables — not a security
// feature here, just the wrong tool for a genuinely cross-tenant read.
//
// So every method below follows the same two-step discipline:
//   1. Call requirePlatformAuth(...) FIRST — resolved through the caller's
//      own RLS-governed session (see platform-auth.ts), independently
//      re-verified on every single call, never cached across requests and
//      never trusted from a prior check. This is the real gate.
//   2. Only once that has genuinely thrown-or-passed does this file reach
//      for getSupabaseAdminClient() to run the actual cross-workspace
//      aggregate/listing query. RLS is bypassed deliberately and only for
//      these specific, narrowly-scoped, already-authorized reads — never for
//      a write, and never reachable before step 1 has run.
//
// Every query in this file is read-only. No mutation, bulk action,
// impersonation, or destructive control exists here or anywhere else in this
// phase (see the migration's own header and the manual grant/revoke script)
// — Phase 6.1A is an operationally useful, deliberately read-only surface.

import "server-only";
import { getSupabaseAdminClient } from "../supabase/admin.ts";
import { requirePlatformAuth, PLATFORM_STAFF_ROLES, type PlatformRole } from "./platform-auth.ts";
import { resolveAppMode } from "./mode.ts";
import { deriveLifecycle } from "../coach/roster.ts";
import { getAiEnvConfig } from "../ai/env.ts";
import { getSupabaseServerConfig } from "./env.ts";
import { median } from "../shared/stats.ts";
import {
  ALL_WORKSPACES,
  ALL_COACH_PROFILES,
  ALL_CLIENT_PROFILES,
  ALL_MEMBERSHIPS,
  ALL_ASSIGNMENTS,
  ALL_SAMPLE_REVIEW_REQUESTS,
  ALL_SAMPLE_MESSAGES,
} from "../tenancy/seed.ts";
import type { ClientLifecycleStatus } from "../coach/types";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type LifecycleBucket = Exclude<ClientLifecycleStatus, "ready_to_activate"> | "archived";

export interface PlatformActivityItem {
  id: string;
  kind: "workspace_created" | "client_created" | "escalation_opened" | "escalation_resolved";
  label: string;
  atIso: string;
}

export interface PlatformWarning {
  id: string;
  severity: "info" | "warning";
  message: string;
}

export interface PlatformOverviewMetrics {
  registeredCoachCount: number;
  coachWorkspaceCount: number;
  coachesWithAssignedClientsCount: number;
  totalClientCount: number;
  lifecycleCounts: Record<LifecycleBucket, number>;
  escalationStatusCounts: { open: number; resolved: number };
  conversationCount: number;
  clientMessageCount: number;
  assistantMessageCount: number;
  recentActivity: PlatformActivityItem[];
  operationalWarnings: PlatformWarning[];
  generatedAtIso: string;
  /** True only for the demo/fixture adapter — the overview page must show a
   * visible "demo fixtures, not live data" note whenever this is true (see
   * this file's Demo adapter doc). */
  isDemoFixture: boolean;
}

export interface PlatformCoachSummary {
  /** The workspace_memberships row id — the stable identity a coach detail
   * route keys on (see this file's header doc for why: today this is
   * effectively one row per workspace, but the schema already supports more
   * than one staff member per workspace). */
  membershipId: string;
  userId: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
  workspaceStatus: string;
  workspaceCreatedAtIso: string;
  assignedClientCount: number;
  lifecycleCounts: Partial<Record<LifecycleBucket, number>>;
  openEscalationCount: number;
  lastActivityIso: string | null;
}

export interface PlatformCoachDetail extends PlatformCoachSummary {
  clients: { clientId: string; displayName: string; lifecycle: LifecycleBucket }[];
}

export interface PlatformClientSummary {
  clientId: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
  coachDisplayName: string;
  lifecycle: LifecycleBucket;
  onboardingCompletedAtIso: string | null;
  hasActiveProgram: boolean;
  hasActiveNutrition: boolean;
  openEscalationCount: number;
  createdAtIso: string;
}

export interface PlatformClientDetail extends PlatformClientSummary {
  goal: string | null;
  invitedEmail: string | null;
  hasSignedIn: boolean;
  startDateIso: string | null;
  timezone: string;
  activeProgramVersionNumber: number | null;
  activeNutritionVersionNumber: number | null;
}

export interface PlatformAiProviderCount {
  providerId: string;
  modelId: string;
  count: number;
}

export interface PlatformAiOperationsMetrics {
  conversationCount: number;
  clientMessageCount: number;
  assistantMessageCount: number;
  coachMessageCount: number;
  providerDistribution: PlatformAiProviderCount[];
  realProviderMessageCount: number;
  fakeProviderMessageCount: number;
  latencyMs: { averageMs: number | null; medianMs: number | null; sampleSize: number };
  failureCount: number;
  escalationCount: number;
  recentActivity: { atIso: string; workspaceName: string; decisionKind: string | null; providerId: string | null; modelId: string | null; latencyMs: number | null; failure: string | null }[];
  isDemoFixture: boolean;
}

export interface PlatformSystemStatus {
  appMode: "demo" | "supabase";
  currentRole: PlatformRole | "demo";
  supabaseConfigured: boolean;
  anthropicConfigured: boolean;
  aiProviderId: "anthropic" | "fake";
  recentProviderFailures: { atIso: string; failure: string }[];
  unavailableMetrics: string[];
  notes: string[];
}

export interface PlatformOperationsRepository {
  getOverview(): Promise<PlatformOverviewMetrics>;
  listCoaches(): Promise<PlatformCoachSummary[]>;
  getCoachDetail(membershipId: string): Promise<PlatformCoachDetail | null>;
  listClients(): Promise<PlatformClientSummary[]>;
  getClientDetail(clientId: string): Promise<PlatformClientDetail | null>;
  getAiOperations(): Promise<PlatformAiOperationsMetrics>;
  getSystemStatus(): Promise<PlatformSystemStatus>;
}

const LIFECYCLE_BUCKETS: LifecycleBucket[] = ["invited", "onboarding", "coach_setup", "active", "paused", "completed", "archived"];

function emptyLifecycleCounts(): Record<LifecycleBucket, number> {
  const counts = {} as Record<LifecycleBucket, number>;
  for (const bucket of LIFECYCLE_BUCKETS) counts[bucket] = 0;
  return counts;
}

// ---------------------------------------------------------------------------
// Demo adapter — deterministic, real seed fixtures (lib/tenancy/seed.ts),
// completely isolated from the interactive demo prototype's own live
// localStorage state, for exactly the reason lib/production/coach-
// operations.ts's own DemoCoachOperationsRepository already documents: this
// is server-only code, which architecturally cannot read browser
// localStorage. This is NOT a live view of "whatever the demo prototype
// currently shows" — it is a real, honest rendering of the same static
// fixtures every other server-only demo adapter in this codebase already
// falls back to, clearly labeled as such (isDemoFixture: true) rather than
// silently presented as live data.
// ---------------------------------------------------------------------------
class DemoPlatformOperationsRepository implements PlatformOperationsRepository {
  async getOverview(): Promise<PlatformOverviewMetrics> {
    const lifecycleCounts = emptyLifecycleCounts();
    // The demo fixture roster has no separate lifecycle concept (see
    // lib/tenancy/types.ts's ClientProfile) — every seeded client is a real,
    // fully-configured "active" client by construction.
    lifecycleCounts.active = ALL_CLIENT_PROFILES.length;

    const coachesWithClients = new Set(ALL_ASSIGNMENTS.map((a) => a.coachId));

    const recentActivity: PlatformActivityItem[] = ALL_CLIENT_PROFILES.map((c, i) => ({
      id: `demo-client-${c.id}`,
      kind: "client_created" as const,
      label: `${c.name} added to ${ALL_WORKSPACES.find((w) => w.id === c.workspaceId)?.displayName ?? "a workspace"}`,
      atIso: new Date(Date.now() - i * 86_400_000).toISOString(),
    }));

    return {
      registeredCoachCount: ALL_COACH_PROFILES.length,
      coachWorkspaceCount: ALL_WORKSPACES.length,
      coachesWithAssignedClientsCount: coachesWithClients.size,
      totalClientCount: ALL_CLIENT_PROFILES.length,
      lifecycleCounts,
      escalationStatusCounts: {
        open: ALL_SAMPLE_REVIEW_REQUESTS.filter((r) => r.status !== "resolved").length,
        resolved: ALL_SAMPLE_REVIEW_REQUESTS.filter((r) => r.status === "resolved").length,
      },
      conversationCount: new Set(ALL_SAMPLE_MESSAGES.map((m) => m.clientId)).size,
      clientMessageCount: ALL_SAMPLE_MESSAGES.filter((m) => m.sender === "client").length,
      assistantMessageCount: ALL_SAMPLE_MESSAGES.filter((m) => m.sender === "assistant").length,
      recentActivity,
      operationalWarnings: [
        { id: "demo-fixture-notice", severity: "info", message: "Demo mode shows the static seed roster only, not the interactive prototype's live browser state." },
      ],
      generatedAtIso: new Date().toISOString(),
      isDemoFixture: true,
    };
  }

  async listCoaches(): Promise<PlatformCoachSummary[]> {
    return ALL_MEMBERSHIPS.filter((m) => m.role === "workspace_owner" || m.role === "coach" || m.role === "platform_admin").map((m) => {
      const coach = ALL_COACH_PROFILES.find((c) => c.userId === m.userId && c.workspaceId === m.workspaceId);
      const workspace = ALL_WORKSPACES.find((w) => w.id === m.workspaceId);
      const assignedClients = ALL_ASSIGNMENTS.filter((a) => a.coachId === coach?.id);
      const lifecycleCounts: Partial<Record<LifecycleBucket, number>> = { active: assignedClients.length };
      return {
        membershipId: m.id,
        userId: m.userId,
        displayName: coach?.displayName ?? "Coach",
        workspaceId: m.workspaceId,
        workspaceName: workspace?.displayName ?? "Workspace",
        workspaceStatus: workspace?.status ?? "active",
        workspaceCreatedAtIso: workspace?.createdAtIso ?? new Date().toISOString(),
        assignedClientCount: assignedClients.length,
        lifecycleCounts,
        openEscalationCount: ALL_SAMPLE_REVIEW_REQUESTS.filter((r) => r.status !== "resolved" && assignedClients.some((a) => a.clientId === r.clientId)).length,
        lastActivityIso: null,
      };
    });
  }

  async getCoachDetail(membershipId: string): Promise<PlatformCoachDetail | null> {
    const summaries = await this.listCoaches();
    const summary = summaries.find((s) => s.membershipId === membershipId);
    if (!summary) return null;
    const coach = ALL_COACH_PROFILES.find((c) => c.userId === summary.userId && c.workspaceId === summary.workspaceId);
    const clients = ALL_ASSIGNMENTS.filter((a) => a.coachId === coach?.id).map((a) => {
      const client = ALL_CLIENT_PROFILES.find((c) => c.id === a.clientId);
      return { clientId: a.clientId, displayName: client?.name ?? "Client", lifecycle: "active" as LifecycleBucket };
    });
    return { ...summary, clients };
  }

  async listClients(): Promise<PlatformClientSummary[]> {
    return ALL_CLIENT_PROFILES.map((client) => {
      const workspace = ALL_WORKSPACES.find((w) => w.id === client.workspaceId);
      const coach = ALL_COACH_PROFILES.find((c) => c.id === client.primaryCoachId);
      return {
        clientId: client.id,
        displayName: client.name,
        workspaceId: client.workspaceId,
        workspaceName: workspace?.displayName ?? "Workspace",
        coachDisplayName: coach?.displayName ?? "Unassigned",
        lifecycle: "active",
        onboardingCompletedAtIso: null,
        hasActiveProgram: true,
        hasActiveNutrition: true,
        openEscalationCount: ALL_SAMPLE_REVIEW_REQUESTS.filter((r) => r.clientId === client.id && r.status !== "resolved").length,
        createdAtIso: new Date().toISOString(),
      };
    });
  }

  async getClientDetail(clientId: string): Promise<PlatformClientDetail | null> {
    const summaries = await this.listClients();
    const summary = summaries.find((s) => s.clientId === clientId);
    if (!summary) return null;
    const client = ALL_CLIENT_PROFILES.find((c) => c.id === clientId);
    return {
      ...summary,
      goal: client?.goal ?? null,
      invitedEmail: null,
      hasSignedIn: true,
      startDateIso: null,
      timezone: "UTC",
      activeProgramVersionNumber: 1,
      activeNutritionVersionNumber: 1,
    };
  }

  async getAiOperations(): Promise<PlatformAiOperationsMetrics> {
    return {
      conversationCount: new Set(ALL_SAMPLE_MESSAGES.map((m) => m.clientId)).size,
      clientMessageCount: ALL_SAMPLE_MESSAGES.filter((m) => m.sender === "client").length,
      assistantMessageCount: ALL_SAMPLE_MESSAGES.filter((m) => m.sender === "assistant").length,
      coachMessageCount: 0,
      providerDistribution: [{ providerId: "fake", modelId: "demo-fixture", count: ALL_SAMPLE_MESSAGES.length }],
      realProviderMessageCount: 0,
      fakeProviderMessageCount: ALL_SAMPLE_MESSAGES.length,
      latencyMs: { averageMs: null, medianMs: null, sampleSize: 0 },
      failureCount: 0,
      escalationCount: ALL_SAMPLE_REVIEW_REQUESTS.length,
      recentActivity: [],
      isDemoFixture: true,
    };
  }

  async getSystemStatus(): Promise<PlatformSystemStatus> {
    return {
      appMode: "demo",
      currentRole: "demo",
      supabaseConfigured: false,
      anthropicConfigured: false,
      aiProviderId: "fake",
      recentProviderFailures: [],
      unavailableMetrics: ["Billing / revenue", "Token cost", "Churn / retention"],
      notes: ["Demo mode: every metric on this page is derived from the static seed roster (lib/tenancy/seed.ts), never the interactive prototype's live browser state."],
    };
  }
}

// ---------------------------------------------------------------------------
// Supabase adapter — see this file's own module-level threat-model doc.
// ---------------------------------------------------------------------------

interface RawPlatformClientRow {
  id: string;
  display_name: string;
  goal: string | null;
  invited_email: string | null;
  user_id: string | null;
  created_at: string;
  workspace_id: string;
  workspaces: { display_name: string } | null;
  coach_client_assignments: { coach_user_id: string; is_primary: boolean; profiles: { display_name: string } | null }[] | null;
  // client_profile_id is UNIQUE on both tables, so PostgREST embeds a
  // single object, not an array — see lib/production/roster.ts's own note
  // on this same shape (confirmed live; a prior `?.[0]` here silently
  // evaluated to undefined for every row).
  client_enrollments: { status: string; timezone: string; original_program_start_date: string | null; archived_at: string | null } | null;
  client_onboarding_progress: { completed_at: string | null } | null;
}

function lifecycleBucketFor(raw: RawPlatformClientRow): LifecycleBucket {
  const enrollment = raw.client_enrollments ?? null;
  const onboarding = raw.client_onboarding_progress ?? null;
  if (enrollment?.archived_at) return "archived";
  const status = deriveLifecycle({
    enrollmentStatus: enrollment?.status ?? null,
    onboardingExists: onboarding !== null,
    onboardingCompletedAtIso: onboarding?.completed_at ?? null,
  });
  return status as LifecycleBucket;
}

class SupabasePlatformOperationsRepository implements PlatformOperationsRepository {
  private async fetchAllClientRows() {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("client_profiles")
      .select(
        `id, display_name, goal, invited_email, user_id, created_at, workspace_id,
         workspaces(display_name),
         coach_client_assignments(coach_user_id, is_primary, profiles:coach_user_id(display_name)),
         client_enrollments(status, timezone, original_program_start_date, archived_at),
         client_onboarding_progress(completed_at)`
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(`fetchAllClientRows failed: ${error.message}`);
    return (data ?? []) as unknown as RawPlatformClientRow[];
  }

  private async fetchOpenEscalationCountsByClient(): Promise<Map<string, number>> {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from("escalations").select("client_profile_id").neq("status", "resolved");
    if (error) throw new Error(`fetchOpenEscalationCountsByClient failed: ${error.message}`);
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const id = row.client_profile_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }

  private async fetchActiveAssignmentClientIds(): Promise<{ program: Map<string, number>; nutrition: Map<string, number> }> {
    const admin = getSupabaseAdminClient();
    const [{ data: programRows, error: programError }, { data: nutritionRows, error: nutritionError }] = await Promise.all([
      admin
        .from("program_assignments")
        .select("client_profile_id, training_program_versions(version_number)")
        .eq("status", "active"),
      admin
        .from("nutrition_plan_assignments")
        .select("client_profile_id, nutrition_plan_versions(version_number)")
        .eq("status", "active"),
    ]);
    if (programError) throw new Error(`fetchActiveAssignmentClientIds (program) failed: ${programError.message}`);
    if (nutritionError) throw new Error(`fetchActiveAssignmentClientIds (nutrition) failed: ${nutritionError.message}`);

    const program = new Map<string, number>();
    for (const row of programRows ?? []) {
      const version = row.training_program_versions as unknown as { version_number: number } | null;
      program.set(row.client_profile_id as string, version?.version_number ?? 0);
    }
    const nutrition = new Map<string, number>();
    for (const row of nutritionRows ?? []) {
      const version = row.nutrition_plan_versions as unknown as { version_number: number } | null;
      nutrition.set(row.client_profile_id as string, version?.version_number ?? 0);
    }
    return { program, nutrition };
  }

  async getOverview(): Promise<PlatformOverviewMetrics> {
    await requirePlatformAuth(PLATFORM_STAFF_ROLES);
    const admin = getSupabaseAdminClient();

    const [clientRows, escalationCounts, { data: workspaceRows, error: workspaceError }, { data: membershipRows, error: membershipError }, { data: assignmentRows, error: assignmentError }] =
      await Promise.all([
        this.fetchAllClientRows(),
        this.fetchOpenEscalationCountsByClient(),
        admin.from("workspaces").select("id, display_name, created_at").order("created_at", { ascending: false }),
        admin.from("workspace_memberships").select("user_id, workspace_id, role").eq("status", "active").in("role", ["workspace_owner", "coach", "platform_admin"]),
        admin.from("coach_client_assignments").select("coach_user_id"),
      ]);
    if (workspaceError) throw new Error(`getOverview (workspaces) failed: ${workspaceError.message}`);
    if (membershipError) throw new Error(`getOverview (memberships) failed: ${membershipError.message}`);
    if (assignmentError) throw new Error(`getOverview (assignments) failed: ${assignmentError.message}`);

    const lifecycleCounts = emptyLifecycleCounts();
    for (const raw of clientRows) lifecycleCounts[lifecycleBucketFor(raw)] += 1;

    const registeredCoachIds = new Set((membershipRows ?? []).map((m) => m.user_id as string));
    const coachesWithClients = new Set((assignmentRows ?? []).map((a) => a.coach_user_id as string));

    let openTotal = 0;
    for (const count of escalationCounts.values()) openTotal += count;
    const { count: resolvedCount, error: resolvedError } = await admin
      .from("escalations")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved");
    if (resolvedError) throw new Error(`getOverview (resolved escalations) failed: ${resolvedError.message}`);

    const { count: conversationCount, error: conversationError } = await admin.from("conversations").select("id", { count: "exact", head: true });
    if (conversationError) throw new Error(`getOverview (conversations) failed: ${conversationError.message}`);
    const { count: clientMessageCount, error: clientMsgError } = await admin
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .eq("actor_type", "client");
    if (clientMsgError) throw new Error(`getOverview (client messages) failed: ${clientMsgError.message}`);
    const { count: assistantMessageCount, error: assistantMsgError } = await admin
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .eq("actor_type", "assistant");
    if (assistantMsgError) throw new Error(`getOverview (assistant messages) failed: ${assistantMsgError.message}`);

    const recentActivity: PlatformActivityItem[] = [
      ...(workspaceRows ?? []).slice(0, 5).map((w) => ({
        id: `workspace-${w.id}`,
        kind: "workspace_created" as const,
        label: `Workspace "${w.display_name}" created`,
        atIso: w.created_at as string,
      })),
      ...clientRows.slice(0, 8).map((c) => ({
        id: `client-${c.id}`,
        kind: "client_created" as const,
        label: `${c.display_name} added to ${c.workspaces?.display_name ?? "a workspace"}`,
        atIso: c.created_at,
      })),
    ]
      .sort((a, b) => b.atIso.localeCompare(a.atIso))
      .slice(0, 10);

    const operationalWarnings: PlatformWarning[] = [];
    const staleInvitedCount = clientRows.filter((c) => {
      const enrollment = c.client_enrollments;
      if (enrollment?.status !== "invited") return false;
      return Date.now() - new Date(c.created_at).getTime() > 14 * 86_400_000;
    }).length;
    if (staleInvitedCount > 0) {
      operationalWarnings.push({
        id: "stale-invites",
        severity: "warning",
        message: `${staleInvitedCount} client${staleInvitedCount === 1 ? "" : "s"} invited more than 14 days ago with no onboarding activity yet.`,
      });
    }
    if (openTotal > 0) {
      operationalWarnings.push({ id: "open-escalations", severity: openTotal > 5 ? "warning" : "info", message: `${openTotal} escalation${openTotal === 1 ? "" : "s"} awaiting coach attention.` });
    }
    const workspacesWithNoClients = (workspaceRows ?? []).length - new Set(clientRows.map((c) => c.workspace_id)).size;
    if (workspacesWithNoClients > 0) {
      operationalWarnings.push({
        id: "workspaces-no-clients",
        severity: "info",
        message: `${workspacesWithNoClients} workspace${workspacesWithNoClients === 1 ? "" : "s"} registered with no clients yet.`,
      });
    }

    return {
      registeredCoachCount: registeredCoachIds.size,
      coachWorkspaceCount: (workspaceRows ?? []).length,
      coachesWithAssignedClientsCount: coachesWithClients.size,
      totalClientCount: clientRows.length,
      lifecycleCounts,
      escalationStatusCounts: { open: openTotal, resolved: resolvedCount ?? 0 },
      conversationCount: conversationCount ?? 0,
      clientMessageCount: clientMessageCount ?? 0,
      assistantMessageCount: assistantMessageCount ?? 0,
      recentActivity,
      operationalWarnings,
      generatedAtIso: new Date().toISOString(),
      isDemoFixture: false,
    };
  }

  async listCoaches(): Promise<PlatformCoachSummary[]> {
    await requirePlatformAuth(PLATFORM_STAFF_ROLES);
    const admin = getSupabaseAdminClient();

    const [{ data: membershipRows, error: membershipError }, clientRows, escalationCounts] = await Promise.all([
      admin
        .from("workspace_memberships")
        .select("id, user_id, workspace_id, profiles(display_name), workspaces(display_name, status, created_at)")
        .eq("status", "active")
        .in("role", ["workspace_owner", "coach", "platform_admin"]),
      this.fetchAllClientRows(),
      this.fetchOpenEscalationCountsByClient(),
    ]);
    if (membershipError) throw new Error(`listCoaches failed: ${membershipError.message}`);

    return (membershipRows ?? []).map((m) => {
      const profile = m.profiles as unknown as { display_name: string } | null;
      const workspace = m.workspaces as unknown as { display_name: string; status: string; created_at: string } | null;
      const assigned = clientRows.filter((c) => (c.coach_client_assignments ?? []).some((a) => a.coach_user_id === m.user_id));
      const lifecycleCounts: Partial<Record<LifecycleBucket, number>> = {};
      let openEscalationCount = 0;
      for (const client of assigned) {
        const bucket = lifecycleBucketFor(client);
        lifecycleCounts[bucket] = (lifecycleCounts[bucket] ?? 0) + 1;
        openEscalationCount += escalationCounts.get(client.id) ?? 0;
      }
      return {
        membershipId: m.id as string,
        userId: m.user_id as string,
        displayName: profile?.display_name ?? "Coach",
        workspaceId: m.workspace_id as string,
        workspaceName: workspace?.display_name ?? "Workspace",
        workspaceStatus: workspace?.status ?? "active",
        workspaceCreatedAtIso: workspace?.created_at ?? new Date().toISOString(),
        assignedClientCount: assigned.length,
        lifecycleCounts,
        openEscalationCount,
        lastActivityIso: assigned.length > 0 ? (assigned.map((c) => c.created_at).sort().at(-1) ?? null) : null,
      };
    });
  }

  async getCoachDetail(membershipId: string): Promise<PlatformCoachDetail | null> {
    await requirePlatformAuth(PLATFORM_STAFF_ROLES);
    const summaries = await this.listCoaches();
    const summary = summaries.find((s) => s.membershipId === membershipId);
    if (!summary) return null;

    const clientRows = await this.fetchAllClientRows();
    const clients = clientRows
      .filter((c) => (c.coach_client_assignments ?? []).some((a) => a.coach_user_id === summary.userId))
      .map((c) => ({ clientId: c.id, displayName: c.display_name, lifecycle: lifecycleBucketFor(c) }));

    return { ...summary, clients };
  }

  async listClients(): Promise<PlatformClientSummary[]> {
    await requirePlatformAuth(PLATFORM_STAFF_ROLES);
    const [clientRows, escalationCounts, { program, nutrition }] = await Promise.all([
      this.fetchAllClientRows(),
      this.fetchOpenEscalationCountsByClient(),
      this.fetchActiveAssignmentClientIds(),
    ]);

    return clientRows.map((raw) => {
      const primary = raw.coach_client_assignments?.find((a) => a.is_primary) ?? raw.coach_client_assignments?.[0] ?? null;
      const onboarding = raw.client_onboarding_progress ?? null;
      return {
        clientId: raw.id,
        displayName: raw.display_name,
        workspaceId: raw.workspace_id,
        workspaceName: raw.workspaces?.display_name ?? "Workspace",
        coachDisplayName: primary?.profiles?.display_name ?? "Unassigned",
        lifecycle: lifecycleBucketFor(raw),
        onboardingCompletedAtIso: onboarding?.completed_at ?? null,
        hasActiveProgram: program.has(raw.id),
        hasActiveNutrition: nutrition.has(raw.id),
        openEscalationCount: escalationCounts.get(raw.id) ?? 0,
        createdAtIso: raw.created_at,
      };
    });
  }

  async getClientDetail(clientId: string): Promise<PlatformClientDetail | null> {
    await requirePlatformAuth(PLATFORM_STAFF_ROLES);
    const [summaries, { program, nutrition }] = await Promise.all([this.listClients(), this.fetchActiveAssignmentClientIds()]);
    const summary = summaries.find((s) => s.clientId === clientId);
    if (!summary) return null;

    const admin = getSupabaseAdminClient();
    const { data: raw, error } = await admin
      .from("client_profiles")
      .select("goal, invited_email, user_id, client_enrollments(original_program_start_date, timezone)")
      .eq("id", clientId)
      .single();
    if (error) throw new Error(`getClientDetail failed: ${error.message}`);
    const enrollment = (raw.client_enrollments as unknown as { original_program_start_date: string | null; timezone: string } | null) ?? null;

    return {
      ...summary,
      goal: raw.goal as string | null,
      invitedEmail: raw.invited_email as string | null,
      hasSignedIn: raw.user_id !== null,
      startDateIso: enrollment?.original_program_start_date ?? null,
      timezone: enrollment?.timezone ?? "UTC",
      activeProgramVersionNumber: program.get(clientId) ?? null,
      activeNutritionVersionNumber: nutrition.get(clientId) ?? null,
    };
  }

  async getAiOperations(): Promise<PlatformAiOperationsMetrics> {
    await requirePlatformAuth(PLATFORM_STAFF_ROLES);
    const admin = getSupabaseAdminClient();

    const [{ count: conversationCount, error: conversationError }, { count: clientMessageCount, error: clientErr }, { count: coachMessageCount, error: coachErr }, { data: assistantRows, error: assistantError }, { count: escalationCount, error: escalationError }] =
      await Promise.all([
        admin.from("conversations").select("id", { count: "exact", head: true }),
        admin.from("conversation_messages").select("id", { count: "exact", head: true }).eq("actor_type", "client"),
        admin.from("conversation_messages").select("id", { count: "exact", head: true }).eq("actor_type", "coach"),
        admin
          .from("conversation_messages")
          .select("created_at, route_meta, conversations(workspace_id, workspaces(display_name))")
          .eq("actor_type", "assistant")
          .order("created_at", { ascending: false })
          .limit(500),
        admin.from("escalations").select("id", { count: "exact", head: true }),
      ]);
    if (conversationError) throw new Error(`getAiOperations (conversations) failed: ${conversationError.message}`);
    if (clientErr) throw new Error(`getAiOperations (client messages) failed: ${clientErr.message}`);
    if (coachErr) throw new Error(`getAiOperations (coach messages) failed: ${coachErr.message}`);
    if (assistantError) throw new Error(`getAiOperations (assistant messages) failed: ${assistantError.message}`);
    if (escalationError) throw new Error(`getAiOperations (escalations) failed: ${escalationError.message}`);

    const assistantMessages = (assistantRows ?? []) as unknown as {
      created_at: string;
      route_meta: Record<string, unknown> | null;
      conversations: { workspace_id: string; workspaces: { display_name: string } | null } | null;
    }[];

    const providerCounts = new Map<string, PlatformAiProviderCount>();
    const latencies: number[] = [];
    let realProviderCount = 0;
    let fakeProviderCount = 0;
    let failureCount = 0;

    for (const row of assistantMessages) {
      const meta = row.route_meta ?? {};
      const providerId = typeof meta.providerId === "string" ? meta.providerId : "unknown";
      const modelId = typeof meta.modelId === "string" ? meta.modelId : "unknown";
      const key = `${providerId}::${modelId}`;
      const existing = providerCounts.get(key);
      providerCounts.set(key, { providerId, modelId, count: (existing?.count ?? 0) + 1 });
      // "coach-approved"/"unknown" are neither a real model call nor the
      // deterministic fake provider (see lib/ai/pipeline.ts's routeMeta —
      // coach-approved is a human re-send of OPTIM's own draft, zero
      // latency, no fresh model call) — counted only in providerDistribution
      // above, not in either bucket here, so this split stays honest.
      if (providerId === "anthropic") realProviderCount += 1;
      else if (providerId === "fake") fakeProviderCount += 1;
      if (typeof meta.latencyMs === "number" && meta.latencyMs > 0) latencies.push(meta.latencyMs);
      if (typeof meta.providerFailure === "string") failureCount += 1;
    }

    const recentActivity = assistantMessages.slice(0, 20).map((row) => {
      const meta = row.route_meta ?? {};
      return {
        atIso: row.created_at,
        workspaceName: row.conversations?.workspaces?.display_name ?? "Workspace",
        decisionKind: typeof meta.decisionKind === "string" ? meta.decisionKind : null,
        providerId: typeof meta.providerId === "string" ? meta.providerId : null,
        modelId: typeof meta.modelId === "string" ? meta.modelId : null,
        latencyMs: typeof meta.latencyMs === "number" ? meta.latencyMs : null,
        failure: typeof meta.providerFailure === "string" ? meta.providerFailure : null,
      };
    });

    return {
      conversationCount: conversationCount ?? 0,
      clientMessageCount: clientMessageCount ?? 0,
      assistantMessageCount: assistantMessages.length,
      coachMessageCount: coachMessageCount ?? 0,
      providerDistribution: [...providerCounts.values()].sort((a, b) => b.count - a.count),
      realProviderMessageCount: realProviderCount,
      fakeProviderMessageCount: fakeProviderCount,
      latencyMs: {
        averageMs: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
        medianMs: median(latencies),
        sampleSize: latencies.length,
      },
      failureCount,
      escalationCount: escalationCount ?? 0,
      recentActivity,
      isDemoFixture: false,
    };
  }

  async getSystemStatus(): Promise<PlatformSystemStatus> {
    const ctx = await requirePlatformAuth(PLATFORM_STAFF_ROLES);
    const admin = getSupabaseAdminClient();

    let supabaseConfigured = true;
    try {
      getSupabaseServerConfig();
    } catch {
      supabaseConfigured = false;
    }

    const aiConfig = getAiEnvConfig();

    // Filtered in application code rather than a route_meta->>'providerFailure'
    // PostgREST operator string: this codebase has no existing precedent for
    // JSON-path filter syntax through supabase-js, and a plain bounded recent
    // scan is simple enough to trust without a live database to verify
    // operator syntax against (see this phase's own honest "not run in this
    // environment" note for Docker/Supabase CLI).
    const { data: recentAssistantRows, error: failureError } = await admin
      .from("conversation_messages")
      .select("created_at, route_meta")
      .eq("actor_type", "assistant")
      .order("created_at", { ascending: false })
      .limit(200);
    if (failureError) throw new Error(`getSystemStatus failed: ${failureError.message}`);

    const recentProviderFailures = (recentAssistantRows ?? [])
      .map((r) => ({ atIso: r.created_at as string, failure: (r.route_meta as Record<string, unknown> | null)?.providerFailure }))
      .filter((r): r is { atIso: string; failure: string } => typeof r.failure === "string")
      .slice(0, 10);

    return {
      appMode: "supabase",
      currentRole: ctx.role,
      supabaseConfigured,
      anthropicConfigured: !!aiConfig.anthropicApiKey,
      aiProviderId: aiConfig.providerId,
      recentProviderFailures,
      unavailableMetrics: ["Billing / revenue", "Token cost", "Churn / retention"],
      notes: [
        "Token cost and billing are not instrumented anywhere in this schema yet — no persisted per-request token usage or pricing input exists to compute them honestly.",
        "\"Coaches active in the last 30 days\" is derived from the most recent client-affecting record this platform actually persists (a new client, a resolved escalation, an assistant message in one of their clients' conversations) — not a dedicated coach-session/login-activity table, which does not exist yet.",
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Factory — mirrors getFoundationRepository/getCoachOperationsRepository.
// ---------------------------------------------------------------------------

let cached: PlatformOperationsRepository | null = null;

export function getPlatformOperationsRepository(): PlatformOperationsRepository {
  if (cached) return cached;
  cached = resolveAppMode() === "supabase" ? new SupabasePlatformOperationsRepository() : new DemoPlatformOperationsRepository();
  return cached;
}

export function __resetPlatformOperationsRepositoryForTests(): void {
  cached = null;
}
