"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstimateItemEditor } from "@/components/nutrition/photo/estimate-item-editor";
import { activeMealVisionEstimator, type MealAnalysisResult } from "@/lib/nutrition/vision-estimator";
import { sumMealEstimateItems } from "@/lib/nutrition/view-model";
import { MEAL_PERIOD_LABELS } from "@/lib/mock-data";
import type { MacroValues, MealEstimateConfidence, MealEstimateItem, MealPeriod } from "@/lib/types";

type FlowStep =
  | { kind: "capture" }
  | { kind: "analyzing"; previewUrl: string | null }
  | { kind: "review"; previewUrl: string | null; items: MealEstimateItem[]; confidence: MealEstimateConfidence; note?: string }
  | { kind: "unrecognized"; previewUrl: string | null; note: string }
  | { kind: "error"; previewUrl: string | null; message: string };

export interface PhotoMealFlowProps {
  period: MealPeriod;
  onConfirm: (items: MealEstimateItem[], macros: MacroValues, confidence: MealEstimateConfidence) => void;
  onCancel: () => void;
  /** Offers "Enter manually instead" wherever shown — omit to hide that
   * escape hatch (e.g. when there's nowhere sensible to fall back to). */
  onFallbackManual?: () => void;
  /** Reopens directly into the review step with a previously confirmed
   * estimate's items, for correcting an already-logged photo meal — no
   * image is available in this case (see the module doc's storage note), so
   * the review UI shows a neutral placeholder instead of a photo. */
  initialReview?: { items: MealEstimateItem[]; confidence: MealEstimateConfidence };
  /** Gate 3B — offered only on the "unrecognized"/"error" dead-end below:
   * when OPTIM genuinely cannot form a safe estimate from this photo, the
   * client can route the evidence to their coach instead of being stuck
   * with only "try again"/"enter manually." Omit to hide the option (e.g.
   * if the caller has no coach-review path wired for this context). */
  onRequestHelp?: () => void;
}

/**
 * The capture -> analyze -> review -> confirm state machine behind OPTIM's
 * meal-photo estimator. Talks to the vision-estimation boundary only through
 * `MealVisionEstimator` (see lib/nutrition/vision-estimator.ts) — never a
 * concrete implementation. Nothing is dispatched to app state until the
 * client explicitly confirms (see onConfirm), so an abandoned analyzing/
 * review pass never touches today's totals.
 *
 * Image handling: a temporary object URL is created only for local preview,
 * held only in this component's memory (never written to AppState or
 * localStorage), and revoked on every exit path (confirm, cancel, retry,
 * unmount) — see setPreviewUrl/the unmount effect below. The raw file is
 * never logged to the console and never sent anywhere by the local demo
 * estimator.
 */
