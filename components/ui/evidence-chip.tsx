import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** One real fact supporting a decision — a pain location, an RPE change, a
 * video attachment. Never rendered unless the caller has a real value;
 * there's no "empty chip" state because a chip that isn't backed by real
 * evidence should simply not be in the list. */
export function EvidenceChip({ icon: Icon, label, toneClassName = "text-navy-ink-muted bg-white/10" }: { icon: LucideIcon; label: string; toneClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", toneClassName)}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </span>
  );
}
