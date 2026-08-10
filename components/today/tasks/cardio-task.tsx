"use client";

import { useState } from "react";
import { HeartPulse } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ReasonPicker } from "@/components/ui/reason-picker";
import { TextArea } from "@/components/ui/textarea";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { CARDIO_TARGET } from "@/lib/mock-data";
import type { DailyTaskState, SkipReason } from "@/lib/types";

export function CardioTask({ state }: { state: DailyTaskState }) {
  const { dispatch } = usePrototypeState();
  const [duration, setDuration] = useState(CARDIO_TARGET.durationMin);
  const [note, setNote] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState<SkipReason | null>(null);
  const [skipNote, setSkipNote] = useState("");

  if (state === "completed" || state === "skipped") {
    return <TaskShell title={`Cardio — ${CARDIO_TARGET.activity}`} icon={<HeartPulse size={17} />} state={state} />;
  }

  if (state === "upcoming") {
    return (
      <TaskShell
        title={`Cardio — ${CARDIO_TARGET.activity}`}
        icon={<HeartPulse size={17} />}
        state={state}
      >
        <p className="text-sm text-neutral">
          {CARDIO_TARGET.durationMin} minutes · target heart rate {CARDIO_TARGET.heartRateRangeLow}–
          {CARDIO_TARGET.heartRateRangeHigh} bpm (coach guidance)
        </p>
      </TaskShell>
    );
  }

  const isInProgress = state === "in-progress";

  function handleSkipConfirm() {
    if (!skipReason) return;
    dispatch({ type: "SKIP_CARDIO", reason: skipReason, note: skipNote.trim() || undefined });
    setSkipOpen(false);
  }

  return (
    <>
      <TaskShell title={`Cardio — ${CARDIO_TARGET.activity}`} icon={<HeartPulse size={17} />} state={state}>
        <p className="text-sm text-neutral">
          Target heart rate {CARDIO_TARGET.heartRateRangeLow}–{CARDIO_TARGET.heartRateRangeHigh} bpm (coach
          guidance)
        </p>

        {!isInProgress ? (
          <Button className="mt-3 w-full" onClick={() => dispatch({ type: "START_CARDIO" })}>
            Start
          </Button>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-white/[0.04] px-3 py-2.5">
              <span className="text-sm text-off-white">{duration} min logged</span>
              <button
                onClick={() => setDuration((d) => d + 5)}
                className="text-sm font-medium text-accent-strong"
              >
                + 5 min
              </button>
            </div>
            <TextArea
              id="cardio-note"
              label="Optional note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="How did it feel?"
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() =>
                  dispatch({ type: "COMPLETE_CARDIO", durationMin: duration, note: note.trim() || undefined })
                }
              >
                Complete
              </Button>
              <Button variant="outline" onClick={() => setSkipOpen(true)}>
                Skip
              </Button>
            </div>
          </div>
        )}
      </TaskShell>

      <Sheet open={skipOpen} onClose={() => setSkipOpen(false)} title="Skip cardio">
        <div className="space-y-4">
          <ReasonPicker value={skipReason} onChange={setSkipReason} name="skip-cardio" />
          <TextArea
            id="cardio-skip-note"
            label="Optional note"
            value={skipNote}
            onChange={(e) => setSkipNote(e.target.value)}
          />
          <Button className="w-full" disabled={!skipReason} onClick={handleSkipConfirm}>
            Confirm skip
          </Button>
        </div>
      </Sheet>
    </>
  );
}
