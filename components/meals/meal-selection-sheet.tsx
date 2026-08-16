"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { ReasonPicker } from "@/components/ui/reason-picker";
import { MealOptionCard } from "@/components/meals/meal-option-card";
import { ManualMealForm } from "@/components/meals/manual-meal-form";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { findEarliestIncompleteMealBefore } from "@/lib/calculations";
import { MEAL_OPTIONS, MEAL_PERIOD_LABELS } from "@/lib/mock-data";
import type { MacroValues, MealPeriod, SkipReason } from "@/lib/types";

interface MealSelectionSheetProps {
  period: MealPeriod;
  open: boolean;
  onClose: () => void;
}

type View = "options" | "manual" | "skip" | "sequence-warning";

type PendingLog = { kind: "option"; optionId: string } | { kind: "manual"; name: string; macros: MacroValues };

export function MealSelectionSheet({ period, open, onClose }: MealSelectionSheetProps) {
  const { state, dispatch, activeContext, dailyPlan } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [view, setView] = useState<View>("options");
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState<SkipReason | null>(null);
  const [skipNote, setSkipNote] = useState("");
  // Phase 3.1.1 §1 — holds the action to run once the client either
  // confirms past the sequence warning or never triggered one at all.
  const [pendingLog, setPendingLog] = useState<PendingLog | null>(null);
  const [blockingPeriod, setBlockingPeriod] = useState<MealPeriod | null>(null);
  const [viewBeforeWarning, setViewBeforeWarning] = useState<View>("options");

  const currentSelection = state.meals[period];
  const hasExistingSelection =
    !!currentSelection && (currentSelection.source === "option" || currentSelection.source === "manual");
  const options = MEAL_OPTIONS[period];
  const label = MEAL_PERIOD_LABELS[period];

  function resetAndClose() {
    setView("options");
    setPendingOptionId(null);
    setSkipReason(null);
    setSkipNote("");
    setPendingLog(null);
    setBlockingPeriod(null);
    onClose();
  }

  function logNow(log: PendingLog) {
    if (log.kind === "option") {
      dispatch({ type: "SELECT_MEAL_OPTION", period, optionId: log.optionId });
    } else {
      dispatch({ type: "SET_MANUAL_MEAL", period, manualName: log.name, macros: log.macros });
    }
    resetAndClose();
  }

  // Warns — but never blocks — logging a meal while an earlier meal in
  // today's actual plan is still incomplete. Generic over any period pair;
  // never fires for a meal that was legitimately skipped or isn't part of
  // today's plan. See lib/calculations.ts's findEarliestIncompleteMealBefore.
  function attemptLog(log: PendingLog) {
    const periodsInPlan = Object.keys(dailyPlan.mealSchedule.entries) as MealPeriod[];
    const blocking = findEarliestIncompleteMealBefore(state.meals, period, periodsInPlan);
    if (blocking) {
      setBlockingPeriod(blocking);
      setPendingLog(log);
      setViewBeforeWarning(view);
      setView("sequence-warning");
      return;
    }
    logNow(log);
  }

  function handleSelectOption(optionId: string) {
    // Selecting only marks the option as pending — the client still has to
    // explicitly confirm they ate it before it's logged.
    setPendingOptionId(optionId);
  }

  function confirmSelection() {
    if (!pendingOptionId) return;
    attemptLog({ kind: "option", optionId: pendingOptionId });
  }

  function handleManualSave(name: string, macros: MacroValues) {
    attemptLog({ kind: "manual", name, macros });
  }

  function handleSkipConfirm() {
    if (!skipReason) return;
    dispatch({ type: "SKIP_MEAL", period, reason: skipReason, note: skipNote.trim() || undefined });
    resetAndClose();
  }

  function handlePlanLater() {
    dispatch({ type: "PLAN_MEAL_LATER", period });
    resetAndClose();
  }

  const pendingOption = pendingOptionId ? options.find((o) => o.id === pendingOptionId) : null;

  return (
    <Sheet
      open={open}
      onClose={resetAndClose}
      title={
        view === "manual"
          ? `${label}: something else`
          : view === "skip"
            ? `Skip ${label.toLowerCase()}`
            : view === "sequence-warning"
              ? "Log out of order?"
              : label
      }
      description={
        view === "options"
          ? "Pick the option that fits today, or log something else."
          : undefined
      }
    >
      {view === "options" && (
        <div className="space-y-3">
          {options.map((option) => (
            <MealOptionCard
              key={option.id}
              option={option}
              isSelected={pendingOptionId ? pendingOptionId === option.id : currentSelection?.optionId === option.id}
              onSelect={() => handleSelectOption(option.id)}
            />
          ))}

          {pendingOption ? (
            <div className="rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft p-4">
              <p className="text-sm text-off-white">
                {hasExistingSelection && currentSelection?.optionId !== pendingOptionId ? (
                  <>
                    Replace your selected {label.toLowerCase()} with <strong>{pendingOption.name}</strong>? This
                    will update today&apos;s nutrition totals.
                  </>
                ) : (
                  <>
                    Confirm you ate <strong>{pendingOption.name}</strong>? This will log it to today&apos;s
                    nutrition totals.
                  </>
                )}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={confirmSelection}>
                  {hasExistingSelection && currentSelection?.optionId !== pendingOptionId
                    ? "Replace"
                    : "Confirm — I ate this"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingOptionId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
              <Button variant="outline" size="sm" onClick={() => setView("manual")}>
                I ate something else
              </Button>
              <Button variant="outline" size="sm" onClick={handlePlanLater}>
                Plan for later
              </Button>
              <Button variant="outline" size="sm" onClick={() => setView("skip")}>
                Mark skipped
              </Button>
            </div>
          )}
        </div>
      )}

      {view === "sequence-warning" && blockingPeriod ? (
        <div className="space-y-4">
          <p className="text-sm text-off-white">
            You haven&apos;t logged {MEAL_PERIOD_LABELS[blockingPeriod].toLowerCase()} yet. Log{" "}
            {label.toLowerCase()} anyway?
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setView(viewBeforeWarning);
                setBlockingPeriod(null);
                setPendingLog(null);
              }}
            >
              Go back
            </Button>
            <Button className="flex-1" onClick={() => pendingLog && logNow(pendingLog)}>
              Log {label.toLowerCase()} anyway
            </Button>
          </div>
        </div>
      ) : null}

      {view === "manual" && (
        <ManualMealForm onSave={handleManualSave} onCancel={() => setView("options")} />
      )}

      {view === "skip" && (
        <div className="space-y-4">
          <p className="text-sm text-neutral">What&apos;s the reason you&apos;re skipping {label.toLowerCase()}?</p>
          <ReasonPicker value={skipReason} onChange={setSkipReason} name={`skip-${period}`} />
          <TextArea
            id={`skip-note-${period}`}
            label="Optional note"
            value={skipNote}
            onChange={(e) => setSkipNote(e.target.value)}
            placeholder={`Anything ${coachName} should know?`}
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSkipConfirm} disabled={!skipReason}>
              Confirm skip
            </Button>
            <Button variant="ghost" onClick={() => setView("options")}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
