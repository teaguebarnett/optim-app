// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// The Supabase-mode sibling of components/coach/demo-clients-page.tsx: a
// real roster, read through lib/production/roster.ts, rendered with the
// SAME ClientRosterTable/ClientRosterMobileList components demo mode uses
// (both produce lib/coach/roster.ts's RosterRow shape — see roster.ts's own
// doc) — one presentation, two real data sources. An async Server
// Component (this page's own data fetch is a real Supabase read, and the
// only interactive piece — Invite client — is its own small Client
// Component island, matching app/coach/page.tsx's LiveCoachDashboard
// pattern exactly.

import { PageHeader } from "@/components/coach/page-header";
import { ClientRosterTable } from "@/components/coach/client-roster-table";
import { ClientRosterMobileList } from "@/components/coach/client-roster-mobile-list";
import { InviteClientTrigger } from "@/components/coach/invite-client-trigger";
import { EmptyState } from "@/components/coach/empty-state";
import { Users } from "lucide-react";
import { listRosterForOwnWorkspace } from "@/lib/production/roster";

export async function LiveClientsPage() {
  const { workspaceId, rows } = await listRosterForOwnWorkspace();
  // Archived clients are hidden from the default roster (never deleted —
  // see lib/production/roster.ts's setClientLifecycleAction doc) but their
  // history/conversation/program data remains fully intact and reachable
  // directly by URL (/coach/clients/[clientId]) for a coach who still has
  // the link.
  const visibleRows = rows.filter((row) => !row.archived);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Every client assigned to you in this workspace."
        action={<InviteClientTrigger workspaceId={workspaceId} />}
      />

      {visibleRows.length === 0 ? (
        <EmptyState icon={Users} title="No clients yet" description="Invite a client to send them a real sign-in invitation." />
      ) : (
        <>
          <ClientRosterTable rows={visibleRows} />
          <ClientRosterMobileList rows={visibleRows} />
        </>
      )}
    </div>
  );
}
