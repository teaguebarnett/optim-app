"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Check,
  Users2,
  Dumbbell,
  Activity,
  Utensils,
  MessageCircle,
  ShieldCheck,
  ClipboardCheck,
  Compass,
  Trophy,
  Zap,
  Timer,
  Combine,
  HeartPulse,
  Scale,
  UserCog,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCalibration } from "@/components/coach-onboarding/calibration-context";
import { AiAuthorityPanel } from "@/components/coach/ai-authority-panel";
import { CALIBRATION_CHAPTERS, CHAPTER_ORDER, answerKeyOf } from "@/lib/coach/calibration/questions";
import { buildCalibrationContext, computeCalibrationProgress, isQuestionAnswered, visibleCalibrationQuestions, visibleParts } from "@/lib/coach/calibration/engine";
import { NEEDS_CONFIRMATION_KEY, type CalibrationAnswers, type CalibrationAnswerValue, type CalibrationChapterId as CoachOnboardingChapterId, type CalibrationQuestion } from "@/lib/coach/calibration/types";
import { CalibrationField } from "@/components/coach-onboarding/v2/calibration-field";
import { Step0Description } from "@/components/coach-onboarding/v2/step0-description";
import { ReviewChapter } from "@/components/coach-onboarding/review-chapter";
import { CoachOnboardingWelcome } from "@/components/coach-onboarding/coach-onboarding-welcome";

const ALL_CHAPTER_IDS_IN_ORDER = CHAPTER_ORDER;
const CHAPTER_META = new Map(CALIBRATION_CHAPTERS.map((c) => [c.id, c]));

/** One consistent, recognizable icon per chapter. */
const CHAPTER_ICONS: Record<CoachOnboardingChapterId, LucideIcon> = {
  your_coaching: Users2,
  philosophy: Compass,
  training: Dumbbell,
  strength: Trophy,
  physique: Activity,
  sport_performance: Zap,
  endurance: Timer,
  integration: Combine,
  general_fitness: HeartPulse,
  weight_management: Scale,
  client_groups: UserCog,
  nutrition: Utensils,
  voice: MessageCircle,
  messages: MessagesSquare,
  safety: ShieldCheck,
  situations: Activity,
  ai_authority: Sparkles,
  review: ClipboardCheck,
};

/** Values shown pre-selected on a question (suggestions, the safety-policy
 * acknowledgment). Displayed only; saved when the coach continues past
 * them. */
function displayDefaults(question: CalibrationQuestion, answers: CalibrationAnswers): Record<string, CalibrationAnswerValue> {
  const ctx = buildCalibrationContext(answers);
  const items = question.kind === "group" ? visibleParts(question, ctx) : [question];
  const out: Record<string, CalibrationAnswerValue> = {};
  for (const item of items) {
    const key = answerKeyOf(item);
    if (answers[key] !== undefined) continue;
    if (item.kind === "policy") out[key] = { stricter: [] };
    else if (item.suggest) {
      const v = item.suggest(ctx);
      if (v !== undefined && !(Array.isArray(v) && v.length === 0)) out[key] = v;
    }
  }
  return out;
}

function questionKeys(question: CalibrationQuestion, answers: CalibrationAnswers): string[] {
  const ctx = buildCalibrationContext(answers);
  return question.kind === "group" ? visibleParts(question, ctx).map(answerKeyOf) : [answerKeyOf(question)];
}

