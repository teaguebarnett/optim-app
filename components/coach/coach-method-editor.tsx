"use client";

// Gate 3.2 — Settings → Coaching method is the Coach Brain editor for a
// calibrated coach. Each methodology category is a tile: closed, it shows the
// same summary Settings always showed; open, it renders the SAME controls the
// calibration interview uses (CalibrationField over the canonical question
// bank), filtered by the same applicability rules. Edits stay in a local
// draft — nothing is saved until the coach reviews exactly what changed and
// confirms, which creates one new immutable method version
// (confirmMethodEditAction). Discarding drops the draft; the active method
// never changes on its own.

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { CalibrationField } from "@/components/coach-onboarding/v2/calibration-field";
import { ControlInput } from "@/components/coach-onboarding/v2/controls";
import { ChapterSummaryBody, STATUS_C_COPY } from "@/components/coach-onboarding/v2/calibration-summary";
import { LiveAiAuthorityPanel } from "@/components/coach/live-ai-authority-panel";
import { CALIBRATION_QUESTIONS, answerKeyOf, chapterMeta } from "@/lib/coach/calibration/questions";
import { editorChapters, editorQuestions, methodEditState, questionAnswerKeys, type MethodChange } from "@/lib/coach/calibration/settings-editor";
import { AI_AUTHORITY_LEVEL_LABELS, AI_AUTHORITY_LEVEL_LIVE_DESCRIPTIONS, type CoachAiAuthoritySettings } from "@/lib/coach/ai-authority";
import { confirmMethodEditAction } from "@/app/actions/coach-calibration";
import type { CalibrationAnswerValue, CalibrationAnswers, CalibrationChapterId, CalibrationQuestion } from "@/lib/coach/calibration/types";

const AUTHORITY = "ai_authority" as const;
type TileId = CalibrationChapterId;

