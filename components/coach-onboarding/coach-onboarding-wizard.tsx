"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import {
  ALL_CHAPTER_IDS_IN_ORDER,
  COACH_ONBOARDING_CHAPTERS,
  visibleQuestionsForChapter,
  type CoachOnboardingAnswerValue,
  type CoachOnboardingChapterId,
} from "@/lib/coach/coach-onboarding-questions";
import { applicableChapters, computeProgressSummary } from "@/lib/coach/coach-onboarding-engine";
import { QuestionField } from "@/components/coach-onboarding/question-field";
import { AiAuthorityChapter } from "@/components/coach-onboarding/ai-authority-chapter";
import { ExistingWorkChapter } from "@/components/coach-onboarding/existing-work-chapter";
import { ReviewChapter } from "@/components/coach-onboarding/review-chapter";
import { CoachOnboardingWelcome } from "@/components/coach-onboarding/coach-onboarding-welcome";

const CHAPTER_META = new Map(COACH_ONBOARDING_CHAPTERS.map((c) => [c.id, c]));

export function CoachOnboardingWizard({ businessName }: { businessName: string }) {
  const com = useCoachOperatingModel();
  const [phase, setPhase] = useState<"welcome" | "chapters">(com.progress?.updatedAtIso ? "chapters" : "welcome");
  const chapters = applicableChapters(com.answers);

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
  const [chapterId, setChapterId] = useState<CoachOnboardingChapterId>(chapters[0]);
  const [questionIndex, setQuestionIndex] = useState(0);
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

  if (phase === "welcome") {
    return <CoachOnboardingWelcome businessName={businessName} onContinue={() => setPhase("chapters")} />;
  }

  const chapterIndex = Math.max(0, chapters.indexOf(chapterId));
  const meta = CHAPTER_META.get(chapterId)!;
  const isLastChapter = chapterIndex >= chapters.length - 1;

  function goToNextChapter() {
    if (isLastChapter) return;
    setChapterId(chapters[chapterIndex + 1]);
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
    const prevQuestionCount = visibleQuestionsForChapter(prevId, com.answers).length;
    setChapterId(prevId);
    setQuestionIndex(Math.max(0, prevQuestionCount - 1));
  }

  if (chapterId === "ai_authority") {
    return (
      <ChapterFrame meta={meta} chapterNumber={chapterIndex + 1} totalChapters={chapters.length} onBack={goToPreviousChapter} canGoBack={chapterIndex > 0}>
        <AiAuthorityChapter onContinue={goToNextChapter} />
      </ChapterFrame>
    );
  }

  if (chapterId === "existing_work") {
    return (
      <ChapterFrame meta={meta} chapterNumber={chapterIndex + 1} totalChapters={chapters.length} onBack={goToPreviousChapter} canGoBack={chapterIndex > 0}>
        <ExistingWorkChapter onContinue={goToNextChapter} />
      </ChapterFrame>
    );
  }

  if (chapterId === "review") {
    return (
      <ChapterFrame meta={meta} chapterNumber={chapterIndex + 1} totalChapters={chapters.length} onBack={goToPreviousChapter} canGoBack={chapterIndex > 0}>
        <ReviewChapter
          onEditChapter={(id) => {
            if (chapters.includes(id)) {
              setChapterId(id);
              setQuestionIndex(0);
            }
          }}
        />
      </ChapterFrame>
    );
  }

  const questions = visibleQuestionsForChapter(chapterId, com.answers);
  const question = questions[Math.min(questionIndex, questions.length - 1)];
  const isLastQuestionInChapter = questionIndex >= questions.length - 1;

  function handleChange(id: string, value: CoachOnboardingAnswerValue) {
    com.saveAnswers({ ...com.answers, [id]: value });
  }

  function handleContinue() {
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

  const currentValue = question ? com.answers[question.id] : undefined;
  const canContinue =
    !question ||
    !question.required ||
    (question.type === "multi_select" || question.type === "scenario" ? Array.isArray(currentValue) && currentValue.length > 0 : question.type === "boolean" ? typeof currentValue === "boolean" : currentValue !== undefined && currentValue !== "");

  return (
    <ChapterFrame meta={meta} chapterNumber={chapterIndex + 1} totalChapters={chapters.length} onBack={handleBack} canGoBack={chapterIndex > 0 || questionIndex > 0}>
      {question ? (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-meta font-semibold uppercase tracking-wide text-accent-strong">
            <span>{questionIndex + 1}</span>
            <span className="text-neutral">of {questions.length}</span>
          </div>
          <h2 className="max-w-3xl text-display text-off-white">{question.prompt}</h2>
          {question.explanation ? <p className="mt-2 max-w-2xl text-body text-neutral">{question.explanation}</p> : null}
          <div className="mt-6">
            <QuestionField question={question} answers={com.answers} onChange={handleChange} />
          </div>
          <div className="mt-8 flex gap-3">
            <Button size="lg" onClick={handleContinue} disabled={!canContinue}>
              Continue <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : (
        // Reachable only if a chapter genuinely has zero visible questions
        // for the coach's current answers — every real chapter in the bank
        // is designed not to, but this is the honest, non-fabricated
        // fallback rather than a silently blank screen: it still always
        // offers a real way forward. In development, it also shows exactly
        // which chapter/answers produced the empty state so a future
        // regression is diagnosable instead of just "the page went blank."
        <div>
          <p className="text-body text-neutral">Nothing to ask here yet.</p>
          {process.env.NODE_ENV !== "production" ? (
            <pre className="mt-3 max-w-2xl overflow-x-auto rounded-[var(--radius-sm)] border border-dashed border-warning/40 bg-warning-soft p-3 text-xs text-warning-strong">
              {JSON.stringify({ chapterId, questionIndex, visibleQuestionCount: questions.length, answers: com.answers }, null, 2)}
            </pre>
          ) : null}
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
  chapterNumber,
  totalChapters,
  children,
  onBack,
  canGoBack,
}: {
  meta: { title: string; description: string };
  chapterNumber: number;
  totalChapters: number;
  children: React.ReactNode;
  onBack: () => void;
  canGoBack: boolean;
}) {
  return (
    <div className="mx-auto grid min-h-screen max-w-[1440px] grid-cols-[1fr_320px] gap-10 px-12 py-10">
      <div>
        <div className="mb-8 flex items-center gap-4">
          {canGoBack ? (
            <button type="button" onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full text-neutral hover:bg-accent-soft hover:text-accent-strong">
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
          ) : null}
          <div>
            <p className="text-label text-accent-strong">
              {meta.title} · {chapterNumber} of {totalChapters}
            </p>
            <div className="mt-1.5 flex gap-1">
              {Array.from({ length: totalChapters }, (_, i) => (
                <span key={i} className={`h-1 flex-1 rounded-full ${i < chapterNumber ? "bg-accent" : "bg-border"}`} />
              ))}
            </div>
          </div>
        </div>
        {children}
      </div>
      <LearningPanel />
    </div>
  );
}

function LearningPanel() {
  const com = useCoachOperatingModel();
  const summary = computeProgressSummary(com.answers);
  return (
    <aside className="sticky top-10 h-fit rounded-[var(--radius-lg)] border border-border-strong bg-charcoal p-5">
      <div className="flex items-center gap-2 text-label text-neutral">
        <Sparkles size={14} className="text-accent-strong" aria-hidden="true" />
        WHAT OPTIM IS LEARNING
      </div>
      <p className="mt-3 text-heading text-off-white">{summary.percentComplete}% of applicable questions answered</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="pc-segment h-full rounded-full bg-accent" style={{ width: `${summary.percentComplete}%` }} />
      </div>
      <p className="mt-3 text-meta text-neutral">
        {summary.answeredQuestions} of {summary.totalApplicableQuestions} questions apply to you — {ALL_CHAPTER_IDS_IN_ORDER.length} chapters total, some skip automatically based on your answers.
      </p>
    </aside>
  );
}