export function CoachOnboardingWizard({ initialChapterId }: { initialChapterId?: CoachOnboardingChapterId }) {
  const cal = useCalibration();
  // Gate 5A — a coach arriving here to fix one specific Playbook section
  // (see components/coach/coach-playbook-detail.tsx's per-section "Edit"
  // links) must land directly on that chapter, not always chapter 1 —
  // "the coach should not need to redo onboarding merely to change one
  // rule." Only ever skips the welcome screen when a real, already-
  // calibrated coach is being deep-linked to a specific section; a
  // genuinely first-time coach (no progress yet) still sees the welcome
  // screen even if a stray chapter param were somehow present.
  const [phase, setPhase] = useState<"welcome" | "chapters">(cal.hasProgress || initialChapterId ? "chapters" : "welcome");
  const chapters = cal.chapters;
  // Gate 3 — a live coach resumes exactly where they left off (saved
  // server-side with every navigation); an explicit ?chapter= still wins.
  const resumeChapter = initialChapterId ?? cal.initialPosition?.chapterId;

  // Coach-onboarding refinement pass — tracked by chapter ID, not a raw
  // array index. `chapters` is recomputed every render from the coach's
  // current answers (e.g. toggling "Do you coach nutrition?" to No removes
  // nutrition_philosophy/nutrition_adjustment from this list on the very
  // next render). A raw numeric index has no idea a chapter disappeared —
  // it silently points at whatever chapter now occupies that slot, which
  // is how a coach flipping that toggle while still on that chapter could
  // land on a completely unrelated chapter's question. Self-healing below
  // (the same "adjust state during render" pattern used elsewhere in this
  // codebase, e.g. components/ui/discrete-slider.tsx) walks forward from
  // wherever the vanished chapter was in the real canonical order to the
  // next chapter that's still genuinely applicable — never backward to
  // chapter 1, and never left pointing at a chapter that no longer exists.
  const [chapterId, setChapterId] = useState<CoachOnboardingChapterId>(resumeChapter && chapters.includes(resumeChapter) ? resumeChapter : chapters[0]);
  const [questionIndex, setQuestionIndex] = useState(!initialChapterId && cal.initialPosition && resumeChapter === cal.initialPosition.chapterId ? cal.initialPosition.questionIndex : 0);
  const [syncedChaptersKey, setSyncedChaptersKey] = useState(chapters.join("|"));
  const chaptersKey = chapters.join("|");
  if (chaptersKey !== syncedChaptersKey) {
    setSyncedChaptersKey(chaptersKey);
    if (!chapters.includes(chapterId)) {
      const startFrom = Math.max(0, ALL_CHAPTER_IDS_IN_ORDER.indexOf(chapterId));
      const healed = ALL_CHAPTER_IDS_IN_ORDER.slice(startFrom).find((id) => chapters.includes(id)) ?? chapters[chapters.length - 1];
      setChapterId(healed);
      setQuestionIndex(0);
    }
  }

  const { recordPosition, markReviewReached } = cal;
  useEffect(() => {
    if (phase !== "chapters") return;
    recordPosition(chapterId, questionIndex);
    if (chapterId === "review") markReviewReached();
  }, [phase, chapterId, questionIndex, recordPosition, markReviewReached]);

  if (phase === "welcome") {
    return <CoachOnboardingWelcome businessName={cal.businessName} onContinue={() => setPhase("chapters")} />;
  }

  const chapterIndex = Math.max(0, chapters.indexOf(chapterId));
  const meta = CHAPTER_META.get(chapterId)!;
  const isLastChapter = chapterIndex >= chapters.length - 1;

  function goToNextChapter() {
    if (isLastChapter) return;
    setChapterId(chapters[chapterIndex + 1]);
    setQuestionIndex(0);
  }
  // Gate 5A — the same direct jump ReviewChapter's own onEditChapter already
  // does, now also reachable from the chapter rail on every screen (not
  // just Review), so a coach fixing one thing can jump straight there and
  // straight back to Review to confirm — never forced through every
  // chapter in between just to reach the one they actually want.
  function jumpToChapter(id: CoachOnboardingChapterId) {
    if (!chapters.includes(id) || id === chapterId) return;
    setChapterId(id);
    setQuestionIndex(0);
  }
  function goToPreviousChapter() {
    if (chapterIndex === 0) return;
    const prevId = chapters[chapterIndex - 1];
    // Landing on the FIRST question of the previous chapter when going
    // backward is the confirmed bug this pass fixes — a real coach
    // reviewing/correcting earlier answers via Back expects to land on the
    // last thing before where they are now, not be thrown back to that
    // chapter's start.
    const prevQuestionCount = visibleCalibrationQuestions(prevId, cal.answers).length;
    setChapterId(prevId);
    setQuestionIndex(Math.max(0, prevQuestionCount - 1));
  }

  if (chapterId === "ai_authority") {
    return (
      <ChapterFrame meta={meta} chapterId={chapterId} chapters={chapters} chapterNumber={chapterIndex + 1} onBack={goToPreviousChapter} canGoBack={chapterIndex > 0} onSelectChapter={jumpToChapter}>
        {cal.authority ? <LiveAuthorityStep onContinue={goToNextChapter} /> : <DemoAuthorityStep onContinue={goToNextChapter} />}
      </ChapterFrame>
    );
  }

  if (chapterId === "review") {
    return (
      <ChapterFrame meta={meta} chapterId={chapterId} chapters={chapters} chapterNumber={chapterIndex + 1} onBack={goToPreviousChapter} canGoBack={chapterIndex > 0} onSelectChapter={jumpToChapter}>
        <ReviewChapter
          onEditChapter={(id, key) => {
            if (!chapters.includes(id)) return;
            const list = visibleCalibrationQuestions(id, cal.answers);
            const index = key ? list.findIndex((q) => questionKeys(q, cal.answers).includes(key)) : 0;
            setChapterId(id);
            setQuestionIndex(Math.max(0, index));
          }}
        />
      </ChapterFrame>
    );
  }

  const questions = visibleCalibrationQuestions(chapterId, cal.answers);
  const question = questions[Math.min(questionIndex, questions.length - 1)];
  const isLastQuestionInChapter = questionIndex >= questions.length - 1;
  const defaults = question ? displayDefaults(question, cal.answers) : {};
  const shown: CalibrationAnswers = { ...cal.answers, ...defaults };
  const needs = Array.isArray(cal.answers[NEEDS_CONFIRMATION_KEY]) ? (cal.answers[NEEDS_CONFIRMATION_KEY] as string[]) : [];
  const keysHere = question ? questionKeys(question, cal.answers) : [];
  const needsHere = keysHere.filter((k) => needs.includes(k));

  function save(patch: Record<string, CalibrationAnswerValue>, options?: { debounce?: boolean }) {
    cal.updateAnswers((prev) => {
      const next: CalibrationAnswers = { ...prev };
      // Suggestions only fill what's still unanswered in the latest answers.
      for (const [k, v] of Object.entries(patch)) if (!(k in defaults) || prev[k] === undefined || patch[k] !== defaults[k]) next[k] = v;
      // Looking at (or changing) a carried-over answer counts as confirming it.
      const pendingNeeds = Array.isArray(prev[NEEDS_CONFIRMATION_KEY]) ? (prev[NEEDS_CONFIRMATION_KEY] as string[]) : [];
      const touched = Object.keys(patch).filter((k) => pendingNeeds.includes(k));
      if (touched.length) next[NEEDS_CONFIRMATION_KEY] = pendingNeeds.filter((k) => !touched.includes(k));
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
      return next;
    }, options);
  }

  function handleChange(key: string, value: CalibrationAnswerValue) {
    const isText = question?.kind === "control" && question.control?.kind === "text";
    save({ ...defaults, [key]: value }, { debounce: isText });
  }

  function handleContinue() {
    if (Object.keys(defaults).length || needsHere.length) {
      cal.updateAnswers((prev) => {
        const next: CalibrationAnswers = { ...prev };
        for (const [k, v] of Object.entries(defaults)) if (prev[k] === undefined) next[k] = v;
        const pendingNeeds = Array.isArray(prev[NEEDS_CONFIRMATION_KEY]) ? (prev[NEEDS_CONFIRMATION_KEY] as string[]) : [];
        if (needsHere.length) next[NEEDS_CONFIRMATION_KEY] = pendingNeeds.filter((k) => !needsHere.includes(k));
        return next;
      });
    }
    if (!isLastQuestionInChapter) {
      setQuestionIndex((i) => i + 1);
      return;
    }
    goToNextChapter();
  }

  function handleBack() {
    if (questionIndex > 0) {
      setQuestionIndex((i) => i - 1);
      return;
    }
    goToPreviousChapter();
  }

  const saveBlocked = cal.saveStatus === "saving" || cal.saveStatus === "error";
  const canContinue = !saveBlocked && (!question || !question.required || isQuestionAnswered(question, shown));

  return (
    <ChapterFrame meta={meta} chapterId={chapterId} chapters={chapters} chapterNumber={chapterIndex + 1} onBack={handleBack} canGoBack={chapterIndex > 0 || questionIndex > 0} onSelectChapter={jumpToChapter}>
      {question ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-meta font-semibold uppercase tracking-wide text-accent-fg">
            <span>Question {questionIndex + 1}</span>
            <span className="text-neutral">of {questions.length}</span>
            {!question.required ? <span className="rounded-[var(--radius-sm)] bg-surface px-2 py-0.5 normal-case tracking-normal text-neutral">Optional</span> : null}
          </div>
          <h2 className="max-w-2xl text-heading text-off-white">{question.prompt}</h2>
          {question.explanation ? <p className="mt-2 max-w-xl text-body text-neutral">{question.explanation}</p> : null}
          {question.status === "C" ? <p className="mt-2 max-w-xl text-meta text-neutral">Recorded for future use — OPTIM doesn&apos;t act on this yet.</p> : null}
          {needsHere.length ? (
            <p className="mt-3 max-w-xl rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-meta text-warning-strong">Carried over from your earlier method — check it&apos;s still right, then continue.</p>
          ) : null}
          {Object.keys(defaults).length && question.kind !== "policy" ? <p className="mt-3 max-w-xl text-meta text-accent-fg">Suggested from your earlier answers — adjust anything that isn&apos;t right.</p> : null}
          <div className="mt-7">
            {question.kind === "description" ? (
              <Step0Description answers={cal.answers} onSave={(patch, options) => save(patch, options)} />
            ) : (
              // Keyed per question: controls (number wheels especially) must never
              // carry state or scroll position from one question to the next.
              <CalibrationField key={question.id} question={question} answers={shown} onChange={handleChange} />
            )}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={handleContinue} disabled={!canContinue}>
              {question.required || isQuestionAnswered(question, shown) ? "Continue" : "Skip for now"} <ArrowRight size={16} aria-hidden="true" />
            </Button>
            {chapterId === "situations" && !isLastChapter ? (
              <Button size="lg" variant="ghost" onClick={goToNextChapter}>
                Skip common situations
              </Button>
            ) : null}
            <SaveIndicator />
          </div>
        </div>
      ) : (
        <div>
          <p className="text-body text-neutral">Nothing to ask here.</p>
          <div className="mt-6">
            <Button size="lg" onClick={goToNextChapter} disabled={isLastChapter}>
              Continue <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </ChapterFrame>
  );
}

function ChapterFrame({
  meta,
  chapterId,
  chapters,
  chapterNumber,
  children,
  onBack,
  canGoBack,
  onSelectChapter,
}: {
  meta: { title: string; description: string };
  chapterId: CoachOnboardingChapterId;
  chapters: CoachOnboardingChapterId[];
  chapterNumber: number;
  children: React.ReactNode;
  onBack: () => void;
  canGoBack: boolean;
  onSelectChapter: (id: CoachOnboardingChapterId) => void;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr] lg:gap-8 lg:px-10 lg:py-12">
        <div className="hidden lg:block">
          <ChapterRail chapterId={chapterId} chapters={chapters} onSelectChapter={onSelectChapter} />
        </div>
        <CompactProgress chapterId={chapterId} chapters={chapters} chapterNumber={chapterNumber} onSelectChapter={onSelectChapter} />
        <div className="min-w-0">
          <div className="mb-6 flex items-center gap-3">
            {canGoBack ? (
              <button type="button" onClick={onBack} aria-label="Back" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral hover:bg-accent-soft hover:text-accent-fg">
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
            ) : null}
            <div>
              <p className="text-label text-accent-fg">
                {meta.title} · {chapterNumber} of {chapters.length}
              </p>
              <p className="mt-0.5 text-meta text-neutral">{meta.description}</p>
            </div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-border-strong bg-charcoal p-5 shadow-[var(--shadow-subtle)] sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** The categories-at-a-glance rail — replaces a bare percent stat with the
 * actual shape of this coach's calibration: every chapter that genuinely
 * applies to them (already filtered by applicableChapters), each marked
 * done / current / upcoming. A coach mid-flow can see exactly how much is
 * behind them and what's still ahead without leaving the question. */
function ChapterRail({
  chapterId,
  chapters,
  onSelectChapter,
}: {
  chapterId: CoachOnboardingChapterId;
  chapters: CoachOnboardingChapterId[];
  onSelectChapter: (id: CoachOnboardingChapterId) => void;
}) {
  const cal = useCalibration();
  const summary = computeCalibrationProgress(cal.answers);
  const currentIndex = chapters.indexOf(chapterId);

  return (
    <aside className="sticky top-12 h-fit space-y-5">
      <div className="rounded-[var(--radius-lg)] border border-border-strong bg-charcoal p-5">
        <div className="flex items-center gap-2 text-label text-neutral">
          <Sparkles size={14} className="text-accent-fg" aria-hidden="true" />
          WHAT OPTIM IS LEARNING
        </div>
        <p className="mt-2.5 text-subheading text-off-white">{summary.percentComplete}% complete</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div className="pc-segment h-full rounded-full bg-accent" style={{ width: `${summary.percentComplete}%` }} />
        </div>
        <p className="mt-2.5 text-meta text-neutral">{summary.answered} of {summary.totalApplicable} questions that apply to you.</p>
      </div>

      <nav aria-label="Calibration chapters" className="space-y-1">
        {chapters.map((id, index) => {
          const chapterMeta = CHAPTER_META.get(id)!;
          const Icon = CHAPTER_ICONS[id];
          const isCurrent = index === currentIndex;
          const isDone = index < currentIndex;
          return (
            // Gate 5A — every chapter here is already reachable in some
            // order by the coach's own answers (`chapters` is pre-filtered
            // by applicableChapters), so jumping directly to any of them —
            // forward, backward, or straight to Review — never skips a
            // real gate; it's the same jump ReviewChapter's own
            // onEditChapter already performs, just reachable from anywhere.
            <button
              key={id}
              type="button"
              onClick={() => onSelectChapter(id)}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors hover:bg-accent-soft/60 ${
                isCurrent ? "bg-accent-soft" : ""
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  isDone ? "bg-accent text-on-accent" : isCurrent ? "bg-accent text-on-accent" : "bg-surface-raised text-neutral"
                }`}
              >
                {isDone ? <Check size={14} aria-hidden="true" /> : <Icon size={14} aria-hidden="true" />}
              </span>
              <span className={`text-meta font-medium leading-tight ${isCurrent ? "text-off-white" : isDone ? "text-neutral" : "text-neutral/70"}`}>
                {chapterMeta.title}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/** Live only: whether the coach's latest answer is actually saved. A failed
 * save is shown as failed (with retry) and blocks Continue — never hidden. */
function SaveIndicator() {
  const cal = useCalibration();
  if (cal.mode !== "live" || cal.saveStatus === "idle") return null;
  if (cal.saveStatus === "error") {
    return (
      <span role="alert" className="flex flex-wrap items-center gap-2 text-meta text-error-strong">
        Not saved{cal.saveError ? ` — ${cal.saveError}` : ""}
        <button type="button" onClick={cal.retrySave} className="min-h-11 font-semibold text-accent-fg underline-offset-2 hover:underline sm:min-h-0">
          Retry
        </button>
      </span>
    );
  }
  return (
    <span className="text-meta text-neutral" aria-live="polite">
      {cal.saveStatus === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}

/** Phones/tablets: the chapter rail collapses to one line of progress with a
 * chapter picker — same chapters, same jumps, no sidebar. */
function CompactProgress({
  chapterId,
  chapters,
  chapterNumber,
  onSelectChapter,
}: {
  chapterId: CoachOnboardingChapterId;
  chapters: CoachOnboardingChapterId[];
  chapterNumber: number;
  onSelectChapter: (id: CoachOnboardingChapterId) => void;
}) {
  const cal = useCalibration();
  const summary = computeCalibrationProgress(cal.answers);
  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between gap-3 text-meta text-neutral">
        <span>
          Chapter {chapterNumber} of {chapters.length} · {summary.percentComplete}% complete
        </span>
        <label className="sr-only" htmlFor="calibration-chapter-picker">
          Jump to chapter
        </label>
        <select
          id="calibration-chapter-picker"
          value={chapterId}
          onChange={(e) => onSelectChapter(e.target.value as CoachOnboardingChapterId)}
          className="min-h-11 max-w-[55%] rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-meta text-off-white"
        >
          {chapters.map((id) => (
            <option key={id} value={id}>
              {CHAPTER_META.get(id)!.title}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent" style={{ width: `${summary.percentComplete}%` }} />
      </div>
    </div>
  );
}

/** Live AI-authority step: the same AiAuthorityPanel, backed by the coach's
 * real calibration draft. Starts at Advisor (OPTIM only suggests); nothing
 * broader is ever assumed. Continuing records the coach's explicit choice —
 * and only advances once that's saved. */
function LiveAuthorityStep({ onContinue }: { onContinue: () => void }) {
  const cal = useCalibration();
  const authority = cal.authority!;
  const [busy, setBusy] = useState(false);
  async function handleContinue() {
    setBusy(true);
    const ok = await authority.confirm();
    setBusy(false);
    if (ok) onContinue();
  }
  return (
    <div className="max-w-2xl">
      <h2 className="text-heading text-off-white sm:text-display">How much should OPTIM do on its own?</h2>
      <p className="mt-2 text-body text-neutral">
        This starts at Advisor — OPTIM only suggests and you decide. Choose what fits how you coach; you can change it any time in Settings. Pain, injury, and out-of-bounds situations always come to you.
      </p>
      <div className="mt-6">
        <AiAuthorityPanel live confirmChanges override={{ settings: authority.settings, setGlobal: authority.setGlobal }} />
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={handleContinue} disabled={busy || cal.saveStatus === "saving"}>
          {authority.confirmed ? "Continue" : "Confirm and continue"} <ArrowRight size={16} aria-hidden="true" />
        </Button>
        <SaveIndicator />
      </div>
    </div>
  );
}

/** Demo mode keeps the browser-local authority panel. */
function DemoAuthorityStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-heading text-off-white sm:text-display">How much should OPTIM do on its own?</h2>
      <div className="mt-6">
        <AiAuthorityPanel />
      </div>
      <Button size="lg" className="mt-8" onClick={onContinue}>
        Continue <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}
