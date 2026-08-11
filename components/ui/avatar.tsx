import { cn } from "@/lib/cn";

interface AvatarProps {
  initials: string;
  className?: string;
  variant?: "accent" | "neutral";
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
};

export function Avatar({ initials, className, variant = "neutral", size = "md" }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizeClasses[size],
        variant === "accent" ? "bg-accent text-on-accent" : "bg-surface-raised text-off-white border border-border-strong",
        className
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
