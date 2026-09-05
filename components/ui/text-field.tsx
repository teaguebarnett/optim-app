import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  id: string;
  helperText?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, label, id, helperText, ...props }, ref) => {
    return (
      <div className="w-full">
        {label ? (
          <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-off-white">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={id}
          className={cn(
            "h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 text-[15px] text-off-white outline-none placeholder:text-neutral/60 focus-visible:border-accent",
            className
          )}
          aria-describedby={helperText ? `${id}-help` : undefined}
          {...props}
        />
        {helperText ? (
          <p id={`${id}-help`} className="mt-1.5 text-xs text-neutral">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);
TextField.displayName = "TextField";
