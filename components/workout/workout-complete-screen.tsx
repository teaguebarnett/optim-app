"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import type { WorkoutSession } from "@/lib/types";

const TEAGUE_REVIEW_SENTENCE = "I've organized this for Teague's review. Teague will make any programming decisions.";

export function WorkoutCompleteScreen({ session }: { session: WorkoutSession }) {
  const router = useRouter();

  if (session.status === "skipped") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-neutral">
          <XCircle size={28} />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-off-white">Today&apos;s workout was skipped.</h1>
        {session.skipReason ? (
          <p className="mt-2 text-sm text-neutral">Reason: {SKIP_REASON_LABELS[session.skipReason]}</p>
        ) : null}
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-neutral">
          Your program has not been permanently changed.
        </p>
        <AssistantNote text={TEAGUE_REVIEW_SENTENCE} className="mt-4 max-w-xs" />
        <Button className="mt-6" onClick={() => router.push("/today")}>
          Back to Today
        </Button>
      </div>
    );
  }

  const summary = session.summary;
  if (!summary) return null;

  return (
    <div className="px-4 py-8 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
        <CheckCircle2 size={28} />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-off-white">{summary.headline}</h1>

      <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-3 text-left">
        <Stat label="Exercises completed" value={summary.exercisesCompleted} />
        <Stat label="Working sets" value={summary.workingSetsCompleted} />
        <Stat label="Average RPE" value={summary.averageRpe !== null ? summary.averageRpe : "—"} />
        <Stat label="Skipped sets" value={summary.skippedSetsCount} />
        <Stat label="Duration" value={`${summary.durationMin} min`} />
        <Stat label="Pain reports" value={summary.painReportCount} />
      </div>

      <AssistantNote text={summary.detail} className="mx-auto mt-6 max-w-sm" />

      {summary.needsReview ? (
        <AssistantNote text={TEAGUE_REVIEW_SENTENCE} className="mx-auto mt-3 max-w-sm" tone="warning" />
      ) : (
        <p className="mx-auto mt-6 max-w-sm text-sm leading-relaxed text-neutral">
          Teague remains your coach and the final decision-maker — he&apos;ll review your performance and RPE
          trends before making future programming decisions.
        </p>
      )}

      <Button className="mt-6" onClick={() => router.push("/today")}>
        Back to Today
      </Button>
    </div>
  );
}

function AssistantNote({
  text,
  className,
  tone = "neutral",
}: {
  text: string;
  className?: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-center gap-1.5">
        <Sparkles size={13} className="text-neutral" />
        <span className="text-xs font-medium text-neutral">OPTIM Assistant</span>
      </div>
      <p
        className={`mt-1.5 text-[15px] leading-relaxed ${tone === "warning" ? "text-warning" : "text-neutral"}`}
      >
        {text}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-charcoal p-3">
      <p className="text-lg font-semibold text-off-white">{value}</p>
      <p className="text-xs text-neutral">{label}</p>
    </div>
  );
}
