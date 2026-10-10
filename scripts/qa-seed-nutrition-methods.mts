// Gate U3A — LOCAL-ONLY browser-QA fixtures for the nutrition plan contract. Refuses anything but the local stack.
//
// Creates one calibrated coach and four active clients, each with a real published + assigned training program, an
// active enrollment starting today, and a published + assigned nutrition plan:
//   legacy     — a four-number plan with no `method` (exactly what production stores today)
//   calprotein — calories + protein (the iCloud coach's method: calories_protein + meal plan, formula)
//   habit      — habit-based, no numbers at all
//   baseline   — baseline first (calories null until the baseline; protein set)
// Method plans come from the Nutrition Reasoner's SCRIPTED model through the real conversion (no paid calls) and pass
// the production validator before insert. Sign in at /auth/sign-in with the printed emails; the one-time code arrives
// in local Mailpit. Each run creates fresh, uniquely-named fixtures.
//
//   node --experimental-strip-types scripts/qa-seed-nutrition-methods.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { generateProgramDirectionSummaries } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { runNutritionReasoner } from "../lib/synthesis/reasoner/nutrition/reasoner.ts";
import { toAssignedNutritionPlanDraft } from "../lib/synthesis/reasoner/nutrition/to-plan.ts";
import { fakeModel, NOW, nutritionCoach, scenarioInput, scriptedNutrition } from "../lib/synthesis/reasoner/nutrition/eval/fixtures.ts";
import { fullCoach } from "../lib/synthesis/unified/eval/fixtures.ts";
import { validateAssignedNutritionPlanContent } from "../lib/production/validation.ts";
import { universalProgramToClientAssignedProgram } from "../lib/training/legacy-adapter.ts";
import type { NutritionPlan } from "../lib/synthesis/reasoner/nutrition/contract.ts";
import type { AssignedNutritionPlan, DayOfWeek } from "../lib/types.ts";

