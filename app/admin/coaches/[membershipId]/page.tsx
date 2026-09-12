import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/admin/stat-tile";
import { LifecycleChip } from "@/components/admin/lifecycle-chip";
import { StatusBadge } from "@/components/progress/status-badge";
import { getPlatformOperationsRepository, type LifecycleBucket } from "@/lib/production/platform-operations";

export default async function AdminCoachDetailPage({ params }: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await params;
  const detail = await getPlatformOperationsRepository().getCoachDetail(membershipId);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/coaches" className="inline-flex w-fit items-center gap-1.5 text-action text-neutral hover:text-off-white">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to coaches
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-heading text-off-white">{detail.displayName}</h1>
          <p className="text-meta text-neutral">{detail.workspaceName}</p>
        </div>
        <StatusBadge label={detail.workspaceStatus} tone={detail.workspaceStatus === "active" ? "success" : detail.workspaceStatus === "suspended" ? "error" : "neutral"} />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Assigned clients" value={detail.assignedClientCount} />
        <StatTile label="Open escalations" value={detail.openEscalationCount} />
        <StatTile label="Workspace created" value={new Date(detail.workspaceCreatedAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} />
        <StatTile label="Last client-affecting activity" value={detail.lastActivityIso ? new Date(detail.lastActivityIso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "None yet"} />
      </section>

      <section>
        <h2 className="mb-3 text-subheading text-off-white">Client lifecycle breakdown</h2>
        <div className="flex flex-wrap gap-2">
          {Object.keys(detail.lifecycleCounts).length === 0 ? (
            <p className="text-meta text-neutral">No clients assigned yet.</p>
          ) : (
            Object.entries(detail.lifecycleCounts).map(([bucket, count]) => (
              <span key={bucket} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-sm text-off-white">
                <LifecycleChip lifecycle={bucket as LifecycleBucket} />
                {count}
              </span>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-subheading text-off-white">Assigned clients</h2>
        <Card className="p-0">
          {detail.clients.length === 0 ? (
            <p className="p-4 text-meta text-neutral">This coach has no assigned clients yet.</p>
          ) : (
            <ul>
              {detail.clients.map((client, i) => (
                <li key={client.clientId} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  <Link href={`/admin/clients/${client.clientId}`} className="text-sm font-medium text-off-white hover:text-accent-strong">
                    {client.displayName}
                  </Link>
                  <LifecycleChip lifecycle={client.lifecycle} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
