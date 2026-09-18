"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvidenceChip } from "@/components/ui/evidence-chip";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { confirmInference, inferFromExistingWork, type OperatingModelInference } from "@/lib/coach/coach-onboarding-engine";

/**
 * Real, traceable inference over the coach's own saved program templates
 * and meal recommendations (see coach-onboarding-engine.ts's
 * inferFromExistingWork — genuinely computed, never fabricated, and
 * genuinely empty when there isn't enough real data). Every card shows its
 * real sample size and lets the coach confirm or dismiss it individually —
 * nothing here is ever silently treated as confirmed (this phase's brief
 * §II.2).
 */
export function ExistingWorkChapter({ onContinue }: { onContinue: () => void }) {
  const com = useCoachOperatingModel();
  const workspace = useCoachWorkspace();
  const myTemplates = workspace.platform.programTemplates.filter((t) => t.coachId === com.coachId);
  const myMealRecs = workspace.platform.mealRecommendations.filter((r) => r.coachId === com.coachId);
  const allInferences = useMemo(() => inferFromExistingWork(myTemplates, myMealRecs), [myTemplates, myMealRecs]);

  const draftModel = com.buildDraftModel();
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const pending = allInferences.filter((inf) => !resolvedIds.has(inf.questionId) && draftModel.provenance[inf.questionId]?.source !== "coach_confirmed");

  function confirm(inference: OperatingModelInference) {
    const nowIso = new Date().toISOString();
    const applied = inference.apply(draftModel, nowIso);
    const confirmed = confirmInference(applied, inference.questionId, nowIso);
    com.saveDraft(confirmed);
    setResolvedIds((prev) => new Set(prev).add(inference.questionId));
  }

  function dismiss(inference: OperatingModelInference) {
    setResolvedIds((prev) => new Set(prev).add(inference.questionId));
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-display text-off-white">What OPTIM noticed in your existing work</h2>
      <p className="mt-2 text-body text-neutral">
        Computed from {myTemplates.length} saved program template{myTemplates.length === 1 ? "" : "s"} and {myMealRecs.length} saved meal recommendation
        {myMealRecs.length === 1 ? "" : "s"}. Nothing here becomes a real rule until you confirm it.
      </p>

      <div className="mt-6 space-y-4">
        {allInferences.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border-strong p-6 text-center">
            <p className="text-body text-off-white">Not enough saved work yet to infer anything real.</p>
            <p className="mt-1 text-meta text-neutral">Save a few program templates or meal recommendations later, and OPTIM will learn from them then.</p>
          </div>
        ) : pending.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-border-strong bg-charcoal p-6 text-center">
            <Check size={20} className="mx-auto mb-2 text-success" aria-hidden="true" />
            <p className="text-body text-off-white">You&apos;ve reviewed every inference OPTIM could make from your existing work.</p>
          </div>
        ) : (
          pending.map((inference) => (
            <div key={inference.questionId} className="rounded-[var(--radius-lg)] border border-border-strong bg-charcoal p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-body font-semibold text-off-white">{inference.label}</p>
                  <p className="mt-1 text-sm text-neutral">{inference.note}</p>
                </div>
                <EvidenceChip icon={Sparkles} label={`${Math.round(inference.confidence * 100)}% confidence`} toneClassName="bg-accent-soft text-accent-fg" />
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => confirm(inference)}>
                  <Check size={14} aria-hidden="true" /> That&apos;s right
                </Button>
                <Button size="sm" variant="secondary" onClick={() => dismiss(inference)}>
                  <X size={14} aria-hidden="true" /> Not quite
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-8">
        <Button size="lg" onClick={onContinue}>
          Continue <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