export function PhotoMealFlow({ period, onConfirm, onCancel, onFallbackManual, initialReview, onRequestHelp }: PhotoMealFlowProps) {
  const [step, setStep] = useState<FlowStep>(
    initialReview
      ? { kind: "review", previewUrl: null, items: initialReview.items, confidence: initialReview.confidence }
      : { kind: "capture" }
  );
  const [confirming, setConfirming] = useState(false);
  const pendingFileRef = useRef<File | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function setPreviewUrl(url: string | null) {
    if (previewUrlRef.current && previewUrlRef.current !== url) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = url;
  }

  async function runAnalysis(file: File) {
    pendingFileRef.current = file;
    const previewUrl = URL.createObjectURL(file);
    setPreviewUrl(previewUrl);
    setStep({ kind: "analyzing", previewUrl });
    try {
      const result: MealAnalysisResult = await activeMealVisionEstimator.estimate(file);
      if (result.status === "unrecognized") {
        setStep({ kind: "unrecognized", previewUrl, note: result.note ?? "Couldn't identify this meal confidently." });
        return;
      }
      setStep({ kind: "review", previewUrl, items: result.items, confidence: result.confidence, note: result.note });
    } catch {
      setStep({
        kind: "error",
        previewUrl,
        message: "Something went wrong analyzing that photo. You can try again or enter this meal manually.",
      });
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    // No file means the client canceled the camera/picker — stay put on the
    // capture step rather than showing any error.
    if (!file) return;
    void runAnalysis(file);
  }

  function retry() {
    const file = pendingFileRef.current;
    if (file) void runAnalysis(file);
  }

  function backToCapture() {
    setPreviewUrl(null);
    setStep({ kind: "capture" });
  }

  function handleConfirm() {
    if (step.kind !== "review" || confirming) return;
    const macros = sumMealEstimateItems(step.items);
    setConfirming(true);
    onConfirm(step.items, macros, step.confidence);
  }

  const mealLabel = MEAL_PERIOD_LABELS[period];

  if (step.kind === "capture") {
    return (
      <div className="space-y-3">
        <p className="text-body text-neutral">
          Photograph or choose a photo of your {mealLabel.toLowerCase()} — OPTIM will estimate the items and macros for
          you to review before anything is logged.
        </p>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <input ref={libraryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <Button type="button" className="w-full" onClick={() => cameraInputRef.current?.click()}>
          <Camera size={18} aria-hidden="true" /> Take a photo
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={() => libraryInputRef.current?.click()}>
          <ImageIcon size={18} aria-hidden="true" /> Choose from library
        </Button>
        <p className="text-meta text-neutral">
          If your browser blocks camera access, choose from library instead — manual entry is always available too.
        </p>
        {onFallbackManual ? (
          <Button type="button" variant="ghost" className="w-full" onClick={onFallbackManual}>
            Enter manually instead
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  }

  if (step.kind === "analyzing") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        {step.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- transient local object-URL preview, never a remote/optimizable asset
          <img src={step.previewUrl} alt="" className="h-40 w-40 rounded-[var(--radius-md)] object-cover opacity-70" />
        ) : null}
        <div className="flex items-center gap-2 text-body text-off-white">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-brass border-t-transparent"
          />
          <span role="status">Analyzing your photo…</span>
        </div>
        <p className="text-meta text-neutral">This usually takes just a couple of seconds.</p>
      </div>
    );
  }

  if (step.kind === "unrecognized" || step.kind === "error") {
    const message = step.kind === "unrecognized" ? step.note : step.message;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-warning-soft p-3" role="alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-body text-off-white">{message}</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Button type="button" onClick={retry}>
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={backToCapture}>
            Use a different photo
          </Button>
          {onFallbackManual ? (
            <Button type="button" variant="outline" onClick={onFallbackManual}>
              Enter manually instead
            </Button>
          ) : null}
          {onRequestHelp ? (
            <Button type="button" variant="outline" onClick={onRequestHelp}>
              Ask my coach for help
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // review
  const totals = sumMealEstimateItems(step.items);
  const hasNamedItems = step.items.length > 0 && step.items.every((item) => item.name.trim().length > 0);
  const canConfirm = hasNamedItems && !confirming;
  const confidenceLabel = step.confidence === "high" ? "High" : step.confidence === "medium" ? "Medium" : "Lower";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {step.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- transient local object-URL preview, never a remote/optimizable asset
          <img src={step.previewUrl} alt="" className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-raised text-neutral">
            <ImageIcon size={20} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-subheading text-off-white">OPTIM estimate</p>
          <p className="text-meta text-neutral">{confidenceLabel} confidence — review before confirming</p>
        </div>
      </div>

      {step.note ? <p className="text-meta text-neutral">{step.note}</p> : null}

      <EstimateItemEditor items={step.items} onChange={(items) => setStep({ ...step, items })} />

      <div className="rounded-[var(--radius-md)] bg-surface-raised p-3">
        <p className="text-label text-neutral">Estimated total</p>
        <p className="mt-1 text-subheading text-off-white">
          {Math.round(totals.calories)} cal · {Math.round(totals.proteinG)}g P · {Math.round(totals.carbsG)}g C ·{" "}
          {Math.round(totals.fatG)}g F
        </p>
      </div>

      {step.items.length === 0 ? <p className="text-meta text-neutral">Add at least one item to confirm.</p> : null}

      <div className="flex gap-2">
        <Button type="button" className="flex-1" onClick={handleConfirm} disabled={!canConfirm}>
          Confirm meal
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
