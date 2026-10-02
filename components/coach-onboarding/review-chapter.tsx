"use client";

// Gate 3.1 — the final review of the coach's method before confirmation.
// The same readiness rule the server enforces (every required answer that
// applies, every carried-over answer looked at, authority confirmed) — the
// button and the server never disagree about what "complete" means.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleAlert, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCalibration } from "@/components/coach-onboarding/calibration-context";
import { CalibrationSummary } from "@/components/coach-onboarding/v2/calibration-summary";
import { generateThreeTrainingOptions, type ClientOnboardingSnapshot } from "@/lib/coach/activation-generation";
import { calibrationReadiness } from "@/lib/coach/coach-brain";
import { methodCoversResistance, resolveProgramLengthHint } from "@/lib/coach/method-resolution";
import { ALL_CALIBRATION_ITEMS, CALIBRATION_CHAPTERS, answerKeyOf } from "@/lib/coach/calibration/questions";
import type { CalibrationChapterId } from "@/lib/coach/calibration/types";

const HYPOTHETICALS: { title: string; snapshot: ClientOnboardingSnapshot }[] = [
  {
    title: "A 28-year-old novice, general health, 3 days/week, commercial gym",
    snapshot: { age: 28, heightTotalInches: 66, weightLb: 150, sex: "female", primaryGoal: "general_health", secondaryGoals: [], availableDays: ["Monday", "Wednesday", "Friday"], maxSessionLengthMinutes: 60, trainingEnvironment: ["commercial_gym"], trainingExperience: "new", hasDietaryRestrictions: false, nutritionApproach: "no_structure" },
  },
  {
    title: "A 35-year-old experienced lifter, 5 days/week, home gym",
    snapshot: { age: 35, heightTotalInches: 70, weightLb: 190, sex: "male", primaryGoal: "body_recomposition", secondaryGoals: ["build_muscle", "lose_fat"], availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], maxSessionLengthMinutes: 75, trainingEnvironment: ["home_gym"], trainingExperience: "experienced_consistent", hasDietaryRestrictions: false, nutritionApproach: "tracking" },
  },
];

function chapterOfKey(key: string): CalibrationChapterId | undefined {
  return ALL_CALIBRATION_ITEMS.find((q) => answerKeyOf(q) === key)?.chapter;
}
function chapterTitle(id: CalibrationChapterId): string {
  return CALIBRATION_CHAPTERS.find((c) => c.id === id)?.title ?? id;
}

