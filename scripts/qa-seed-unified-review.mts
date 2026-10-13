// Gate U3B — LOCAL-ONLY browser-QA fixtures for the unified coach review. Refuses anything but the local stack.
//
// Creates a calibrated coach (the eval coach method) and one client whose completed intake is the eval intake (strength
// goal, six available days, 75-min sessions) — so the server derives the same planning input OPTIM's scripted domain
// models were built for. Prepare the proposal from the running dev server (OPTIM_REASONER_TEST_PROVIDER set, local
// Supabase) with prepareUnifiedProposalLocalQaAction; sign in as the coach with a local magic link.
//
//   node --experimental-strip-types scripts/qa-seed-unified-review.mts [--lift-only] [--calories-protein]
//
// --lift-only: the coach's cardio is for fat loss only (like the first real client's coach), so a muscle-building /
// strength client's unified program is lifting + nutrition — publishable to Today (Gate U3C).

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { BASE_INTAKE_ANSWERS } from "../lib/synthesis/reasoner/eval/fixtures.ts";
import { fullCoach, routerModel } from "../lib/synthesis/unified/eval/fixtures.ts";
import { restrict, scenarioInput } from "../lib/synthesis/reasoner/eval/fixtures.ts";
import { runUnifiedProgram, type DomainResults } from "../lib/synthesis/unified/orchestrate.ts";
import { buildUnifiedTrainingContent } from "../lib/production/unified-drafts.ts";
import { resolveRestrictionOption } from "../lib/synthesis/limitations/vocabulary.ts";
import { FOUNDATION_KNOWLEDGE } from "../lib/synthesis/knowledge/registry.ts";

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
async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as NonNullable<T>;
}
async function user(tag: string, name: string) {
  const email = `qa-u3b-${tag}-${RUN}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: name } });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  return { id: data.user.id, email };
}

const coach = await user("coach", "QA Coach");
const ws = await must(admin.from("workspaces").insert({ owner_user_id: coach.id, display_name: `U3B QA ${RUN}`, business_name: "U3B QA" }).select("id").single(), "workspace");
await must(admin.from("workspace_memberships").insert({ workspace_id: ws.id, user_id: coach.id, role: "workspace_owner", status: "active" }), "coach membership");
// --calories-protein: the coach's nutrition approach is calories + protein only (like the first real client's coach).
const method = fullCoach({ ...(process.argv.includes("--lift-only") ? { t_cardio_roles: ["fat_loss"] } : {}), ...(process.argv.includes("--calories-protein") ? { n_approach: ["calories_protein"] } : {}) });
const brain = await must(admin.from("coach_brains").insert({ workspace_id: ws.id, coach_user_id: coach.id }).select("id").single(), "brain");
const mv = await must(admin.from("coach_method_versions").insert({ brain_id: brain.id, workspace_id: ws.id, coach_user_id: coach.id, version: 1, source: "calibration", operating_model: method.operatingModel, ai_authority: method.aiAuthority ?? {}, calibration_answers: method.operatingModel.calibration?.answers ?? {}, confirmed_by: coach.id }).select("id").single(), "method version");
await must(admin.from("coach_brains").update({ calibration_status: "calibrated", active_method_version_id: mv.id, calibrated_at: nowIso }).eq("id", brain.id), "calibrate");

const client = await user("client", "Riley Strength");
await must(admin.from("workspace_memberships").insert({ workspace_id: ws.id, user_id: client.id, role: "client", status: "active" }), "client membership");
const cp = await must(admin.from("client_profiles").insert({ workspace_id: ws.id, user_id: client.id, display_name: "Riley Strength" }).select("id").single(), "profile");
await must(admin.from("coach_client_assignments").insert({ workspace_id: ws.id, coach_user_id: coach.id, client_profile_id: cp.id, is_primary: true }), "assignment");
const answers = structuredClone(BASE_INTAKE_ANSWERS) as Record<string, Record<string, unknown>>;
answers.what_you_want = { ...answers.what_you_want, primaryGoal: "get_stronger", successDefinition: "Squat 180 kg without getting gassed" };
answers.your_week = { ...answers.your_week, availableDays: ["mon", "tue", "wed", "thu", "fri", "sat"], maxSessionLength: "75", trainingEnvironment: ["commercial_gym"], preferredTrainingTime: ["evening", "morning"] };
await must(admin.from("client_onboarding_progress").insert({ workspace_id: ws.id, client_profile_id: cp.id, current_step_index: 6, answers, completed_at: nowIso }), "onboarding");
// As the invite flow creates it: enrolled but not active (the coach sets the start date and activates).
await must(admin.from("client_enrollments").insert({ workspace_id: ws.id, client_profile_id: cp.id, status: "invited", timezone: "UTC" }), "enrollment");

// A second client with a coach-confirmed health review: documented limitations + structured restrictions (so the
// proposal carries prepared decisions — cardio clearance and the documented-limitation exercise review).
const limited = await user("limits", "Sam Limits");
await must(admin.from("workspace_memberships").insert({ workspace_id: ws.id, user_id: limited.id, role: "client", status: "active" }), "limited membership");
const lp = await must(admin.from("client_profiles").insert({ workspace_id: ws.id, user_id: limited.id, display_name: "Sam Limits" }).select("id").single(), "limited profile");
await must(admin.from("coach_client_assignments").insert({ workspace_id: ws.id, coach_user_id: coach.id, client_profile_id: lp.id, is_primary: true }), "limited assignment");
const la = structuredClone(answers);
la.health_finish = { ...(la.health_finish ?? {}), hasInjuryHistory: false, safetyScreen: ["advised_limit", "joint_muscular"] };
await must(admin.from("client_onboarding_progress").insert({ workspace_id: ws.id, client_profile_id: lp.id, current_step_index: 6, answers: la, completed_at: nowIso }), "limited onboarding");
// The real first client's documented limitations, verbatim in substance (names lat pulldowns, triceps pushdowns and
// single-leg pushing — the exercises the coach must decide on).
const DOC = "no squats, or lower body compounds like leg press, RDLs, or single leg pushing motions. No movements that involve bracing like high effort lat pull downs or tricep push downs. no ab workouts.";
const restrictions = ["avoid_squat", "avoid_hinge", "avoid_bracing_high"].map((optionId) => {
  const o = resolveRestrictionOption(optionId, FOUNDATION_KNOWLEDGE)!;
  return { optionId, label: o.label, tags: o.tags, origin: "proposed" };
});
await must(admin.from("escalations").insert({
  workspace_id: ws.id, client_profile_id: lp.id, reason_category: "pain_or_safety", status: "resolved", proposed_response: "Health screen flagged — coach review.",
  resolved_by: coach.id, resolved_at: nowIso, health_review_status: "proceed_with_limitations", documented_limitations: DOC, health_review_decided_by: coach.id, health_review_decided_at: nowIso,
  structured_limitations: { schema: 1, sourceText: DOC, restrictions, noExerciseRestrictions: false, interpretation: { interpreter: { kind: "manual", reason: "QA seed" }, proposedOptionIds: restrictions.map((r) => r.optionId), removedOptionIds: [], addedOptionIds: [], clarifications: [] }, confirmedAtIso: nowIso, confirmedBy: coach.id },
  structured_limitations_confirmed_by: coach.id, structured_limitations_confirmed_at: nowIso,
}), "health review");

// The coach's existing PENDING lifting draft for Sam (like the first real client's v4): a restriction-fitting program
// (OPTIM's scripted planner for Sam's confirmed restrictions) in which two exercises — every week — are Cable Triceps
// Pushdown and Single-Leg Calf Raise. The unified proposal uses it unchanged; the coach decides on those exercises.
{
  const review = { clientId: lp.id, workspaceId: ws.id, status: "proceed_with_limitations", reasons: ["Health screen flagged — coach review."], createdAtIso: nowIso, updatedAtIso: nowIso, documentedLimitations: DOC } as never;
  const confirmedTags = restrict([{ kind: "avoid_movement_pattern", pattern: "squat" }, { kind: "avoid_movement_pattern", pattern: "hinge" }, { kind: "avoid_demand", demand: "bracing", atOrAbove: "high" }]).map((x) => ({ ...x, interprets: [`${lp.id}:coach_documented_limitation`] }));
  const inS = scenarioInput({ clientId: lp.id, coach: method, patch: { what_you_want: { primaryGoal: "get_stronger" }, health_finish: la.health_finish, your_week: answers.your_week } as never, healthReview: review, restrictions: confirmedTags });
  let r: DomainResults | null = null;
  const u = await runUnifiedProgram({ input: inS, model: routerModel(), nowIso, maxAttempts: 1, onResults: (x) => (r = x) });
  const rr = r as unknown as DomainResults;
  if (!rr) throw new Error(`seed: planning stopped early (${u.status}: ${Object.values(u.domains).map((d) => `${d.domain}=${d.status} ${d.reasons.join(" ").slice(0, 160)}`).join(" | ")})`);
  if (rr.resistance?.status !== "PLANNED") throw new Error(`seed: lifting not planned (${rr.resistance?.status})`);
  const content = buildUnifiedTrainingContent({ rowId: `seed-${RUN}`, artifacts: { resistance: { source: "proposed_program", result: rr.resistance, generationInputs: {} as never }, cardio: null, nutrition: null }, proposal: { ...u, domains: { ...u.domains, cardio: { ...u.domains.cardio, status: "NOT_COACHED" } } }, knowledge: FOUNDATION_KNOWLEDGE, workspaceId: ws.id, clientProfileId: lp.id, coachId: coach.id, title: "Sam — coach draft", nowIso })!;
  delete (content as { unifiedProvenance?: unknown }).unifiedProvenance;
  const lifts = [...new Set(content.weeks.flatMap((w) => w.days.flatMap((d) => (d.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.prescription.family === "resistance").map((i) => i.name))))))];
  const rename = new Map([[lifts[1], "Cable Triceps Pushdown"], [lifts[2], "Single-Leg Calf Raise"]]);
  for (const w of content.weeks) for (const d of w.days) for (const s of d.sessions ?? []) for (const b of s.blocks) for (const i of b.items) if (rename.has(i.name)) i.name = rename.get(i.name)!;
  const tp = await must(admin.from("training_programs").insert({ workspace_id: ws.id, created_by: coach.id, title: "Sam — coach draft" }).select("id").single(), "sam program");
  await must(admin.from("training_program_versions").insert({ program_id: tp.id, workspace_id: ws.id, version_number: 1, status: "draft", content, created_by: coach.id, proposed_for_client_profile_id: lp.id }), "sam pending draft");
  console.log(`limited pending draft: ${content.weeks.length} weeks, renamed ${[...rename.keys()].join(" / ")} → Cable Triceps Pushdown / Single-Leg Calf Raise`);
}
await must(admin.from("client_enrollments").insert({ workspace_id: ws.id, client_profile_id: lp.id, status: "invited", timezone: "UTC" }), "limited enrollment");
console.log(`client email ${client.email}`);
console.log(`coach   ${coach.email}\nclient  ${cp.id}  (workspace ${ws.id})\nlimited ${lp.id}`);
