"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CoachSourceList } from "@/components/nutrition/coach-source-list";
import { MACRO_EDUCATION } from "@/lib/nutrition/education-content";
import { MACRO_ACCENTS, macroRemainingCaption } from "@/lib/nutrition/view-model";
import type { MacroKey } from "@/lib/nutrition/view-model";

interface MacroDetailSheetProps {
  macro: MacroKey;
  open: boolean;
  onClose: () => void;
  consumed: number;
  target: number;
}

/**
 * The macro detail surface — a scannable first layer (what it does, why it
 * matters, today's progress, how to use it today, coach-curated sources)
 * with the complete explanation exactly one tap away via "Read the full
 * guide", per the product spec. Progressive disclosure happens inside this
 * one sheet (a view toggle) rather than stacking a second Sheet instance.
 */
export function MacroDetailSheet({ macro, open, onClose, consumed, target }: MacroDetailSheetProps) {
  const [showFull, setShowFull] = useState(false);
  const content = MACRO_EDUCATION[macro];
  const accent = MACRO_ACCENTS[macro];
  const percent = target > 0 ? (consumed / target) * 100 : 0;

  // Deferred a tick (matches components/today/training-time-sheet.tsx's
  // established convention) rather than calling setState synchronously in
  // the effect body, which react-hooks' set-state-in-effect rule flags.
  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => setShowFull(false), 0);
    return () => clearTimeout(timeout);
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={content.displayName}>
      {!showFull ? (
        <div className="space-y-5">
          <div className="rounded-[var(--radius-md)] bg-surface-raised p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-label text-neutral">Consumed</p>
                <p className="mt-1 text-heading text-off-white">{Math.round(consumed)}g</p>
              </div>
              <div className="text-right">
                <p className="text-label text-neutral">Target</p>
                <p className="mt-1 text-heading text-neutral">{target}g</p>
              </div>
            </div>
            <ProgressBar percent={percent} color={accent} trackClassName="mt-1.5" />
            <p className="mt-2 text-meta text-neutral">{macroRemainingCaption(consumed, target)}</p>
          </div>

          <DetailSection heading="What it does" body={content.whatItDoes} />
          <DetailSection heading="Why it matters" body={content.whyItMatters} />
          <DetailSection heading="How to use this today" body={content.howToUseToday} />

          <div>
            <p className="text-label text-neutral">Coach&apos;s picks</p>
            <div className="mt-2">
              <CoachSourceList sources={content.sources} />
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={() => setShowFull(true)}>
            Read the full guide
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => setShowFull(false)}
            className="flex items-center gap-1 text-action text-brass-strong"
          >
            <ChevronLeft size={16} aria-hidden="true" /> Back
          </button>

          {content.fullSections.map((section) => (
            <div key={section.heading}>
              <p className="text-subheading text-off-white">{section.heading}</p>
              <p className="mt-1 text-body text-neutral">{section.body}</p>
            </div>
          ))}

          <div>
            <p className="text-label text-neutral">Coach&apos;s picks</p>
            <div className="mt-2">
              <CoachSourceList sources={content.sources} detailed />
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function DetailSection({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <p className="text-subheading text-off-white">{heading}</p>
      <p className="mt-1 text-body text-neutral">{body}</p>
    </div>
  );
}
