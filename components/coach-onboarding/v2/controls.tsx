"use client";

// Gate 3.1 — the reusable calibration controls. Every control reports a
// value only on an explicit coach action (tap, scroll settling, typing then
// "Set"); nothing displayed is ever saved as the coach's answer unless they
// act on it.

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { OptionCard } from "@/components/ui/option-card";
import { TextArea } from "@/components/ui/textarea";
import { NumberWheel } from "@/components/ui/number-wheel";
import { Button } from "@/components/ui/button";
import { buildStepRange } from "@/lib/numeric-wheel";
import { unitFitsInWheel, unitLabel } from "@/lib/coach/calibration/units";
import type { ChoiceOption, ControlSpec, NumberAnswer, NumberSpec, RangeAnswer } from "@/lib/coach/calibration/types";

const OTHER = "other:";

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

export function ChoiceGrid({
  options,
  value,
  mode,
  onChange,
  otherAllowed,
  maxSelections,
  name,
}: {
  options: ChoiceOption[];
  value: unknown;
  mode: "single" | "multi" | "ranked";
  onChange: (next: string | string[]) => void;
  otherAllowed?: boolean;
  maxSelections?: number;
  name: string;
}) {
  const [otherDraft, setOtherDraft] = useState("");
  const cols = options.length > 4 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2";

  if (mode === "single") {
    return (
      <div className={`grid max-w-4xl grid-cols-1 gap-3 ${cols}`} role="radiogroup" aria-label={name}>
        {options.map((opt) => (
          <OptionCard key={opt.value} active={value === opt.value} label={opt.label} description={opt.description} onClick={() => onChange(opt.value)} />
        ))}
      </div>
    );
  }

  const selected = Array.isArray(value) ? (value as string[]) : [];
  const exclusive = new Set(options.filter((o) => o.exclusive).map((o) => o.value));
  const capped = maxSelections !== undefined && selected.length >= maxSelections;
  const toggle = (v: string) => {
    if (selected.includes(v)) return onChange(selected.filter((x) => x !== v));
    if (capped) return;
    onChange(exclusive.has(v) ? [v] : [...selected.filter((x) => !exclusive.has(x)), v]);
  };
  const custom = selected.filter((v) => v.startsWith(OTHER));
  const addOther = () => {
    const label = otherDraft.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!label) return;
    const v = `${OTHER}${label}`;
    if (!selected.includes(v)) onChange([...selected.filter((x) => !exclusive.has(x)), v]);
    setOtherDraft("");
  };

  return (
    <div className="max-w-4xl">
      <div className={`grid grid-cols-1 gap-3 ${cols}`}>
        {options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          const rank = mode === "ranked" && isSelected ? selected.indexOf(opt.value) + 1 : undefined;
          return (
            <OptionCard
              key={opt.value}
              active={isSelected}
              disabled={!isSelected && capped}
              disabledReason={!isSelected && capped ? `Limit of ${maxSelections} reached` : undefined}
              label={rank ? `${rank}. ${opt.label}` : opt.label}
              description={opt.description}
              onClick={() => toggle(opt.value)}
            />
          );
        })}
      </div>
      {mode === "ranked" && selected.length > 1 ? <p className="mt-2 text-meta text-neutral">Numbered in the order you chose — your first pick comes first.</p> : null}
      {otherAllowed ? (
        <div className="mt-4">
          {custom.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {custom.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-accent-soft px-2.5 py-1 text-meta text-accent-fg">
                  {c.slice(OTHER.length)}
                  <button type="button" aria-label={`Remove ${c.slice(OTHER.length)}`} onClick={() => onChange(selected.filter((x) => x !== c))} className="rounded-full p-0.5 hover:bg-accent/15">
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex max-w-md items-center gap-2">
            <input
              type="text"
              value={otherDraft}
              onChange={(e) => setOtherDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOther();
                }
              }}
              placeholder="Other — type it in"
              aria-label="Add another option"
              className="min-h-11 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface-input px-3 text-body text-off-white placeholder:text-neutral/70"
            />
            <Button type="button" variant="secondary" onClick={addOther} disabled={!otherDraft.trim()}>
              <Plus size={14} aria-hidden="true" /> Add
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple controls
// ---------------------------------------------------------------------------

export function BooleanChoice({ value, onChange, yesLabel = "Yes", noLabel = "No" }: { value: unknown; onChange: (v: boolean) => void; yesLabel?: string; noLabel?: string }) {
  return (
    <div className="grid max-w-md grid-cols-2 gap-3">
      <OptionCard active={value === true} label={yesLabel} onClick={() => onChange(true)} />
      <OptionCard active={value === false} label={noLabel} onClick={() => onChange(false)} />
    </div>
  );
}

export function ScaleInput({ value, onChange, min, max, minLabel, maxLabel, label }: { value: unknown; onChange: (v: number) => void; min: number; max: number; minLabel: string; maxLabel: string; label: string }) {
  const answered = typeof value === "number";
  const current = answered ? (value as number) : Math.round((min + max) / 2);
  return (
    <div className="max-w-xl">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${max - min + 1}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={answered && current === n}
            onClick={() => onChange(n)}
            className={`min-h-11 rounded-[var(--radius-sm)] border text-body font-semibold transition-colors ${answered && current === n ? "border-accent bg-accent text-on-accent" : "border-border-strong bg-surface-raised text-off-white hover:border-accent/60"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-meta text-neutral">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export function TextAnswer({ id, value, onChange, placeholder, multiline = true }: { id: string; value: unknown; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <div className="max-w-2xl">
      <TextArea id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={multiline ? 3 : 1} />
    </div>
  );
}

export function TagsInput({ value, onChange, placeholder, label }: { value: unknown; onChange: (v: string[]) => void; placeholder?: string; label: string }) {
  const tags = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(/[,;\n]/)
      .map((x) => x.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    onChange([...new Set([...tags, ...parts])]);
    setDraft("");
  };
  return (
    <div className="max-w-2xl">
      {tags.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-surface-raised px-2.5 py-1.5 text-meta text-off-white">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded-full p-0.5 text-neutral hover:text-off-white">
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          className="min-h-11 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface-input px-3 text-body text-off-white placeholder:text-neutral/70"
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}>
          <Plus size={14} aria-hidden="true" /> Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

function snap(n: number, step: number): number {
  return Math.round(n / step) * step;
}
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
function startValue(spec: NumberSpec): number {
  return snap(spec.min + (spec.max - spec.min) / 3, spec.step);
}

/** "From (minutes)" — the unit sits right above the wheel it describes. */
function WheelHeading({ prefix, unit }: { prefix?: string; unit: string }) {
  const label = unitLabel(unit);
  return (
    <p className="mb-1.5 text-meta font-medium text-neutral">
      {prefix ? (
        <>
          {prefix} <span className="text-off-white">({label})</span>
        </>
      ) : (
        <span className="text-off-white">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
      )}
    </p>
  );
}

/** A wheel whose bounds the coach can extend, plus a typed fallback for any
 * value. The wheel's bounds are a convenience — never a limit — and its step
 * is a scrolling shortcut, never a precision limit: a typed value between
 * steps (22 on a 5-minute wheel) is shown exactly. */
function ExpandableWheel({ id, label, prefix, spec, value, onSet }: { id: string; label: string; prefix?: string; spec: NumberSpec; value: number; onSet: (n: number) => void }) {
  const span = spec.max - spec.min;
  const [lo, setLo] = useState(Math.min(spec.min, value));
  const [hi, setHi] = useState(Math.max(spec.max, value));
  const canLower = spec.hardMin === undefined || lo > spec.hardMin;
  const canRaise = spec.hardMax === undefined || hi < spec.hardMax;
  const grid = buildStepRange(lo, hi, spec.step);
  const values = grid.some((v) => Math.abs(v - value) < 1e-9) ? grid : [...grid, value].sort((a, b) => a - b);
  return (
    <div className="min-w-0 flex-1">
      <WheelHeading prefix={prefix} unit={spec.unit} />
      <NumberWheel key={`${lo}-${hi}`} id={id} fieldLabel={`${label} (${unitLabel(spec.unit)})`} value={value} onChange={onSet} values={values} unit={unitFitsInWheel(spec.unit) ? spec.unit : undefined} formatValue={fmt} />
      <div className="mt-1.5 flex justify-between gap-2">
        <button type="button" disabled={!canLower} onClick={() => setLo(Math.max(spec.hardMin ?? -Infinity, snap(lo - Math.max(spec.step, span / 2), spec.step)))} className="min-h-9 text-meta text-accent-fg underline-offset-2 hover:underline disabled:invisible">
          Lower…
        </button>
        <button type="button" disabled={!canRaise} onClick={() => setHi(Math.min(spec.hardMax ?? Infinity, snap(hi + Math.max(spec.step, span / 2), spec.step)))} className="min-h-9 text-meta text-accent-fg underline-offset-2 hover:underline">
          Higher…
        </button>
      </div>
    </div>
  );
}

/** Type any value; outside the usual range asks once before keeping it. */
function TypedNumber({ spec, label, onSet }: { spec: NumberSpec; label: string; onSet: (n: number) => void }) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n)) return setError("Enter a number.");
    if ((spec.hardMin !== undefined && n < spec.hardMin) || (spec.hardMax !== undefined && n > spec.hardMax)) return setError("That number isn't possible here.");
    setError(null);
    if (n < spec.min || n > spec.max) return setPending(n);
    onSet(n);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setPending(null);
          }}
          aria-label={label}
          className="min-h-11 w-28 rounded-[var(--radius-sm)] border border-border-strong bg-surface-input px-3 text-body text-off-white"
        />
        <span className="text-meta text-off-white">{unitLabel(spec.unit)}</span>
        <Button type="button" variant="secondary" onClick={submit}>
          Set
        </Button>
      </div>
      {error ? <p className="mt-1 text-meta text-error-strong">{error}</p> : null}
      {pending !== null ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-3 py-2 text-meta text-warning-strong">
          <span>
            {fmt(pending)} {unitLabel(spec.unit)} is outside the usual range — keep it?
          </span>
          <button
            type="button"
            className="font-semibold underline-offset-2 hover:underline"
            onClick={() => {
              onSet(pending);
              setPending(null);
              setDraft("");
            }}
          >
            Keep it
          </button>
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => setPending(null)}>
            Change
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function NumberAnswerInput({ id, spec, value, onChange, label }: { id: string; spec: NumberSpec; value: unknown; onChange: (v: NumberAnswer) => void; label: string }) {
  const current = value && typeof value === "object" && typeof (value as NumberAnswer).value === "number" ? (value as NumberAnswer) : null;
  const shown = current?.value ?? startValue(spec);
  const [typing, setTyping] = useState(false);
  const set = (n: number) => onChange({ value: n, unit: spec.unit });
  return (
    <div className="max-w-sm">
      <ExpandableWheel key={`${id}-${spec.min}-${spec.max}-${spec.unit}-${shown}`} id={id} label={label} spec={spec} value={shown} onSet={set} />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-meta">
        {!current ? (
          <Button type="button" variant="secondary" onClick={() => set(shown)}>
            Use {fmt(shown)} {unitLabel(spec.unit)}
          </Button>
        ) : (
          <span className="text-neutral">
            Set to <strong className="text-off-white">{fmt(current.value)} {unitLabel(spec.unit)}</strong>
          </span>
        )}
        <button type="button" onClick={() => setTyping((t) => !t)} className="min-h-9 text-accent-fg underline-offset-2 hover:underline">
          {typing ? "Hide" : "Type a value"}
        </button>
      </div>
      {typing ? (
        <div className="mt-2">
          <TypedNumber spec={spec} label={`${label} (${spec.unit})`} onSet={set} />
        </div>
      ) : null}
    </div>
  );
}

export function RangeAnswerInput({ id, spec, value, onChange, label }: { id: string; spec: NumberSpec; value: unknown; onChange: (v: RangeAnswer) => void; label: string }) {
  const current = value && typeof value === "object" && typeof (value as RangeAnswer).min === "number" ? (value as RangeAnswer) : null;
  const from = current?.min ?? startValue(spec);
  const to = current ? current.max : snap(spec.min + ((spec.max - spec.min) * 2) / 3, spec.step);
  const openMax = current ? current.max === null : false;
  const [typing, setTyping] = useState(false);
  const [showPreferred, setShowPreferred] = useState(current?.preferred !== undefined);

  const commit = (next: { min: number; max: number | null; preferred?: number }) => {
    let { min, max } = next;
    if (max !== null && min > max) [min, max] = [max, min];
    const preferred = next.preferred !== undefined && next.preferred >= min && (max === null || next.preferred <= max) ? next.preferred : undefined;
    onChange({ min, max, unit: spec.unit, ...(preferred !== undefined ? { preferred } : {}) });
  };
  const base = { min: from, max: openMax ? null : (to ?? from), preferred: current?.preferred };

  return (
    <div className="max-w-lg">
      {/* Bottom-aligned so a heading that wraps ("From (% of bodyweight/week)")
          never pushes one wheel out of line with the other. */}
      <div className="flex items-end gap-4">
        <ExpandableWheel key={`${id}-from-${spec.min}-${spec.max}-${spec.unit}-${from}`} id={`${id}-from`} label={`${label} from`} prefix="From" spec={spec} value={from} onSet={(n) => commit({ ...base, min: n })} />
        {openMax ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <WheelHeading prefix="To" unit={spec.unit} />
            <div className="flex flex-1 items-center justify-center rounded-[var(--radius-md)] bg-surface px-3 text-body text-off-white">or more</div>
          </div>
        ) : (
          <ExpandableWheel key={`${id}-to-${spec.min}-${spec.max}-${spec.unit}-${to ?? from}`} id={`${id}-to`} label={`${label} to`} prefix="To" spec={spec} value={to ?? from} onSet={(n) => commit({ ...base, max: n })} />
        )}
      </div>
      <p className="mt-2 text-meta text-neutral">The same number twice means a single value.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-meta">
        {!current ? (
          <Button type="button" variant="secondary" onClick={() => commit(base)}>
            Use {fmt(base.min)}
            {base.max === null ? "+" : base.max !== base.min ? `–${fmt(base.max)}` : ""} {unitLabel(spec.unit)}
          </Button>
        ) : (
          <span className="text-neutral">
            Set to{" "}
            <strong className="text-off-white">
              {fmt(current.min)}
              {current.max === null ? "+" : current.max !== current.min ? `–${fmt(current.max)}` : ""} {unitLabel(spec.unit)}
            </strong>
          </span>
        )}
        {spec.allowOpenMax ? (
          <label className="inline-flex min-h-9 items-center gap-2 text-off-white">
            <input type="checkbox" checked={openMax} onChange={(e) => commit({ ...base, max: e.target.checked ? null : (to ?? from) })} className="h-4 w-4 accent-[var(--pc-accent)]" />
            No upper limit
          </label>
        ) : null}
        <button type="button" onClick={() => setTyping((t) => !t)} className="min-h-9 text-accent-fg underline-offset-2 hover:underline">
          {typing ? "Hide" : "Type values"}
        </button>
      </div>
      {typing ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-2 sm:gap-x-6">
          <div>
            <p className="mb-1 text-meta text-neutral">From</p>
            <TypedNumber spec={spec} label={`${label} from`} onSet={(n) => commit({ ...base, min: n })} />
          </div>
          {!openMax ? (
            <div>
              <p className="mb-1 text-meta text-neutral">To</p>
              <TypedNumber spec={spec} label={`${label} to`} onSet={(n) => commit({ ...base, max: n })} />
            </div>
          ) : null}
        </div>
      ) : null}
      {spec.allowPreferred && current ? (
        <div className="mt-4 border-t border-border pt-3">
          {!showPreferred ? (
            <button type="button" onClick={() => setShowPreferred(true)} className="min-h-9 text-meta text-accent-fg underline-offset-2 hover:underline">
              I usually aim for a specific value in this range
            </button>
          ) : (
            <div>
              <p className="mb-1 text-meta text-neutral">Usual value (optional)</p>
              <div className="flex flex-wrap items-center gap-3">
                <TypedNumber spec={{ ...spec, min: current.min, max: current.max ?? spec.max }} label={`${label} usual value`} onSet={(n) => commit({ ...base, preferred: n })} />
                {current.preferred !== undefined ? (
                  <span className="text-meta text-neutral">
                    Usually <strong className="text-off-white">{fmt(current.preferred)} {unitLabel(spec.unit)}</strong> ·{" "}
                    <button type="button" onClick={() => commit({ min: current.min, max: current.max })} className="text-accent-fg underline-offset-2 hover:underline">
                      Remove
                    </button>
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function ControlInput({ id, control, value, onChange, label }: { id: string; control: ControlSpec; value: unknown; onChange: (v: unknown) => void; label: string }) {
  switch (control.kind) {
    case "single":
      return <ChoiceGrid name={label} options={control.options} value={value} mode="single" onChange={onChange} />;
    case "multi":
      return <ChoiceGrid name={label} options={control.options} value={value} mode="multi" onChange={onChange} otherAllowed={control.otherAllowed} />;
    case "ranked":
      return <ChoiceGrid name={label} options={control.options} value={value} mode="ranked" onChange={onChange} maxSelections={control.maxSelections} />;
    case "boolean":
      return <BooleanChoice value={value} onChange={onChange} yesLabel={control.yesLabel} noLabel={control.noLabel} />;
    case "scale":
      return <ScaleInput value={value} onChange={onChange} min={control.min} max={control.max} minLabel={control.minLabel} maxLabel={control.maxLabel} label={label} />;
    case "text":
      return <TextAnswer id={id} value={value} onChange={onChange} placeholder={control.placeholder} multiline={control.multiline !== false} />;
    case "tags":
      return <TagsInput value={value} onChange={onChange} placeholder={control.placeholder} label={label} />;
    case "number":
      return <NumberAnswerInput id={id} spec={control.spec} value={value} onChange={onChange} label={label} />;
    case "range":
      return <RangeAnswerInput id={id} spec={control.spec} value={value} onChange={onChange} label={label} />;
  }
}
