"use client";

import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The one reusable selectable-option tile — promoted out of onboarding
 * (where it started as a private OptionTile) so any future picker
 * anywhere in OPTIM (Today, Training, Nutrition, Progress, Chat, the coach
 * workspace, white-label onboarding) reaches for this instead of a fifth
 * reimplementation. An unselected card must visibly read as interactive
 * (real border + fill, not a beige-on-beige blend); a selected card is
 * unmistakable (border color + fill + bold text + an animated check, never
 * color alone); a disabled card stays legible and explains why via
 * `disabledReason` rather than just going inert.
 */
export function OptionCard({
  active,
  disabled,
  disabledReason,
  label,
  description,
  icon: Icon,
  onClick,
  className,
}: {
  active: boolean;
  disabled?: boolean;
  /** Shown under the label only while disabled — e.g. "Limit of 2 reached".
   * Never shown for an active (selected) card, which is never disabled. */
  disabledReason?: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      className={cn(
        "group flex w-full items-start justify-between gap-2 rounded-[var(--radius-sm)] border-2 px-3.5 py-3 text-left transition-all",
        active
          ? "border-accent bg-selected-bg text-accent-fg shadow-[var(--shadow-subtle)]"
          : disabled
            ? "cursor-not-allowed border-border bg-surface-raised/60 text-neutral"
            : "border-border-strong bg-charcoal text-off-white shadow-[var(--shadow-subtle)] hover:border-accent/50 hover:bg-selected-bg/40 active:scale-[0.98]",
        className
      )}
      style={{ transitionDuration: "var(--motion-fast)" }}
    >
      <span className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <Icon
            size={17}
            className={cn("mt-0.5 shrink-0", active ? "text-accent-fg" : disabled ? "text-neutral/60" : "text-neutral")}
            aria-hidden="true"
          />
        ) : null}
        <span className="min-w-0">
          <span className="block text-sm font-medium">{label}</span>
          {description ? <span className="mt-0.5 block text-xs text-neutral">{description}</span> : null}
          {disabled && disabledReason ? <span className="mt-0.5 block text-xs text-neutral">{disabledReason}</span> : null}
        </span>
      </span>
      {active ? <Check size={16} className="pc-check-pop mt-0.5 shrink-0 text-accent-fg" aria-hidden="true" /> : null}
    </button>
  );
}
