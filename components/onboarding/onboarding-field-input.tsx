"use client";

import { TextField } from "@/components/ui/text-field";
import { TextArea } from "@/components/ui/textarea";
import { NumberWheel } from "@/components/ui/number-wheel";
import { OptionCard } from "@/components/ui/option-card";
import { cn } from "@/lib/cn";
import {
  isMultiSelectOptionDisabled,
  optionsForField,
  toggleMultiSelectValue,
  type OnboardingFieldDef,
} from "@/lib/coach/onboarding-steps";
import type { OnboardingAnswerValue, OnboardingStepAnswers } from "@/lib/coach/types";

/** injury_list is deliberately excluded — no live field uses it anymore
 * (see lib/coach/onboarding-steps.ts's LEGACY_V51_STEPS doc); it only ever
 * appears in an already-completed Phase 5.1 record, rendered read-only by
 * components/coach/coach-brief.tsx's own special-cased FieldRows, never
 * through this live-input renderer. Fields of type "height_feet_inches"
 * ARE live but handled directly by the wizard (see
 * components/onboarding/height-input.tsx) rather than here, since one
 * height field writes two separate answer keys (heightFeet,
 * heightInchesRemainder) at once — a shape this component's one-key/
 * one-onChange contract can't express. */
export type OnboardingFieldValue = Exclude<OnboardingAnswerValue, import("@/lib/coach/types").InjuryEntry[]>;

function fieldLabel(field: OnboardingFieldDef): string {
  if (field.required || field.label.trim().toLowerCase().endsWith("(optional)")) return field.label;
  return `${field.label} (optional)`;
}

function FieldHeading({ field }: { field: OnboardingFieldDef }) {
  const Icon = field.icon;
  return (
    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-off-white">
      {Icon ? <Icon size={15} className="shrink-0 text-neutral" aria-hidden="true" /> : null}
      {fieldLabel(field)}
    </p>
  );
}

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function DaySelector({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {DAY_ORDER.map((day) => {
        const active = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? value.filter((d) => d !== day) : [...value, day])}
            className={cn(
              "flex h-12 flex-col items-center justify-center rounded-[var(--radius-sm)] border-2 text-xs font-semibold uppercase transition-all active:scale-95",
              active
                ? "border-accent bg-selected-bg text-accent-strong shadow-[var(--shadow-subtle)]"
                : "border-border-strong bg-charcoal text-off-white shadow-[var(--shadow-subtle)] hover:border-accent/50"
            )}
            style={{ transitionDuration: "var(--motion-fast)" }}
          >
            {day.slice(0, 2)}
          </button>
        );
      })}
    </div>
  );
}

/** Renders whichever control lib/coach/onboarding-steps.ts's field type
 * calls for — including OPTIM's own wheel selector for numeric values (see
 * components/ui/number-wheel.tsx) — so the wizard itself never branches on
 * field type (except injury_list, handled separately — see this file's
 * OnboardingFieldValue doc). `answers` is the step's current answers bag —
 * needed only for multi_select's excludeValueOfField (see
 * lib/coach/onboarding-steps.ts's optionsForField); every other field type
 * ignores it. */
export function OnboardingFieldInput({
  field,
  value,
  answers,
  onChange,
}: {
  field: OnboardingFieldDef;
  value: OnboardingFieldValue;
  answers: OnboardingStepAnswers;
  onChange: (value: OnboardingFieldValue) => void;
}) {
  if (field.type === "height_feet_inches" || field.type === "injury_list" || field.type === "timezone_confirm") {
    // Never actually reached — the wizard renders these field types
    // through their own dedicated components before falling back to this
    // generic renderer for everything else (see this file's
    // OnboardingFieldValue doc). Guards against a silent single_select
    // mis-render if a future step definition ever forgets to special-case
    // one.
    return null;
  }

  if (field.type === "text") {
    return (
      <TextField
        id={field.key}
        label={fieldLabel(field)}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        required={field.required}
        helperText={field.helpText}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        <TextArea
          id={field.key}
          label={fieldLabel(field)}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
        />
        {field.helpText ? <p className="mt-1.5 text-xs text-neutral">{field.helpText}</p> : null}
      </div>
    );
  }

  if (field.type === "number_wheel") {
    const numeric = typeof value === "number" ? value : (field.min ?? 0);
    return (
      <div>
        <FieldHeading field={field} />
        <NumberWheel
          id={field.key}
          fieldLabel={field.label}
          value={numeric}
          onChange={onChange}
          min={field.min}
          max={field.max}
          step={field.step}
          unit={field.unit}
        />
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div>
        <FieldHeading field={field} />
        {field.helpText ? <p className="mb-2 text-xs text-neutral">{field.helpText}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <OptionCard active={value === true} label="Yes" onClick={() => onChange(true)} />
          <OptionCard active={value === false} label="No" onClick={() => onChange(false)} />
        </div>
      </div>
    );
  }

  if (field.type === "day_selector") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div>
        <FieldHeading field={field} />
        <DaySelector value={selected} onChange={onChange} />
        {selected.length > 0 ? (
          <p className="mt-1.5 text-meta text-neutral">
            {selected.length} {selected.length === 1 ? "day" : "days"}/week
          </p>
        ) : null}
      </div>
    );
  }

  if (field.type === "multi_select") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const options = optionsForField(field, answers);
    return (
      <div>
        <FieldHeading field={field} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            const disabled = isMultiSelectOptionDisabled(field, selected, opt.value);
            return (
              <OptionCard
                key={opt.value}
                active={isSelected}
                disabled={disabled}
                disabledReason={disabled ? `Limit of ${field.maxSelections} reached` : undefined}
                label={opt.label}
                description={opt.description}
                icon={opt.icon}
                onClick={() => onChange(toggleMultiSelectValue(field, selected, opt.value))}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // single_select
  const options = optionsForField(field, answers);
  return (
    <div>
      <FieldHeading field={field} />
      {field.helpText ? <p className="mb-1.5 text-xs text-neutral">{field.helpText}</p> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((opt) => (
          <OptionCard key={opt.value} active={value === opt.value} label={opt.label} description={opt.description} icon={opt.icon} onClick={() => onChange(opt.value)} />
        ))}
      </div>
    </div>
  );
}
