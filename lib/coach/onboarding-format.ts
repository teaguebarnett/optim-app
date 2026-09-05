// Phase 5.1 — the one place a raw stored answer becomes human-readable
// text, shared by the wizard's own Review step and the coach-side Brief
// (lib/coach/onboarding-profile.ts / components/coach/onboarding-brief.tsx)
// so the two surfaces can never describe the same answer two different
// ways. Every formatter here distinguishes "Not provided" (never
// answered — including a legacy record from before this field existed)
// from an explicit "No" — a real, submitted answer — per the Phase 5.1
// brief's explicit requirement.

import { resolveHeight, formatHeight } from "./height.ts";
import type { OnboardingFieldDef } from "./onboarding-steps.ts";
import type { InjuryEntry, OnboardingStepAnswers } from "./types";

export const NOT_PROVIDED = "Not provided";

const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function optionLabel(field: OnboardingFieldDef, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

export function formatDaySelection(days: string[]): string {
  if (days.length === 0) return NOT_PROVIDED;
  const ordered = DAY_ORDER.filter((d) => days.includes(d));
  return `${ordered.map((d) => DAY_LABELS[d]).join(", ")} (${ordered.length}/week)`;
}

export function formatInjuryEntry(entry: InjuryEntry): string {
  const side = entry.side !== "not_applicable" ? ` (${entry.side})` : "";
  return `${entry.bodyArea || "Unnamed area"}${side}`;
}

/** Formats one field's stored value for display — never for the
 * height_feet_inches or injury_list field types, which need the full
 * step answers bag (see formatHeightFromAnswers/InjuryEntry above) rather
 * than a single field's own value. */
export function formatFieldValue(field: OnboardingFieldDef, value: unknown): string {
  if (field.type === "boolean") {
    if (value === true) return "Yes";
    if (value === false) return "No";
    return NOT_PROVIDED;
  }
  if (field.type === "day_selector") {
    return Array.isArray(value) ? formatDaySelection(value as string[]) : NOT_PROVIDED;
  }
  if (field.type === "multi_select") {
    if (Array.isArray(value)) {
      if (value.length === 0) return NOT_PROVIDED;
      return (value as string[]).map((v) => optionLabel(field, v)).join(", ");
    }
    // Tolerates a legacy plain-string value on a field that's since become
    // multi_select (e.g. trainingEnvironment/preferredTrainingTime/
    // coachSupportStyle as of Phase 5.3A) — an already-completed client's
    // real answer must never render as "Not provided" just because the
    // field's cardinality changed after they submitted it.
    if (typeof value === "string" && value !== "") return optionLabel(field, value);
    return NOT_PROVIDED;
  }
  if (field.type === "single_select") {
    if (typeof value !== "string" || value === "") return NOT_PROVIDED;
    return optionLabel(field, value);
  }
  if (value === undefined || value === null || value === "") return NOT_PROVIDED;
  if (field.type === "number_wheel" && field.unit) return `${value} ${field.unit}`;
  return String(value);
}

export function formatHeightFromAnswers(basicsAnswers: OnboardingStepAnswers | undefined): string {
  return formatHeight(resolveHeight(basicsAnswers));
}
