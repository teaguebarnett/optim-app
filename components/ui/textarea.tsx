import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  id: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label ? (
          <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-off-white">
            {label}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={id}
          rows={3}
          className={cn(
            "w-full resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2.5 text-[15px] text-off-white outline-none placeholder:text-neutral/60 focus-visible:border-accent",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
TextArea.displayName = "TextArea";
