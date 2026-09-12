import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/admin/stat-tile";
import { getPlatformOperationsRepository } from "@/lib/production/platform-operations";

export default async function AdminAiOperationsPage() {
  const metrics = await getPlatformOperationsRepository().getAiOperations();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-heading text-off-white">AI & Communication Operations</h1>
        <p className="text-meta text-neutral">
          {metrics.isDemoFixture ? "Demo fixtures — deterministic seed data, not live traffic." : "Derived from real conversation and escalation records — never a token-cost/monetary figure unless it is actually instrumented."}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Conversations" value={metrics.conversationCount} />
        <StatTile label="Client messages" value={metrics.clientMessageCount} />
        <StatTile label="Assistant messages" value={metrics.assistantMessageCount} />
        <StatTile label="Coach messages" value={metrics.coachMessageCount} />
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatTile label="Real-provider messages" value={metrics.realProviderMessageCount} hint="Anthropic" />
        <StatTile label="Fake-provider messages" value={metrics.fakeProviderMessageCount} hint="Deterministic local/test provider" />
        <StatTile label="Escalations generated" value={metrics.escalationCount} />
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatTile label="Median response latency" value={metrics.latencyMs.medianMs !== null ? `${Math.round(metrics.latencyMs.medianMs)} ms` : "Not enough data"} hint={`n = ${metrics.latencyMs.sampleSize}`} />
        <StatTile label="Average response latency" value={metrics.latencyMs.averageMs !== null ? `${Math.round(metrics.latencyMs.averageMs)} ms` : "Not enough data"} />
        <StatTile label="Provider failures recorded" value={metrics.failureCount} />
      </section>

      <section>
        <h2 className="mb-3 text-subheading text-off-white">Provider / model distribution</h2>
        <Card className="p-0">
          {metrics.providerDistribution.length === 0 ? (
            <p className="p-4 text-meta text-neutral">No assistant messages recorded yet.</p>
          ) : (
            <ul>
              {metrics.providerDistribution.map((p, i) => (
                <li key={`${p.providerId}-${p.modelId}`} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  <span className="text-sm text-off-white">
                    {p.providerId} · {p.modelId}
                  </span>
                  <span className="text-meta text-neutral">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-subheading text-off-white">Recent AI activity</h2>
        <Card className="p-0">
          {metrics.recentActivity.length === 0 ? (
            <p className="p-4 text-meta text-neutral">No recent assistant activity.</p>
          ) : (
            <ul>
              {metrics.recentActivity.map((item, i) => (
                <li key={`${item.atIso}-${i}`} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  <span className="text-sm text-off-white">
                    {item.workspaceName} — {item.decisionKind ?? "response"}
                    {item.failure ? ` (failed: ${item.failure})` : ""}
                  </span>
                  <span className="shrink-0 text-meta text-neutral">
                    {item.providerId ?? "—"} {item.latencyMs !== null ? `· ${item.latencyMs} ms` : ""} · {new Date(item.atIso).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
