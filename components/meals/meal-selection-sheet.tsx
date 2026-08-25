"use client";

import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { ReasonPicker, SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import { MealOptionCard } from "@/components/meals/meal-option-card";
import { ManualMealForm } from "@/components/meals/manual-meal-form";
import { PhotoMealFlow } from "@/components/nutrition/photo/photo-meal-flow";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { findEarliestIncompleteMealBefore } from "@/lib/calculations";
import { mealDisplayName, mealProvenanceLabel } from "@/lib/nutrition/view-model";
import { MEAL_OPTIONS, MEAL_PERIOD_LABELS } from "@/lib/mock-data";
import type { MacroValues, MealEstimateConfidence, MealEstimateItem, MealPeriod, MealSelection, SkipReason } from "@/lib/types";

interface MealSelectionSheetProps {
  period: MealPeriod;
  open: boolean;
  onClose: () => void;
  /** Skips straight to the photo-capture flow on open — used by the
   * "current meal" card's camera shortcut. Defaults to the normal options
   * (or, for an already-logged meal, summary) view. */
  initialView?: "options" | "photo";
}

type View = "summary" | "options" | "manual" | "photo" | "skip" | "sequence-warning";

type PendingLog =
  | { kind: "option"; optionId: string }
  | { kind: "manual"; name: string; macros: MacroValues }
  | { kind: "photo"; items: MealEstimateItem[]; macros: MacroValues; confidence: MealEstimateConfidence };

function formatTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function MealSelectionSheet({ period, open, onClose, initialView }: MealSelectionSheetProps) {
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
    !!currentSelection &&
    (currentSelection.source === "option" || currentSelection.source === "manual" || currentSelection.source === "photo-estimate");
  const options = MEAL_OPTIONS[period];
  const label = MEAL_PERIOD_LABELS[period];

  // Resets to the right starting view every time the sheet opens — never
  // just once on mount, since this same component instance stays mounted
  // (controlled by `open`) across repeated opens for a given meal card. See
  // components/today/training-time-sheet.tsx for the identical pattern,
  // including the setTimeout wrapper — react-hooks' set-state-in-effect rule
  // flags a synchronous setState call directly in an effect body, so the
  // reset is deferred a tick the same way that sheet's already does.
  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      setPendingOptionId(null);
      setPendingLog(null);
      setBlockingPeriod(null);
      if (initialView === "photo") {
        setView("photo");
        return;
      }
      setView(currentSelection ? "summary" : "options");
    }, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialView]);

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
    } else if (log.kind === "manual") {
      dispatch({ type: "SET_MANUAL_MEAL", period, manualName: log.name, macros: log.macros });
    } else {
      dispatch({ type: "LOG_PHOTO_MEAL", period, items: log.items, macros: log.macros, confidence: log.confidence });
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

  function handlePhotoConfirm(items: MealEstimateItem[], macros: MacroValues, confidence: MealEstimateConfidence) {
    attemptLog({ kind: "photo", items, macros, confidence });
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

  function handleClear() {
    dispatch({ type: "UNDO_MEAL_SELECTION", period });
    resetAndClose();
  }

  function startEdit() {
    if (!currentSelection) return;
    if (currentSelection.source === "option") {
      setPendingOptionId(currentSelection.optionId ?? null);
      setView("options");
    } else if (currentSelection.source === "manual") {
      setView("manual");
    } else if (currentSelection.source === "photo-estimate") {
      setView("photo");
    }
  }

  const pendingOption = pendingOptionId ? options.find((o) => o.id === pendingOptionId) : null;
  const editingPhotoEstimate = currentSelection?.source === "photo-estimate" ? currentSelection.photoEstimate : undefined;

  return (
    <Sheet
      open={open}
      onClose={resetAndClose}
      title={
        view === "manual"
          ? `${label}: something else`
          : view === "photo"
            ? `${label}: photo estimate`
            : view === "skip"
              ? `Skip ${label.toLowerCase()}`
              : view === "sequence-warning"
                ? "Log out of order?"
                : label
      }
      description={view === "options" ? "Pick the option that fits today, or log something else." : undefined}
    >
      {view === "summary" && currentSelection ? (
        <MealSummary
          period={period}
          label={label}
          selection={currentSelection}
          onEdit={hasExistingSelection ? startEdit : undefined}
          onLogNow={!hasExistingSelection && currentSelection.source !== "skipped" ? () => setView("options") : undefined}
          onClear={handleClear}
        />
      ) : null}

      {view === "options" && (
        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={() => setView("photo")}>
            <Camera size={16} aria-hidden="true" /> Log with a photo
          </Button>

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
            <div className="space-y-2 pt-1">
              <Button variant="outline" size="sm" className="w-full" onClick={() => setView("manual")}>
                I ate something else
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={handlePlanLater}>
                  Plan for later
                </Button>
                <Button variant="outline" size="sm" onClick={() => setView("skip")}>
                  Mark skipped
                </Button>
              </div>
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
        <ManualMealForm
          onSave={handleManualSave}
          onCancel={() => setView(currentSelection ? "summary" : "options")}
          initial={
            currentSelection?.source === "manual" && currentSelection.macros
              ? { name: currentSelection.manualName ?? "", macros: currentSelection.macros }
              : undefined
          }
          submitLabel={currentSelection?.source === "manual" ? "Save changes" : "Save estimate"}
        />
      )}

      {view === "photo" && (
        <PhotoMealFlow
          key={editingPhotoEstimate ? "edit" : "new"}
          period={period}
          initialReview={editingPhotoEstimate}
          onConfirm={handlePhotoConfirm}
          onCancel={() => (currentSelection ? setView("summary") : resetAndClose())}
          onFallbackManual={() => setView("manual")}
        />
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
            <Button variant="ghost" onClick={() => setView(currentSelection ? "summary" : "options")}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** The "reopen a logged meal" summary — first thing shown when the sheet
 * opens for a meal that already has a resolved selection (logged, skipped,
 * or planned for later), so reviewing what's already recorded never
 * requires stepping back through the picker. */
function MealSummary({
  period,
  label,
  selection,
  onEdit,
  onLogNow,
  onClear,
}: {
  period: MealPeriod;
  label: string;
  selection: MealSelection;
  onEdit?: () => void;
  onLogNow?: () => void;
  onClear: () => void;
}) {
  const name = mealDisplayName(period, selection);
  const provenance = mealProvenanceLabel(selection);
  const time = formatTime(selection.completedAtIso);

  return (
    <div className="space-y-4">
      {selection.source === "skipped" ? (
        <div className="rounded-[var(--radius-md)] bg-surface-raised p-4">
          <p className="text-subheading text-off-white">Skipped</p>
          <p className="mt-1 text-meta text-neutral">{SKIP_REASON_LABELS[selection.skipReason ?? "other"]}</p>
          {selection.skipNote ? <p className="mt-1 text-meta text-neutral">&ldquo;{selection.skipNote}&rdquo;</p> : null}
        </div>
      ) : selection.source === "planned-later" ? (
        <div className="rounded-[var(--radius-md)] bg-surface-raised p-4">
          <p className="text-subheading text-off-white">Planned for later</p>
          <p className="mt-1 text-meta text-neutral">You chose to log {label.toLowerCase()} later today.</p>
        </div>
      ) : (
        <div className="rounded-[var(--radius-md)] bg-surface-raised p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-subheading text-off-white">{name ?? label}</p>
            {provenance ? (
              <span className="shrink-0 rounded-full bg-brass-soft px-2 py-0.5 text-label text-brass-strong">
                {provenance}
              </span>
            ) : null}
          </div>
          {time ? <p className="mt-0.5 text-meta text-neutral">Logged at {time}</p> : null}
          {selection.macros ? (
            <p className="mt-2 text-meta text-neutral">
              {Math.round(selection.macros.calories)} cal · {Math.round(selection.macros.proteinG)}g P ·{" "}
              {Math.round(selection.macros.carbsG)}g C · {Math.round(selection.macros.fatG)}g F
            </p>
          ) : null}
          {selection.source === "photo-estimate" && selection.photoEstimate ? (
            <ul className="mt-2 space-y-1">
              {selection.photoEstimate.items.map((item) => (
                <li key={item.id} className="text-meta text-neutral">
                  {item.name} — {item.quantityLabel}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {onEdit ? (
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
        ) : onLogNow ? (
          <Button size="sm" onClick={onLogNow}>
            Log {label.toLowerCase()} now
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
