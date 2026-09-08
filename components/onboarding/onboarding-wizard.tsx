"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapse } from "@/components/ui/collapse";
import { OnboardingFieldInput, type OnboardingFieldValue } from "@/components/onboarding/onboarding-field-input";
import { HeightInput } from "@/components/onboarding/height-input";
import { TimezoneInput } from "@/components/onboarding/timezone-input";
import { OnboardingStage } from "@/components/onboarding/onboarding-stage";
import { OptimIntro } from "@/components/onboarding/optim-intro";
import { ChapterTransition } from "@/components/onboarding/chapter-transition";
import { RequireThemeChoice } from "@/components/app-shell/theme-provider";
import { usePlatformState } from "@/hooks/use-platform-state";
import { getClientProfile, getOnboardingProgress } from "@/lib/coach/repository";
import {
  ONBOARDING_STEPS,
  ONBOARDING_CHAPTER_ICONS,
  applyStepFieldUpdate,
  findVisibleMomentIndex,
  isFieldAnswered,
  momentIndexForField,
  momentsForStep,
  visibleFieldsForStep,
  type OnboardingFieldDef,
  type OnboardingStepDef,
} from "@/lib/coach/onboarding-steps";
import { formatFieldValue, formatHeightFromAnswers, describePrimaryGoal, NOT_PROVIDED } from "@/lib/coach/onboarding-format";
import { computeHealthReviewRequired } from "@/lib/coach/health-review";
import { contextualResponseFor } from "@/lib/coach/contextual-response";
import { detectTimeZone } from "@/lib/shared/timezone";
import { ALL_COACH_PROFILES } from "@/lib/tenancy/seed";
import type { OnboardingRecapFact } from "@/components/onboarding/onboarding-stage";
import type { OnboardingStepAnswers, OnboardingStepId } from "@/lib/coach/types";

/**
 * The connected onboarding framework — Phase 5.3A's adaptively-paced
 * six-chapter flow defined in lib/coach/onboarding-steps.ts. A chapter with
 * several related decisions is internally split into "moments" (see that
 * file's OnboardingStepDef.moments) so no single screen becomes a tall
 * wall of controls, without inflating the top-level "X of 6" a client
 * sees. Saves after every completed chapter and resumes at the exact
 * chapter/answers a client left off at (see the hydration effect below —
 * resuming always skips straight past the OPTIM introduction, which only
 * a genuinely fresh client ever sees). Real conditional logic lives in
 * each field's `visibleIf` — see visibleFieldsForStep and
 * applyStepFieldUpdate's generic hide-and-clear behavior, which never
 * needs to hardcode which field depends on which.
 */
