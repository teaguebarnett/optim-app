"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "md" | "lg" | "sm" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the label and disables interaction —
   * every meaningful async action (save, submit) should set this the
   * instant it fires rather than leaving the button silently clickable
   * again mid-request. */
  loading?: boolean;
  /** Shows a brief checkmark + success tint in place of the label —
   * caller-controlled (e.g. a `justSaved` flag cleared after ~1.5s), never
   * an internal timer here, so the caller's own state stays the source of
   * truth. */
  success?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong active:scale-[0.98]",
  secondary: "bg-surface-raised text-off-white border border-border-strong hover:border-accent/40",
  ghost: "bg-transparent text-off-white hover:bg-off-white/5",
  outline: "bg-transparent text-off-white border border-border-strong hover:border-accent/50",
  danger: "bg-error-soft text-off-white border border-error/30 hover:border-error/60",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm rounded-[var(--radius-sm)]",
  md: "h-11 px-4 text-[15px] rounded-[var(--radius-md)]",
  lg: "h-[52px] px-5 text-base rounded-[var(--radius-md)]",
  icon: "h-11 w-11 rounded-full",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, success, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none select-none",
          success ? "bg-success text-on-accent" : variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading ? <Loader2 size={16} className="pc-spin" aria-hidden="true" /> : success ? <Check size={16} className="pc-check-pop" aria-hidden="true" /> : null}
        {loading ? null : children}
      </button>
    );
  }
);
Button.displayName = "Button";