export function CoachMethodEditor({
  activeAnswers,
  baseVersionId,
  version,
  authority,
  onSaved,
}: {
  activeAnswers: CalibrationAnswers;
  baseVersionId: string;
  version: number;
  authority: CoachAiAuthoritySettings;
  onSaved: (version: number, changed: number) => void;
}) {
  const [draft, setDraft] = useState<CalibrationAnswers>(activeAnswers);
  const [open, setOpen] = useState<TileId | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a confirm succeeds: the draft IS the new method until Settings
  // reloads with the new version (this editor then remounts).
  const [committed, setCommitted] = useState(false);

  const computed = useMemo(() => methodEditState(activeAnswers, draft), [activeAnswers, draft]);
  const edit = committed ? { ...computed, changes: [], needsInput: [], dirty: false, ready: false } : computed;
  const chapters = useMemo(() => editorChapters(draft), [draft]);
  const changedChapters = new Set(edit.changes.map((c) => c.chapter));
  const needsKeys = new Set(edit.needsInput.map((n) => n.key));
  const needsChapters = new Set(edit.needsInput.map((n) => n.chapter));

  // Leaving with unsaved method changes asks first.
  useEffect(() => {
    if (!edit.dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edit.dirty]);

  function onChange(key: string, value: CalibrationAnswerValue) {
    setError(null);
    setDraft((prev) => {
      const next: CalibrationAnswers = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function toggle(id: TileId) {
    const next = open === id ? null : id;
    setOpen(next);
    if (next) requestAnimationFrame(() => document.getElementById(`method-tile-${next}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function discard() {
    setDraft(activeAnswers);
    setReviewing(false);
    setError(null);
  }

  function startSave() {
    if (edit.invalid) return setError(`Check “${labelForKey(edit.invalid.key)}”: ${edit.invalid.message}`);
    if (edit.needsInput.length) {
      setError(null);
      document.getElementById("method-needs-input")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setReviewing(true);
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    const result = await confirmMethodEditAction({ answers: draft, baseVersionId });
    setSaving(false);
    if (!result.ok) {
      setReviewing(false);
      setError(result.message);
      return;
    }
    setReviewing(false);
    setCommitted(true);
    setOpen(null);
    onSaved(result.version, result.changed);
  }

  // Questions that own a setting needing input — shown on their own, so the
  // coach answers just those (never the whole interview).
  const neededQuestions = CALIBRATION_QUESTIONS.filter((q) => questionAnswerKeys(q).some((k) => needsKeys.has(k)));

  return (
    <div className="space-y-4">
      {edit.dirty && edit.needsInput.length > 0 ? (
        <section id="method-needs-input" className="scroll-mt-24 rounded-[var(--radius-lg)] border border-warning/40 bg-warning-soft/40 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-subheading text-off-white">
            <CircleAlert size={16} className="shrink-0 text-warning-strong" aria-hidden="true" />
            {edit.needsInput.length} setting{edit.needsInput.length === 1 ? " needs" : "s need"} your input before this update can be confirmed
          </p>
          <p className="mt-1 text-meta text-neutral">Your change makes these apply. OPTIM won’t guess them for you.</p>
          <div className="mt-5 space-y-6">
            {neededQuestions.map((q) => (
              <SettingField key={q.id} q={q} answers={draft} onChange={onChange} needsInput />
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-[var(--radius-sm)] border border-error/40 bg-error-soft/40 px-3 py-2 text-meta text-off-white">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {chapters.map((id) => {
          const isOpen = open === id;
          return (
            <section key={id} id={`method-tile-${id}`} className={`scroll-mt-24 rounded-[var(--radius-lg)] border bg-surface-raised ${isOpen ? "border-accent/40 lg:col-span-2" : "border-border-strong"}`}>
              <TileHeader title={chapterMeta(id)?.title ?? id} open={isOpen} onToggle={() => toggle(id)} edited={changedChapters.has(id)} needsInput={needsChapters.has(id)} controls={`method-tile-body-${id}`} />
              <div id={`method-tile-body-${id}`} className={isOpen ? "space-y-6 border-t border-border px-4 pb-5 pt-5 sm:px-5" : "px-4 pb-5 sm:px-5"}>
                {isOpen ? (
                  editorQuestions(id, draft).map((q) => <SettingField key={q.id} q={q} answers={draft} onChange={onChange} needsInput={questionAnswerKeys(q).some((k) => needsKeys.has(k))} />)
                ) : (
                  <div className="-mt-3">
                    <ChapterSummaryBody chapterId={id} answers={draft} />
                  </div>
                )}
              </div>
            </section>
          );
        })}

        <section id={`method-tile-${AUTHORITY}`} className={`scroll-mt-24 rounded-[var(--radius-lg)] border bg-surface-raised ${open === AUTHORITY ? "border-accent/40 lg:col-span-2" : "border-border-strong"}`}>
          <TileHeader title="AI coaching authority" open={open === AUTHORITY} onToggle={() => toggle(AUTHORITY)} controls="method-tile-body-authority" />
          <div id="method-tile-body-authority" className={open === AUTHORITY ? "border-t border-border px-4 pb-5 pt-5 sm:px-5" : "px-4 pb-5 sm:px-5"}>
            {open === AUTHORITY ? (
              <div className="space-y-3">
                <p className="text-meta text-neutral">How much you want OPTIM to take on for your clients. A change here is confirmed on its own and saved as a new version of your method.</p>
                {edit.dirty ? <p className="text-meta text-warning-strong">Save or discard your method changes first — then you can change OPTIM’s authority.</p> : null}
                <div inert={edit.dirty} className={edit.dirty ? "pointer-events-none opacity-50" : undefined}>
                  <LiveAiAuthorityPanel initialSettings={authority} />
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-3">
                <dt className="text-meta text-neutral">Level</dt>
                <dd className="text-body text-off-white">
                  {AI_AUTHORITY_LEVEL_LABELS[authority.global.level]} — {AI_AUTHORITY_LEVEL_LIVE_DESCRIPTIONS[authority.global.level]}
                </dd>
              </dl>
            )}
          </div>
        </section>
      </div>

      {edit.dirty ? <div aria-hidden="true" className="h-24" /> : null}

      {edit.dirty ? (
        <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-0 md:px-6 md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div role="region" aria-label="Unsaved method changes" className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-accent/30 bg-charcoal p-3 shadow-[var(--shadow-elevated)] sm:px-4">
            <p className="text-meta text-off-white">
              <strong>
                {edit.changes.length} unsaved change{edit.changes.length === 1 ? "" : "s"}
              </strong>{" "}
              to your method
              {edit.needsInput.length ? <span className="text-warning-strong"> · {edit.needsInput.length} need{edit.needsInput.length === 1 ? "s" : ""} your input</span> : null}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={discard} disabled={saving}>
                Discard
              </Button>
              <Button onClick={startSave} disabled={saving}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Sheet
        open={reviewing}
        onClose={() => (saving ? undefined : setReviewing(false))}
        title={`You changed ${edit.changes.length} setting${edit.changes.length === 1 ? "" : "s"}`}
        description={`Confirming saves this as version ${version + 1} of your method. Version ${version} stays in your history.`}
        footer={
          <div className="flex flex-wrap justify-end gap-2 p-4 pc-safe-bottom">
            <Button variant="secondary" onClick={() => setReviewing(false)} disabled={saving}>
              Keep editing
            </Button>
            <Button onClick={confirm} disabled={saving}>
              {saving ? "Saving…" : "Confirm and save"}
            </Button>
          </div>
        }
      >
        <ChangeList changes={edit.changes} />
      </Sheet>
    </div>
  );
}

function labelForKey(key: string): string {
  const q = CALIBRATION_QUESTIONS.flatMap((x) => (x.kind === "group" ? (x.parts ?? []) : [x])).find((x) => answerKeyOf(x) === key);
  return q?.summaryLabel ?? key;
}

function TileHeader({ title, open, onToggle, edited, needsInput, controls }: { title: string; open: boolean; onToggle: () => void; edited?: boolean; needsInput?: boolean; controls: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] px-4 py-4 text-left sm:px-5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-subheading text-off-white">{title}</span>
        {needsInput ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-strong">Needs input</span> : edited ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-fg">Edited</span> : null}
      </span>
      <span className="flex items-center gap-1.5 text-meta text-accent-fg">
        <span className="hidden sm:inline">{open ? "Done" : "Edit"}</span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ transitionDuration: "var(--motion-fast)" }} />
      </span>
    </button>
  );
}

/** One setting, edited with the same control calibration uses. */
function SettingField({ q, answers, onChange, needsInput }: { q: CalibrationQuestion; answers: CalibrationAnswers; onChange: (key: string, value: CalibrationAnswerValue) => void; needsInput?: boolean }) {
  const key = answerKeyOf(q);
  return (
    <div className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="mb-3">
        <p className="flex flex-wrap items-center gap-2 text-subheading text-off-white">
          {q.kind === "description" ? "Coaching areas" : q.summaryLabel}
          {!q.required ? <span className="text-meta font-normal text-neutral">Optional</span> : null}
          {needsInput ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-strong">Needs your input</span> : null}
        </p>
        {q.kind !== "description" && q.prompt !== q.summaryLabel ? <p className="mt-0.5 text-meta text-neutral">{q.prompt}</p> : null}
        {q.kind !== "description" && q.explanation ? <p className="mt-0.5 text-meta text-neutral">{q.explanation}</p> : null}
        {q.status === "C" ? <p className="mt-1 text-meta text-neutral">{STATUS_C_COPY}</p> : null}
      </div>
      {q.kind === "description" && q.control ? (
        <ControlInput id={q.id} control={q.control} value={answers[key]} onChange={(v) => onChange(key, v as CalibrationAnswerValue)} label="Coaching areas" />
      ) : (
        <CalibrationField question={q} answers={answers} onChange={onChange} />
      )}
    </div>
  );
}

function ChangeList({ changes }: { changes: MethodChange[] }) {
  const current = changes.filter((c) => c.kind !== "removed");
  const removed = changes.filter((c) => c.kind === "removed");
  return (
    <div className="space-y-5">
      {current.length > 0 ? (
        <ul className="space-y-3">
          {current.map((c) => (
            <li key={c.key} className="rounded-[var(--radius-md)] bg-surface px-3 py-2.5">
              <p className="text-meta font-semibold text-off-white">{c.label}</p>
              <p className="mt-0.5 text-meta text-neutral">
                <span className="line-through decoration-neutral/60">{c.before}</span> <span aria-hidden="true">→</span>
                <span className="sr-only">changes to</span> <span className="text-off-white">{c.after}</span>
              </p>
              {c.status === "C" ? <p className="mt-1 text-[11px] text-neutral">{STATUS_C_COPY}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {removed.length > 0 ? (
        <div>
          <p className="text-meta font-semibold text-off-white">No longer part of your method</p>
          <p className="mt-0.5 text-meta text-neutral">These stop applying with this update. They stay in your earlier versions.</p>
          <ul className="mt-2 space-y-1.5">
            {removed.map((c) => (
              <li key={c.key} className="text-meta text-neutral">
                {c.label}: <span className="text-off-white/80">{c.before}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
