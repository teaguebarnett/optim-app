"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, Users2, Dumbbell, MessageCircle, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { ALL_CHAPTER_IDS_IN_ORDER, questionsForChapter, SCENARIO_DEPENDS_VALUE, type CoachOnboardingChapterId, type CoachOnboardingQuestionDef } from "@/lib/coach/coach-onboarding-questions";
import type { AdjustmentPolicy } from "@/lib/coach/operating-model";

const ALL_QUESTIONS: CoachOnboardingQuestionDef[] = ALL_CHAPTER_IDS_IN_ORDER.flatMap(questionsForChapter);
const QUESTION_BY_ID = new Map(ALL_QUESTIONS.map((q) => [q.id, q]));

/** A stored answer value is always a real onboarding-question option value
 * (a slug like "moderate_deficit_or_surplus_from_maintenance"), never
 * fabricated prose — this only ever looks up that option's own human label
 * from the same question bank the coach actually answered, falling back to
 * a plainly de-slugged version of the value itself (never inventing new
 * wording) when no matching option exists (e.g. a free-typed value). */
function labelForValue(questionId: string, value: string): string {
  if (value === SCENARIO_DEPENDS_VALUE) return "It depends";
  const option = QUESTION_BY_ID.get(questionId)?.options?.find((o) => o.value === value);
  return option?.label ?? value.replace(/_/g, " ");
}

function humanizeSlug(value: string): string {
  return value.replace(/_/g, " ");
}

