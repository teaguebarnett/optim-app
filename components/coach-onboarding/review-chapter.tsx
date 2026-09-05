"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { generateThreeNutritionStrategies, generateThreeTrainingOptions, type ClientOnboardingSnapshot } from "@/lib/coach/activation-generation";
import { lowConfidenceQuestionIds } from "@/lib/coach/operating-model";
import { allRequiredVisibleQuestionIds, summarizeCoachOperatingModelChanges } from "@/lib/coach/coach-onboarding-engine";
import type { CoachOnboardingChapterId } from "@/lib/coach/coach-onboarding-questions";

const HYPOTHETICALS: { title: string; snapshot: ClientOnboardingSnapshot }[] = [
  {
    title: "A 28-year-old novice, general health, 3 days/week, commercial gym",
    snapshot: {
      age: 28,
      heightTotalInches: 66,
      weightLb: 150,
      sex: "female",
      primaryGoal: "general_health",
      secondaryGoals: [],
      availableDays: ["Monday", "Wednesday", "Friday"],
      maxSessionLengthMinutes: 60,
      trainingEnvironment: ["commercial_gym"],
      trainingExperience: "new",
      hasDietaryRestrictions: false,
      nutritionApproach: "no_structure",
    },
  },
  {
    title: "A 35-year-old advanced lifter, body recomposition, 5 days/week, home gym",
    snapshot: {
      age: 35,
      heightTotalInches: 70,
      weightLb: 190,
      sex: "male",
      primaryGoal: "body_recomposition",
      secondaryGoals: ["build_muscle", "lose_fat"],
      availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      maxSessionLengthMinutes: 75,
      trainingEnvironment: ["home_gym"],
      trainingExperience: "experienced_consistent",
      hasDietaryRestrictions: false,
      nutritionApproach: "tracking",
    },
  },
];

