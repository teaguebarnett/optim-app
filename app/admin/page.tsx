import { AlertTriangle, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/admin/stat-tile";
import { getPlatformOperationsRepository, type LifecycleBucket } from "@/lib/production/platform-operations";

const LIFECYCLE_LABELS: Record<LifecycleBucket, string> = {
  invited: "Invited clients",
  onboarding: "Onboarding clients",
  coach_setup: "Awaiting coach setup",
  active: "Active clients",
  paused: "Paused clients",
  completed: "Completed",
  archived: "Archived clients",
};

const LIFECYCLE_ORDER: LifecycleBucket[] = ["invited", "onboarding", "coach_setup", "active", "paused", "completed", "archived"];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export default async function AdminOverviewPage() {
  const overview = await getPlatformOperationsRepository().getOverview();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-heading text-off-white">Platform Overview</h1>
        <p className="text-meta text-neutral">
          {overview.isDemoFixture ? "Demo fixtures — deterministic seed data, not live platform traffic." : `Live data as of ${new Date(overview.generatedAtIso).toLocaleString()}.`}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Registered coaches" value={overview.registeredCoachCount} hint="Users holding an active coach/owner role in any workspace" />
        <StatTile label="Coach workspaces" value={overview.coachWorkspaceCount} hint="Independent coaching businesses on OPTIM" />
        <StatTile label="Coaches with assigned clients" value={overview.coachesWithAssignedClientsCount} />
        <StatTile label="Total clients" value={overview.totalClientCount} />
      </section>

      <section>
        <h2 className="mb-3 text-subheading text-off-white">Client lifecycle</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {LIFECYCLE_ORDER.map((bucket) => (
            <StatTile key={bucket} label={LIFECYCLE_LABELS[bucket]} value={overview.lifecycleCounts[bucket]} />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatTile label="Open escalations" value={overview.escalationStatusCounts.open} hint="Pending, proposed, approved, or coach-responded" />
        <StatTile label="Resolved escalations" value={overview.escalationStatusCounts.resolved} />
        <StatTile label="Conversations" value={overview.conversationCount} />
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StatTile label="Client messages sent" value={overview.clientMessageCount} />
        <StatTile label="Assistant messages sent" value={overview.assistantMessageCount} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-subheading text-off-white">Recent platform activity</h2>
          <Card className="p-0">
            {overview.recentActivity.length === 0 ? (
              <p className="p-4 text-meta text-neutral">No recorded activity yet.</p>
            ) : (
              <ul>
                {overview.recentActivity.map((item, i) => (
                  <li key={item.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="text-sm text-off-white">{item.label}</span>
                    <span className="shrink-0 text-meta text-neutral">{formatRelativeTime(item.atIso)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-subheading text-off-white">Operational warnings</h2>
          <Card className="p-0">
            {overview.operationalWarnings.length === 0 ? (
              <p className="p-4 text-meta text-neutral">Nothing needs attention right now.</p>
            ) : (
              <ul>
                {overview.operationalWarnings.map((warning, i) => {
                  const Icon = warning.severity === "warning" ? AlertTriangle : Info;
                  return (
                    <li key={warning.id} className={`flex items-start gap-2.5 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                      <Icon size={15} className={warning.severity === "warning" ? "mt-0.5 shrink-0 text-warning" : "mt-0.5 shrink-0 text-neutral"} aria-hidden="true" />
                      <span className="text-sm text-off-white">{warning.message}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
