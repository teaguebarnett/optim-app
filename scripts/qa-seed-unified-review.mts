// Gate U3B — LOCAL-ONLY browser-QA fixtures for the unified coach review. Refuses anything but the local stack.
//
// Creates a calibrated coach (the eval coach method) and one client whose completed intake is the eval intake (strength
// goal, six available days, 75-min sessions) — so the server derives the same planning input OPTIM's scripted domain
// models were built for. Prepare the proposal from the running dev server (OPTIM_REASONER_TEST_PROVIDER set, local
// Supabase) with prepareUnifiedProposalLocalQaAction; sign in as the coach with a local magic link.
//
//   node --experimental-strip-types scripts/qa-seed-unified-review.mts

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { BASE_INTAKE_ANSWERS } from "../lib/synthesis/reasoner/eval/fixtures.ts";
import { fullCoach } from "../lib/synthesis/unified/eval/fixtures.ts";
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
const method = fullCoach();
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

// A second client with a coach-confirmed health review: documented limitations + structured restrictions (so the
// proposal carries prepared decisions — cardio clearance and the documented-limitation exercise review).
const limited = await user("limits", "Sam Limits");
await must(admin.from("workspace_memberships").insert({ workspace_id: ws.id, user_id: limited.id, role: "client", status: "active" }), "limited membership");
const lp = await must(admin.from("client_profiles").insert({ workspace_id: ws.id, user_id: limited.id, display_name: "Sam Limits" }).select("id").single(), "limited profile");
await must(admin.from("coach_client_assignments").insert({ workspace_id: ws.id, coach_user_id: coach.id, client_profile_id: lp.id, is_primary: true }), "limited assignment");
const la = structuredClone(answers);
la.health_finish = { ...(la.health_finish ?? {}), hasInjuryHistory: false, safetyScreen: ["advised_limit", "joint_muscular"] };
await must(admin.from("client_onboarding_progress").insert({ workspace_id: ws.id, client_profile_id: lp.id, current_step_index: 6, answers: la, completed_at: nowIso }), "limited onboarding");
const DOC = "No squats or lower body compounds like leg press; no movements with hard bracing like high effort lat pull downs; no ab work.";
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

console.log(`coach   ${coach.email}\nclient  ${cp.id}  (workspace ${ws.id})\nlimited ${lp.id}`);
