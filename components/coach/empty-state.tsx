import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * The one "nothing here yet" treatment for the coach workspace — an
 * intentionally composed small scene (icon + a real sentence, not a bare
 * placeholder bar), used whenever a queue, roster, or history is genuinely
 * empty. Never claims something is wrong; a quiet inbox is a good outcome.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 border-dashed py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-neutral">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="text-subheading text-off-white">{title}</p>
      {description ? <p className="max-w-xs text-meta text-neutral">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </Card>
  );
}
