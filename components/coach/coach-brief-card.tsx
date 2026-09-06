import Link from "next/link";
import { RefreshCcw, ArrowRight, Sparkles } from "lucide-react";
import type { CoachBriefRecord } from "@/lib/coach/coach-brief-record";

/**
 * The one dominant, at-most-three-sentence OPTIM Coach Brief surface (spec
 * §5.2/§6) — shared by the Activation Workspace and the active Client
 * Workspace, which each build their own real CoachBriefRecord (see
 * hooks/use-coach-brief.ts) and pass it here. Never regenerates on its own;
 * "Refresh" is the one explicit way a coach can force a recheck.
 */
export function CoachBriefCard({
  brief,
  kicker,
  linkedHref,
  linkedLabel,
  onRefresh,
}: {
  brief: CoachBriefRecord | null;
  kicker: string;
  linkedHref?: string;
  linkedLabel?: string;
  onRefresh: () => void;
}) {
  if (!brief) {
    return (
      <div className="pc-signature-surface rounded-[var(--radius-xl)] p-5 md:p-6">
        <p className="text-label text-navy-ink-muted">{kicker}</p>
        <p className="mt-2 text-body text-navy-ink-muted">Not enough information yet to generate a brief.</p>
      </div>
    );
  }

  return (
    <div className="pc-signature-surface rounded-[var(--radius-xl)] p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-label text-navy-ink-muted">
          <Sparkles size={13} aria-hidden="true" />
          {kicker}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh brief"
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-meta text-navy-ink-muted hover:bg-white/10 hover:text-navy-ink"
        >
          <RefreshCcw size={12} aria-hidden="true" /> Refresh
        </button>
      </div>

      <div className="mt-2 space-y-1.5">
        {brief.sentences.map((sentence, i) => (
          <p key={i} className="text-body text-navy-ink">
            {sentence}
          </p>
        ))}
      </div>

      {brief.actionRequired && linkedHref ? (
        <Link href={linkedHref} className="mt-3 inline-flex items-center gap-1.5 text-action text-white hover:underline">
          {linkedLabel ?? "Open the flagged item"} <ArrowRight size={13} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
