// Daily training-plan state: creation, updates, and local-date scoping.
//
// Timezone note: this prototype has no per-client configured timezone (a
// real product would store one on the client profile and use it here
// instead). Until that exists, every date/time computation in this module
// uses the browser's local timezone via Date's local getters (getFullYear/
// getMonth/getDate/getHours/getMinutes) — never toISOString() or UTC
// components, which would silently roll a late-night entry onto the wrong
// calendar day for anyone not in UTC. This is a documented limitation, not
// an oversight: a client and their coach in different timezones would see
// today's plan keyed to their own device's local date.

import type { ClientProfileId, WorkspaceId } from "../tenancy/types";
import type { DailyTrainingPlan, TrainingPlanStatus } from "./types";

/** Local calendar date as YYYY-MM-DD, using the browser's local timezone —
 * see the module-level timezone note above. */
export function resolveLocalDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** True only when the plan's workspace/client/date all match the active
 * session — a stale or foreign-scoped plan is never reused. Returning null
 * (rather than reusing a mismatched record) is what makes "a day initially
 * has no selected training time" hold even after switching client, day, or
 * workspace. */
export function trainingPlanMatchesScope(
  plan: DailyTrainingPlan | null | undefined,
  workspaceId: WorkspaceId,
  clientId: ClientProfileId,
  dateIso: string
): plan is DailyTrainingPlan {
  return (
    !!plan &&
    plan.workspaceId === workspaceId &&
    plan.clientId === clientId &&
    plan.dateIso === dateIso
  );
}

/** Resolves the stored plan only if it's actually scoped to today's
 * workspace/client/date — otherwise null, meaning no decision has been made
 * for today yet (a fresh plan is created lazily by the SET_TRAINING_*
 * reducer cases, not eagerly on every render). */
export function resolveScopedTrainingPlan(
  stored: DailyTrainingPlan | null,
  workspaceId: WorkspaceId,
  clientId: ClientProfileId,
  dateIso: string
): DailyTrainingPlan | null {
  return trainingPlanMatchesScope(stored, workspaceId, clientId, dateIso) ? stored : null;
}

function baseFor(
  existing: DailyTrainingPlan | null,
  workspaceId: WorkspaceId,
  clientId: ClientProfileId,
  dateIso: string
): Pick<DailyTrainingPlan, "workspaceId" | "clientId" | "dateIso"> {
  if (existing && existing.workspaceId === workspaceId && existing.clientId === clientId && existing.dateIso === dateIso) {
    return existing;
  }
  return { workspaceId, clientId, dateIso };
}

export function formatTimeLabel(time24: string): string {
  const [hourStr, minuteStr] = time24.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function setTrainingTime(
  existing: DailyTrainingPlan | null,
  workspaceId: WorkspaceId,
  clientId: ClientProfileId,
  dateIso: string,
  time24: string,
  nowIso: string
): DailyTrainingPlan {
  return {
    ...baseFor(existing, workspaceId, clientId, dateIso),
    status: "scheduled",
    plannedTime24: time24,
    plannedTimeLabel: formatTimeLabel(time24),
    updatedAtIso: nowIso,
  };
}

export function setTrainingStatus(
  existing: DailyTrainingPlan | null,
  workspaceId: WorkspaceId,
  clientId: ClientProfileId,
  dateIso: string,
  status: Extract<TrainingPlanStatus, "unsure" | "rest_day">,
  nowIso: string
): DailyTrainingPlan {
  return {
    ...baseFor(existing, workspaceId, clientId, dateIso),
    status,
    plannedTime24: undefined,
    plannedTimeLabel: undefined,
    updatedAtIso: nowIso,
  };
}

/** Combines today's local date with a plan's "HH:MM" local time into a
 * concrete Date for comparison against "now" — e.g. to tell whether a
 * planned time has passed. Returns null when no time is set. */
export function resolvePlannedDateTime(plan: DailyTrainingPlan, referenceNow: Date): Date | null {
  if (plan.status !== "scheduled" || !plan.plannedTime24) return null;
  const [hourStr, minuteStr] = plan.plannedTime24.split(":");
  const result = new Date(referenceNow);
  result.setHours(Number(hourStr), Number(minuteStr), 0, 0);
  return result;
}
