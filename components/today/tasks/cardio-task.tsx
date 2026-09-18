"use client";

import { useState } from "react";
import { HeartPulse } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ReasonPicker } from "@/components/ui/reason-picker";
import { TextArea } from "@/components/ui/textarea";
import { NumberWheel } from "@/components/ui/number-wheel";
import { cn } from "@/lib/cn";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { cardioPrescriptionForClient } from "@/lib/mock-data";
import type { CardioOption, DailyTaskState, SkipReason } from "@/lib/types";

// Phase 3.1.1 §2 — the +/- stepper now moves by a single minute, and the
// client can also type the exact completed duration directly. 0 min is the
// sensible floor (never negative); 180 min is a generous but sane ceiling
// for a single cardio session, preventing an obviously mistyped value from
// silently saving.
const DURATION_STEP_MIN = 1;
const DURATION_MAX_MIN = 180;

function clampDuration(value: number): number {
  return Math.min(DURATION_MAX_MIN, Math.max(0, Math.round(value)));
}

export function CardioTask({
  state,
  emphasisOverride,
  scheduleLabel,
  fillWidth,
  expanded,
  onToggleExpand,
}: {
  state: DailyTaskState;
  emphasisOverride?: "primary" | "secondary";
  scheduleLabel?: string;
  fillWidth?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const { state: appState, dispatch } = usePrototypeState();
  const [note, setNote] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState<SkipReason | null>(null);
  const [skipNote, setSkipNote] = useState("");

  const duration = appState.cardio.durationMin;

  const prescription = cardioPrescriptionForClient(appState.clientId);
  // Multiple approved options only ever appear when the assigned plan
  // actually has more than one — never invented, never shown to every
  // client. See Phase 3.1 §6 and lib/mock-data.ts's
  // CARDIO_PRESCRIPTIONS_BY_CLIENT.
  const hasMultipleOptions = prescription.options.length > 1;
  const defaultOption = prescription.options.find((o) => o.isDefault) ?? prescription.options[0];
  const selectedOption: CardioOption =
    prescription.options.find((o) => o.id === appState.cardio.selectedOptionId) ?? defaultOption;

  const title = `Cardio — ${selectedOption.displayName}`;
  const heartRateLabel =
    selectedOption.heartRateRangeLow !== undefined && selectedOption.heartRateRangeHigh !== undefined
      ? `${selectedOption.targetDurationMin} min · Target ${selectedOption.heartRateRangeLow}–${selectedOption.heartRateRangeHigh} bpm`
      : `${selectedOption.targetDurationMin} min`;

  function selectOption(option: CardioOption) {
    dispatch({ type: "SELECT_CARDIO_OPTION", optionId: option.id });
  }

  const optionPicker = hasMultipleOptions ? (
    <div className="mt-3 flex gap-2">
      {prescription.options.map((option) => {
        const active = option.id === selectedOption.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => selectOption(option)}
            className={cn(
              "flex-1 rounded-[var(--radius-sm)] border px-3 py-2 text-left text-subheading transition-colors",
              active
                ? "border-accent bg-accent-soft text-accent-fg"
                : "border-border-strong text-off-white hover:border-accent/40"
            )}
          >
            {option.displayName}
            <span className="block text-meta text-neutral">{option.targetDurationMin} min</span>
          </button>
        );
      })}
    </div>
  ) : null;

  if (state === "completed" || state === "skipped") {
    return (
      <TaskShell
        title={title}
        icon={<HeartPulse size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      >
        {state === "completed" ? (
          <p className="text-meta text-neutral">
            {appState.cardio.durationMin} min completed · target {selectedOption.targetDurationMin} min
          </p>
        ) : null}
      </TaskShell>
    );
  }

  // Some real minutes were logged before the client stopped — never shown
  // as "skipped." See Phase 4.1's cardio-partial correction.
  if (state === "partially-completed") {
    return (
      <TaskShell
        title={title}
        icon={<HeartPulse size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      >
        <p className="text-meta text-neutral">
          {appState.cardio.durationMin} min logged before stopping · target {selectedOption.targetDurationMin} min
        </p>
      </TaskShell>
    );
  }

  if (state === "upcoming") {
    return (
      <TaskShell
        title={title}
        icon={<HeartPulse size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        scheduleLabel={scheduleLabel}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      >
        <p className="text-meta text-neutral">{heartRateLabel}</p>
        <p className="mt-1 text-body text-neutral">{selectedOption.protocol}</p>
        {optionPicker}
      </TaskShell>
    );
  }

  const isInProgress = state === "in-progress";

  function setDuration(minutes: number) {
    dispatch({ type: "SET_CARDIO_DURATION", durationMin: clampDuration(minutes) });
  }

  function handleStart() {
    dispatch({ type: "START_CARDIO", durationMin: 0 });
  }

  function handleSkipConfirm() {
    if (!skipReason) return;
    dispatch({ type: "SKIP_CARDIO", reason: skipReason, note: skipNote.trim() || undefined });
    setSkipOpen(false);
  }

  // "Running out of time" during today's workout never forces a long
  // cardio session — it just surfaces whichever approved time-saving
  // alternative exists as a visible choice. See Phase 3.1 §4/§6.
  const wasOutOfTime = appState.workoutSession.skipReason === "out-of-time";
  const timeSavingOption = prescription.options.find((o) => !o.isDefault);

  return (
    <>
      <TaskShell
        title={title}
        icon={<HeartPulse size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        scheduleLabel={scheduleLabel}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      >
        <p className="text-meta text-neutral">{heartRateLabel}</p>
        <p className="mt-1 text-body text-neutral">{selectedOption.protocol}</p>

        {wasOutOfTime && hasMultipleOptions && timeSavingOption && !isInProgress ? (
          <p className="mt-2 text-meta text-warning">
            You mentioned running short on time — {timeSavingOption.displayName} is available below.
          </p>
        ) : null}

        {!isInProgress ? (
          <>
            {optionPicker}
            <Button className="mt-3 w-full" onClick={handleStart}>
              Start
            </Button>
          </>
        ) : (
          <div className="mt-3 space-y-3">
            {optionPicker}
            <div>
              <p className="mb-1.5 text-label text-neutral">Minutes logged</p>
              <NumberWheel
                id="cardio-duration"
                fieldLabel="Cardio duration in minutes"
                value={duration}
                onChange={setDuration}
                min={0}
                max={DURATION_MAX_MIN}
                step={DURATION_STEP_MIN}
                unit="min"
              />
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
