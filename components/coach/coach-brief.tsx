import { AlertTriangle, Dumbbell, Salad, Target, Clock3, Moon, HeartPulse, Users2, Home } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ONBOARDING_STEPS, LEGACY_V51_STEPS, visibleFieldsForStep, type OnboardingFieldDef, type OnboardingStepDef } from "@/lib/coach/onboarding-steps";
import { formatFieldValue, formatHeightFromAnswers, formatInjuryEntry, describePrimaryGoal, NOT_PROVIDED } from "@/lib/coach/onboarding-format";
import { computeHealthReviewRequired, computeLegacyHealthReviewRequired, describeInjuryBodyAreas } from "@/lib/coach/health-review";
import { cn } from "@/lib/cn";
import type { HealthReviewRecord, InjuryEntry, OnboardingProgress, OnboardingStepAnswers, OnboardingStepId } from "@/lib/coach/types";

function stepAnswers(onboarding: OnboardingProgress, id: OnboardingStepId): OnboardingStepAnswers | undefined {
  return onboarding.answers[id];
}

function fieldByKey(steps: OnboardingStepDef[], id: OnboardingStepId, key: string): OnboardingFieldDef | undefined {
  return steps.find((s) => s.id === id)?.fields.find((f) => f.key === key);
}

function fmt(steps: OnboardingStepDef[], answers: OnboardingStepAnswers | undefined, stepId: OnboardingStepId, key: string): string {
  const field = fieldByKey(steps, stepId, key);
  if (!field) return NOT_PROVIDED;
  return formatFieldValue(field, answers?.[key]);
}

/**
 * The completed intake as a coach decision surface, not a questionnaire
 * dump. Phase 5.2 reorganizes this around the live, concise six-chapter
 * intake's own categories — Goal & success, Body context, Real weekly
 * availability, Training starting point, Nutrition & recovery, Coaching
 * preference, Health & injury review — while still rendering an
 * already-completed Phase 5.1 (nine-section) or original seven-step record
 * exactly as before; existing clients must never go blank just because the
 * live intake shape changed under them.
 */
export function CoachBrief({ onboarding, healthReview }: { onboarding: OnboardingProgress | null; healthReview: HealthReviewRecord | null }) {
  if (!onboarding) {
    return (
      <Card>
        <p className="text-subheading text-off-white">Coach Brief</p>
        <p className="mt-1.5 text-sm text-neutral">
          No onboarding responses recorded through this system — this client predates it, or hasn&apos;t started yet.
        </p>
      </Card>
    );
  }

  const isLive = !!onboarding.answers.about_you || !!onboarding.answers.what_you_want || !!onboarding.answers.health_finish;
  const isLegacyV51 = !isLive && (!!onboarding.answers.basics || !!onboarding.answers.goals || !!onboarding.answers.health);

  return isLive ? (
    <LiveCoachBrief onboarding={onboarding} healthReview={healthReview} />
  ) : isLegacyV51 ? (
    <LegacyV51CoachBrief onboarding={onboarding} healthReview={healthReview} />
  ) : (
    <OldestLegacyCoachBrief onboarding={onboarding} healthReview={healthReview} />
  );
}

// ---------------------------------------------------------------------------
// Live (Phase 5.2, six-chapter) intake
// ---------------------------------------------------------------------------

