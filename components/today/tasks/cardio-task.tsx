"use client";

import { useState } from "react";
import { HeartPulse, Minus, Plus } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ReasonPicker } from "@/components/ui/reason-picker";
import { TextArea } from "@/components/ui/textarea";
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
}: {
  state: DailyTaskState;
  emphasisOverride?: "primary" | "secondary";
}) {
  const { state: appState, dispatch } = usePrototypeState();
  const [note, setNote] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState<SkipReason | null>(null);
  const [skipNote, setSkipNote] = useState("");

  const duration = appState.cardio.durationMin;
  // Free-typed local mirror of the saved duration so a client can clear the
  // field and type an exact value (e.g. 17) without every keystroke
  // round-tripping through the store and briefly showing 0. Resyncs
  // whenever the saved duration changes from elsewhere (the +/- stepper,
  // another tab after refresh, etc) — adjusted during render rather than in
  // an effect, per React's guidance on resetting state from a changed prop.
  // Declared unconditionally, before any early return below, per the Rules
  // of Hooks.
  const [durationInput, setDurationInput] = useState(String(duration));
  const [syncedDuration, setSyncedDuration] = useState(duration);
  if (duration !== syncedDuration) {
    setSyncedDuration(duration);
    setDurationInput(String(duration));
  }

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
              "flex-1 rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm font-medium transition-colors",
              active
                ? "border-accent bg-accent-soft text-accent-strong"
                : "border-border-strong text-off-white hover:border-accent/40"
            )}
          >
            {option.displayName}
            <span className="block text-xs font-normal text-neutral">{option.targetDurationMin} min</span>
          </button>
        );
      })}
    </div>
  ) : null;

  if (state === "completed" || state === "skipped") {
    return (
      <TaskShell title={title} icon={<HeartPulse size={17} />} state={state} emphasisOverride={emphasisOverride}>
        {state === "completed" ? (
          <p className="text-sm text-neutral">
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
      <TaskShell title={title} icon={<HeartPulse size={17} />} state={state} emphasisOverride={emphasisOverride}>
        <p className="text-sm text-neutral">
          {appState.cardio.durationMin} min logged before stopping · target {selectedOption.targetDurationMin} min
        </p>
      </TaskShell>
    );
  }

  if (state === "upcoming") {
    return (
      <TaskShell title={title} icon={<HeartPulse size={17} />} state={state} emphasisOverride={emphasisOverride}>
        <p className="text-sm text-neutral">{selectedOption.protocol}</p>
        {optionPicker}
      </TaskShell>
    );
  }

  const isInProgress = state === "in-progress";

  function adjustDuration(deltaMin: number) {
    dispatch({ type: "SET_CARDIO_DURATION", durationMin: clampDuration(duration + deltaMin) });
  }

  function commitDurationInput(raw: string) {
    const parsed = Number(raw);
    if (raw.trim() === "" || Number.isNaN(parsed)) {
      setDurationInput(String(duration));
      return;
    }
    dispatch({ type: "SET_CARDIO_DURATION", durationMin: clampDuration(parsed) });
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
      <TaskShell title={title} icon={<HeartPulse size={17} />} state={state} emphasisOverride={emphasisOverride}>
        <p className="text-sm text-neutral">{selectedOption.protocol}</p>

        {wasOutOfTime && hasMultipleOptions && timeSavingOption && !isInProgress ? (
          <p className="mt-2 text-xs text-warning">
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
            <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-off-white/[0.04] px-3 py-2.5">
              <button
                type="button"
                aria-label="Subtract 1 minute"
                onClick={() => adjustDuration(-DURATION_STEP_MIN)}
                disabled={duration <= 0}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong text-off-white disabled:opacity-40"
              >
                <Minus size={16} />
              </button>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="Cardio duration in minutes"
                  value={durationInput}
                  min={0}
                  max={DURATION_MAX_MIN}
                  onChange={(e) => setDurationInput(e.target.value)}
                  onBlur={(e) => commitDurationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="h-9 w-14 rounded-[var(--radius-sm)] border border-border-strong bg-surface text-center text-sm text-off-white outline-none focus-visible:border-accent"
                />
                <span className="text-sm text-off-white">min logged</span>
              </div>
              <button
                type="button"
                aria-label="Add 1 minute"
                onClick={() => adjustDuration(DURATION_STEP_MIN)}
                disabled={duration >= DURATION_MAX_MIN}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong text-off-white disabled:opacity-40"
              >
                <Plus size={16} />
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
