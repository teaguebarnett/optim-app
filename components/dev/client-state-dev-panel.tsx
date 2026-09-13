"use client";

// Phase 9D — the developer/QA-accessible shadow output spec section 32
// asks for. Deliberately plain: workspace/client id in, real findings out,
// as neutral text — never rendered for a client, never a polished
// dashboard (that's explicitly out of scope for this phase; see spec
// section 33, "design output so later Phase 10 can surface concise
// findings to the coach — do not build the dashboard now").

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { analyzeClientStateAction } from "@/app/actions/production-programs";
import type { ClientStateAnalysis, ClientStateFinding } from "@/lib/client-state/types";

const DOMAIN_LABELS: Record<ClientStateFinding["domain"], string> = {
  adherence: "Adherence",
  training_performance: "Resistance performance",
  continuous_performance: "Continuous performance",
  prescription_completion: "Prescription completion",
  recovery: "Recovery",
};

function FindingBlock({ finding }: { finding: ClientStateFinding }) {
  return (
    <div className="border-t border-border-strong py-3 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium text-off-white">{DOMAIN_LABELS[finding.domain]}:</p>
      <p className="text-sm text-off-white">{finding.findingType.replaceAll("_", " ")}</p>
      <p className="text-xs text-neutral">Strength: {finding.strength}</p>
      <p className="text-xs text-neutral">Window: {finding.analysisWindow.label}</p>
      {finding.reasonClassification ? <p className="text-xs text-neutral">Reason: {finding.reasonClassification.replaceAll("_", " ")}</p> : null}
      <p className="mt-1 text-sm text-off-white">{finding.summary}</p>
      <p className="mt-1 text-xs text-neutral">Supporting evidence: {finding.supportingEvidenceRefs.length} record(s)</p>
      {finding.contradictingEvidenceRefs.length > 0 ? <p className="text-xs text-neutral">Contradicting evidence: {finding.contradictingEvidenceRefs.length} record(s)</p> : null}
      {finding.activeSafetyRestriction ? <p className="mt-1 text-xs text-warning">Context: an active safety restriction currently exists for this client (not interpreted here — see Phase 7 escalations).</p> : null}
    </div>
  );
}

export function ClientStateDevPanel() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [clientProfileId, setClientProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClientStateAnalysis | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const analysis = await analyzeClientStateAction({ workspaceId: workspaceId.trim(), clientProfileId: clientProfileId.trim() });
      setResult(analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold text-off-white">Client State — Shadow</h1>
        <p className="mt-1 text-sm text-neutral">Read-only, evidence-backed findings. No coaching action taken. Dev/QA only — never shown to clients.</p>
      </div>

      <form className="space-y-3" onSubmit={run}>
        <TextField id="workspaceId" label="Workspace id" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} required />
        <TextField id="clientProfileId" label="Client profile id" value={clientProfileId} onChange={(e) => setClientProfileId(e.target.value)} required />
        <Button type="submit" loading={loading}>
          Analyze
        </Button>
      </form>

      {error ? <p className="text-sm text-error">{error}</p> : null}

      {result ? (
        <Card>
          <p className="mb-2 text-xs text-neutral">Analyzed at {result.analyzedAtIso}</p>
          {result.findings.map((finding) => (
            <FindingBlock key={finding.domain} finding={finding} />
          ))}
        </Card>
      ) : null}
    </main>
  );
}
