"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, PauseCircle, XCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import type { WorkoutSession } from "@/lib/types";

export function WorkoutCompleteScreen({ session }: { session: WorkoutSession }) {
  const router = useRouter();
  const { activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const reviewSentence = `I've organized this for ${coachName}'s review. ${coachName} will make any programming decisions.`;

  if (session.status === "skipped") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-off-white/[0.06] text-neutral">
          <XCircle size={28} />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-off-white">Today&apos;s workout was skipped.</h1>
        {session.skipReason ? (
          <p className="mt-2 text-sm text-neutral">Reason: {SKIP_REASON_LABELS[session.skipReason]}</p>
        ) : null}
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-neutral">
          Your program has not been permanently changed.
        </p>
        <AssistantNote
          text={reviewSentence}
          assistantName={activeContext.assistantDisplayName}
          className="mt-4 max-w-xs"
        />
        <Button className="mt-6" onClick={() => router.push("/today")}>
          Back to Today
        </Button>
      </div>
    );
  }

  const summary = session.summary;
  if (!summary) return null;

  const endedEarly = session.status === "ended-early";

  return (
    <div className="px-4 py-8 text-center">
      <span
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
          endedEarly ? "bg-warning-soft text-warning" : "bg-success-soft text-success"
        }`}
      >
        {endedEarly ? <PauseCircle size={28} /> : <CheckCircle2 size={28} />}
      </span>
      <h1 className="mt-4 text-xl font-semibold text-off-white">
        {endedEarly ? "Workout ended early." : summary.headline}
      </h1>
      {endedEarly && session.skipReason ? (
        <p className="mt-2 text-sm text-neutral">Reason: {SKIP_REASON_LABELS[session.skipReason]}</p>
      ) : null}
      {endedEarly ? (
        <p className="mt-2 max-w-xs mx-auto text-sm leading-relaxed text-neutral">
          Completed sets and their RPE are saved. Your program has not been permanently changed.
        </p>
      ) : null}

      <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-3 text-left">
        <Stat label="Exercises completed" value={summary.exercisesCompleted} />
        <Stat label="Working sets" value={summary.workingSetsCompleted} />
        <Stat label="Average RPE" value={summary.averageRpe !== null ? summary.averageRpe : "—"} />
        <Stat label="Skipped sets" value={summary.skippedSetsCount} />
        <Stat label="Duration" value={`${summary.durationMin} min`} />
        <Stat label="Pain reports" value={summary.painReportCount} />
      </div>

      <AssistantNote text={summary.detail} assistantName={activeContext.assistantDisplayName} className="mx-auto mt-6 max-w-sm" />

      {summary.needsReview ? (
        <AssistantNote
          text={reviewSentence}
          assistantName={activeContext.assistantDisplayName}
          className="mx-auto mt-3 max-w-sm"
          tone="warning"
        />
      ) : (
        <p className="mx-auto mt-6 max-w-sm text-sm leading-relaxed text-neutral">
          {coachName} remains your coach and the final decision-maker — reviewing your performance and RPE trends
          before making future programming decisions.
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
  assistantName,
  className,
  tone = "neutral",
}: {
  text: string;
  assistantName: string;
  className?: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-center gap-1.5">
        <Sparkles size={13} className="text-neutral" />
        <span className="text-xs font-medium text-neutral">{assistantName}</span>
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
