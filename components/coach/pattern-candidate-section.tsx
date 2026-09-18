// Phase 9B — "OPTIM noticed": the coach-facing confirmation surface for
// eligible shadow pattern candidates (lib/production/learned-rules.ts).
// Deliberately small — never a giant AI-learning dashboard (spec section
// 6/26): renders nothing at all when there's nothing eligible, and shows
// at most a few compact cards, never a queue the coach has to work
// through. No fake certainty (spec section 7): every candidate's own
// summary text already carries an honest hedge ("has repeatedly...
// candidate, not a confirmed rule") — this component never adds a
// stronger claim on top of it.

import { revalidatePath } from "next/cache";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmLearnedRuleAction, recordContextualDispositionAction, recordRejectedDispositionAction } from "@/app/actions/coach-learned-rules";
import type { EligibleCandidateSummary } from "@/lib/production/learned-rules";

function formatFields(value: Record<string, unknown> | null): string {
  if (!value) return "—";
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
}

function EvidenceExampleRow({ example }: { example: EligibleCandidateSummary["supportingExamples"][number] }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-xs text-neutral">
      <span className="text-off-white">{example.clientDisplayName ?? "A client"}</span>
      <span>· {new Date(example.decidedAtIso).toLocaleDateString()}</span>
      <span>· {formatFields(example.proposedValue)} → {formatFields(example.chosenValue)}</span>
    </li>
  );
}

function CandidateCard({ workspaceId, candidate }: { workspaceId: string; candidate: EligibleCandidateSummary }) {
  async function revalidate() {
    "use server";
    revalidatePath(`/coach`);
  }
  async function confirm() {
    "use server";
    await confirmLearnedRuleAction({ workspaceId, candidateSignature: candidate.candidateSignature });
    await revalidate();
  }
  async function contextual() {
    "use server";
    await recordContextualDispositionAction({ workspaceId, candidateSignature: candidate.candidateSignature });
    await revalidate();
  }
  async function reject() {
    "use server";
    await recordRejectedDispositionAction({ workspaceId, candidateSignature: candidate.candidateSignature });
    await revalidate();
  }

  const evidenceLine = `${candidate.supportCount} supporting decision${candidate.supportCount === 1 ? "" : "s"} across ${candidate.distinctClientCount} client${candidate.distinctClientCount === 1 ? "" : "s"}${candidate.contradictionCount > 0 ? ` · ${candidate.contradictionCount} comparable contradiction${candidate.contradictionCount === 1 ? "" : "s"}` : ""}`;

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-body text-off-white">{candidate.summary}</p>
        <span className="shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-label text-neutral">Strong evidence</span>
      </div>
      <p className="text-meta text-neutral">{evidenceLine}</p>

      {candidate.conflictsWithExplicitMethodology && candidate.methodologyConflictNote ? (
        <div className="rounded border border-warning bg-warning-soft/40 px-3 py-2">
          <p className="text-xs font-medium text-warning-strong">This appears to differ from your current coaching setup.</p>
          <p className="mt-1 text-xs text-warning-strong">{candidate.methodologyConflictNote}</p>
        </div>
      ) : null}

      {candidate.supportingExamples.length > 0 || candidate.contradictingExamples.length > 0 ? (
        <details className="rounded bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs text-neutral">See the evidence</summary>
          <div className="mt-2 space-y-2">
            {candidate.supportingExamples.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-off-white">Supporting</p>
                <ul className="mt-1 space-y-0.5">
                  {candidate.supportingExamples.map((ex, i) => (
                    <EvidenceExampleRow key={i} example={ex} />
                  ))}
                </ul>
              </div>
            ) : null}
            {candidate.contradictingExamples.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-off-white">Contradicting</p>
                <ul className="mt-1 space-y-0.5">
                  {candidate.contradictingExamples.map((ex, i) => (
                    <EvidenceExampleRow key={i} example={ex} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <form action={confirm}>
          <Button type="submit" variant="primary" size="sm">
            Yes, that&apos;s my default
          </Button>
        </form>
        <form action={contextual}>
          <Button type="submit" variant="secondary" size="sm">
            Depends on context
          </Button>
        </form>
        <form action={reject}>
          <Button type="submit" variant="ghost" size="sm">
            No, don&apos;t learn this
          </Button>
        </form>
      </div>
    </Card>
  );
}

/** Renders nothing at all when there's nothing eligible — this section
 * must never compete with real attention items, and an empty-state card
 * here would just be dashboard clutter. The caller (the Command Center's
 * Worth Knowing zone) already labels this category and its count; this
 * renders only the object(s) it's given, capped at 3 as a hard safety
 * limit — never its own repeated category header or explanatory subtitle. */
export function PatternCandidateSection({ workspaceId, candidates }: { workspaceId: string; candidates: EligibleCandidateSummary[] }) {
  if (candidates.length === 0) return null;
  const shown = candidates.slice(0, 3);
  return (
    <div className="space-y-3">
      {shown.map((c) => (
        <CandidateCard key={c.candidateSignature} workspaceId={workspaceId} candidate={c} />
      ))}
    </div>
  );
}
