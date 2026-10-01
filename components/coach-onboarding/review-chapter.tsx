"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCalibration } from "@/components/coach-onboarding/calibration-context";
import { MethodSummaryGrid } from "@/components/coach-onboarding/method-summary";
import { generateThreeNutritionStrategies, generateThreeTrainingOptions, type ClientOnboardingSnapshot } from "@/lib/coach/activation-generation";
import { allRequiredVisibleQuestionIds, summarizeCoachOperatingModelChanges } from "@/lib/coach/coach-onboarding-engine";
import { COACH_ONBOARDING_CHAPTERS, findQuestion, type CoachOnboardingChapterId } from "@/lib/coach/coach-onboarding-questions";
import { calibrationReadiness } from "@/lib/coach/coach-brain";

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
  const cal = useCalibration();
  const model = cal.buildDraftModel();
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
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const requiredIds = allRequiredVisibleQuestionIds(cal.answers);
  // Gate 3 (live) — the same readiness rule the server enforces, so the
  // button and the server never disagree about what "complete" means.
  const readiness = calibrationReadiness({ answers: cal.answers, aiAuthorityConfirmed: cal.authority ? cal.authority.confirmed : true });
  const unansweredRequired = cal.requireExplicitCompletion ? readiness.unansweredQuestionIds : requiredIds.filter((id) => !cal.answers[id] && cal.answers[id] !== false);
  const confirmBlocked = cal.requireExplicitCompletion && !readiness.ready;

  // Phase 5.4A corrective pass — a coach re-entering Review after already
  // having an active, confirmed model gets an honest "what's changing"
  // summary before they overwrite it with a new version, plus an explicit
  // statement of what confirming will (and will not) touch.
  const previousActive = cal.previousActiveModel;
  const isRevision = cal.isRevision && !!previousActive;
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

  async function handleActivate() {
    if (confirmBlocked || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    const result = await cal.confirm(model);
    setConfirming(false);
    // Only a real, server-confirmed method counts as activated.
    if (result.ok) setActivated(true);
    else setConfirmError(result.message);
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
              <p className="text-heading text-off-white">{unansweredRequired.length > 0 ? "Onboarding complete — playbook review pending" : isRevision ? "Your updated method is active" : "Calibration complete"}</p>
              <p className="mt-1.5 max-w-xl text-body text-neutral">
                {unansweredRequired.length > 0
                  ? `Your coaching model is active with ${unansweredRequired.length} honest OPTIM default${unansweredRequired.length === 1 ? "" : "s"} standing in for unanswered required questions — worth reviewing when you have a moment, from ${isRevision ? "the Playbook" : "Settings → Coach Playbook"}.`
                  : isRevision
                    ? "Your updated coaching model is active — new client generations will use it."
                    : "Your coaching model is active — OPTIM will use it for every new client."}
              </p>
            </div>
          </div>
          <Button size="lg" onClick={() => router.push(cal.afterConfirmHref)}>
            {cal.afterConfirmHref === "/coach" ? "Go to your dashboard" : "Back to settings"} <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <>
          <h2 className="text-heading text-off-white">Here&apos;s how OPTIM understands you</h2>
          <p className="mt-2 text-body text-neutral">Review each area below. Nothing becomes active until you confirm at the bottom.</p>
        </>
      )}

      {!activated && cal.requireExplicitCompletion && confirmBlocked ? (
        <div className="mt-5 rounded-[var(--radius-sm)] bg-warning-soft px-3.5 py-3 text-sm text-warning-strong">
          <p className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {[
                unansweredRequired.length > 0 ? `${unansweredRequired.length} required question${unansweredRequired.length === 1 ? " still needs" : "s still need"} an answer` : null,
                readiness.authorityUnconfirmed ? "OPTIM’s authority still needs your confirmation" : null,
              ]
                .filter(Boolean)
                .join(", and ")}
              . You can confirm once that&apos;s done.
            </span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-6">
            {[...new Set(unansweredRequired.map((id) => findQuestion(id)?.chapter).filter(Boolean))].map((chapter) => (
              <li key={chapter}>
                <button type="button" onClick={() => onEditChapter(chapter as CoachOnboardingChapterId)} className="min-h-11 font-semibold underline-offset-2 hover:underline sm:min-h-0">
                  Go to {chapterTitle(chapter as CoachOnboardingChapterId)}
                </button>
              </li>
            ))}
            {readiness.authorityUnconfirmed ? (
              <li>
                <button type="button" onClick={() => onEditChapter("ai_authority")} className="min-h-11 font-semibold underline-offset-2 hover:underline sm:min-h-0">
                  Go to AI authority
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : !activated && unansweredRequired.length > 0 ? (
        <div className="mt-5 flex items-start gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3.5 py-3 text-sm text-warning-strong">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{unansweredRequired.length} required question{unansweredRequired.length === 1 ? "" : "s"} still need an answer — OPTIM is using an honest default for now.</span>
        </div>
      ) : null}

      {activated ? <p className="mb-3 mt-8 text-label text-neutral">Your coaching model, at a glance</p> : null}
      <MethodSummaryGrid model={model} onEditChapter={onEditChapter} className={activated ? "" : "mt-6"} />

      <div className="mt-10">
        <h3 className="text-heading text-off-white">Calibration preview</h3>
        <p className="mt-1 text-body text-neutral">How OPTIM would set up two example clients using the method above.</p>
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
                Confirming creates a new version of your method. OPTIM uses it for new client plans — clients you&apos;ve already activated keep their current program and nutrition targets until you explicitly
                regenerate or approve a change for them.
              </p>
            </div>
          ) : null}
          {cal.mode === "live" ? (
            <p className="mb-3 max-w-2xl text-meta text-neutral">
              {isRevision
                ? "Confirming creates a new version of your coaching method. Your current method stays active until you do."
                : "Confirming makes this your coaching method in OPTIM. Everything OPTIM prepares for your clients will follow it — you can review or update it any time from Settings."}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={handleActivate} disabled={confirmBlocked || confirming}>
              {confirming ? "Confirming…" : isRevision ? "Save updated coaching model" : "Confirm and activate my coaching model"} <ArrowRight size={16} aria-hidden="true" />
            </Button>
            {cal.discardReview ? (
              <Button
                size="lg"
                variant="ghost"
                onClick={async () => {
                  const result = await cal.discardReview!();
                  if (!result.ok) setConfirmError(result.message);
                }}
              >
                Discard changes
              </Button>
            ) : null}
          </div>
          {confirmError ? (
            <p role="alert" className="mt-3 text-meta text-error-strong">
              {confirmError}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}


function chapterTitle(id: CoachOnboardingChapterId): string {
  return COACH_ONBOARDING_CHAPTERS.find((c) => c.id === id)?.title ?? id;
}
