"use client";

// The human-readable summary of a coach's method — "what OPTIM believes it
// learned about how you coach." Extracted unchanged from the calibration
// Review chapter so the Review step and Settings show the exact same
// summary, built from the same question-bank labels (never a second,
// drifting description). Gate 3.

import { Pencil, Users2, Dumbbell, TrendingUp, Utensils, MessageCircle, ShieldCheck, ShieldAlert, type LucideIcon } from "lucide-react";
import { lowConfidenceQuestionIds, type CoachOperatingModel } from "@/lib/coach/operating-model";
import { findQuestion, type CoachOnboardingChapterId } from "@/lib/coach/coach-onboarding-questions";

/** Fallback for free-text/no-option values only — never mutates a stored
 * enum value. Prefer labelFor()/labelForList() below for anything backed by
 * a question's real options: a bare regex can't recover structure a raw
 * value threw away (e.g. "0_1_reps_in_reserve" -> "0 1 reps in reserve"
 * reads as nonsense, not "0-1 reps in reserve"). */
function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

/** The real coach-facing label for a stored option value, looked up from
 * the same question bank the coach answered from — never a guess at what
 * the underscores meant. Falls back to humanize() only if the value can't
 * be matched to a real option (e.g. it's since been removed from the bank). */
function labelFor(questionId: string, value: string): string {
  const option = findQuestion(questionId)?.options?.find((o) => o.value === value);
  return option?.label ?? humanize(value);
}
function labelForList(questionId: string, values: string[]): string {
  return values.map((v) => labelFor(questionId, v)).join(", ");
}

export function MethodSummaryGrid({ model, onEditChapter, className = "" }: { model: CoachOperatingModel; onEditChapter?: (chapter: CoachOnboardingChapterId) => void; className?: string }) {
  const lowConfidence = lowConfidenceQuestionIds(model);
  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${className}`}>
        <SummarySection icon={Users2} title="Who you coach" onEdit={onEditChapter && (() => onEditChapter("practice"))}>
          <p>{labelForList("practice_common_goals", model.practice.commonGoals) || "No goals specified"} · {labelForList("practice_experience_levels", model.practice.experienceLevelsServed) || "any experience level"}</p>
          <p className="mt-1.5 text-neutral">{model.practice.successDefinition || "No success definition provided yet."}</p>
        </SummarySection>

        <SummarySection icon={Dumbbell} title="How you program" onEdit={onEditChapter && (() => onEditChapter("program_architecture"))}>
          <p>
            {labelForList("program_splits", model.programArchitecture.preferredSplits) || "no split preference set"} · {model.programArchitecture.setsPerExerciseMin}–{model.programArchitecture.setsPerExerciseMax} sets ·{" "}
            {labelFor("program_rep_philosophy", model.programArchitecture.repRangePhilosophy)}
          </p>
        </SummarySection>

        <SummarySection icon={TrendingUp} title="How you progress clients & handle fatigue" onEdit={onEditChapter && (() => onEditChapter("program_architecture"))}>
          <p>
            {labelFor("program_progression", model.programArchitecture.progressionMethod)} · deload every {model.programArchitecture.deloadFrequencyWeeks ?? "as-needed"} weeks · proximity to failure:{" "}
            {labelFor("program_proximity_to_failure", model.programArchitecture.proximityToFailure)}
          </p>
          <p className="mt-1.5 text-neutral">Your answers cover {model.trainingAdjustmentPolicies.length} adjustment scenarios.</p>
        </SummarySection>

        <SummarySection icon={Utensils} title="How you coach nutrition" onEdit={onEditChapter && (() => onEditChapter("nutrition_philosophy"))}>
          {model.nutritionPhilosophy.providesNutritionCoaching ? (
            <>
              <p>
                {model.nutritionPhilosophy.proteinTargetApproach === "goal_dependent" && model.nutritionPhilosophy.proteinTargetsByGoalGramsPerLbBodyweight ? (
                  <>
                    Protein by goal: {model.nutritionPhilosophy.proteinTargetsByGoalGramsPerLbBodyweight.fatLoss}g/lb (fat loss) · {model.nutritionPhilosophy.proteinTargetsByGoalGramsPerLbBodyweight.maintenanceOrRecomposition}g/lb (maintenance/recomp) ·{" "}
                    {model.nutritionPhilosophy.proteinTargetsByGoalGramsPerLbBodyweight.muscleGain}g/lb (muscle gain)
                  </>
                ) : (
                  <>{model.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight}g/lb protein for every client</>
                )}{" "}
                · {labelFor("nutrition_plan_vs_framework", model.nutritionPhilosophy.planVsFrameworkPreference)} · {model.nutritionPhilosophy.rateOfLossPercentPerWeek}%/week loss rate
              </p>
              <p className="mt-1.5 text-neutral">Your answers cover {model.nutritionAdjustmentPolicies.length} adjustment scenarios.</p>
            </>
          ) : (
            <p className="text-neutral">Not part of your service — OPTIM won&apos;t generate nutrition strategies for your clients.</p>
          )}
        </SummarySection>

        <SummarySection icon={MessageCircle} title="How you communicate" onEdit={onEditChapter && (() => onEditChapter("communication"))}>
          <p>
            {humanize(model.communication.tone)} · directness {model.communication.directness}/5 · warmth {model.communication.warmth}/5 · {model.communication.messageLength} messages
          </p>
        </SummarySection>

        <SummarySection icon={ShieldCheck} title="Safety boundaries" onEdit={onEditChapter && (() => onEditChapter("safety"))}>
          <p>Pain: {labelFor("scn_pain", model.safety.painResponsePolicy)}</p>
          <p>Possible injury: {labelFor("scn_possible_injury", model.safety.injuryResponsePolicy)}</p>
          {model.safety.absoluteOverrideRules.length > 0 ? <p className="mt-1.5 text-neutral">Your rules: {model.safety.absoluteOverrideRules.join("; ")}</p> : null}
        </SummarySection>

        <SummarySection icon={ShieldAlert} title="What always requires you" onEdit={onEditChapter && (() => onEditChapter("safety"))} span2>
          <p className="text-neutral">Pain or injury reports, medical concerns, disordered-eating signals, and any major goal change always reach you — regardless of your AI Authority level.</p>
        </SummarySection>

        {lowConfidence.length > 0 ? (
          <SummarySection title="Unknown or low-confidence areas" tone="warning" span2>
            <p className="text-neutral">{lowConfidence.length} area{lowConfidence.length === 1 ? "" : "s"} are still using an OPTIM default because you haven&apos;t reviewed them yet — you can always refine these later.</p>
          </SummarySection>
        ) : null}
      </div>
  );
}

function SummarySection({
  icon: Icon,
  title,
  children,
  onEdit,
  tone,
  span2,
}: {
  icon?: LucideIcon;
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
  tone?: "warning";
  span2?: boolean;
}) {
  return (
    <div className={`rounded-[var(--radius-lg)] border p-5 ${tone === "warning" ? "border-warning/30 bg-warning-soft" : "border-border-strong bg-surface-raised"} ${span2 ? "md:col-span-2" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
              <Icon size={15} aria-hidden="true" />
            </span>
          ) : null}
          <p className="text-subheading text-off-white">{title}</p>
        </div>
        {onEdit ? (
          <button type="button" onClick={onEdit} className="flex shrink-0 items-center gap-1 text-meta text-accent-fg hover:underline">
            <Pencil size={12} aria-hidden="true" /> Edit
          </button>
        ) : null}
      </div>
      <div className="mt-3 text-body leading-relaxed text-off-white">{children}</div>
    </div>
  );
}