export function ReviewChapter({ onEditChapter }: { onEditChapter: (chapter: CoachOnboardingChapterId) => void }) {
  const com = useCoachOperatingModel();
  const model = com.buildDraftModel();
  const [activated, setActivated] = useState(!!com.activeModel);
  const lowConfidence = lowConfidenceQuestionIds(model);
  const requiredIds = allRequiredVisibleQuestionIds(com.answers);
  const unansweredRequired = requiredIds.filter((id) => !com.answers[id] && com.answers[id] !== false);

  // Phase 5.4A corrective pass — a coach re-entering Review after already
  // having an active, confirmed model gets an honest "what's changing"
  // summary before they overwrite it with a new version, plus an explicit
  // statement of what confirming will (and will not) touch.
  const previousActive = com.versions.find((v) => v.status === "active") ?? null;
  const isRevision = !!previousActive;
  const changedAreas = useMemo(() => summarizeCoachOperatingModelChanges(previousActive, model), [previousActive, model]);

  const previews = useMemo(
    () =>
      HYPOTHETICALS.map((h) => {
        const training = generateThreeTrainingOptions({ clientId: "preview-client", workspaceId: model.workspaceId, coachId: model.coachId, snapshot: h.snapshot, com: model, durationWeeks: model.practice.typicalProgramLengthWeeks, nowIso: new Date().toISOString() });
        const nutrition = generateThreeNutritionStrategies({ snapshot: h.snapshot, com: model, nowIso: new Date().toISOString() });
        return { title: h.title, bestTraining: training.find((t) => t.kind === "best_fit"), bestNutrition: nutrition.find((n) => n.kind === "best_fit") };
      }),
    [model]
  );

  function handleActivate() {
    com.confirmAndActivate(model);
    setActivated(true);
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-display text-off-white">Here&apos;s how OPTIM understands you</h2>
      <p className="mt-2 text-body text-neutral">Review each area below. Nothing becomes active until you confirm at the bottom.</p>

      {unansweredRequired.length > 0 ? (
        <div className="mt-5 flex items-start gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3.5 py-3 text-sm text-warning-strong">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{unansweredRequired.length} required question{unansweredRequired.length === 1 ? "" : "s"} still need an answer — OPTIM is using an honest default for now.</span>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        <SummarySection title="Who you coach" onEdit={() => onEditChapter("practice")}>
          <p>{model.practice.commonGoals.join(", ") || "No goals specified"} · {model.practice.experienceLevelsServed.join(", ") || "any experience level"}</p>
          <p className="mt-1 text-neutral">{model.practice.successDefinition || "No success definition provided yet."}</p>
        </SummarySection>

        <SummarySection title="How you program" onEdit={() => onEditChapter("program_architecture")}>
          <p>
            {model.programArchitecture.preferredSplits.join(", ") || "no split preference set"} · {model.programArchitecture.setsPerExerciseMin}–{model.programArchitecture.setsPerExerciseMax} sets ·{" "}
            {model.programArchitecture.repRangePhilosophy.replace(/_/g, " ")}
          </p>
        </SummarySection>

        <SummarySection title="How you progress clients & handle fatigue" onEdit={() => onEditChapter("program_architecture")}>
          <p>
            {model.programArchitecture.progressionMethod.replace(/_/g, " ")} · deload every {model.programArchitecture.deloadFrequencyWeeks ?? "as-needed"} weeks · proximity to failure:{" "}
            {model.programArchitecture.proximityToFailure.replace(/_/g, " ")}
          </p>
          <p className="mt-1 text-neutral">{model.trainingAdjustmentPolicies.length} real adjustment scenarios configured.</p>
        </SummarySection>

        <SummarySection title="How you coach nutrition" onEdit={() => onEditChapter("nutrition_philosophy")}>
          {model.nutritionPhilosophy.providesNutritionCoaching ? (
            <>
              <p>
                {model.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight}g/lb protein · {model.nutritionPhilosophy.planVsFrameworkPreference.replace(/_/g, " ")} ·{" "}
                {model.nutritionPhilosophy.rateOfLossPercentPerWeek}%/week loss rate
              </p>
              <p className="mt-1 text-neutral">{model.nutritionAdjustmentPolicies.length} real adjustment scenarios configured.</p>
            </>
          ) : (
            <p className="text-neutral">Not part of your service — OPTIM won&apos;t generate nutrition strategies for your clients.</p>
          )}
        </SummarySection>

        <SummarySection title="How you communicate" onEdit={() => onEditChapter("communication")}>
          <p>
            {model.communication.tone.replace(/_/g, " ")} · directness {model.communication.directness}/5 · warmth {model.communication.warmth}/5 · {model.communication.messageLength} messages
          </p>
        </SummarySection>

        <SummarySection title="Safety boundaries" onEdit={() => onEditChapter("safety")}>
          <p>Pain: {model.safety.painResponsePolicy.replace(/_/g, " ")}</p>
          <p>Possible injury: {model.safety.injuryResponsePolicy.replace(/_/g, " ")}</p>
          {model.safety.absoluteOverrideRules.length > 0 ? <p className="mt-1 text-neutral">Your rules: {model.safety.absoluteOverrideRules.join("; ")}</p> : null}
        </SummarySection>

        <SummarySection title="What always requires you" onEdit={() => onEditChapter("safety")}>
          <p className="text-neutral">Pain or injury reports, medical concerns, disordered-eating signals, and any major goal change always reach you — regardless of your AI Authority level.</p>
        </SummarySection>

        {lowConfidence.length > 0 ? (
          <SummarySection title="Unknown or low-confidence areas" tone="warning">
            <p className="text-neutral">{lowConfidence.length} area{lowConfidence.length === 1 ? "" : "s"} are still using an OPTIM default because you haven&apos;t reviewed them yet — you can always refine these later.</p>
          </SummarySection>
        ) : null}
      </div>

      <div className="mt-10">
        <h3 className="text-heading text-off-white">Calibration preview</h3>
        <p className="mt-1 text-body text-neutral">A real run of the generation engine using your current model, against two hypothetical clients.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {previews.map((p) => (
            <div key={p.title} className="rounded-[var(--radius-lg)] border border-border-strong bg-charcoal p-5">
              <p className="text-sm font-semibold text-off-white">{p.title}</p>
              {p.bestTraining ? (
                <div className="mt-3">
                  <p className="text-meta font-semibold uppercase tracking-wide text-accent-strong">OPTIM would recommend</p>
                  <p className="mt-1 text-sm text-off-white">{p.bestTraining.splitName}</p>
                  <p className="text-meta text-neutral">{p.bestTraining.explanation.whyItFits}</p>
                </div>
              ) : null}
              {p.bestNutrition ? (
                <div className="mt-3">
                  <p className="text-meta font-semibold uppercase tracking-wide text-accent-strong">Nutrition</p>
                  <p className="mt-1 text-sm text-off-white">
                    {p.bestNutrition.targets.calories} kcal · {p.bestNutrition.targets.proteinG}p / {p.bestNutrition.targets.carbsG}c / {p.bestNutrition.targets.fatG}f
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-meta text-neutral">No nutrition strategy — nutrition coaching isn&apos;t part of your service.</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 border-t border-border pt-6">
        {activated ? (
          <p className="flex items-center gap-2 text-body font-medium text-success">
            <Check size={18} aria-hidden="true" /> {isRevision ? "Your updated coaching model is active — new client generations will use it." : "Your coaching model is active — OPTIM will use it for every new client."}
          </p>
        ) : (
          <>
            {isRevision ? (
              <div className="mb-4 rounded-[var(--radius-lg)] border border-border-strong bg-charcoal p-5">
                <p className="text-sm font-semibold text-off-white">What&apos;s changing (v{previousActive!.version} → v{previousActive!.version + 1})</p>
                {changedAreas.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-sm text-off-white">
                    {changedAreas.map((area) => (
                      <li key={area}>{area}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-neutral">No changes since your last confirmed model.</p>
                )}
                <p className="mt-3 text-meta text-neutral">
                  Confirming creates a new model version. Future client generations use it — clients you&apos;ve already activated keep their current program and nutrition targets until you explicitly
                  regenerate or approve a change for them.
                </p>
              </div>
            ) : null}
            <Button size="lg" onClick={handleActivate}>
              {isRevision ? "Save updated coaching model" : "Confirm and activate my coaching model"} <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function SummarySection({ title, children, onEdit, tone }: { title: string; children: React.ReactNode; onEdit?: () => void; tone?: "warning" }) {
  return (
    <div className={`rounded-[var(--radius-lg)] border p-5 ${tone === "warning" ? "border-warning/30 bg-warning-soft" : "border-border-strong bg-charcoal"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-off-white">{title}</p>
        {onEdit ? (
          <button type="button" onClick={onEdit} className="flex items-center gap-1 text-meta text-accent-strong hover:underline">
            <Pencil size={12} aria-hidden="true" /> Edit
          </button>
        ) : null}
      </div>
      <div className="mt-2 text-sm text-off-white">{children}</div>
    </div>
  );
}
