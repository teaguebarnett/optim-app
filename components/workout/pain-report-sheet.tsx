"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { NumberField } from "@/components/ui/number-field";
import { cn } from "@/lib/cn";

interface PainReportSheetProps {
  open: boolean;
  onClose: () => void;
  defaultMovement?: string;
  onSubmit: (report: {
    location: string;
    ratingZeroToTen: number;
    onset: string;
    causedByMovement: string;
    continuedAfterSet: boolean;
    affectsOutsideGym: boolean;
    note?: string;
  }) => void;
}

const ONSET_OPTIONS = ["Before starting", "During the set", "Right after the set", "Earlier today"];

export function PainReportSheet({ open, onClose, defaultMovement, onSubmit }: PainReportSheetProps) {
  const [step, setStep] = useState<"form" | "confirmation">("form");
  const [location, setLocation] = useState("");
  const [rating, setRating] = useState<number | "">("");
  const [onset, setOnset] = useState<string | null>(null);
  const [movement, setMovement] = useState(defaultMovement ?? "");
  const [continuedAfterSet, setContinuedAfterSet] = useState<boolean | null>(null);
  const [affectsOutsideGym, setAffectsOutsideGym] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => setMovement(defaultMovement ?? ""), 0);
    return () => clearTimeout(timeout);
  }, [open, defaultMovement]);

  function reset() {
    setStep("form");
    setLocation("");
    setRating("");
    setOnset(null);
    setMovement(defaultMovement ?? "");
    setContinuedAfterSet(null);
    setAffectsOutsideGym(null);
    setNote("");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    if (!location.trim() || rating === "" || !onset || continuedAfterSet === null || affectsOutsideGym === null) {
      setError("Please fill in each field so Teague has the full picture.");
      return;
    }
    onSubmit({
      location: location.trim(),
      ratingZeroToTen: rating,
      onset,
      causedByMovement: movement.trim() || "Not specified",
      continuedAfterSet,
      affectsOutsideGym,
      note: note.trim() || undefined,
    });
    setStep("confirmation");
  }

  return (
    <Sheet open={open} onClose={handleClose} title={step === "form" ? "Report pain or discomfort" : "Logged for review"}>
      {step === "form" ? (
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

          <NumberField id="pain-rating" label="Pain rating (0–10)" value={rating} onChange={setRating} min={0} max={10} />

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
                    onset === option ? "border-accent bg-accent-soft text-accent-strong" : "border-border-strong text-off-white"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="pain-movement" className="mb-1.5 block text-sm font-medium text-off-white">
              Which movement caused it?
            </label>
            <input
              id="pain-movement"
              type="text"
              value={movement}
              onChange={(e) => setMovement(e.target.value)}
              className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[15px] text-off-white outline-none focus-visible:border-accent"
            />
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
                    continuedAfterSet === v ? "border-accent bg-accent-soft text-accent-strong" : "border-border-strong text-off-white"
                  )}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-off-white">
              Does it affect anything outside the gym?
            </span>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setAffectsOutsideGym(v)}
                  className={cn(
                    "h-11 flex-1 rounded-[var(--radius-sm)] border text-sm font-medium",
                    affectsOutsideGym === v ? "border-accent bg-accent-soft text-accent-strong" : "border-border-strong text-off-white"
                  )}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>

          <TextArea id="pain-note" label="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />

          {error ? <p className="text-xs text-error">{error}</p> : null}

          <Button className="w-full" onClick={handleSubmit}>
            Submit
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[15px] leading-relaxed text-off-white">
            I&apos;ve logged this and prepared it for Teague&apos;s review. Your program has not been permanently
            changed. Teague will review the details before any adjustment is finalized.
          </p>
          <Button className="w-full" onClick={handleClose}>
            Done
          </Button>
        </div>
      )}
    </Sheet>
  );
}
