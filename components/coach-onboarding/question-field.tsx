"use client";

import { useState } from "react";
import { OptionCard } from "@/components/ui/option-card";
import { TextArea } from "@/components/ui/textarea";
import { SCENARIO_DEPENDS_VALUE, type CoachOnboardingAnswerValue, type CoachOnboardingAnswers, type CoachOnboardingQuestionDef } from "@/lib/coach/coach-onboarding-questions";

/**
 * The one generic renderer for every coach-onboarding question type — the
 * same "a handful of reusable primitives, driven entirely by data" strategy
 * lib/coach/onboarding-steps.ts's client-facing OnboardingFieldInput
 * already uses, so ~65 real questions (see coach-onboarding-questions.ts)
 * never needed 65 bespoke components. `scenario` reuses multi_select's
 * OptionCard grid, plus SCENARIO_DEPENDS_VALUE's own one-field follow-up —
 * selection ORDER is the rank (see coach-onboarding-engine.ts's
 * buildAdjustmentPolicy: first-selected = preferredAction, the rest =
 * acceptableAlternatives), which is why toggling never re-sorts the array.
 */
export function QuestionField({
  question,
  answers,
  onChange,
}: {
  question: CoachOnboardingQuestionDef;
  answers: CoachOnboardingAnswers;
  onChange: (id: string, value: CoachOnboardingAnswerValue) => void;
}) {
  const value = answers[question.id];

  if (question.type === "boolean") {
    return (
      <div className="grid max-w-md grid-cols-2 gap-3">
        <OptionCard active={value === true} label="Yes" onClick={() => onChange(question.id, true)} />
        <OptionCard active={value === false} label="No" onClick={() => onChange(question.id, false)} />
      </div>
    );
  }

  if (question.type === "slider") {
    const min = question.min ?? 1;
    const max = question.max ?? 5;
    const current = typeof value === "number" ? value : Math.round((min + max) / 2);
    return (
      <div className="max-w-xl">
        <input
          type="range"
          min={min}
          max={max}
          step={question.step ?? 1}
          value={current}
          onChange={(e) => onChange(question.id, Number(e.target.value))}
          className="w-full accent-[var(--pc-accent)]"
          aria-label={question.prompt}
        />
        <div className="mt-2 flex justify-between text-meta text-neutral">
          <span>Less</span>
          <span className="text-heading text-accent-strong">{current}</span>
          <span>More</span>
        </div>
      </div>
    );
  }

  if (question.type === "text") {
    return (
      <div className="max-w-2xl">
        <TextArea
          id={question.id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(question.id, e.target.value)}
          placeholder={question.explanation ?? "Optional — leave blank if not applicable."}
          rows={3}
        />
      </div>
    );
  }

  if (question.type === "single_select") {
    const cols = (question.options?.length ?? 0) > 4 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2";
    return (
      <div className={`grid max-w-4xl grid-cols-1 gap-3 ${cols}`}>
        {(question.options ?? []).map((opt) => (
          <OptionCard key={opt.value} active={value === opt.value} label={opt.label} description={opt.description} icon={opt.icon} onClick={() => onChange(question.id, opt.value)} />
        ))}
      </div>
    );
  }

  // multi_select and scenario share the same selection mechanism.
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const capped = question.maxSelections !== undefined && selected.length >= question.maxSelections;

  const exclusiveValues = new Set((question.options ?? []).filter((o) => o.exclusive).map((o) => o.value));

  function toggle(optValue: string) {
    if (selected.includes(optValue)) {
      onChange(
        question.id,
        selected.filter((v) => v !== optValue)
      );
      return;
    }
    if (question.maxSelections !== undefined && selected.length >= question.maxSelections) return;
    // An exclusive option ("None"/"Never") can never coexist with any real
    // selection, in either direction: picking it clears everything else,
    // and picking anything else clears it.
    const next = exclusiveValues.has(optValue) ? [optValue] : [...selected.filter((v) => !exclusiveValues.has(v)), optValue];
    onChange(question.id, next);
  }

  const depends = selected.includes(SCENARIO_DEPENDS_VALUE);
  const cols = (question.options?.length ?? 0) > 4 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2";

  return (
    <div className="max-w-4xl">
      <div className={`grid grid-cols-1 gap-3 ${cols}`}>
        {(question.options ?? []).map((opt) => {
          const isSelected = selected.includes(opt.value);
          const isDisabled = !isSelected && capped && opt.value !== SCENARIO_DEPENDS_VALUE;
          const rank = question.type === "scenario" && isSelected && opt.value !== SCENARIO_DEPENDS_VALUE ? selected.filter((v) => v !== SCENARIO_DEPENDS_VALUE).indexOf(opt.value) + 1 : undefined;
          return (
            <OptionCard
              key={opt.value}
              active={isSelected}
              disabled={isDisabled}
              disabledReason={isDisabled ? `Limit of ${question.maxSelections} reached` : undefined}
              label={rank ? `${rank}. ${opt.label}` : opt.label}
              description={opt.description}
              icon={opt.icon}
              onClick={() => toggle(opt.value)}
            />
          );
        })}
      </div>
      {question.type === "scenario" && selected.length > 1 && !depends ? <p className="mt-2 text-meta text-neutral">Numbered in the order you selected — your first pick is the preferred action.</p> : null}
      {depends ? (
        <div className="mt-3">
          <ScenarioDependsDetail question={question} answers={answers} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

function ScenarioDependsDetail({ question, answers, onChange }: { question: CoachOnboardingQuestionDef; answers: CoachOnboardingAnswers; onChange: (id: string, value: CoachOnboardingAnswerValue) => void }) {
  const key = `${question.id}_depends_detail`;
  const [localValue, setLocalValue] = useState(typeof answers[key] === "string" ? (answers[key] as string) : "");
  return (
    <TextArea
      id={key}
      label="What does it depend on?"
      value={localValue}
      onChange={(e) => {
        setLocalValue(e.target.value);
        onChange(key, e.target.value);
      }}
      placeholder="e.g. Whether it's the client's first missed week or a recurring pattern."
      rows={2}
    />
  );
}
