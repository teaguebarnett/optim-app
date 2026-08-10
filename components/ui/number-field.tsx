"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | "";
  onChange: (value: number | "") => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  placeholder?: string;
  helperText?: string;
  errorText?: string;
  className?: string;
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  placeholder,
  helperText,
  errorText,
  className,
}: NumberFieldProps) {
  const numeric = value === "" ? null : value;

  function clamp(n: number): number {
    let out = n;
    if (min !== undefined) out = Math.max(min, out);
    if (max !== undefined) out = Math.min(max, out);
    return out;
  }

  function adjust(delta: number) {
    const base = numeric ?? min ?? 0;
    onChange(clamp(Math.round((base + delta) * 100) / 100));
  }

  return (
    <div className={cn("w-full", className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-off-white">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => adjust(-step)}
          aria-label={`Decrease ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-strong text-off-white hover:border-accent/50 active:scale-95"
        >
          <Minus size={16} />
        </button>
        <div className="relative flex-1">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange("");
                return;
              }
              const parsed = Number(raw);
              if (Number.isNaN(parsed)) return;
              onChange(parsed);
            }}
            className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-center text-base text-off-white outline-none focus-visible:border-accent"
            aria-describedby={helperText ? `${id}-help` : undefined}
            aria-invalid={!!errorText}
          />
          {suffix ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral">
              {suffix}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => adjust(step)}
          aria-label={`Increase ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-strong text-off-white hover:border-accent/50 active:scale-95"
        >
          <Plus size={16} />
        </button>
      </div>
      {errorText ? (
        <p className="mt-1.5 text-xs text-error">{errorText}</p>
      ) : helperText ? (
        <p id={`${id}-help`} className="mt-1.5 text-xs text-neutral">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