export function OnboardingWizard({ clientId }: { clientId: string }) {
  const { platform, dispatch, isPlatformHydrated } = usePlatformState();
  const router = useRouter();
  const initializedRef = useRef(false);

  const [phase, setPhase] = useState<"intro" | "chapters">("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [momentIndex, setMomentIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [draftAnswers, setDraftAnswers] = useState<Partial<Record<string, OnboardingStepAnswers>>>({});
  const step = ONBOARDING_STEPS[stepIndex];

  const client = isPlatformHydrated ? getClientProfile(platform, clientId) : null;
  const existingProgress = isPlatformHydrated ? getOnboardingProgress(platform, clientId) : null;

  useEffect(() => {
    if (!isPlatformHydrated || initializedRef.current) return;
    // The "already resumed" flag is set INSIDE the deferred callback, not
    // here before scheduling it — deliberately, to survive React Strict
    // Mode's dev-only double-invoke without ever silently skipping resume.
    // See git history for the exact failure this avoids.
    const timeout = setTimeout(() => {
      initializedRef.current = true;
      if (existingProgress?.completedAtIso) {
        router.replace(`/setup-status/${clientId}`);
        return;
      }
      if (existingProgress) {
        setStepIndex(Math.min(existingProgress.currentStepIndex, ONBOARDING_STEPS.length - 1));
        setDraftAnswers(existingProgress.answers);
        setPhase("chapters");
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, [isPlatformHydrated, existingProgress, clientId, router]);

  if (!isPlatformHydrated) return null;

  if (!client) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-near-black px-6">
        <Card className="max-w-sm text-center">
          <p className="text-sm text-neutral">This onboarding link isn&apos;t valid.</p>
        </Card>
      </div>
    );
  }

  const coach = ALL_COACH_PROFILES.find((c) => c.id === client.primaryCoachId);
  const coachName = coach?.displayName ?? "your coach";

  if (phase === "intro") {
    return (
      <RequireThemeChoice accountKind="client" accountId={client.id}>
        <OnboardingStage coachName={coach?.displayName} coachInitials={coach?.avatarInitials}>
          <OptimIntro coachName={coachName} onContinue={() => setPhase("chapters")} />
        </OnboardingStage>
      </RequireThemeChoice>
    );
  }

  const currentAnswers = draftAnswers[step.id] ?? {};
  const isReviewStep = step.id === "review";
  const moments = momentsForStep(step);
  const safeMomentIndex = Math.min(momentIndex, moments.length - 1);
  const currentMomentKeys = new Set(moments[safeMomentIndex]);

  // A number_wheel (and height_feet_inches, two of them) visually shows a
  // centered value the instant it mounts, but only ever calls onChange
  // once the client actually scrolls it — so a client happy with the
  // displayed default would otherwise never get it recorded. Derived
  // fresh on every render (never written into draftAnswers via an effect,
  // which previously raced with the resume effect above) and only locked
  // into real state in handleNext, once the client actually advances.
  const effectiveAnswers: OnboardingStepAnswers = { ...currentAnswers };
  for (const field of step.fields) {
    if (field.type === "number_wheel" && effectiveAnswers[field.key] === undefined) {
      effectiveAnswers[field.key] = field.min ?? 0;
    }
    if (field.type === "height_feet_inches") {
      if (effectiveAnswers.heightFeet === undefined) effectiveAnswers.heightFeet = 5;
      if (effectiveAnswers.heightInchesRemainder === undefined) effectiveAnswers.heightInchesRemainder = 6;
    }
    if (field.type === "timezone_confirm" && effectiveAnswers[field.key] === undefined) {
      effectiveAnswers[field.key] = detectTimeZone();
    }
  }

  const visibleFields = visibleFieldsForStep(step, effectiveAnswers);
  const visibleMomentFields = visibleFields.filter((f) => currentMomentKeys.has(f.key));
  const requiredFieldsFilled = visibleMomentFields.filter((f) => f.required).every((f) => isFieldAnswered(f, effectiveAnswers));
  const reviewAcknowledged = (draftAnswers.review ?? {}).acknowledged === true;

  function updateField(key: string, value: OnboardingFieldValue) {
    setDraftAnswers((prev) => {
      const existing = prev[step.id] ?? {};
      const next = applyStepFieldUpdate(step, existing, key, value);
      return { ...prev, [step.id]: next };
    });
  }

  function handleNext() {
    // Skip straight past any run of moments that have nothing applicable to
    // answer (e.g. health_finish's injury-detail moments once
    // hasInjuryHistory is false) — see findVisibleMomentIndex's own doc for
    // why this is the actual fix for the "blank onboarding screen" defect,
    // not just a cosmetic one.
    const next = findVisibleMomentIndex(step, effectiveAnswers, safeMomentIndex + 1, 1);
    if (next !== -1) {
      setDirection("forward");
      setMomentIndex(next);
      return;
    }

    const nowIso = new Date().toISOString();
    if (isReviewStep) {
      dispatch({ type: "COMPLETE_ONBOARDING", clientId, workspaceId: client!.workspaceId, nowIso });
      router.push(`/setup-status/${clientId}`);
      return;
    }
    const nextIndex = Math.min(stepIndex + 1, ONBOARDING_STEPS.length - 1);
    setDraftAnswers((prev) => ({ ...prev, [step.id]: effectiveAnswers }));
    dispatch({
      type: "SAVE_ONBOARDING_STEP",
      clientId,
      workspaceId: client!.workspaceId,
      stepId: step.id,
      answers: effectiveAnswers,
      nextStepIndex: nextIndex,
      nowIso,
    });
    setDirection("forward");
    setStepIndex(nextIndex);
    const nextStep = ONBOARDING_STEPS[nextIndex];
    const nextStepAnswers = draftAnswers[nextStep.id] ?? {};
    const entryMoment = findVisibleMomentIndex(nextStep, nextStepAnswers, 0, 1);
    setMomentIndex(entryMoment === -1 ? 0 : entryMoment);
  }

  function handleBack() {
    const prev = findVisibleMomentIndex(step, effectiveAnswers, safeMomentIndex - 1, -1);
    if (prev !== -1) {
      setDirection("back");
      setMomentIndex(prev);
      return;
    }
    if (stepIndex > 0) {
      setDirection("back");
      const prevIndex = stepIndex - 1;
      const prevStep = ONBOARDING_STEPS[prevIndex];
      const prevStepAnswers = draftAnswers[prevStep.id] ?? {};
      const lastVisible = findVisibleMomentIndex(prevStep, prevStepAnswers, momentsForStep(prevStep).length - 1, -1);
      setStepIndex(prevIndex);
      setMomentIndex(lastVisible === -1 ? 0 : lastVisible);
    }
  }

  function jumpToMoment(id: OnboardingStepId, targetMomentIndex = 0) {
    const index = ONBOARDING_STEPS.findIndex((s) => s.id === id);
    if (index === -1) return;
    setDirection("back");
    setStepIndex(index);
    setMomentIndex(targetMomentIndex);
  }

  const totalChapters = ONBOARDING_STEPS.length - 1; // Review isn't one of "the six chapters"
  const percentComplete = Math.round((Math.min(stepIndex, totalChapters) / totalChapters) * 100);
  const canContinue = isReviewStep ? reviewAcknowledged : requiredFieldsFilled;
  const isVeryFirstScreen = stepIndex === 0 && momentIndex === 0;

  const actions = (
    <Button className="w-full" size="lg" onClick={handleNext} disabled={!canContinue}>
      {isReviewStep ? `Send to ${coachName}` : "Continue"}
    </Button>
  );

  return (
    <RequireThemeChoice accountKind="client" accountId={client.id}>
    <OnboardingStage
      coachName={coach?.displayName}
      coachInitials={coach?.avatarInitials}
      onBack={!isVeryFirstScreen ? handleBack : undefined}
      progress={
        isReviewStep
          ? { sectionName: "Review", stepNumber: totalChapters, totalSteps: totalChapters, percentComplete: 100 }
          : { sectionName: step.section, stepNumber: stepIndex + 1, totalSteps: totalChapters, percentComplete }
      }
      moment={moments.length > 1 ? { index: momentIndex, total: moments.length } : undefined}
      recap={buildRecapFacts(draftAnswers, stepIndex)}
      footer={actions}
    >
      <ChapterTransition transitionKey={`${stepIndex}-${momentIndex}`} direction={direction}>
        {!isReviewStep ? (
          <div className="mb-6 flex items-center gap-2.5">
            {(() => {
              const Icon = ONBOARDING_CHAPTER_ICONS[step.id];
              return <Icon size={20} className="text-brass-strong" aria-hidden="true" />;
            })()}
            <div>
              <h1 className="text-display text-off-white">{step.title}</h1>
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <h1 className="text-display text-off-white">{step.title}</h1>
          </div>
        )}
        {momentIndex === 0 ? <p className="-mt-4 mb-6 text-body text-neutral">{step.description}</p> : null}

        <div className="space-y-5">
          {isReviewStep ? (
            <ReviewSummary coachName={coachName} draftAnswers={draftAnswers} onJump={jumpToMoment} onAcknowledge={(v) => updateField("acknowledged", v)} acknowledged={reviewAcknowledged} />
          ) : (
            <StepFields step={step} fields={visibleMomentFields} answers={effectiveAnswers} coachName={coachName} onUpdate={updateField} />
          )}
        </div>
      </ChapterTransition>
    </OnboardingStage>
    </RequireThemeChoice>
  );
}

/** A handful of already-completed chapters' headline facts, shown in the
 * desktop rail's "Building your profile" recap — only ever chapters
 * strictly BEFORE the one currently open, so it never shows a half-entered
 * answer as if it were final. Deliberately short (at most 4 facts): a
 * confirmation the system is paying attention, never a second review
 * screen. */
function buildRecapFacts(draftAnswers: Partial<Record<string, OnboardingStepAnswers>>, currentStepIndex: number): OnboardingRecapFact[] {
  const facts: OnboardingRecapFact[] = [];
  const about = draftAnswers.about_you;
  const goals = draftAnswers.what_you_want;
  const week = draftAnswers.your_week;
  const start = draftAnswers.starting_point;

  const aboutIndex = ONBOARDING_STEPS.findIndex((s) => s.id === "about_you");
  const goalsIndex = ONBOARDING_STEPS.findIndex((s) => s.id === "what_you_want");
  const weekIndex = ONBOARDING_STEPS.findIndex((s) => s.id === "your_week");
  const startIndex = ONBOARDING_STEPS.findIndex((s) => s.id === "starting_point");

  if (about && currentStepIndex > aboutIndex) {
    const height = formatHeightFromAnswers(about);
    if (height !== NOT_PROVIDED) facts.push({ label: "Height", value: height });
  }
  if (goals?.primaryGoal && currentStepIndex > goalsIndex) {
    facts.push({ label: "Goal", value: describePrimaryGoal(ONBOARDING_STEPS, goals) });
  }
  if (week?.availableDays && currentStepIndex > weekIndex) {
    const days = Array.isArray(week.availableDays) ? (week.availableDays as string[]) : [];
    if (days.length > 0) facts.push({ label: "Training days", value: `${days.length}/week` });
  }
  if (start?.trainingExperience && currentStepIndex > startIndex) {
    const field = ONBOARDING_STEPS[startIndex].fields.find((f) => f.key === "trainingExperience")!;
    facts.push({ label: "Experience", value: formatFieldValue(field, start.trainingExperience) });
  }
  return facts.slice(0, 4);
}

function withHeadingFlags(fields: OnboardingFieldDef[]): { field: OnboardingFieldDef; showHeading: boolean }[] {
  let previous: string | undefined;
  return fields.map((field) => {
    const showHeading = !!field.sectionLabel && field.sectionLabel !== previous;
    if (field.sectionLabel) previous = field.sectionLabel;
    return { field, showHeading };
  });
}

function StepFields({
  step,
  fields,
  answers,
  coachName,
  onUpdate,
}: {
  step: OnboardingStepDef;
  fields: OnboardingFieldDef[];
  answers: OnboardingStepAnswers;
  coachName: string;
  onUpdate: (key: string, value: OnboardingFieldValue) => void;
}) {
  return (
    <>
      {withHeadingFlags(fields).map(({ field, showHeading }) => {
        const response = contextualResponseFor(step.id, field.key, answers[field.key], coachName);
        return (
        <Collapse key={field.key} open>
          <div>
            {showHeading ? <p className="mb-3 border-t border-border pt-5 text-label text-neutral first:border-t-0 first:pt-0">{field.sectionLabel}</p> : null}
            {field.type === "height_feet_inches" ? (
              <HeightInput
                feet={answers.heightFeet as number | undefined}
                inches={answers.heightInchesRemainder as number | undefined}
                onChangeFeet={(v) => onUpdate("heightFeet", v)}
                onChangeInches={(v) => onUpdate("heightInchesRemainder", v)}
              />
            ) : field.type === "timezone_confirm" ? (
              <TimezoneInput value={answers[field.key] as string} onChange={(v) => onUpdate(field.key, v)} />
            ) : (
              <OnboardingFieldInput field={field} value={answers[field.key] as OnboardingFieldValue} answers={answers} onChange={(v) => onUpdate(field.key, v)} />
            )}
            <Collapse open={!!response}>
              <p className="mt-2.5 rounded-[var(--radius-sm)] bg-accent-soft px-3 py-2 text-sm text-accent-strong">{response}</p>
            </Collapse>
          </div>
        </Collapse>
        );
      })}
      {fields.length === 0 ? <p className="text-sm text-neutral">Nothing more to answer here — continue when you&apos;re ready.</p> : null}
    </>
  );
}

/**
 * One compact summary — never a wall of per-chapter review cards. Shows
 * exactly the facts the Phase 5.2 brief names (goal, available days,
 * session length, environment, experience, any health flag), each with its
 * own direct "Edit" action that jumps to the exact chapter AND internal
 * moment that answer came from — never a single blanket "Edit answers"
 * link that always lands on chapter one regardless of which row a client
 * actually wants to change.
 */
function step(id: OnboardingStepId): OnboardingStepDef {
  const found = ONBOARDING_STEPS.find((s) => s.id === id);
  if (!found) throw new Error(`No onboarding step "${id}"`);
  return found;
}

function ReviewSummary({
  coachName,
  draftAnswers,
  onJump,
  onAcknowledge,
  acknowledged,
}: {
  coachName: string;
  draftAnswers: Partial<Record<string, OnboardingStepAnswers>>;
  onJump: (id: OnboardingStepId, momentIndex?: number) => void;
  onAcknowledge: (v: boolean) => void;
  acknowledged: boolean;
}) {
  const about = draftAnswers.about_you;
  const goals = draftAnswers.what_you_want;
  const week = draftAnswers.your_week;
  const start = draftAnswers.starting_point;
  const health = draftAnswers.health_finish;
  const healthFlag = computeHealthReviewRequired(health);

  const secondaryGoalsField = ONBOARDING_STEPS.find((s) => s.id === "what_you_want")!.fields.find((f) => f.key === "secondaryGoals")!;
  const sessionField = ONBOARDING_STEPS.find((s) => s.id === "your_week")!.fields.find((f) => f.key === "maxSessionLength")!;
  const envField = ONBOARDING_STEPS.find((s) => s.id === "your_week")!.fields.find((f) => f.key === "trainingEnvironment")!;
  const experienceField = ONBOARDING_STEPS.find((s) => s.id === "starting_point")!.fields.find((f) => f.key === "trainingExperience")!;
  const availableDays = Array.isArray(week?.availableDays) ? (week!.availableDays as string[]) : [];
  const hasSecondaryGoals = Array.isArray(goals?.secondaryGoals) && (goals!.secondaryGoals as string[]).length > 0;

  // Moment index is always derived from the live moments array (see
  // momentIndexForField) — never hardcoded — so a chapter's internal
  // pacing can be re-split or regrouped without silently pointing a Review
  // row's "Edit" at the wrong internal screen.
  const rows: { label: string; value: string; jumpTo: OnboardingStepId; moment: number }[] = [
    { label: "Height", value: formatHeightFromAnswers(about), jumpTo: "about_you", moment: momentIndexForField(step("about_you"), "heightFeetInches") },
    { label: "Goal", value: goals ? describePrimaryGoal(ONBOARDING_STEPS, goals) : NOT_PROVIDED, jumpTo: "what_you_want", moment: momentIndexForField(step("what_you_want"), "primaryGoal") },
    ...(hasSecondaryGoals
      ? [{ label: "Also working on", value: formatFieldValue(secondaryGoalsField, goals!.secondaryGoals), jumpTo: "what_you_want" as const, moment: momentIndexForField(step("what_you_want"), "secondaryGoals") }]
      : []),
    { label: "Available days", value: availableDays.length > 0 ? `${availableDays.length}/week` : NOT_PROVIDED, jumpTo: "your_week", moment: momentIndexForField(step("your_week"), "availableDays") },
    { label: "Session length", value: week ? formatFieldValue(sessionField, week.maxSessionLength) : NOT_PROVIDED, jumpTo: "your_week", moment: momentIndexForField(step("your_week"), "maxSessionLength") },
    { label: "Environment", value: week ? formatFieldValue(envField, week.trainingEnvironment) : NOT_PROVIDED, jumpTo: "your_week", moment: momentIndexForField(step("your_week"), "trainingEnvironment") },
    { label: "Experience", value: start ? formatFieldValue(experienceField, start.trainingExperience) : NOT_PROVIDED, jumpTo: "starting_point", moment: momentIndexForField(step("starting_point"), "trainingExperience") },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-label text-neutral">Summary</p>
        <dl className="mt-2.5 divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
              <dt className="shrink-0 text-neutral">{row.label}</dt>
              <div className="flex min-w-0 items-center gap-2">
                <dd className="max-w-[220px] truncate text-right text-off-white">{row.value}</dd>
                <button
                  type="button"
                  onClick={() => onJump(row.jumpTo, row.moment)}
                  aria-label={`Edit ${row.label}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral transition-colors hover:bg-off-white/5 hover:text-accent-strong"
                  style={{ transitionDuration: "var(--motion-fast)" }}
                >
                  <Pencil size={13} />
                </button>
              </div>
            </div>
          ))}
        </dl>
        {healthFlag.required ? (
          <p className="mt-3 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-sm text-warning">
            This does not automatically prevent you from training. {coachName} will review it with you before your
            program begins.
          </p>
        ) : null}
      </Card>

      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-border-strong bg-surface-input px-3.5 py-3 transition-colors hover:border-accent/40" style={{ transitionDuration: "var(--motion-fast)" }}>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledge(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-current"
        />
        <span className="text-sm text-off-white">This information is accurate to the best of my knowledge.</span>
      </label>

      <p className="text-sm text-neutral">{coachName} — not an automated system — will review this and finish your setup from here.</p>
    </div>
  );
}
