"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CoachBrief } from "@/components/coach/coach-brief";
import type { HealthReviewRecord, OnboardingProgress } from "@/lib/coach/types";

/**
 * Gates the existing, unchanged CoachBrief (full intake — glance facts plus
 * the six Body Context/Goal/Availability/Starting Point/Nutrition/Health
 * accordions) behind one clear disclosure action, per spec §4.5: "collapsed
 * by default behind one clear 'View full intake' action." CoachBrief itself
 * is not touched — every existing accordion/detail inside it still works
 * exactly as before once revealed.
 */
export function FullIntakeDisclosure({ onboarding, healthReview }: { onboarding: OnboardingProgress | null; healthReview: HealthReviewRecord | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface-raised px-3.5 py-2.5 text-sm font-medium text-off-white hover:bg-surface-input"
      >
        View full intake
        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {open ? (
        <div className="mt-3">
          <CoachBrief onboarding={onboarding} healthReview={healthReview} />
        </div>
      ) : null}
    </div>
  );
}
