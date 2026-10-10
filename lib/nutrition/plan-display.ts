// Gate U3A — how an assigned nutrition plan is SHOWN, for every supported method, without fake targets. Pure.
//
// Legacy plans (no `method`) and full-macro plans show their four numbers exactly as before. A calories-and-protein
// plan shows calories and protein and says carbs/fat have no target; habit- and portion-based plans show no numbers at
// all (nutrition is never turned into a mandatory calorie tracker); a baseline-first plan says targets come after the
// baseline. Nothing here invents, rounds into, or defaults a number the coach didn't prescribe.

import type { AssignedNutritionPlan, NutritionPlanApproach, NutritionTargets, PrescribedNutritionTargets } from "../types.ts";
import { ALL_CALIBRATION_ITEMS } from "../coach/calibration/questions.ts";

// The coach's own measure labels (the calibration question the measure ids come from) — never raw ids to a client.
const MEASURE_LABELS = new Map(
  (ALL_CALIBRATION_ITEMS.find((q) => q.id === "n_measurements")?.control as { options?: Array<{ value: string; label: string }> } | undefined)?.options?.map((o) => [o.value, o.label]) ?? []
);
export const measureLabel = (id: string) => MEASURE_LABELS.get(id) ?? id.replaceAll("_", " ");

export type MacroKey = "calories" | "proteinG" | "carbsG" | "fatG";
export const NO_TARGET_LABEL = "No target";

export interface DisplayTargets extends PrescribedNutritionTargets {
  /** A coach-assigned plan exists (so a missing number means "not prescribed", never "not assigned"). */
  planAssigned: boolean;
}

/** The numbers to show: the complete set when it exists, else exactly what the method prescribed, else nothing. */
export function resolveDisplayTargets(state: { nutritionTargets: NutritionTargets | null; assignedNutritionPlan?: AssignedNutritionPlan | null }): DisplayTargets {
  const plan = state.assignedNutritionPlan ?? null;
  if (state.nutritionTargets) return { ...state.nutritionTargets, planAssigned: true };
  const p = plan?.method?.prescribed ?? null;
  return { calories: p?.calories ?? null, proteinG: p?.proteinG ?? null, carbsG: p?.carbsG ?? null, fatG: p?.fatG ?? null, planAssigned: !!plan };
}

const APPROACH_LABEL: Record<NutritionPlanApproach, string> = {
  full_macros: "Calorie and macro targets",
  calories_protein: "Calorie and protein targets",
  meal_plan: "Personalized meal plan",
  portion_guides: "Portion guidance",
  habit_based: "Habit-based guidance",
};

export interface NutritionPlanSummary {
  approach: string;
  /** Only prescribed numbers, as display lines ("2,400 kcal", "180 g protein"). */
  targets: string[];
  /** e.g. "Training days 2,600 kcal · Rest days 2,300 kcal" — only when the plan varies by day. */
  dayVariation: string | null;
  /** Shown instead of numbers when the method has none yet (baseline first) or none at all (habits/portions). */
  note: string | null;
  habits: string[];
  meals: Array<{ name: string; timing: string; intent: string; foods: string[] }>;
  substitutions: string[];
  monitoring: string | null;
}

const fmt = (n: number) => n.toLocaleString("en-US");
function lines(t: PrescribedNutritionTargets): string[] {
  return [t.calories !== null ? `${fmt(t.calories)} kcal` : null, t.proteinG !== null ? `${fmt(t.proteinG)} g protein` : null, t.carbsG !== null ? `${fmt(t.carbsG)} g carbs` : null, t.fatG !== null ? `${fmt(t.fatG)} g fat` : null].filter((x): x is string => !!x);
}

/** The coach/reasoner sentence as written, capitalized and ending in punctuation (no splicing into a template). */
const sentence = (t: string) => {
  const x = t.trim();
  return `${x.charAt(0).toUpperCase()}${x.slice(1)}${/[.!?]$/.test(x) ? "" : "."}`;
};

export function summarizeNutritionPlan(plan: AssignedNutritionPlan): NutritionPlanSummary {
  const m = plan.method;
  if (!m) {
    // Legacy plan: four numbers, exactly as every existing screen already shows them.
    const t = plan.targets!;
    return {
      approach: APPROACH_LABEL.full_macros,
      targets: lines(t),
      dayVariation: plan.usesTrainingRestSplit && plan.trainingDayTargets && plan.restDayTargets ? `Training days ${fmt(plan.trainingDayTargets.calories)} kcal · Rest days ${fmt(plan.restDayTargets.calories)} kcal` : null,
      note: null,
      habits: [],
      meals: [],
      substitutions: plan.substitutionGuidance ? [plan.substitutionGuidance] : [],
      monitoring: plan.metricsToMonitor.length ? plan.metricsToMonitor.map(measureLabel).join(", ") : null,
    };
  }
  const td = m.trainingDay?.calories ?? null;
  const rd = m.restDay?.calories ?? null;
  return {
    approach: APPROACH_LABEL[m.approach],
    targets: lines(m.prescribed),
    dayVariation: td !== null && rd !== null && td !== rd ? `Training days ${fmt(td)} kcal · Rest days ${fmt(rd)} kcal` : null,
    note: m.energyMode === "baseline_first" ? `Baseline first: ${sentence(m.baseline?.instruction ?? "Log your normal eating")} Your coach sets calorie targets from that baseline.` : m.energyMode === "none" ? "No calorie numbers — follow the guidance below." : null,
    habits: m.habits,
    meals: m.meals,
    substitutions: m.substitutions.map((s) => `${s.for} → ${s.use.join(" or ")}${s.why ? ` (${s.why})` : ""}`),
    monitoring: m.monitoring.measures.length ? `${m.monitoring.measures.map(measureLabel).join(", ")} · ${m.monitoring.cadence}` : null,
  };
}

/** A target caption: the number, "No target" (plan exists, not prescribed) or the existing not-assigned label. */
export function targetText(value: number | null, planAssigned: boolean, notAssignedLabel: string, render: (n: number) => string): string {
  return value !== null ? render(value) : planAssigned ? NO_TARGET_LABEL : notAssignedLabel;
}
