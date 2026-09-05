"use client";

import { useRef, useState } from "react";
import { Scale, Pencil } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { Button } from "@/components/ui/button";
import { WheelColumn, WheelFrame } from "@/components/workout/live/wheel-column";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { isValidWeight } from "@/lib/calculations";
import { buildStepRange, nearestValueIndex } from "@/lib/numeric-wheel";
import type { DailyTaskState } from "@/lib/types";

// Correction pass — the same allowed range (60–600 lb) and increment (0.2
// lb) the old NumberField already enforced via isValidWeight/its own
// step/min/max, just replacing the +/- stepper + typed field with a wheel.
// Two columns (whole pounds, tenths) rather than one 2,701-row wheel —
// mirrors both a real bathroom-scale reading (e.g. "182" + ".4") and this
// codebase's own established multi-column pattern for a decimal-ish value
// (see components/today/training-time-wheel.tsx's hour/minute/period
// columns sharing one frame).
const WEIGHT_MIN_LB = 60;
const WEIGHT_MAX_LB = 600;
const WHOLE_POUND_VALUES = buildStepRange(WEIGHT_MIN_LB, WEIGHT_MAX_LB, 1);
const TENTHS_VALUES = [0, 2, 4, 6, 8]; // the existing 0.2 lb step, expressed as tenths

/** Only ever calls `onChange` in response to a real user interaction on one
 * of the two columns (WheelColumn's own contract — never on mount), so a
 * wheel resting on a neutral center never silently counts as an answer;
 * `handleSave` below still gates on `draft !== ""` exactly as before. */
function WeightWheel({ displayValueLb, onChange }: { displayValueLb: number; onChange: (valueLb: number) => void }) {
  const clamped = Math.min(WEIGHT_MAX_LB, Math.max(WEIGHT_MIN_LB, displayValueLb));
  const whole = Math.floor(clamped);
  const tenths = Math.round((clamped - whole) * 10);
  const wholeRef = useRef(whole);
  const clampedTenths = TENTHS_VALUES.includes(tenths) ? tenths : 0;
  const tenthsRef = useRef(clampedTenths);

  function commit() {
    onChange(Math.round((wholeRef.current + tenthsRef.current / 10) * 10) / 10);
  }

  return (
    <div className="relative">
      <WheelFrame>
        <WheelColumn
          ariaLabel="Weight, whole pounds"
          values={WHOLE_POUND_VALUES.map(String)}
          index={nearestValueIndex(WHOLE_POUND_VALUES, whole)}
          onChange={(i) => {
            wholeRef.current = WHOLE_POUND_VALUES[i];
            commit();
          }}
        />
        <WheelColumn
          ariaLabel="Weight, tenths of a pound"
          values={TENTHS_VALUES.map((t) => `.${t}`)}
          index={nearestValueIndex(TENTHS_VALUES, clampedTenths)}
          onChange={(i) => {
            tenthsRef.current = TENTHS_VALUES[i];
            commit();
          }}
        />
      </WheelFrame>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-meta text-neutral"
      >
        lb
      </span>
    </div>
  );
}

export function MorningWeightTask({
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
  const { state: appState, dispatch, activeContext } = usePrototypeState();
  const { morningWeight } = appState;
  const previousWeightLb = activeContext.clientProfile?.previousWeightLb ?? null;
  const [draft, setDraft] = useState<number | "">("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  // When Morning Weight is the day's spotlighted priority, the full
  // decrement/field/increment/Save/Skip form used to appear immediately —
  // one simple action consuming the same room as a rich meal or workout
  // card. This defers that form behind a one-line "Log weight" teaser
  // until tapped, purely a presentational default; nothing about the
  // interaction, validation, or dispatch below changes.
  const [formOpen, setFormOpen] = useState(false);

  const isLogged = morningWeight.weightLb !== null;

  function handleSave() {
    if (draft === "") {
      setError("Enter your weight to save it.");
      return;
    }
    if (!isValidWeight(draft)) {
      setError("Enter a realistic weight between 60 and 600 lb.");
      return;
    }
    dispatch({ type: "SET_MORNING_WEIGHT", weightLb: draft });
    setEditing(false);
    setError(null);
    setJustSaved(true);
  }

  if ((isLogged || morningWeight.skipped) && !editing) {
    return (
      <TaskShell
        title="Morning weight"
        icon={<Scale size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      >
        {isLogged ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-metric text-off-white">{morningWeight.weightLb} lb</p>
              {justSaved ? (
                <p className="mt-1 text-meta text-success">
                  Logged. Weekly trends matter more than a single morning.
                </p>
              ) : previousWeightLb !== null ? (
                <p className="mt-1 text-meta text-neutral">Previous: {previousWeightLb} lb</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(morningWeight.weightLb ?? "");
                setEditing(true);
                setJustSaved(false);
              }}
            >
              <Pencil size={14} />
              Edit
            </Button>
          </div>
        ) : (
          <p className="text-meta text-neutral">Skipped for today. You can still log it later if you&apos;d like.</p>
        )}
      </TaskShell>
    );
  }

  // Spotlighted but not yet acted on: a compact teaser rather than the
  // full form. Secondary-tier tiles already get this compactness for free
  // from TaskShell's own collapse — this only applies to the primary
  // (spotlight) case, which previously always rendered the full form.
  if (emphasisOverride === "primary" && !formOpen) {
    return (
      <TaskShell
        title="Morning weight"
        icon={<Scale size={17} />}
        state={state}
        emphasisOverride={emphasisOverride}
        scheduleLabel={scheduleLabel}
        fillWidth={fillWidth}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      >
        <button type="button" onClick={() => setFormOpen(true)} className="flex w-full items-center justify-between gap-3 text-left">
          <span className="min-w-0 text-meta text-neutral">
            {previousWeightLb !== null ? `Previous: ${previousWeightLb} lb` : "Track today's weight."}
          </span>
          <span className="shrink-0 text-action text-accent-strong">Log weight →</span>
        </button>
      </TaskShell>
    );
  }

  return (
    <TaskShell
      title="Morning weight"
      icon={<Scale size={17} />}
      state={state}
      emphasisOverride={emphasisOverride}
      scheduleLabel={scheduleLabel}
      fillWidth={fillWidth}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      {previousWeightLb !== null ? (
        <p className="mb-3 text-meta text-neutral">Previous recorded weight: {previousWeightLb} lb</p>
      ) : null}
      <div>
        <span className="mb-1.5 block text-sm font-medium text-off-white">Today&apos;s weight</span>
        <WeightWheel
          displayValueLb={draft === "" ? (previousWeightLb ?? 150) : draft}
          onChange={(v) => {
            setDraft(v);
            setError(null);
          }}
        />
      </div>
      {error ? <p className="mt-1.5 text-xs text-error">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button onClick={handleSave} className="flex-1">
          Save
        </Button>
        {editing ? (
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => {
              dispatch({ type: "SKIP_MORNING_WEIGHT" });
              setError(null);
            }}
          >
            Skip
          </Button>
        )}
      </div>
    </TaskShell>
  );
}
