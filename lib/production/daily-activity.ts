// Gate 6D — the coach's client detail page had real, persisted daily_records
// history (training sessions, logged meals — see hooks/use-prototype-state.tsx's
// own Supabase-mode autosave and lib/history/build-daily-record.ts for the
// exact shape it writes) with no coach-facing view of it at all. This file is
// read-only and invents nothing: every value here is read straight out of the
// same daily_records rows that autosave already writes — no second logging
// system, no demo/mock content.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server";
import { getAuthenticatedContext, requireWorkspaceRole } from "./auth";
import { MEAL_PERIOD_LABELS } from "../mock-data";
import type { MealPeriod, WorkoutSessionStatus } from "../types";

export interface RecentMealEntry {
  period: MealPeriod;
  label: string;
  calories: number | null;
  completedAtIso: string | null;
}

export interface RecentActivityDay {
  dateIso: string;
  /** Real status only — "not-started" is never surfaced as a day worth
   * showing on its own (see the filter below); a coach reading this list
   * must never see "completed" for a session the client only started. */
  sessionStatus: WorkoutSessionStatus | null;
  workoutName: string | null;
  startedAtIso: string | null;
  completedAtIso: string | null;
  workingSetsCompleted: number;
  workingSetsPrescribed: number;
  meals: RecentMealEntry[];
}

interface DailyRecordRow {
  date_iso: string;
  content: {
    training?: {
      sessionStatus?: WorkoutSessionStatus | null;
      prescribedWorkoutSnapshot?: { name?: string } | null;
      startedAtIso?: string | null;
      completedAtIso?: string | null;
      workingSetsCompleted?: number;
      workingSetsPrescribed?: number;
    } | null;
    nutrition?: {
      meals?: Partial<Record<MealPeriod, { macros?: { calories?: number }; completedAtIso?: string | null }>>;
    } | null;
  } | null;
}

/** Read-only recent history for the coach's "Recent Activity" section — same
 * authorization discipline as lib/production/roster.ts's getClientDetail:
 * the client_profiles row's own workspace_id is checked against the
 * caller's real membership before anything else is read (RLS's
 * daily_records_select/can_access_client is the backstop, never the only
 * gate). Rows with neither a real session status nor a logged meal are
 * dropped — an autosaved row from a day nothing happened on is not
 * "activity," it's just today's not-yet-touched scaffold. */
export async function getRecentActivityForClient(clientProfileId: string, limit = 14): Promise<RecentActivityDay[]> {
  const ctx = await getAuthenticatedContext();
  const supabase = await getSupabaseServerClient();

  const { data: client, error: clientError } = await supabase.from("client_profiles").select("workspace_id").eq("id", clientProfileId).single();
  if (clientError) throw new Error(`getRecentActivityForClient (client lookup) failed: ${clientError.message}`);
  requireWorkspaceRole(ctx, client.workspace_id as string, ["workspace_owner", "platform_admin", "coach"]);

  const { data, error } = await supabase
    .from("daily_records")
    .select("date_iso, content")
    .eq("client_profile_id", clientProfileId)
    .order("date_iso", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentActivityForClient failed: ${error.message}`);

  return ((data ?? []) as DailyRecordRow[])
    .map((row): RecentActivityDay => {
      const training = row.content?.training ?? null;
      const nutritionMeals = row.content?.nutrition?.meals ?? {};
      const meals: RecentMealEntry[] = (Object.keys(nutritionMeals) as MealPeriod[])
        .filter((period) => nutritionMeals[period])
        .map((period) => {
          const meal = nutritionMeals[period]!;
          return {
            period,
            label: MEAL_PERIOD_LABELS[period],
            calories: meal.macros?.calories ?? null,
            completedAtIso: meal.completedAtIso ?? null,
          };
        });
      return {
        dateIso: row.date_iso,
        sessionStatus: training?.sessionStatus ?? null,
        workoutName: training?.prescribedWorkoutSnapshot?.name ?? null,
        startedAtIso: training?.startedAtIso ?? null,
        completedAtIso: training?.completedAtIso ?? null,
        workingSetsCompleted: training?.workingSetsCompleted ?? 0,
        workingSetsPrescribed: training?.workingSetsPrescribed ?? 0,
        meals,
      };
    })
    .filter((day) => (day.sessionStatus && day.sessionStatus !== "not-started") || day.meals.length > 0);
}