function EditChapterLink({ chapter, label }: { chapter: CoachOnboardingChapterId; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/coach-onboarding?chapter=${chapter}`)}
      className="inline-flex items-center gap-1 text-sm text-accent-fg hover:underline"
    >
      {label} <ChevronRight size={14} aria-hidden="true" />
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-meta text-neutral">{label}</p>
      <p className="text-sm text-off-white">{value}</p>
    </div>
  );
}

function PolicyRow({ policy }: { policy: AdjustmentPolicy }) {
  const actionLabel = policy.conditions ? policy.conditions : labelForValue(policy.id, policy.preferredAction);
  return (
    <div className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3.5 py-2.5">
      <p className="text-sm text-off-white">{policy.trigger}</p>
      <p className="mt-1 text-meta text-neutral">
        → {actionLabel}
        {policy.alwaysEscalates ? <span className="ml-2 font-medium text-warning">Always escalates to you</span> : null}
      </p>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Users2;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-[var(--radius-md)] border border-border bg-surface-raised open:bg-surface-raised">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
        <span className="flex items-center gap-2.5">
          <Icon size={16} className="text-neutral" aria-hidden="true" />
          <span className="text-sm font-medium text-off-white">{title}</span>
        </span>
        <ChevronRight size={16} className="text-neutral transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="space-y-4 border-t border-border px-4 pb-4 pt-3.5">
        <p className="text-meta text-neutral">{description}</p>
        {children}
      </div>
    </details>
  );
}

/**
 * Gate 5A — "What does OPTIM currently believe about how I coach?" made
 * inspectable without re-entering the onboarding wizard. Every value here
 * reads directly from the coach's own active CoachOperatingModel (see
 * lib/coach/operating-model.ts) — nothing here is a second copy of that
 * data, and nothing here can be edited in place: each section's "Edit"
 * link deep-links into the exact onboarding chapter that produced it (see
 * app/coach-onboarding/page.tsx's ?chapter= handling), so a coach fixing
 * one thing lands on that one question rather than chapter 1. Grouped by
 * coaching job (methodology / interpretation rules / communication /
 * safety), not by database schema — a representative handful of values per
 * section, never every field the model tracks (avoiding a settings wall).
 */
export function CoachPlaybookDetail() {
  const com = useCoachOperatingModel();
  const model = com.activeModel;

  if (!model) {
    return (
      <Card>
        <p className="text-sm text-neutral">Complete calibration to see how OPTIM currently interprets your coaching style here.</p>
      </Card>
    );
  }

  const trainingPolicies = model.trainingAdjustmentPolicies;
  const nutritionPolicies = model.nutritionAdjustmentPolicies;

  return (
    <div className="space-y-2.5">
      <Section icon={Dumbbell} title="Methodology" description="Your coaching practice, training philosophy, and nutrition approach — set in Chapters 1, 2, and 4.">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-off-white">Your practice</p>
            <EditChapterLink chapter="practice" label="Edit" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fact label="Success looks like" value={model.practice.successDefinition || "—"} />
            <Fact label="Involvement" value={humanizeSlug(model.practice.expectedCoachInvolvement) || "—"} />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3.5">
            <p className="text-sm font-medium text-off-white">Program architecture</p>
            <EditChapterLink chapter="program_architecture" label="Edit" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fact label="Progression method" value={humanizeSlug(model.programArchitecture.progressionMethod) || "—"} />
            <Fact label="Rep range philosophy" value={humanizeSlug(model.programArchitecture.repRangePhilosophy) || "—"} />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3.5">
            <p className="text-sm font-medium text-off-white">Nutrition philosophy</p>
            <EditChapterLink chapter="nutrition_philosophy" label="Edit" />
          </div>
          {model.nutritionPhilosophy.providesNutritionCoaching ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Fact label="Calorie targets" value={humanizeSlug(model.nutritionPhilosophy.calorieTargetPhilosophy) || "—"} />
              <Fact label="Adherence standard" value={humanizeSlug(model.nutritionPhilosophy.adherenceStandard) || "—"} />
            </div>
          ) : (
            <p className="text-sm text-neutral">You&apos;ve indicated you don&apos;t provide nutrition coaching.</p>
          )}
        </div>
      </Section>

      <Section icon={Users2} title="Interpretation rules" description="Real scenarios you've told OPTIM how to handle — from Chapters 3 and 5.">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-off-white">Training adjustments</p>
            <EditChapterLink chapter="training_adjustment" label="Edit" />
          </div>
          {trainingPolicies.length > 0 ? (
            <div className="space-y-2">
              {trainingPolicies.map((p) => (
                <PolicyRow key={p.id} policy={p} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral">No training-adjustment rules confirmed yet.</p>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3.5">
            <p className="text-sm font-medium text-off-white">Nutrition adjustments</p>
            <EditChapterLink chapter="nutrition_adjustment" label="Edit" />
          </div>
          {nutritionPolicies.length > 0 ? (
            <div className="space-y-2">
              {nutritionPolicies.map((p) => (
                <PolicyRow key={p.id} policy={p} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral">No nutrition-adjustment rules confirmed yet.</p>
          )}
        </div>
      </Section>

      <Section icon={MessageCircle} title="Communication style" description="Tone, cadence, and where OPTIM should defer to you personally — from Chapter 6.">
        <div className="space-y-4">
          <div className="flex justify-end">
            <EditChapterLink chapter="communication" label="Edit" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Tone" value={humanizeSlug(model.communication.tone) || "—"} />
            <Fact label="Message length" value={model.communication.messageLength} />
            <Fact label="Directness" value={`${model.communication.directness}/5`} />
            <Fact label="Warmth" value={`${model.communication.warmth}/5`} />
          </div>
          {model.communication.coachMustRespondPersonally.length > 0 ? (
            <div>
              <p className="text-meta text-neutral">You always respond personally to</p>
              <ul className="mt-1 list-inside list-disc text-sm text-off-white">
                {model.communication.coachMustRespondPersonally.map((item) => (
                  <li key={item}>{humanizeSlug(item)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Section>

      <Section icon={ShieldCheck} title="Safety and escalation" description="Your stop, pause, and always-escalate rules — from Chapter 7. These sit alongside (never weaken) OPTIM's own platform safety minimums.">
        <div className="space-y-4">
          <div className="flex justify-end">
            <EditChapterLink chapter="safety" label="Edit" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fact label="Pain response" value={humanizeSlug(model.safety.painResponsePolicy) || "—"} />
            <Fact label="Injury response" value={humanizeSlug(model.safety.injuryResponsePolicy) || "—"} />
          </div>
          {model.safety.absoluteOverrideRules.length > 0 ? (
            <div>
              <p className="text-meta text-neutral">Your absolute rules (never overridden by any AI Authority level)</p>
              <ul className="mt-1 list-inside list-disc text-sm text-off-white">
                {model.safety.absoluteOverrideRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-neutral">No additional absolute rules beyond OPTIM&apos;s own platform safety minimums.</p>
          )}
        </div>
      </Section>

      <div className="px-1">
        <p className="text-meta text-neutral">Editing any section above opens the calibration survey at that exact question — nothing else is re-asked.</p>
      </div>
    </div>
  );
}