export function ReviewChapter({
  onEditChapter,
  onReviewRequired = () => {},
  onReviewCarriedOver = () => {},
}: {
  onEditChapter: (chapter: CalibrationChapterId, key?: string) => void;
  /** Walk only the required questions that still need an answer. */
  onReviewRequired?: () => void;
  /** Walk only the carried-over answers that still need a look. */
  onReviewCarriedOver?: () => void;
}) {
  const router = useRouter();
  const cal = useCalibration();
  const model = cal.buildDraftModel();
  const [activated, setActivated] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const readiness = calibrationReadiness({ answers: cal.answers, aiAuthorityConfirmed: cal.authority ? cal.authority.confirmed : true });
  const confirmBlocked = cal.requireExplicitCompletion && !readiness.ready;
  const isRevision = cal.isRevision && !!cal.previousActiveModel;
  const previousWasV1 = isRevision && !cal.previousActiveModel?.calibration;

  const covers = methodCoversResistance(model);
  const lengthHint = resolveProgramLengthHint(model);
  const previewWeeks = lengthHint?.preferred ?? lengthHint?.min ?? 8;
  const previews = covers
    ? HYPOTHETICALS.map((h) => {
        const training = generateThreeTrainingOptions({ clientId: "preview-client", workspaceId: model.workspaceId, coachId: model.coachId, snapshot: h.snapshot, com: model, durationWeeks: previewWeeks, nowIso: new Date().toISOString() });
        return { title: h.title, bestTraining: training.find((t) => t.kind === "best_fit") };
      })
    : [];

  const changedChapters = (() => {
    const prev = cal.previousActiveModel?.calibration?.answers;
    if (!isRevision || !prev) return [];
    const next = model.calibration?.answers ?? {};
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    const changed = new Set<CalibrationChapterId>();
    for (const k of keys) {
      if (JSON.stringify(prev[k]) === JSON.stringify(next[k])) continue;
      const c = chapterOfKey(k);
      if (c) changed.add(c);
    }
    return [...changed].map(chapterTitle);
  })();

  async function handleActivate() {
    if (confirmBlocked || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    const result = await cal.confirm(model);
    setConfirming(false);
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
              <p className="text-heading text-off-white">{isRevision ? "Your updated method is active" : "Calibration complete"}</p>
              <p className="mt-1.5 max-w-xl text-body text-neutral">{isRevision ? "OPTIM now works from your updated method." : "Your coaching method is active — OPTIM will follow it for every client."}</p>
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
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {readiness.unansweredQuestionIds.length > 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised p-5">
              <p className="flex items-center gap-2 text-subheading text-off-white">
                <CircleDashed size={16} className="text-accent-fg" aria-hidden="true" />
                {readiness.unansweredQuestionIds.length} answer{readiness.unansweredQuestionIds.length === 1 ? "" : "s"} needed
              </p>
              <p className="mt-1.5 text-meta text-neutral">{isRevision ? "These are new or changed questions OPTIM needs before you can confirm your updated method." : "OPTIM needs these before you can confirm your method."}</p>
              <Button className="mt-4" onClick={onReviewRequired}>
                Review required answers <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {readiness.needsConfirmation.length > 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-warning/30 bg-warning-soft/50 p-5">
              <p className="flex items-center gap-2 text-subheading text-off-white">
                <CircleAlert size={16} className="text-warning-strong" aria-hidden="true" />
                {readiness.needsConfirmation.length} carried-over answer{readiness.needsConfirmation.length === 1 ? "" : "s"} to review
              </p>
              <p className="mt-1.5 text-meta text-neutral">These came from your current method, but their meaning or format changed in the new calibration.</p>
              <Button className="mt-4" variant="secondary" onClick={onReviewCarriedOver}>
                Review carried-over answers <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {readiness.authorityUnconfirmed ? (
            <div className="rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised p-5">
              <p className="text-subheading text-off-white">Confirm OPTIM&apos;s authority</p>
              <p className="mt-1.5 text-meta text-neutral">Choose how much you want OPTIM to take on before you confirm.</p>
              <Button className="mt-4" variant="secondary" onClick={() => onEditChapter("ai_authority")}>
                Go to AI authority <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {activated ? <p className="mb-3 mt-8 text-label text-neutral">Your coaching method, at a glance</p> : null}
      <CalibrationSummary answers={cal.answers} onEditChapter={activated ? undefined : (c) => onEditChapter(c)} className={activated ? "" : "mt-6"} />

      {previews.length > 0 ? (
        <div className="mt-10">
          <h3 className="text-heading text-off-white">Calibration preview</h3>
          <p className="mt-1 text-body text-neutral">How OPTIM would set up two example clients using the training method above.</p>
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
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {activated ? null : (
        <div className="mt-10 border-t border-border pt-6">
          {isRevision ? (
            <div className="mb-4 rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised p-5">
              <p className="text-subheading text-off-white">What&apos;s changing</p>
              {previousWasV1 ? (
                <p className="mt-2 text-sm text-off-white">Your method moves to OPTIM&apos;s updated calibration. Answers that kept their meaning carried over; the rest are above for you to confirm.</p>
              ) : changedChapters.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-sm text-off-white">
                  {changedChapters.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-neutral">No changes since your current method.</p>
              )}
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
              {confirming ? "Confirming…" : isRevision ? "Save updated method" : "Confirm and activate my coaching method"} <ArrowRight size={16} aria-hidden="true" />
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
