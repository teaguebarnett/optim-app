// Phase 10A — "OPTIM noticed": the client workspace's read-only client-
// state intelligence surface (spec section 5). Renders nothing at all
// when there's nothing meaningful (spec section 9/31) — this component
// never fills empty space just because the analysis engine returned data.
//
// Deliberately reuses each finding's own real, already-conservative
// `summary` text verbatim (never rewritten into a stronger claim — spec
// section 6) and never adds an action button (spec section 16: view/
// expand only). Visually distinct from a safety/attention item: no red,
// no warning icon, no urgency styling for a temporary disruption (spec
// section 7) — only a recurring/repeated pattern with strong evidence
// gets the slightly more prominent accent border, never alarming.

import { Card } from "@/components/ui/card";
import type { PresentedFinding } from "@/lib/client-state/presentation";
import type { EvidenceDetailLine } from "@/lib/client-state/evidence-display";
import type { AdjustmentProvenance } from "@/lib/training/types";

const FINDING_LABELS: Record<string, string> = {
  isolated_disruption: "Temporary disruption",
  illness_related_disruption: "Temporary disruption",
  recurring_schedule_conflict: "Recurring schedule conflict",
  recurring_unexplained_skips: "Developing adherence pattern",
  performance_improving: "Performance trending upward",
  performance_declining: "Performance trending downward",
  performance_inconsistent: "Inconsistent performance",
  repeated_under_completion: "Repeated prescription under-completion",
};

const STRENGTH_LABELS: Record<string, string> = {
  emerging: "Worth watching",
  strong: "Clear pattern",
};

function EvidenceList({ title, lines }: { title: string; lines: EvidenceDetailLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-off-white">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {lines.map((line, i) => (
          <li key={i} className="text-xs text-neutral">
            {new Date(line.dateIso).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — {line.label}: {line.value}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoticeCard({ item, supportingEvidence, contradictingEvidence, hasAdjustmentProposal }: { item: PresentedFinding; supportingEvidence: EvidenceDetailLine[]; contradictingEvidence: EvidenceDetailLine[]; hasAdjustmentProposal: boolean }) {
  const { finding, prominence } = item;
  const label = FINDING_LABELS[finding.findingType] ?? finding.findingType.replaceAll("_", " ");
  return (
    <Card className={prominence === "notable" ? "border-l-2 border-l-accent" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-off-white">{label}</p>
        <span className="shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-label text-neutral">{STRENGTH_LABELS[finding.strength] ?? finding.strength}</span>
      </div>
      <p className="mt-1.5 text-sm text-neutral">{finding.summary}</p>
      {finding.activeSafetyRestriction ? <p className="mt-1.5 text-xs text-neutral">This client currently has an active safety restriction on file — see Escalations for details.</p> : null}
      {supportingEvidence.length > 0 || contradictingEvidence.length > 0 ? (
        <details className="mt-2 rounded bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs text-neutral">See the evidence</summary>
          <div className="mt-2 space-y-2">
            <EvidenceList title="Supporting" lines={supportingEvidence} />
            <EvidenceList title="Context" lines={contradictingEvidence} />
          </div>
        </details>
      ) : null}
      {/* Phase 10B — spec section 23: ONLY when a real AdjustmentProposal
          already exists for this exact finding, a restrained pointer to
          the review below — never an action button here, never shown on
          a finding with no real proposal. */}
      {hasAdjustmentProposal ? <p className="mt-2 text-xs text-accent-fg">OPTIM has a proposed adjustment for this — see Training program below.</p> : null}
    </Card>
  );
}

export function ClientStateNoticeSection({ findings, evidenceByFinding, pendingAdjustment }: { findings: PresentedFinding[]; evidenceByFinding: { supporting: EvidenceDetailLine[]; contradicting: EvidenceDetailLine[] }[]; pendingAdjustment: AdjustmentProvenance | null }) {
  if (findings.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <p className="text-sm font-medium text-off-white">OPTIM noticed</p>
        <p className="text-xs text-neutral">Read-only. No coaching action has been taken.</p>
      </div>
      <div className="space-y-3">
        {findings.map((item, i) => (
          <NoticeCard
            key={`${item.finding.domain}-${item.finding.findingType}`}
            item={item}
            supportingEvidence={evidenceByFinding[i]?.supporting ?? []}
            contradictingEvidence={evidenceByFinding[i]?.contradicting ?? []}
            hasAdjustmentProposal={!!pendingAdjustment && pendingAdjustment.sourceFindingDomain === item.finding.domain && pendingAdjustment.sourceFindingType === item.finding.findingType}
          />
        ))}
      </div>
    </section>
  );
}
