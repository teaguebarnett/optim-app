"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "md" | "lg" | "sm" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-off-white hover:bg-accent-strong active:scale-[0.98]",
  secondary: "bg-surface-raised text-off-white border border-border-strong hover:border-accent/40",
  ghost: "bg-transparent text-off-white hover:bg-white/5",
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
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none select-none",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
