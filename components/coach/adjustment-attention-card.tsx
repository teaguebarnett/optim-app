// Phase 10C — the lightweight discovery/navigation card for a pending
// Phase 10B adjustment proposal in the coach's "Needs Your Attention"
// queue. Deliberately NOT EscalationCard (spec section 8): this is
// discovery + navigation + current status only — no approve/edit/reject
// controls live here, those stay exactly where Phase 10B put them (the
// client workspace's real ProgramProposalReview). Visually distinct from
// an escalation (no pain/safety styling) but still clearly a real pending
// decision, never styled like an informational "OPTIM noticed" card (spec
// section 6: "OPTIM proposes X" language, never "OPTIM changed X").

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { AttentionItem } from "@/lib/production/coach-operations";

export function AdjustmentAttentionCard({ item }: { item: AttentionItem }) {
  if (!item.adjustmentProposal) return null;
  return (
    <Link href={`/coach/clients/${item.adjustmentProposal.clientProfileId}#proposal-review`} className="block">
      <Card className="border-l-2 border-l-accent transition-colors hover:border-accent">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-off-white">Program adjustment</p>
            <p className="text-xs text-neutral">{item.clientDisplayName}</p>
          </div>
          <span className="shrink-0 rounded-full border border-border-strong px-2.5 py-0.5 text-label text-neutral">{item.kindLabel}</span>
        </div>
        <p className="mt-1.5 text-sm text-neutral">{item.summary}</p>
        <p className="mt-2 text-action text-accent-strong">Review adjustment →</p>
      </Card>
    </Link>
  );
}
