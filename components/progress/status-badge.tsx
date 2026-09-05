import { AlertCircle, CheckCircle2, Circle, Clock, MinusCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export type BadgeTone = "success" | "warning" | "error" | "neutral" | "accent" | "steel" | "brass";

const TONE_CLASSNAMES: Record<BadgeTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  error: "bg-error-soft text-error",
  neutral: "bg-surface-raised text-neutral border border-border",
  accent: "bg-accent-soft text-accent-strong",
  steel: "bg-steel-soft text-steel",
  brass: "bg-brass-soft text-brass-strong",
};

const TONE_ICONS: Record<BadgeTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertCircle,
  error: MinusCircle,
  neutral: Circle,
  accent: Clock,
  steel: Circle,
  brass: Sparkles,
};

/** A single small badge shared by every Progress card — status is always
 * communicated by icon + label together, never color alone. */
export function StatusBadge({ label, tone, className }: { label: string; tone: BadgeTone; className?: string }) {
  const Icon = TONE_ICONS[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium leading-none",
        TONE_CLASSNAMES[tone],
        className
      )}
    >
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

export function InsufficientDataBadge({ label = "Not enough data yet" }: { label?: string }) {
  return <StatusBadge label={label} tone="neutral" />;
}
