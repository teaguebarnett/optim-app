"use client";

// Gate 3.1 — the coach's v2 method at a glance (Review + Settings). Each
// area shows what OPTIM uses, and separately what it only records for
// future use. Unanswered optional detail reads "Not set — OPTIM will ask
// you"; nothing is shown as a coach rule unless the coach gave it.

import { Pencil } from "lucide-react";
import { CALIBRATION_CHAPTERS, CALIBRATION_QUESTIONS } from "@/lib/coach/calibration/questions";
import { buildCalibrationContext, isApplicable, isQuestionAnswered, visibleParts } from "@/lib/coach/calibration/engine";
import { formatCalibrationAnswer } from "@/lib/coach/calibration/format";
import type { CalibrationAnswers, CalibrationChapterId, CalibrationQuestion } from "@/lib/coach/calibration/types";

const SUMMARY_SKIP = new Set<CalibrationChapterId>(["ai_authority", "review"]);
export const STATUS_C_COPY = "Recorded for future use — OPTIM doesn't act on this yet.";

function rows(q: CalibrationQuestion, answers: CalibrationAnswers): { label: string; value: string; status: CalibrationQuestion["status"]; answered: boolean }[] {
  const ctx = buildCalibrationContext(answers);
  if (q.kind === "group") return visibleParts(q, ctx).map((p) => ({ label: p.summaryLabel, value: formatCalibrationAnswer(p, answers, ctx), status: p.status, answered: isQuestionAnswered(p, answers, ctx) }));
  return [{ label: q.summaryLabel, value: formatCalibrationAnswer(q, answers, ctx), status: q.status, answered: isQuestionAnswered(q, answers, ctx) }];
}

export function CalibrationSummary({ answers, onEditChapter, className = "" }: { answers: CalibrationAnswers; onEditChapter?: (chapter: CalibrationChapterId) => void; className?: string }) {
  const ctx = buildCalibrationContext(answers);
  const chapters = CALIBRATION_CHAPTERS.filter((c) => !SUMMARY_SKIP.has(c.id));
  return (
    <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${className}`}>
      {chapters.map((chapter) => {
        const questions = CALIBRATION_QUESTIONS.filter((q) => q.chapter === chapter.id && isApplicable(q, ctx));
        if (questions.length === 0) return null;
        const all = questions.flatMap((q) => rows(q, answers));
        const used = all.filter((r) => r.status !== "C" && (r.answered || chapter.id !== "situations"));
        const recorded = all.filter((r) => r.status === "C" && r.answered);
        const unansweredOptional = all.filter((r) => r.status === "C" && !r.answered).length;
        if (used.length === 0 && recorded.length === 0 && chapter.id === "situations") {
          return (
            <section key={chapter.id} className="rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised p-5">
              <SectionHeader title={chapter.title} onEdit={onEditChapter ? () => onEditChapter(chapter.id) : undefined} />
              <p className="mt-3 text-meta text-neutral">Not set — when these situations come up, OPTIM will ask you.</p>
            </section>
          );
        }
        return (
          <section key={chapter.id} className="rounded-[var(--radius-lg)] border border-border-strong bg-surface-raised p-5">
            <SectionHeader title={chapter.title} onEdit={onEditChapter ? () => onEditChapter(chapter.id) : undefined} />
            {used.length > 0 ? (
              <dl className="mt-3 space-y-2">
                {used.map((r) => (
                  <div key={r.label} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-3">
                    <dt className="text-meta text-neutral">{r.label}</dt>
                    <dd className={`text-body ${r.answered ? "text-off-white" : "text-neutral"}`}>{r.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {recorded.length > 0 ? (
              <div className={used.length > 0 ? "mt-4 border-t border-border pt-3" : "mt-3"}>
                <p className="text-meta font-medium text-neutral">{STATUS_C_COPY}</p>
                <dl className="mt-2 space-y-2">
                  {recorded.map((r) => (
                    <div key={r.label} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-3">
                      <dt className="text-meta text-neutral">{r.label}</dt>
                      <dd className="text-body text-off-white/90">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {unansweredOptional > 0 && chapter.id !== "situations" ? <p className="mt-3 text-meta text-neutral">{unansweredOptional} optional detail{unansweredOptional === 1 ? "" : "s"} not set — OPTIM will ask you.</p> : null}
          </section>
        );
      })}
    </div>
  );
}

function SectionHeader({ title, onEdit }: { title: string; onEdit?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-subheading text-off-white">{title}</h3>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="flex min-h-9 shrink-0 items-center gap-1 text-meta text-accent-fg hover:underline">
          <Pencil size={12} aria-hidden="true" /> Edit
        </button>
      ) : null}
    </div>
  );
}