const raw = execSync("npx supabase status -o env", { stdio: ["ignore", "pipe", "ignore"] }).toString();
const st: Record<string, string> = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)="(.*)"$/);
  if (m) st[m[1]] = m[2];
}
if (!st.API_URL?.includes("127.0.0.1")) {
  console.error(`Refusing to run: API_URL "${st.API_URL}" isn't the local stack. This script is local-only.`);
  process.exit(1);
}
const admin = createClient(st.API_URL, st.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const RUN = Date.now().toString(36);
const nowIso = new Date().toISOString();
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as NonNullable<T>;
}
async function user(tag: string, name: string) {
  const email = `qa-u3a-${tag}-${RUN}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: name } });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  return { id: data.user.id, email };
}

async function methodPlan(label: string, over: Record<string, unknown>, goal: string): Promise<Omit<AssignedNutritionPlan, "id">> {
  const r = await runNutritionReasoner({ input: scenarioInput({ coach: nutritionCoach(over), patch: { what_you_want: { primaryGoal: goal } } }), model: fakeModel((ri) => scriptedNutrition(ri as never)), nowIso: NOW, maxAttempts: 1 });
  if (r.status !== "PLANNED") throw new Error(`${label}: reasoner ${r.status}`);
  const d = toAssignedNutritionPlanDraft((r as { plan: NutritionPlan }).plan);
  if (!d.ok) throw new Error(`${label}: ${d.reason}`);
  return { ...d.content, approvedAtIso: nowIso };
}

const LEGACY: Omit<AssignedNutritionPlan, "id"> = {
  targets: { calories: 2400, proteinG: 180, carbsG: 250, fatG: 75 },
  usesTrainingRestSplit: false,
  mealsPerDay: 4,
  mealStructureDescription: "Breakfast, lunch, pre-training snack, dinner.",
  preTrainingGuidance: "Carbs and some protein 60–90 minutes before training.",
  postTrainingGuidance: "Protein and carbs within two hours after training.",
  hydrationOzPerDay: 100,
  fiberGramsPerDay: 30,
  substitutionGuidance: "Swap rice for potatoes or oats at equal carbs.",
  supplementGuidance: "Creatine 5 g daily.",
  adherenceStrategy: "Plan tomorrow's meals the night before.",
  metricsToMonitor: ["weekly_average_weight"],
  weeklyAdjustmentRule: "If weekly average weight is flat for two weeks, add 100 kcal from carbs.",
  sourceStrategyLabel: "Coach-authored four-number plan (legacy)",
  approvedAtIso: nowIso,
};

console.log(`U3A QA seed → ${st.API_URL} (local), run ${RUN}, timezone ${tz}, start ${today}\n`);
const coach = await user("coach", "QA Coach");
const ws = await must(admin.from("workspaces").insert({ owner_user_id: coach.id, display_name: `U3A QA ${RUN}`, business_name: "U3A QA" }).select("id").single(), "workspace");
await must(admin.from("workspace_memberships").insert({ workspace_id: ws.id, user_id: coach.id, role: "workspace_owner", status: "active" }), "coach membership");

// Calibrated Coach Brain (required to open the coach workspace).
const method = fullCoach();
const brain = await must(admin.from("coach_brains").insert({ workspace_id: ws.id, coach_user_id: coach.id }).select("id").single(), "brain");
const mv = await must(admin.from("coach_method_versions").insert({ brain_id: brain.id, workspace_id: ws.id, coach_user_id: coach.id, version: 1, source: "calibration", operating_model: method.operatingModel, ai_authority: method.aiAuthority ?? {}, calibration_answers: method.operatingModel.calibration?.answers ?? {}, confirmed_by: coach.id }).select("id").single(), "method version");
await must(admin.from("coach_brains").update({ calibration_status: "calibrated", active_method_version_id: mv.id, calibrated_at: nowIso }).eq("id", brain.id), "calibrate");

const days: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const plans: Array<[string, string, Omit<AssignedNutritionPlan, "id">]> = [
  ["legacy", "Lena Legacy", LEGACY],
  ["calprotein", "Cal Protein", await methodPlan("calprotein", { n_approach: ["calories_protein", "meal_plan"], n_calorie_method: "formula", n_training_rest: "same_calories_shift_carbs" }, "build_muscle")],
  ["habit", "Hana Habit", await methodPlan("habit", { n_approach: ["habit_based"], n_calorie_method: "no_calorie_targets", n_protein_basis: "no_target", n_protein_amount: undefined }, "health_consistency")],
  ["baseline", "Ben Baseline", await methodPlan("baseline", { n_approach: ["calories_protein"], n_calorie_method: "current_intake" }, "build_muscle")],
];

for (const [tag, name, content] of plans) {
  const full = { id: `qa-u3a-${tag}-${RUN}`, ...content } as AssignedNutritionPlan;
  validateAssignedNutritionPlanContent(full);
  const u = await user(tag, name);
  await must(admin.from("workspace_memberships").insert({ workspace_id: ws.id, user_id: u.id, role: "client", status: "active" }), `${tag} membership`);
  const cp = await must(admin.from("client_profiles").insert({ workspace_id: ws.id, user_id: u.id, display_name: name }).select("id").single(), `${tag} profile`);
  await must(admin.from("coach_client_assignments").insert({ workspace_id: ws.id, coach_user_id: coach.id, client_profile_id: cp.id, is_primary: true }), `${tag} assignment`);

  // A real generated program, published and assigned (same path as scripts/e2e-universal-program-execution.mts).
  const com = createDefaultCoachOperatingModel({ coachId: coach.id, workspaceId: ws.id, nowIso, businessName: "U3A QA" });
  // Resistance-only, so Today can render it (cardio sessions aren't legacy-representable yet — an existing limit).
  const profile = { ...buildPlaceholderProgrammingProfile(days.slice(0, 5)), cardioPreference: "avoids_cardio" as const };
  const direction = generateProgramDirectionSummaries({ profile, com, durationWeeks: 4 }).find((d) => d.kind === "best_fit")!;
  const { content: program } = buildUniversalProgramForDirection(direction, { clientId: cp.id, workspaceId: ws.id, coachId: coach.id, profile, com, durationWeeks: 4, nowIso });
  if (!universalProgramToClientAssignedProgram(program)) throw new Error(`${tag}: program isn't Today-renderable`);
  const tp = await must(admin.from("training_programs").insert({ workspace_id: ws.id, created_by: coach.id, title: program.name }).select("id").single(), `${tag} program`);
  const tv = await must(admin.from("training_program_versions").insert({ program_id: tp.id, workspace_id: ws.id, version_number: 1, status: "published", content: program, created_by: coach.id, published_by: coach.id, published_at: nowIso }).select("id").single(), `${tag} program version`);
  await must(admin.from("program_assignments").insert({ workspace_id: ws.id, client_profile_id: cp.id, program_version_id: tv.id, status: "active", assigned_by: coach.id }), `${tag} program assignment`);

  const np = await must(admin.from("nutrition_plans").insert({ workspace_id: ws.id, created_by: coach.id, title: `${name} nutrition` }).select("id").single(), `${tag} nutrition plan`);
  const nv = await must(admin.from("nutrition_plan_versions").insert({ plan_id: np.id, workspace_id: ws.id, version_number: 1, status: "published", content: full, created_by: coach.id, published_by: coach.id, published_at: nowIso }).select("id").single(), `${tag} nutrition version`);
  await must(admin.from("nutrition_plan_assignments").insert({ workspace_id: ws.id, client_profile_id: cp.id, plan_version_id: nv.id, status: "active", assigned_by: coach.id }), `${tag} nutrition assignment`);
  await must(admin.from("client_enrollments").insert({ workspace_id: ws.id, client_profile_id: cp.id, original_program_start_date: today, timezone: tz, status: "active" }), `${tag} enrollment`);

  const m = full.method;
  console.log(`${tag.padEnd(10)} ${u.email}  profile ${cp.id}  ${m ? `${m.approach}/${m.energyMode} prescribed ${JSON.stringify(m.prescribed)}` : `legacy ${JSON.stringify(full.targets)}`}`);
}
console.log(`\ncoach      ${coach.email}  workspace ${ws.id}`);