function LiveCoachBrief({ onboarding, healthReview }: { onboarding: OnboardingProgress; healthReview: HealthReviewRecord | null }) {
  const about = stepAnswers(onboarding, "about_you");
  const goals = stepAnswers(onboarding, "what_you_want");
  const week = stepAnswers(onboarding, "your_week");
  const start = stepAnswers(onboarding, "starting_point");
  const fuel = stepAnswers(onboarding, "fuel_recovery");
  const health = stepAnswers(onboarding, "health_finish");

  const healthTrigger = computeHealthReviewRequired(health);
  const hasInjury = health?.hasInjuryHistory === true;
  const availableDays = Array.isArray(week?.availableDays) ? (week!.availableDays as string[]) : [];
  const consistencyObstacles = Array.isArray(fuel?.consistencyObstacles) ? (fuel!.consistencyObstacles as string[]) : [];

  return (
    <Card className="space-y-5">
      <BriefHeader onboarding={onboarding} />

      <HealthFlag hasInjury={hasInjury} required={healthTrigger.required} healthReview={healthReview}>
        {hasInjury && health ? (
          <p className="mt-1 text-sm text-off-white">
            &bull; {describeInjuryBodyAreas(health) || "Area not specified"} — {typeof health.injuryRestrictions === "string" ? health.injuryRestrictions : "no restriction detail"}
          </p>
        ) : null}
      </HealthFlag>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <GlanceFact icon={Target} label="Goal" value={goals ? describePrimaryGoal(ONBOARDING_STEPS, goals) : NOT_PROVIDED} />
        <GlanceFact icon={Clock3} label="Availability" value={availableDays.length > 0 ? `${availableDays.length}d/wk · ${fmt(ONBOARDING_STEPS, week, "your_week", "maxSessionLength")}` : NOT_PROVIDED} />
        <GlanceFact icon={Home} label="Environment" value={week ? fmt(ONBOARDING_STEPS, week, "your_week", "trainingEnvironment") : NOT_PROVIDED} />
        <GlanceFact icon={Dumbbell} label="Experience" value={start ? fmt(ONBOARDING_STEPS, start, "starting_point", "trainingExperience") : NOT_PROVIDED} />
        <GlanceFact icon={Salad} label="Nutrition approach" value={fuel ? fmt(ONBOARDING_STEPS, fuel, "fuel_recovery", "nutritionApproach") : NOT_PROVIDED} />
        <GlanceFact icon={Moon} label="Sleep" value={fuel ? fmt(ONBOARDING_STEPS, fuel, "fuel_recovery", "typicalSleep") : NOT_PROVIDED} />
        <GlanceFact icon={HeartPulse} label="Consistency obstacle" value={consistencyObstacles.length > 0 ? consistencyObstacles.map((v) => fieldByKey(ONBOARDING_STEPS, "fuel_recovery", "consistencyObstacles")?.options?.find((o) => o.value === v)?.label ?? v).join(", ") : NOT_PROVIDED} />
        <GlanceFact icon={Users2} label="Coaching preference" value={fuel ? fmt(ONBOARDING_STEPS, fuel, "fuel_recovery", "coachSupportStyle") : NOT_PROVIDED} />
      </div>

      {goals?.successDefinition ? (
        <div className="rounded-[var(--radius-sm)] bg-surface-raised px-3.5 py-3">
          <p className="text-label text-neutral">Success looks like</p>
          <p className="mt-1 text-sm text-off-white">&ldquo;{String(goals.successDefinition)}&rdquo;</p>
        </div>
      ) : null}

      <div className="space-y-2 border-t border-border pt-4">
        <DetailSection title="Body context">
          <FieldRows steps={ONBOARDING_STEPS} answers={about} stepId="about_you" extraHeight={about} />
        </DetailSection>
        <DetailSection title="Goal & outcome">
          <FieldRows steps={ONBOARDING_STEPS} answers={goals} stepId="what_you_want" />
        </DetailSection>
        <DetailSection title="Real weekly availability">
          <FieldRows steps={ONBOARDING_STEPS} answers={week} stepId="your_week" />
        </DetailSection>
        <DetailSection title="Training starting point">
          <FieldRows steps={ONBOARDING_STEPS} answers={start} stepId="starting_point" />
        </DetailSection>
        <DetailSection title="Nutrition & recovery constraints">
          <FieldRows steps={ONBOARDING_STEPS} answers={fuel} stepId="fuel_recovery" />
        </DetailSection>
        <DetailSection title="Health & injury review">
          <FieldRows steps={ONBOARDING_STEPS} answers={health} stepId="health_finish" />
        </DetailSection>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Legacy — Phase 5.1's nine-section intake (still real, completed data)
// ---------------------------------------------------------------------------

function LegacyV51CoachBrief({ onboarding, healthReview }: { onboarding: OnboardingProgress; healthReview: HealthReviewRecord | null }) {
  const basics = stepAnswers(onboarding, "basics");
  const goals = stepAnswers(onboarding, "goals");
  const availability = stepAnswers(onboarding, "availability");
  const training = stepAnswers(onboarding, "training_background");
  const nutrition = stepAnswers(onboarding, "nutrition");
  const recovery = stepAnswers(onboarding, "recovery");
  const health = stepAnswers(onboarding, "health");
  const coaching = stepAnswers(onboarding, "coaching");

  const healthTrigger = computeLegacyHealthReviewRequired(health);
  const hasInjury = health?.hasInjuryHistory === true;
  const injuries = Array.isArray(health?.injuries) ? (health!.injuries as InjuryEntry[]) : [];
  const availableDays = Array.isArray(availability?.availableDays) ? (availability!.availableDays as string[]) : [];

  return (
    <Card className="space-y-5">
      <BriefHeader onboarding={onboarding} />
      <p className="rounded-[var(--radius-sm)] bg-surface-raised px-3 py-2 text-meta text-neutral">
        This client completed onboarding under an earlier, more detailed intake — some categories below combine
        several of their original answers.
      </p>

      <HealthFlag hasInjury={hasInjury} required={healthTrigger.required} healthReview={healthReview}>
        {injuries.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-sm text-off-white">
            {injuries.map((entry) => (
              <li key={entry.id}>&bull; {formatInjuryEntry(entry)} — {entry.currentImpact || "no impact description"}</li>
            ))}
          </ul>
        ) : null}
      </HealthFlag>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <GlanceFact icon={Target} label="Goal" value={goals ? fmt(LEGACY_V51_STEPS, goals, "goals", "primaryGoal") : NOT_PROVIDED} />
        <GlanceFact icon={Clock3} label="Availability" value={availableDays.length > 0 ? `${availableDays.length}d/wk · ${fmt(LEGACY_V51_STEPS, availability, "availability", "maxSessionLength")}` : NOT_PROVIDED} />
        <GlanceFact icon={Home} label="Environment" value={availability ? fmt(LEGACY_V51_STEPS, availability, "availability", "trainingEnvironment") : NOT_PROVIDED} />
        <GlanceFact icon={Dumbbell} label="Experience" value={training ? fmt(LEGACY_V51_STEPS, training, "training_background", "trainingTime") : NOT_PROVIDED} />
        <GlanceFact icon={Salad} label="Nutrition tracking" value={nutrition ? fmt(LEGACY_V51_STEPS, nutrition, "nutrition", "trackingHistory") : NOT_PROVIDED} />
        <GlanceFact icon={Moon} label="Sleep quality" value={recovery ? fmt(LEGACY_V51_STEPS, recovery, "recovery", "sleepQuality") : NOT_PROVIDED} />
        <GlanceFact icon={HeartPulse} label="Bandwidth" value={recovery ? fmt(LEGACY_V51_STEPS, recovery, "recovery", "currentBandwidth") : NOT_PROVIDED} />
        <GlanceFact icon={Users2} label="Feedback style" value={coaching ? fmt(LEGACY_V51_STEPS, coaching, "coaching", "feedbackStyle") : NOT_PROVIDED} />
      </div>

      {goals?.successDefinition ? (
        <div className="rounded-[var(--radius-sm)] bg-surface-raised px-3.5 py-3">
          <p className="text-label text-neutral">Success looks like</p>
          <p className="mt-1 text-sm text-off-white">&ldquo;{String(goals.successDefinition)}&rdquo;</p>
        </div>
      ) : null}

      <div className="space-y-2 border-t border-border pt-4">
        <DetailSection title="Body context">
          <FieldRows steps={LEGACY_V51_STEPS} answers={basics} stepId="basics" extraHeight={basics} />
        </DetailSection>
        <DetailSection title="Goal & outcome">
          <FieldRows steps={LEGACY_V51_STEPS} answers={goals} stepId="goals" />
        </DetailSection>
        <DetailSection title="Real weekly availability">
          <FieldRows steps={LEGACY_V51_STEPS} answers={availability} stepId="availability" />
        </DetailSection>
        <DetailSection title="Training starting point">
          <FieldRows steps={LEGACY_V51_STEPS} answers={training} stepId="training_background" />
        </DetailSection>
        <DetailSection title="Nutrition constraints">
          <FieldRows steps={LEGACY_V51_STEPS} answers={nutrition} stepId="nutrition" />
        </DetailSection>
        <DetailSection title="Recovery">
          <FieldRows steps={LEGACY_V51_STEPS} answers={recovery} stepId="recovery" />
        </DetailSection>
        <DetailSection title="Health & injury review">
          <FieldRows steps={LEGACY_V51_STEPS} answers={health} stepId="health" />
        </DetailSection>
        <DetailSection title="Coaching preference">
          <FieldRows steps={LEGACY_V51_STEPS} answers={coaching} stepId="coaching" />
        </DetailSection>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Oldest legacy — the original seven-step intake (schedule_lifestyle /
// health_readiness), or no onboarding record structure recognized at all.
// ---------------------------------------------------------------------------

function OldestLegacyCoachBrief({ onboarding, healthReview }: { onboarding: OnboardingProgress; healthReview: HealthReviewRecord | null }) {
  const legacySchedule = stepAnswers(onboarding, "schedule_lifestyle");
  const legacyHealth = stepAnswers(onboarding, "health_readiness");
  const hasInjury = legacyHealth?.hasInjuryHistory === true;
  const legacyInjuryNote = typeof legacyHealth?.injuryNotes === "string" ? legacyHealth.injuryNotes : "";

  return (
    <Card className="space-y-5">
      <BriefHeader onboarding={onboarding} />
      <p className="rounded-[var(--radius-sm)] bg-surface-raised px-3 py-2 text-meta text-neutral">
        This client completed onboarding before the structured intake existed — raw answers are shown below rather
        than the usual categories.
      </p>

      <HealthFlag hasInjury={hasInjury} required={hasInjury} healthReview={healthReview}>
        {legacyInjuryNote ? <p className="mt-1 text-sm text-off-white">&ldquo;{legacyInjuryNote}&rdquo;</p> : null}
      </HealthFlag>

      <div className="space-y-2 border-t border-border pt-4">
        <details className="group rounded-[var(--radius-sm)] border border-border">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-sm font-medium text-off-white marker:content-none">
            <span className="inline-block transition-transform group-open:rotate-90">›</span> Legacy answers
          </summary>
          <div className="space-y-3 border-t border-border px-3.5 py-3">
            <LegacyRawFieldRows answers={legacySchedule} />
            <LegacyRawFieldRows answers={legacyHealth} />
            {Object.keys(onboarding.answers).length === 0 ? <p className="text-sm text-neutral">Not collected.</p> : null}
          </div>
        </details>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function BriefHeader({ onboarding }: { onboarding: OnboardingProgress }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-subheading text-off-white">Coach Brief</p>
      <span className="text-meta text-neutral">
        {onboarding.completedAtIso
          ? `Completed ${new Date(onboarding.completedAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : "In progress"}
      </span>
    </div>
  );
}

function HealthFlag({
  hasInjury,
  required,
  healthReview,
  children,
}: {
  hasInjury: boolean;
  required: boolean;
  healthReview: HealthReviewRecord | null;
  children?: React.ReactNode;
}) {
  const flagged = hasInjury || required;
  return (
    <div className={cn("rounded-[var(--radius-md)] border px-3.5 py-3", flagged ? "border-error/30 bg-error-soft" : "border-border bg-surface-raised")}>
      <div className="flex items-start gap-2.5">
        {flagged ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" /> : null}
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", flagged ? "text-error" : "text-off-white")}>
            {hasInjury ? "Current pain or injury reported" : "No current pain or injury reported"}
          </p>
          {children}
          {healthReview ? <p className="mt-1.5 text-meta text-neutral">Health review: {healthReview.status.replace(/_/g, " ")}</p> : null}
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-[var(--radius-sm)] border border-border">
      <summary className="cursor-pointer list-none px-3.5 py-2.5 text-sm font-medium text-off-white marker:content-none">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> {title}
      </summary>
      <div className="border-t border-border px-3.5 py-3">{children}</div>
    </details>
  );
}

function FieldRows({
  steps,
  answers,
  stepId,
  extraHeight,
}: {
  steps: OnboardingStepDef[];
  answers: OnboardingStepAnswers | undefined;
  stepId: OnboardingStepId;
  extraHeight?: OnboardingStepAnswers;
}) {
  const step = steps.find((s) => s.id === stepId);
  if (!step) return <p className="text-sm text-neutral">Not collected.</p>;
  const fields = visibleFieldsForStep(step, answers ?? {}).filter((f) => f.type !== "height_feet_inches");

  if ((!answers || Object.keys(answers).length === 0) && !extraHeight) {
    return <p className="text-sm text-neutral">Not collected.</p>;
  }

  return (
    <dl className="space-y-1.5">
      {extraHeight ? (
        <div className="flex items-start justify-between gap-3 text-sm">
          <dt className="shrink-0 text-neutral">Height</dt>
          <dd className="max-w-[65%] text-right text-off-white">{formatHeightFromAnswers(extraHeight)}</dd>
        </div>
      ) : null}
      {fields.map((field) => (
        <div key={field.key} className="flex items-start justify-between gap-3 text-sm">
          <dt className="shrink-0 text-neutral">{field.label}</dt>
          <dd className="max-w-[65%] text-right text-off-white">
            {field.type === "injury_list" ? (
              Array.isArray(answers?.[field.key]) && (answers![field.key] as InjuryEntry[]).length > 0 ? (
                <span>{(answers![field.key] as InjuryEntry[]).map(formatInjuryEntry).join("; ")}</span>
              ) : (
                NOT_PROVIDED
              )
            ) : (
              formatFieldValue(field, answers?.[field.key])
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The oldest era's raw answers bag — no OnboardingFieldDef exists for
 * these keys anymore, so this renders the raw key/value pairs plainly. */
function LegacyRawFieldRows({ answers }: { answers: OnboardingStepAnswers | undefined }) {
  if (!answers) return null;
  const entries = Object.entries(answers).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return (
    <dl className="space-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start justify-between gap-3 text-sm">
          <dt className="shrink-0 text-neutral">{key}</dt>
          <dd className="max-w-[65%] text-right text-off-white">{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function GlanceFact({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface-raised px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-neutral">
        <Icon size={13} aria-hidden="true" />
        <span className="text-label">{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-off-white">{value}</p>
    </div>
  );
}
