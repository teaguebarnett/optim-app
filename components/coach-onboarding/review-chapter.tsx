"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Pencil, Users2, Dumbbell, TrendingUp, Utensils, MessageCircle, ShieldCheck, ShieldAlert, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { generateThreeNutritionStrategies, generateThreeTrainingOptions, type ClientOnboardingSnapshot } from "@/lib/coach/activation-generation";
import { lowConfidenceQuestionIds } from "@/lib/coach/operating-model";
import { allRequiredVisibleQuestionIds, summarizeCoachOperatingModelChanges } from "@/lib/coach/coach-onboarding-engine";
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
  const router = useRouter();
  const com = useCoachOperatingModel();
  const model = com.buildDraftModel();
  // Gate 5A fix — this must track only "confirmed during THIS visit," never
  // "an active model already existed from some earlier visit." Seeding it
  // from com.activeModel meant a coach returning to revise anything (the
  // whole point of Gate 5A's per-section "Edit" links landing here) saw the
  // "already done, return to dashboard" banner immediately and could never
  // reach the "What's changing" / "Save updated coaching model" flow just
  // below — the one real path that turns an edited answer into a new
  // confirmed version. A brand-new coach is unaffected: activeModel is null
  // for them either way.
  const [activated, setActivated] = useState(false);
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
    <div>
      {activated ? (
        <div className="flex flex-wrap items-start justify-between gap-6 rounded-[var(--radius-lg)] border border-success/30 bg-success/10 p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success text-on-accent">
              <Check size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="text-heading text-off-white">{unansweredRequired.length > 0 ? "Onboarding complete — playbook review pending" : "Calibration complete"}</p>
              <p className="mt-1.5 max-w-xl text-body text-neutral">
                {unansweredRequired.length > 0
                  ? `Your coaching model is active with ${unansweredRequired.length} honest OPTIM default${unansweredRequired.length === 1 ? "" : "s"} standing in for unanswered required questions — worth reviewing when you have a moment, from ${isRevision ? "the Playbook" : "Settings → Coach Playbook"}.`
                  : isRevision
                    ? "Your updated coaching model is active — new client generations will use it."
                    : "Your coaching model is active — OPTIM will use it for every new client."}
              </p>
            </div>
          </div>
          <Button size="lg" onClick={() => router.push("/coach")}>
            Return to dashboard <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <>
          <h2 className="text-heading text-off-white">Here&apos;s how OPTIM understands you</h2>
          <p className="mt-2 text-body text-neutral">Review each area below. Nothing becomes active until you confirm at the bottom.</p>
        </>
      )}

      {!activated && unansweredRequired.length > 0 ? (
        <div className="mt-5 flex items-start gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3.5 py-3 text-sm text-warning-strong">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{unansweredRequired.length} required question{unansweredRequired.length === 1 ? "" : "s"} still need an answer — OPTIM is using an honest default for now.</span>
        </div>
      ) : null}

      {activated ? <p className="mb-3 mt-8 text-label text-neutral">Your coaching model, at a glance</p> : null}
      <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${activated ? "" : "mt-6"}`}>
        <SummarySection icon={Users2} title="Who you coach" onEdit={() => onEditChapter("practice")}>
          <p>{labelForList("practice_common_goals", model.practice.commonGoals) || "No goals specified"} · {labelForList("practice_experience_levels", model.practice.experienceLevelsServed) || "any experience level"}</p>
          <p className="mt-1.5 text-neutral">{model.practice.successDefinition || "No success definition provided yet."}</p>
        </SummarySection>

        <SummarySection icon={Dumbbell} title="How you program" onEdit={() => onEditChapter("program_architecture")}>
          <p>
            {labelForList("program_splits", model.programArchitecture.preferredSplits) || "no split preference set"} · {model.programArchitecture.setsPerExerciseMin}–{model.programArchitecture.setsPerExerciseMax} sets ·{" "}
            {labelFor("program_rep_philosophy", model.programArchitecture.repRangePhilosophy)}
          </p>
        </SummarySection>

        <SummarySection icon={TrendingUp} title="How you progress clients & handle fatigue" onEdit={() => onEditChapter("program_architecture")}>
          <p>
            {labelFor("program_progression", model.programArchitecture.progressionMethod)} · deload every {model.programArchitecture.deloadFrequencyWeeks ?? "as-needed"} weeks · proximity to failure:{" "}
            {labelFor("program_proximity_to_failure", model.programArchitecture.proximityToFailure)}
          </p>
          <p className="mt-1.5 text-neutral">{model.trainingAdjustmentPolicies.length} real adjustment scenarios configured.</p>
        </SummarySection>

        <SummarySection icon={Utensils} title="How you coach nutrition" onEdit={() => onEditChapter("nutrition_philosophy")}>
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
              <p className="mt-1.5 text-neutral">{model.nutritionAdjustmentPolicies.length} real adjustment scenarios configured.</p>
            </>
          ) : (
            <p className="text-neutral">Not part of your service — OPTIM won&apos;t generate nutrition strategies for your clients.</p>
          )}
        </SummarySection>

        <SummarySection icon={MessageCircle} title="How you communicate" onEdit={() => onEditChapter("communication")}>
          <p>
            {humanize(model.communication.tone)} · directness {model.communication.directness}/5 · warmth {model.communication.warmth}/5 · {model.communication.messageLength} messages
          </p>
        </SummarySection>

        <SummarySection icon={ShieldCheck} title="Safety boundaries" onEdit={() => onEditChapter("safety")}>
          <p>Pain: {labelFor("scn_pain", model.safety.painResponsePolicy)}</p>
          <p>Possible injury: {labelFor("scn_possible_injury", model.safety.injuryResponsePolicy)}</p>
          {model.safety.absoluteOverrideRules.length > 0 ? <p className="mt-1.5 text-neutral">Your rules: {model.safety.absoluteOverrideRules.join("; ")}</p> : null}
        </SummarySection>

        <SummarySection icon={ShieldAlert} title="What always requires you" onEdit={() => onEditChapter("safety")} span2>
          <p className="text-neutral">Pain or injury reports, medical concerns, disordered-eating signals, and any major goal change always reach you — regardless of your AI Authority level.</p>
        </SummarySection>

        {lowConfidence.length > 0 ? (
          <SummarySection title="Unknown or low-confidence areas" tone="warning" span2>
            <p className="text-neutral">{lowConfidence.length} area{lowConfidence.length === 1 ? "" : "s"} are still using an OPTIM default because you haven&apos;t reviewed them yet — you can always refine these later.</p>
          </SummarySection>
        ) : null}
      </div>

      <div className="mt-10">
        <h3 className="text-heading text-off-white">Calibration preview</h3>
        <p className="mt-1 text-body text-neutral">A real run of the generation engine using your current model, against two hypothetical clients.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {previews.map((p) => (
            <div key={p.title} className="rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised p-5">
              <p className="text-subheading text-off-white">{p.title}</p>
              {p.bestTraining ? (
                <div className="mt-3">
                  <p className="text-meta font-semibold uppercase tracking-wide text-accent-fg">OPTIM would recommend</p>
                  <p className="mt-1 text-body text-off-white">{p.bestTraining.splitName}</p>
                  <p className="text-meta text-neutral">{p.bestTraining.explanation.whyItFits}</p>
                </div>
              ) : null}
              {p.bestNutrition ? (
                <div className="mt-3">
                  <p className="text-meta font-semibold uppercase tracking-wide text-accent-fg">Nutrition</p>
                  <p className="mt-1 text-body text-off-white">
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

      {activated ? null : (
        <div className="mt-10 border-t border-border pt-6">
          {isRevision ? (
            <div className="mb-4 rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised p-5">
              <p className="text-subheading text-off-white">What&apos;s changing (v{previousActive!.version} → v{previousActive!.version + 1})</p>
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
        </div>
      )}
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
