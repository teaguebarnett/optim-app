"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { TextArea } from "@/components/ui/textarea";
import { EvidenceChip } from "@/components/ui/evidence-chip";
import { ATTENTION_KIND_LABELS, ATTENTION_KIND_QUESTIONS } from "@/lib/coach/labels";
import { requiresResolutionNote, resolveReviewRequest, startReviewRequest } from "@/lib/coach/review-lifecycle";
import type { AttentionQueueItem } from "@/lib/coach/types";
import type { ClientProfile, CoachProfileId } from "@/lib/tenancy/types";

function relativeTime(iso: string, nowMs: number): string {
  const diffMs = nowMs - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * The command center's dominant surface — one fully expanded decision at a
 * time, in the signature deep-navy focal panel (see .pc-signature-surface
 * in globals.css). Reuses the exact same lifecycle actions as the Reviews
 * page's detail sheet (lib/coach/review-lifecycle.ts) rather than a second
 * resolution path, so a review resolved here and one resolved from
 * /coach/reviews are indistinguishable afterward. Evidence shown is exactly
 * what's real in this item's own record (see lib/coach/attention-queue.ts)
 * — a synthesized-but-real summary, severity, and timing — never a
 * fabricated measurement, chart, or simulated reasoning.
 */
export function DecisionFocusSurface({
  item,
  client,
  coachId,
  coachName,
  programContextLabel,
  onChanged,
}: {
  item: AttentionQueueItem;
  client: ClientProfile | undefined;
  coachId: CoachProfileId;
  coachName: string;
  programContextLabel: string | null;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const isHealthReview = item.kind === "health_review";
  const noteRequired = item.kind !== "health_review" && requiresResolutionNote(item.kind);
  const noteBlocksResolution = noteRequired && note.trim().length === 0;
  const firstName = item.clientName.split(" ")[0];
  const question = ATTENTION_KIND_QUESTIONS[item.kind].replace("{name}", firstName);

  function handleStart() {
    startReviewRequest(item.clientId, item.reviewRequestId, new Date().toISOString());
    onChanged();
  }

  function handleResolve(action: "reviewed_no_change" | "resolved") {
    if (noteBlocksResolution || isResolving) return;
    resolveReviewRequest({
      clientId: item.clientId,
      reviewId: item.reviewRequestId,
      resolutionAction: action,
      resolutionNote: note.trim() || undefined,
      resolvedByCoachId: coachId,
      nowIso: new Date().toISOString(),
    });
    setNote("");
    // The record is already resolved above — onChanged() is only deferred so
    // the panel can play its exit animation first. A reduced-motion viewer
    // skips straight to it (matches the CSS's own prefers-reduced-motion
    // collapse to ~0, see globals.css).
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      onChanged();
      return;
    }
    setIsResolving(true);
    setTimeout(onChanged, 380);
  }

  return (
    <div className={`pc-signature-surface rounded-[var(--radius-xl)] p-5 md:p-7 ${isResolving ? "pc-row-resolve-out" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar initials={client?.avatarInitials ?? item.clientName.slice(0, 2).toUpperCase()} variant="accent" size="lg" />
          <div className="min-w-0">
            <p className="text-label text-navy-ink-muted">{ATTENTION_KIND_LABELS[item.kind]}</p>
            <p className="truncate text-heading text-navy-ink">{item.clientName}</p>
            {programContextLabel ? <p className="text-meta text-navy-ink-muted">{programContextLabel}</p> : null}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-meta text-navy-ink-muted">
          <Clock3 size={12} aria-hidden="true" />
          {relativeTime(item.createdAtIso, new Date().getTime())}
        </span>
      </div>

      <h2 className="mt-5 text-display text-navy-ink">{question}</h2>

      {isHealthReview && item.reasons && item.reasons.length > 1 ? (
        <div className="mt-3 flex max-w-2xl flex-wrap gap-2">
          {item.reasons.map((reason) => (
            <EvidenceChip key={reason} icon={ShieldAlert} label={reason} toneClassName="bg-error-soft text-error-strong" />
          ))}
        </div>
      ) : (
        <p className="mt-3 max-w-2xl text-body text-navy-ink-muted">{item.summary}</p>
      )}

      {item.status === "in_progress" ? <p className="mt-3 text-label text-brass-strong">In progress</p> : null}

      <div className="mt-6 flex flex-col gap-3">
        {isHealthReview ? (
          <Link href={`/coach/clients/${item.clientId}`} className="inline-flex w-fit items-center gap-1.5 text-action text-white hover:underline">
            Review on {item.clientName}&apos;s page <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ) : (
          <>
            {item.status === "needs_review" ? (
              <Button variant="secondary" className="w-fit" onClick={handleStart}>
                Start review
              </Button>
            ) : null}

            {noteRequired ? (
              <div className="max-w-md">
                <TextArea
                  id={`focus-note-${item.reviewRequestId}`}
                  label="Resolution note (required for safety-related reviews)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={`What did you do about this for ${firstName}?`}
                  rows={2}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => handleResolve("reviewed_no_change")} disabled={noteBlocksResolution || isResolving}>
                Reviewed — no change needed
              </Button>
              <Button onClick={() => handleResolve("resolved")} disabled={noteBlocksResolution || isResolving}>
                Resolve
              </Button>
              <Link
                href={`/coach/clients/${item.clientId}`}
                className="inline-flex items-center gap-1.5 self-center text-action text-navy-ink-muted hover:text-navy-ink hover:underline"
              >
                Full details <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </>
        )}
      </div>

      <p className="mt-6 border-t border-white/10 pt-3 text-meta text-navy-ink-muted">{coachName} — not OPTIM — decides what happens next.</p>
    </div>
  );
}
