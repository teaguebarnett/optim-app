import { StatusBadge, type BadgeTone } from "@/components/progress/status-badge";
import type { LifecycleBucket } from "@/lib/production/platform-operations";

// A platform-wide analog of components/coach/lifecycle-badge.tsx — same
// visual language, but this phase's LifecycleBucket adds "archived" (a
// platform-visible filter state components/coach/lifecycle-badge.tsx's own
// ClientLifecycleStatus union doesn't carry), so this is its own small chip
// rather than a forced reuse of that exact type.
const LABELS: Record<LifecycleBucket, string> = {
  invited: "Invited",
  onboarding: "Onboarding",
  coach_setup: "Awaiting coach setup",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

const TONES: Record<LifecycleBucket, BadgeTone> = {
  invited: "steel",
  onboarding: "accent",
  coach_setup: "accent",
  active: "success",
  paused: "steel",
  completed: "steel",
  archived: "neutral",
};

export function LifecycleChip({ lifecycle, className }: { lifecycle: LifecycleBucket; className?: string }) {
  return <StatusBadge label={LABELS[lifecycle]} tone={TONES[lifecycle]} className={className} />;
}
