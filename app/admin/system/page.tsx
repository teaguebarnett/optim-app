import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/admin/stat-tile";
import { getPlatformOperationsRepository } from "@/lib/production/platform-operations";

function ConfigRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-off-white">{label}</span>
      {ok ? <CheckCircle2 size={16} className="text-success" aria-label="configured" /> : <XCircle size={16} className="text-error" aria-label="not configured" />}
    </li>
  );
}

export default async function AdminSystemStatusPage() {
  const status = await getPlatformOperationsRepository().getSystemStatus();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-heading text-off-white">Platform Status</h1>
        <p className="text-meta text-neutral">Configuration presence only — never a secret value — plus honest limitations on what this platform doesn&apos;t track yet.</p>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatTile label="App mode" value={status.appMode} />
        <StatTile label="Your platform role" value={status.currentRole === "demo" ? "Demo preview" : status.currentRole.replaceAll("_", " ")} />
        <StatTile label="Configured AI provider" value={status.aiProviderId} />
      </section>

      <section>
        <h2 className="mb-3 text-subheading text-off-white">Environment configuration</h2>
        <Card className="p-0">
          <ul>
            <ConfigRow label="Supabase (URL / anon key / service-role key / site URL)" ok={status.supabaseConfigured} />
            <ConfigRow label="Anthropic API key" ok={status.anthropicConfigured} />
          </ul>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-subheading text-off-white">Recent AI provider failures</h2>
        <Card className="p-0">
          {status.recentProviderFailures.length === 0 ? (
            <p className="p-4 text-meta text-neutral">No provider failures recorded recently.</p>
          ) : (
            <ul>
              {status.recentProviderFailures.map((f, i) => (
                <li key={`${f.atIso}-${i}`} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  <span className="text-sm text-off-white">{f.failure}</span>
                  <span className="text-meta text-neutral">{new Date(f.atIso).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-subheading text-off-white">Not yet available</h2>
        <Card className="p-0">
          <ul>
            {status.unavailableMetrics.map((m, i) => (
              <li key={m} className={`px-4 py-3 text-sm text-neutral ${i > 0 ? "border-t border-border" : ""}`}>
                {m} — not connected.
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {status.notes.length > 0 ? (
        <section>
          <h2 className="mb-3 text-subheading text-off-white">Notes</h2>
          <ul className="flex flex-col gap-2">
            {status.notes.map((note) => (
              <li key={note} className="text-meta text-neutral">
                {note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
