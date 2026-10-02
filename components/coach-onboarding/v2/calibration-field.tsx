"use client";

// Gate 3.1 — renders one v2 calibration question: a control, a layered
// "base rule → does it vary? → exceptions" question, a scenario (with the
// condition builder only when the coach says it depends), a group of parts,
// or a read-only safety policy with optional stricter rules.

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { ControlInput } from "@/components/coach-onboarding/v2/controls";
import { ConditionBuilder } from "@/components/coach-onboarding/v2/condition-builder";
import { OptionCard } from "@/components/ui/option-card";
import { buildCalibrationContext, controlFor, visibleParts } from "@/lib/coach/calibration/engine";
import { scenarioActionsFor } from "@/lib/coach/calibration/validate";
import { answerKeyOf } from "@/lib/coach/calibration/questions";
import type { CalibrationAnswers, CalibrationAnswerValue, CalibrationQuestion, DecisionPolicy, LayeredAnswer } from "@/lib/coach/calibration/types";

type OnChange = (key: string, value: CalibrationAnswerValue) => void;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function CalibrationField({ question, answers, onChange }: { question: CalibrationQuestion; answers: CalibrationAnswers; onChange: OnChange }) {
  const ctx = buildCalibrationContext(answers);
  const key = answerKeyOf(question);
  const value = answers[key];

  if (isObj(value) && value.notApplicable === true) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] bg-surface px-4 py-3 text-body text-off-white">
        Marked as doesn&apos;t apply to how you coach.
        <button type="button" onClick={() => onChange(key, undefined)} className="min-h-9 text-meta font-semibold text-accent-fg underline-offset-2 hover:underline">
          Undo
        </button>
      </div>
    );
  }

  let body: React.ReactNode = null;
  switch (question.kind) {
    case "control": {
      const control = controlFor(question, ctx);
      body = control ? <ControlInput id={question.id} control={control} value={value} onChange={(v) => onChange(key, v as CalibrationAnswerValue)} label={question.prompt} /> : null;
      break;
    }
    case "layered":
      body = <LayeredField question={question} answers={answers} onChange={onChange} />;
      break;
    case "scenario":
      body = <ScenarioField question={question} answers={answers} onChange={onChange} />;
      break;
    case "group":
      body = (
        <div className="space-y-7">
          {visibleParts(question, ctx).map((part) => (
            <div key={part.id}>
              <p className="mb-1 text-subheading text-off-white">
                {part.prompt}
                {!part.required ? <span className="ml-2 text-meta font-normal text-neutral">Optional</span> : null}
              </p>
              {part.explanation ? <p className="mb-3 text-meta text-neutral">{part.explanation}</p> : null}
              <div className="mt-2">
                <CalibrationField question={part} answers={answers} onChange={onChange} />
              </div>
            </div>
          ))}
        </div>
      );
      break;
    case "policy":
      body = <PolicyField question={question} answers={answers} onChange={onChange} />;
      break;
    default:
      body = null;
  }

  return (
    <div>
      {body}
      {question.allowNotApplicable ? (
        <button type="button" onClick={() => onChange(key, { notApplicable: true })} className="mt-4 min-h-9 text-meta text-neutral underline-offset-2 hover:text-accent-fg hover:underline">
          This doesn&apos;t apply to how I coach
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layered: base rule → does it vary? → exceptions
// ---------------------------------------------------------------------------

function LayeredField({ question, answers, onChange }: { question: CalibrationQuestion; answers: CalibrationAnswers; onChange: OnChange }) {
  const ctx = buildCalibrationContext(answers);
  const key = answerKeyOf(question);
  const control = controlFor(question, ctx);
  const raw = answers[key];
  const value: LayeredAnswer | null = isObj(raw) && "base" in raw ? (raw as unknown as LayeredAnswer) : null;
  const dims = question.variesBy ? question.variesBy(ctx).filter((d) => d.id !== "day_count" || d.keys.length > 1) : [];
  const varies = value?.varies ?? "no";
  const dim = dims.find((d) => d.id === varies);
  const exceptions = value?.exceptions ?? {};
  if (!control) return null;

  const setBase = (base: unknown) => onChange(key, { base: base as LayeredAnswer["base"], varies, ...(dim && Object.keys(exceptions).length ? { exceptions } : {}) });
  const setVaries = (v: string) => value && onChange(key, { base: value.base, varies: v });
  const setException = (k: string, v: unknown) => value && onChange(key, { base: value.base, varies, exceptions: { ...exceptions, [k]: v as LayeredAnswer["base"] } });
  const removeException = (k: string) => {
    if (!value) return;
    const next = { ...exceptions };
    delete next[k];
    onChange(key, { base: value.base, varies, ...(Object.keys(next).length ? { exceptions: next } : {}) });
  };

  return (
    <div>
      <ControlInput id={question.id} control={control} value={value?.base} onChange={setBase} label={question.prompt} />
      {value && dims.length > 0 ? (
        <div className="mt-7 border-t border-border pt-5">
          <p className="text-subheading text-off-white">Does this change for some clients or situations?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip on={varies === "no"} onClick={() => setVaries("no")}>
              No — always this
            </Chip>
            {dims.map((d) => (
              <Chip key={d.id} on={varies === d.id} onClick={() => setVaries(d.id)}>
                {d.label}
              </Chip>
            ))}
          </div>
          {dim && dim.keys.length === 0 ? <p className="mt-3 text-meta text-neutral">OPTIM shifts within your range across program phases.</p> : null}
          {dim && dim.keys.length > 0 ? (
            <div className="mt-4 space-y-4">
              <p className="text-meta text-neutral">Add an exception only where your rule is different. Everything else uses your base rule.</p>
              {dim.keys
                .filter((k) => exceptions[k.value] !== undefined)
                .map((k) => (
                  <div key={k.value} className="rounded-[var(--radius-md)] border border-border-strong p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-meta font-semibold text-off-white">{k.label}</p>
                      <button type="button" aria-label={`Remove exception for ${k.label}`} onClick={() => removeException(k.value)} className="rounded-full p-1.5 text-neutral hover:text-off-white">
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                    <ControlInput id={`${question.id}-${k.value}`} control={control} value={exceptions[k.value]} onChange={(v) => setException(k.value, v)} label={`${question.prompt} — ${k.label}`} />
                  </div>
                ))}
              <div className="flex flex-wrap gap-2">
                {dim.keys
                  .filter((k) => exceptions[k.value] === undefined)
                  .map((k) => (
                    <button key={k.value} type="button" onClick={() => setException(k.value, value.base)} className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-sm)] border border-dashed border-border-strong px-3 text-meta text-neutral hover:border-accent hover:text-accent-fg">
                      <Plus size={13} aria-hidden="true" /> {k.label}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`min-h-11 rounded-[var(--radius-sm)] border px-3 text-meta font-medium transition-colors ${on ? "border-accent bg-accent-soft text-accent-fg" : "border-border-strong text-off-white hover:border-accent/60"}`}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Scenario: what you'd usually do → does it depend? → conditions
// ---------------------------------------------------------------------------

function ScenarioField({ question, answers, onChange }: { question: CalibrationQuestion; answers: CalibrationAnswers; onChange: OnChange }) {
  const ctx = buildCalibrationContext(answers);
  const key = answerKeyOf(question);
  const spec = question.scenario!;
  const actions = scenarioActionsFor(question, ctx);
  const raw = answers[key];
  const policy: DecisionPolicy | null = isObj(raw) && (raw.mode === "single" || raw.mode === "conditional") ? (raw as unknown as DecisionPolicy) : null;
  const [depends, setDepends] = useState(policy?.mode === "conditional");
  const v1Note = isObj(answers.__v1Notes) ? (answers.__v1Notes as Record<string, string>)[key] : undefined;
  const selected = policy?.mode === "single" ? (policy.actions ?? []) : [];

  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : spec.allowFallbacks ? [...selected, v] : [v];
    onChange(key, next.length ? { mode: "single", actions: next } : undefined);
  };

  return (
    <div className="max-w-4xl">
      {v1Note ? <p className="mb-4 rounded-[var(--radius-sm)] bg-surface px-3 py-2 text-meta text-neutral">Your earlier note: “{v1Note}”</p> : null}
      {!depends ? (
        <>
          <div className={`grid grid-cols-1 gap-3 ${actions.length > 4 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"}`}>
            {actions.map((a) => {
              const rank = selected.indexOf(a.value) + 1;
              return <OptionCard key={a.value} active={rank > 0} label={rank > 0 && spec.allowFallbacks && selected.length > 1 ? `${rank}. ${a.label}` : a.label} onClick={() => toggle(a.value)} />;
            })}
          </div>
          {spec.allowFallbacks && selected.length > 1 ? <p className="mt-2 text-meta text-neutral">Numbered in the order you’d try them.</p> : null}
        </>
      ) : null}
      {spec.allowDepends && actions.length > 0 && spec.factors.length > 0 ? (
        <div className="mt-6 border-t border-border pt-5">
          <p className="text-subheading text-off-white">Does that change depending on the situation?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip
              on={!depends}
              onClick={() => {
                setDepends(false);
                if (policy?.mode === "conditional") onChange(key, undefined);
              }}
            >
              No — that’s what I do
            </Chip>
            <Chip on={depends} onClick={() => setDepends(true)}>
              It depends
            </Chip>
          </div>
          {depends ? (
            <div className="mt-4">
              <ConditionBuilder spec={spec} actions={actions} value={policy?.mode === "conditional" ? policy : null} onChange={(p) => onChange(key, p)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Safety policy: minimums (read-only) + stricter rules
// ---------------------------------------------------------------------------

function PolicyField({ question, answers, onChange }: { question: CalibrationQuestion; answers: CalibrationAnswers; onChange: OnChange }) {
  const key = answerKeyOf(question);
  const raw = answers[key];
  const stricter = isObj(raw) && Array.isArray(raw.stricter) ? (raw.stricter as string[]) : [];
  const policy = question.policy!;
  return (
    <div className="max-w-3xl">
      <ul className="space-y-2.5">
        {policy.statements.map((s) => (
          <li key={s} className="flex items-start gap-2.5 text-body text-off-white">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <Check size={12} aria-hidden="true" />
            </span>
            {s}
          </li>
        ))}
      </ul>
      {policy.stricter.length > 0 ? (
        <div className="mt-6 border-t border-border pt-5">
          <p className="text-subheading text-off-white">Add a stricter rule (optional)</p>
          <div className="mt-3 grid gap-3">
            {policy.stricter.map((o) => {
              const on = stricter.includes(o.value);
              return <OptionCard key={o.value} active={on} label={o.label} onClick={() => onChange(key, { stricter: on ? stricter.filter((x) => x !== o.value) : [...stricter, o.value] })} />;
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
