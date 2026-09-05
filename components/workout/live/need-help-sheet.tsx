"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, Clock, HelpCircle, Wrench } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PainReportOverlay } from "@/components/workout/live/pain-report-overlay";
import { SkipReasonSheet } from "@/components/workout/skip-reason-sheet";
import { TechniqueQuestionSheet } from "@/components/workout/technique-question-sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import type { Exercise, SkipReason } from "@/lib/types";

type SubView = "menu" | "equipment" | "skip-set";

/**
 * Phase 4.4B-2 §J — one calm, progressive-disclosure entry point for pain,
 * equipment, technique, and skip actions, so they never compete visually
 * with the primary set action. Reuses the existing SkipReasonSheet and
 * TechniqueQuestionSheet exactly — no competing implementation of either.
 * Phase 4.4B-2.1 — pain now opens the dedicated full-viewport
 * PainReportOverlay instead of a bottom sheet (see that component's doc for
 * why), and submitting it hands off to the persisted pain-review phase
 * (lib/state.ts's REPORT_PAIN) rather than quietly closing back to the set.
 */
export function NeedHelpSheet({
  open,
  onClose,
  exercise,
  setNumber,
}: {
  open: boolean;
  onClose: () => void;
  exercise: Exercise;
  setNumber: number;
}) {
  const { dispatch, activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [view, setView] = useState<SubView>("menu");
  const [painOpen, setPainOpen] = useState(false);
  const [techniqueOpen, setTechniqueOpen] = useState(false);
  const [equipmentSkipOpen, setEquipmentSkipOpen] = useState(false);
  const canDefer = true; // The set-ready surface is always mid-exercise, so there's always a "later" to return to unless this is the only remaining exercise — DEFER_EXERCISE itself is a safe no-op in that case.

  function reset() {
    setView("menu");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleDeferExercise() {
    dispatch({ type: "DEFER_EXERCISE", exerciseId: exercise.id });
    handleClose();
  }

  function handleEquipmentSkipConfirm(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_EXERCISE", exerciseId: exercise.id, reason, note });
    setEquipmentSkipOpen(false);
    handleClose();
  }

  function handleSkipSetConfirm(reason: SkipReason, note?: string) {
    dispatch({ type: "SKIP_SET", exerciseId: exercise.id, setNumber, isWarmup: false, reason, note });
    handleClose();
  }

  return (
    <>
      <Sheet open={open && view === "menu"} onClose={handleClose} title="Need help?" description={`For ${exercise.name}.`}>
        <div className="space-y-2">
          <MenuRow icon={<AlertTriangle size={17} />} label="Report pain" onClick={() => setPainOpen(true)} />
          <MenuRow icon={<Wrench size={17} />} label="Equipment unavailable" onClick={() => setView("equipment")} />
          <MenuRow icon={<HelpCircle size={17} />} label="Technique question" onClick={() => setTechniqueOpen(true)} />
          <MenuRow icon={<Clock size={17} />} label="Skip this set" onClick={() => setView("skip-set")} />
        </div>
      </Sheet>

      <Sheet
        open={open && view === "equipment"}
        onClose={handleClose}
        title="Equipment unavailable"
        description={`For ${exercise.name}.`}
      >
        <div className="space-y-3">
          <p className="text-body text-neutral">
            Come back to this exercise later, or skip it for today — the choice is recorded either way.
          </p>
          <Button className="w-full" disabled={!canDefer} onClick={handleDeferExercise}>
            Do later
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setEquipmentSkipOpen(true)}>
            Skip this exercise
          </Button>
          <button type="button" onClick={() => setView("menu")} className="w-full text-center text-action text-neutral">
            Back
          </button>
        </div>
      </Sheet>

      <SkipReasonSheet
        open={equipmentSkipOpen}
        onClose={() => setEquipmentSkipOpen(false)}
        title="Skip this exercise"
        description={`${exercise.name} will be marked skipped and flagged for ${coachName}.`}
        onConfirm={handleEquipmentSkipConfirm}
      />

      <SkipReasonSheet
        open={open && view === "skip-set"}
        onClose={handleClose}
        title="Skip this set"
        description={`Set for ${exercise.name}.`}
        onConfirm={handleSkipSetConfirm}
      />

      <PainReportOverlay
        open={painOpen}
        onClose={() => {
          setPainOpen(false);
          handleClose();
        }}
        exerciseName={exercise.name}
        coachName={coachName}
        onSubmit={(report) => {
          dispatch({ type: "REPORT_PAIN", exerciseId: exercise.id, ...report });
          setPainOpen(false);
        }}
      />

      <TechniqueQuestionSheet
        open={techniqueOpen}
        onClose={() => {
          setTechniqueOpen(false);
          handleClose();
        }}
        onFlagForCoach={(context) =>
          dispatch({ type: "FLAG_TECHNIQUE_QUESTION", exerciseName: exercise.name, context: context || undefined })
        }
      />
    </>
  );
}

function MenuRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
        {icon}
      </span>
      <span className="flex-1 text-subheading text-off-white">{label}</span>
      <ChevronRight size={16} className="shrink-0 text-neutral" aria-hidden="true" />
    </button>
  );
}
