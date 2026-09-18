"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberWheel } from "@/components/ui/number-wheel";
import { TextArea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import type { PainSymptomQuality } from "@/lib/types";

const ONSET_OPTIONS = ["Before starting", "During the set", "Right after the set", "Earlier today"];

const SYMPTOM_QUALITY_OPTIONS: { value: PainSymptomQuality; label: string }[] = [
  { value: "sharp-pinching", label: "Sharp or pinching" },
  { value: "aching", label: "Aching" },
  { value: "burning", label: "Burning" },
  { value: "numbness-tingling", label: "Numbness or tingling" },
  { value: "instability-weakness", label: "Instability or weakness" },
  { value: "normal-fatigue", label: "Normal muscular fatigue" },
  { value: "other", label: "Other" },
];

export interface PainReportSubmission {
  location: string;
  ratingZeroToTen: number;
  onset: string;
  causedByMovement: string;
  continuedAfterSet: boolean;
  affectsOutsideGym: boolean;
  symptomQuality: PainSymptomQuality;
  note?: string;
}

interface PainReportOverlayProps {
  open: boolean;
  onClose: () => void;
  exerciseName: string;
  coachName: string;
  onSubmit: (report: PainReportSubmission) => void;
}

/**
 * Phase 4.4B-2.1 — a dedicated, full-viewport safety interruption for
 * reporting pain, replacing the old bottom-sheet form. Root cause of the
 * old form's clipped/trapped appearance: it was a `position: fixed`
 * overlay rendered inside a `.pc-animate-in`-wrapped card, and that class's
 * animation leaves a non-"none" `transform` applied forever (via
 * `animation-fill-mode: both`), which makes the card a CSS containing
 * block — so "fixed" positioned relative to the small card, not the
 * viewport. This component portals directly to `document.body` to
 * guarantee true viewport coverage regardless of where it's opened from
 * (see components/ui/sheet.tsx for the same fix applied to the shared
 * Sheet). The current exercise is already known, so it's shown as compact
 * read-only context instead of asking the client to re-enter it.
 */
export function PainReportOverlay({ open, onClose, exerciseName, coachName, onSubmit }: PainReportOverlayProps) {
  const [location, setLocation] = useState("");
  const [rating, setRating] = useState<number | "">("");
  // Mirrors RpeWheel's "requires an intentional selection" gate (see
  // components/workout/live/rpe-wheel.tsx) — the wheel mounts resting on a
  // neutral value, but that never counts as a real answer until the client
  // actually scrolls or taps a row.
  const [ratingTouched, setRatingTouched] = useState(false);
  const [onset, setOnset] = useState<string | null>(null);
  const [continuedAfterSet, setContinuedAfterSet] = useState<boolean | null>(null);
  const [affectsOutsideGym, setAffectsOutsideGym] = useState<boolean | null>(null);
  const [symptomQuality, setSymptomQuality] = useState<PainSymptomQuality | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  function reset() {
    setLocation("");
    setRating("");
    setRatingTouched(false);
    setOnset(null);
    setContinuedAfterSet(null);
    setAffectsOutsideGym(null);
    setSymptomQuality(null);
    setShowNote(false);
    setNote("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isValid =
    location.trim().length > 0 &&
    rating !== "" &&
    ratingTouched &&
    onset !== null &&
    continuedAfterSet !== null &&
    affectsOutsideGym !== null &&
    symptomQuality !== null;

  function handleSubmit() {
    if (!isValid) return;
    onSubmit({
      location: location.trim(),
      ratingZeroToTen: rating as number,
      onset: onset as string,
      causedByMovement: exerciseName,
      continuedAfterSet: continuedAfterSet as boolean,
      affectsOutsideGym: affectsOutsideGym as boolean,
      symptomQuality: symptomQuality as PainSymptomQuality,
      note: note.trim() || undefined,
    });
    reset();
  }

  // `open` is always false during any server render (client-only
  // interactive state that starts closed), so checking `document` directly
  // here can never cause a hydration mismatch — see components/ui/sheet.tsx
  // for the identical reasoning.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-near-black/95 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative flex h-full w-full items-stretch justify-center sm:items-center sm:p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pain-report-title"
          tabIndex={-1}
          className="flex h-dvh w-full flex-col overflow-hidden bg-charcoal outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-[var(--radius-lg)] sm:border sm:border-border-strong sm:shadow-[var(--shadow-subtle)]"
        >
          {/* Sticky header */}
          <div className="shrink-0 border-b border-border px-5 pb-4 pt-[calc(env(safe-area-inset-top)+16px)] sm:pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error-soft text-error">
                  <AlertTriangle size={17} />
                </span>
                <div>
                  <h2 id="pain-report-title" className="text-heading text-off-white">
                    Report pain or discomfort
                  </h2>
                  <p className="text-meta text-neutral">Reporting for {exerciseName}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral hover:bg-off-white/5 hover:text-off-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="pain-location" className="mb-1.5 block text-sm font-medium text-off-white">
                  Where is it?
                </label>
                <input
                  id="pain-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Right shoulder"
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[15px] text-off-white outline-none placeholder:text-neutral/60 focus-visible:border-accent"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-off-white">Pain rating (0–10)</span>
                  {!ratingTouched ? <span className="text-meta text-neutral">Scroll to select</span> : null}
                </div>
                <div className={ratingTouched ? undefined : "opacity-55"}>
                  <NumberWheel
                    id="pain-rating"
                    fieldLabel="Pain rating, 0 to 10"
                    value={rating === "" ? 0 : rating}
                    onChange={(v) => {
                      setRatingTouched(true);
                      setRating(v);
                    }}
                    min={0}
                    max={10}
                  />
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-off-white">When did it begin?</span>
                <div className="grid grid-cols-2 gap-2">
                  {ONSET_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setOnset(option)}
                      className={cn(
                        "min-h-[44px] rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm font-medium",
                        onset === option ? "border-accent bg-accent-soft text-accent-fg" : "border-border-strong text-off-white"
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-off-white">Did it continue after the set?</span>
                <div className="flex gap-2">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setContinuedAfterSet(v)}
                      className={cn(
                        "h-11 flex-1 rounded-[var(--radius-sm)] border text-sm font-medium",
                        continuedAfterSet === v ? "border-accent bg-accent-soft text-accent-fg" : "border-border-strong text-off-white"
                      )}
                    >
                      {v ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-off-white">Does it affect anything outside the gym?</span>
                <div className="flex gap-2">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setAffectsOutsideGym(v)}
                      className={cn(
                        "h-11 flex-1 rounded-[var(--radius-sm)] border text-sm font-medium",
                        affectsOutsideGym === v ? "border-accent bg-accent-soft text-accent-fg" : "border-border-strong text-off-white"
                      )}
                    >
                      {v ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-off-white">What does it feel like?</span>
                <div role="radiogroup" aria-label="Symptom quality" className="grid grid-cols-2 gap-2">
                  {SYMPTOM_QUALITY_OPTIONS.map((option) => {
                    const selected = symptomQuality === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setSymptomQuality(option.value)}
                        className={cn(
                          "min-h-[44px] rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm font-medium",
                          selected ? "border-accent bg-accent-soft text-accent-fg" : "border-border-strong text-off-white"
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {showNote ? (
                <TextArea id="pain-note" label="Optional note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              ) : (
                <button type="button" onClick={() => setShowNote(true)} className="text-action text-accent-fg">
                  + Add a note
                </button>
              )}

              <p className="text-meta text-neutral">
                When submitted, this will be saved and flagged for {coachName} to review. Nothing here changes your
                program automatically.
              </p>
            </div>
          </div>

          {/* Sticky footer */}
          <div className="shrink-0 border-t border-border px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4">
            <Button className="w-full" size="lg" disabled={!isValid} onClick={handleSubmit}>
              Submit report
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
