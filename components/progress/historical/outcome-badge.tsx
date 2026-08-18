import { StatusBadge } from "@/components/progress/status-badge";
import type { DomainOutcome } from "@/lib/history/derive-day-status";

/** Shared outcome → badge mapping for the Historical Day Review — the same
 * complete/partial/missed language TrainingCard/NutritionCard/CardioCard
 * already use for a week, applied here to one specific day. "no_record"
 * and "not_applicable" are always neutral, never implied as a failure. */
export function OutcomeBadge({ outcome, restLabel }: { outcome: DomainOutcome | "no_record"; restLabel?: string }) {
  if (outcome === "complete") return <StatusBadge label="Completed" tone="success" />;
  if (outcome === "partial") return <StatusBadge label="Partial" tone="warning" />;
  if (outcome === "missed") return <StatusBadge label="Missed" tone="error" />;
  if (outcome === "not_applicable") return <StatusBadge label={restLabel ?? "Not scheduled"} tone="neutral" />;
  if (outcome === "no_record") return <StatusBadge label="Not recorded" tone="neutral" />;
  return <StatusBadge label="Not enough data" tone="neutral" />;
}
