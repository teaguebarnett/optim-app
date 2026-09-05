import { StatusBadge, type BadgeTone } from "@/components/progress/status-badge";
import { LIFECYCLE_LABELS } from "@/lib/coach/labels";
import type { ClientLifecycleStatus } from "@/lib/coach/types";
import type { ProgramPhase } from "@/lib/scheduling/types";

const LIFECYCLE_TONE: Record<ClientLifecycleStatus, BadgeTone> = {
  invited: "steel",
  onboarding: "accent",
  coach_setup: "accent",
  ready_to_activate: "warning",
  active: "success",
  paused: "steel",
  completed: "steel",
};

/**
 * The one lifecycle status chip every coach surface uses — roster rows,
 * mobile client cards, and the client detail header all render the exact
 * same label/tone for a given (lifecycle, programPhase) pair, so a client
 * can never look "active" in one place and "starting soon" in another.
 * "Active but starting in the future" (see lib/scheduling/program-timing.ts)
 * is the one case this distinguishes beyond the raw lifecycle value itself
 * — everywhere else, an active client with a real assigned program that has
 * already begun is exactly what "Active" has always meant.
 */
export function LifecycleBadge({
  lifecycle,
  programPhase,
  className,
}: {
  lifecycle: ClientLifecycleStatus;
  programPhase?: ProgramPhase | null;
  className?: string;
}) {
  if (lifecycle === "active" && programPhase === "pre_program") {
    return <StatusBadge label="Starts soon" tone="brass" className={className} />;
  }
  return <StatusBadge label={LIFECYCLE_LABELS[lifecycle]} tone={LIFECYCLE_TONE[lifecycle]} className={className} />;
}
