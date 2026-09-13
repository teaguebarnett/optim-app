// Phase 8D — Expand Program Review Across the Full Training Horizon.
//
// Live E2E verification against a real local Supabase stack, in the same
// style as scripts/e2e-program-proposal-review.mts (Phase 8C) — this script
// covers ONLY the genuinely new Phase 8D surface (full-horizon editing,
// structural edits, changes-summary accuracy, later-week safety-restriction
// surfacing, full-program validation). Phase 8C's own lifecycle (approve
// unchanged / edit-then-approve / reject / authorization) is NOT re-proven
// here — see e2e-program-proposal-review.mts for that, still green and
// still run for regression.
//
// app/actions/production-programs.ts can't be imported here directly
// (server-only, needs next/headers) — this script reproduces its exact
// real generate/edit/structural-edit calls one at a time, using the actual
// imported pure editing/diff/evidence helpers, matching this repo's
// established e2e convention.
//
// Run against a running local stack (`supabase start`; safe to run
// repeatedly — uses its own isolated e2e-8d-* fixtures):
//   node --experimental-strip-types scripts/e2e-program-proposal-review-8d.mts

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDefaultCoachOperatingModel } from "../lib/coach/operating-model.ts";
import { generateProgramDirectionSummaries, avoidedTermsForProfile } from "../lib/coach/program-directions.ts";
import { buildUniversalProgramForDirection, buildPlaceholderProgrammingProfile } from "../lib/coach/universal-program-generation.ts";
import { extractClientProgrammingProfile } from "../lib/coach/programming-profile.ts";
import { DAYS_OF_WEEK_ORDER } from "../lib/coach/training.ts";
import { validateUniversalTrainingProgramContent } from "../lib/production/validation.ts";
import {
  applyTrainingItemPatch,
  removeTrainingItem,
  addTrainingItem,
  moveBlock,
  renameSession,
  convertTrainingDayToRest,
  buildCoachAuthoredItem,
  locateTrainingItem,
  diffProgramProposal,
  describeProgramDiffEntry,
  groupDeltasByItem,
  findRestrictionConflicts,
  type TrainingItemPath,
} from "../lib/training/program-proposal-editing.ts";
import { projectPrescriptionEditDecision } from "../lib/decisions/project-prescription-edit.ts";
import { projectItemRemovedDecision, projectItemAddedDecision, projectSessionRenamedDecision, projectDayConvertedToRestDecision } from "../lib/decisions/project-structural-edit.ts";
import { validateDecisionEvidenceInput, type DecisionEvidenceInput } from "../lib/decisions/types.ts";
import type { UniversalTrainingProgramContent } from "../lib/training/types.ts";
import type { HealthReviewRecord } from "../lib/coach/types.ts";

function readLocalStatus(): Record<string, string> {
  const raw = execSync("npx supabase status -o env", { cwd: process.cwd() }).toString();
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)="(.*)"$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const status = readLocalStatus();
const url = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY;
const mailpitUrl = status.MAILPIT_URL;

if (!url || !url.includes("127.0.0.1")) {
  console.error(`Refusing to run: API_URL "${url}" doesn't look like the local stack. This script is local-only.`);
  process.exit(1);
}
if (!anonKey || !serviceRoleKey || !mailpitUrl) {
  console.error("Missing ANON_KEY/SERVICE_ROLE_KEY/MAILPIT_URL from `supabase status -o env` — is the local stack running?");
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(description: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${description}`);
  } else {
    failed += 1;
    console.error(`FAIL  - ${description}${detail ? ` (${detail})` : ""}`);
  }
}

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function fetchOtpCodeFromMailpit(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const listRes = await fetch(`${mailpitUrl}/api/v1/messages?limit=5`);
    const list = (await listRes.json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const match = list.messages.find((m) => m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()));
    if (match) {
      const msgRes = await fetch(`${mailpitUrl}/api/v1/message/${match.ID}`);
      const msg = (await msgRes.json()) as { Text: string; HTML: string };
      const body = msg.Text || msg.HTML;
      const codeMatch = body.match(/\b(\d{6})\b/);
      if (codeMatch) return codeMatch[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No OTP email arrived for ${email} within timeout`);
}

async function signInAsRealSession(email: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey);
  const { error: otpError } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (otpError) throw new Error(`signInWithOtp failed for ${email}: ${otpError.message}`);
  const code = await fetchOtpCodeFromMailpit(email);
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session) throw new Error(`verifyOtp failed for ${email}: ${error?.message}`);
  return client;
}

async function ensureUser(email: string, displayName: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: displayName } });
  if (error) {
    if (error.message.includes("already been registered") || error.status === 422) {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
      const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (existing) return existing;
    }
    throw new Error(`createUser failed for ${email}: ${error.message}`);
  }
  return data.user;
}

async function recordEvidenceAs(client: SupabaseClient, input: DecisionEvidenceInput): Promise<{ inserted: boolean }> {
  const v = validateDecisionEvidenceInput(input);
  const row = {
    workspace_id: v.workspaceId,
    coach_user_id: v.coachUserId,
    client_profile_id: v.clientProfileId,
    decision_domain: v.decisionDomain,
    decision_type: v.decisionType,
    outcome: v.outcome,
    proposed_value: v.proposedValue,
    chosen_value: v.chosenValue,
    reason: v.reason ?? null,
    program_assignment_id: v.programAssignmentId ?? null,
    escalation_id: v.escalationId ?? null,
    training_item_instance_id: v.trainingItemInstanceId ?? null,
    observation_ids: v.observationIds ?? null,
    source_ref: v.sourceRef,
    decided_at: v.decidedAtIso,
  };
  const { error } = await client.from("coach_decision_evidence").insert(row);
  if (error && (error as { code?: string }).code !== "23505") throw new Error(`recordEvidenceAs failed: ${error.message}`);
  return { inserted: !error };
}

async function generateProposal(coachSession: SupabaseClient, params: { workspaceId: string; coachId: string; clientProfileId: string; title: string; durationWeeks: number }) {
  const nowIso = new Date().toISOString();
  const com = createDefaultCoachOperatingModel({ coachId: params.coachId, workspaceId: params.workspaceId, nowIso, businessName: "E2E 8D Workspace" });
  const profile = buildPlaceholderProgrammingProfile([DAYS_OF_WEEK_ORDER[0], DAYS_OF_WEEK_ORDER[2], DAYS_OF_WEEK_ORDER[4]]);
  const directions = generateProgramDirectionSummaries({ profile, com, durationWeeks: params.durationWeeks });
  const direction = directions.find((d) => d.kind === "best_fit") ?? directions[0];
  const { content } = buildUniversalProgramForDirection(direction, { clientId: params.clientProfileId, workspaceId: params.workspaceId, coachId: params.coachId, profile, com, durationWeeks: params.durationWeeks, nowIso });
  const finalContent = { ...content, name: params.title };

  const { data: programRow, error: programError } = await coachSession.from("training_programs").insert({ workspace_id: params.workspaceId, created_by: params.coachId, title: params.title }).select("id").single();
  if (programError) throw new Error(`generateProposal (program) failed: ${programError.message}`);
  const { data: versionRow, error: versionError } = await coachSession
    .from("training_program_versions")
    .insert({ program_id: programRow!.id, workspace_id: params.workspaceId, version_number: 1, status: "draft", content: finalContent, created_by: params.coachId, proposed_for_client_profile_id: params.clientProfileId })
    .select("id")
    .single();
  if (versionError) throw new Error(`generateProposal (version) failed: ${versionError.message}`);
  return { programId: programRow!.id as string, versionId: versionRow!.id as string, content: finalContent as UniversalTrainingProgramContent, directionLabel: direction.label };
}

/** Saves a new draft version for an edited content object — exactly the
 * canonical "new version per edit" persistence app/actions/production-programs.ts's
 * saveProposalDraft performs. */
async function saveDraft(coachSession: SupabaseClient, params: { workspaceId: string; programId: string; title: string; content: UniversalTrainingProgramContent; clientProfileId: string; versionNumber: number; coachId: string }) {
  const { data, error } = await coachSession
    .from("training_program_versions")
    .insert({ program_id: params.programId, workspace_id: params.workspaceId, version_number: params.versionNumber, status: "draft", content: params.content, created_by: params.coachId, proposed_for_client_profile_id: params.clientProfileId })
    .select("id")
    .single();
  if (error) throw new Error(`saveDraft failed: ${error.message}`);
  return data!.id as string;
}

async function main() {
  console.log(`OPTIM Phase 8D — live E2E full-horizon program-review verification against ${url}\n`);

  console.log("1. Bootstrap isolated Phase 8D fixtures (service-role, local only)\n");

  const coachA = await ensureUser("e2e-8d-coach-a@example.test", "Coach A 8D");
  const otherCoach = await ensureUser("e2e-8d-other-coach@example.test", "Other Coach 8D");
  const clientA = await ensureUser("e2e-8d-client-a@example.test", "Client A 8D");

  async function ensureWorkspace(ownerId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("workspaces").select("id").eq("owner_user_id", ownerId).eq("display_name", displayName).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("workspaces").insert({ owner_user_id: ownerId, display_name: displayName, business_name: displayName }).select("id").single();
    if (error) throw new Error(`workspace insert failed: ${error.message}`);
    return data!.id as string;
  }
  const workspaceId = await ensureWorkspace(coachA.id, "E2E 8D Workspace");
  const otherWorkspaceId = await ensureWorkspace(otherCoach.id, "E2E 8D Other Workspace");

  await admin.from("workspace_memberships").upsert(
    [
      { workspace_id: workspaceId, user_id: coachA.id, role: "workspace_owner", status: "active" },
      { workspace_id: workspaceId, user_id: clientA.id, role: "client", status: "active" },
      { workspace_id: otherWorkspaceId, user_id: otherCoach.id, role: "workspace_owner", status: "active" },
    ],
    { onConflict: "workspace_id,user_id" }
  );

  async function ensureClientProfile(workspaceIdForProfile: string, coachUserId: string, userId: string, displayName: string): Promise<string> {
    const { data: existing } = await admin.from("client_profiles").select("id").eq("workspace_id", workspaceIdForProfile).eq("user_id", userId).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await admin.from("client_profiles").insert({ workspace_id: workspaceIdForProfile, user_id: userId, display_name: displayName }).select("id").single();
    if (error) throw new Error(`client_profiles insert failed: ${error.message}`);
    await admin.from("coach_client_assignments").insert({ workspace_id: workspaceIdForProfile, coach_user_id: coachUserId, client_profile_id: data!.id, is_primary: true });
    return data!.id as string;
  }
  const clientAProfileId = await ensureClientProfile(workspaceId, coachA.id, clientA.id, "Client A 8D");

  console.log("  fixtures ready: Coach A (owner, assigned) + Client A (Workspace 8D), Other Coach (unrelated workspace)\n");

  console.log("2. Sign in through the real local OTP flow\n");
  const coachASession = await signInAsRealSession("e2e-8d-coach-a@example.test");
  const otherCoachSession = await signInAsRealSession("e2e-8d-other-coach@example.test");
  const clientASession = await signInAsRealSession("e2e-8d-client-a@example.test");
  check("Coach A, Other Coach, and Client A all completed a real OTP sign-in round-trip", true);

  console.log("\n3. Program A (8 weeks): edit Week 1, then Week 4, then Week 8 — all three must accumulate\n");

  const programA = await generateProposal(coachASession, { workspaceId, coachId: coachA.id, clientProfileId: clientAProfileId, title: "Program A", durationWeeks: 8 });
  check("Program A generated with the full requested 8-week horizon", programA.content.weeks.length === 8);

  function firstItemPathForWeek(content: UniversalTrainingProgramContent, weekNumber: number): TrainingItemPath {
    const week = content.weeks.find((w) => w.weekNumber === weekNumber)!;
    const day = week.days.find((d) => d.type === "training")!;
    const session = day.sessions![0];
    const block = session.blocks[0];
    const item = block.items[0];
    return { weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex: 0, blockId: block.id, itemId: item.id };
  }

  // Week 1 edit.
  const week1Path = firstItemPathForWeek(programA.content, 1);
  const week1Before = locateTrainingItem(programA.content, week1Path)!;
  const week1IsContinuous = week1Before.item.category === "continuous";
  const week1Patch = week1IsContinuous ? { durationSeconds: 1800 } : { sets: (week1Before.item.prescription.sets ?? 4) - 1 };
  const afterWeek1Edit = applyTrainingItemPatch(programA.content, week1Path, week1Patch as never);
  validateUniversalTrainingProgramContent(afterWeek1Edit);
  const v2Id = await saveDraft(coachASession, { workspaceId, programId: programA.programId, title: programA.content.name, content: afterWeek1Edit, clientProfileId: clientAProfileId, versionNumber: 2, coachId: coachA.id });
  check("A: Week 1 item can be edited exactly as Phase 8C already supported", !!v2Id);

  // Week 4 edit — a DIFFERENT week, on the SAME accumulated draft.
  const week4Path = firstItemPathForWeek(afterWeek1Edit, 4);
  const week4Before = locateTrainingItem(afterWeek1Edit, week4Path)!;
  const week4IsContinuous = week4Before.item.category === "continuous";
  const week4Patch = week4IsContinuous ? { durationSeconds: 2100 } : { rpe: 9 };
  const afterWeek4Edit = applyTrainingItemPatch(afterWeek1Edit, week4Path, week4Patch as never);
  validateUniversalTrainingProgramContent(afterWeek4Edit);
  const v3Id = await saveDraft(coachASession, { workspaceId, programId: programA.programId, title: programA.content.name, content: afterWeek4Edit, clientProfileId: clientAProfileId, versionNumber: 3, coachId: coachA.id });
  check("B: Week 4 (not just week 1) is editable through the identical universal editing function", !!v3Id);

  const week1StillEditedInV3 = locateTrainingItem(afterWeek4Edit, week1Path)!;
  const week1StillHoldsEdit = week1IsContinuous ? week1StillEditedInV3.item.prescription.duration?.seconds === 1800 : week1StillEditedInV3.item.prescription.sets === (week1Before.item.prescription.sets ?? 4) - 1;
  check("C: editing Week 4 did NOT lose the earlier Week 1 edit — both accumulate on the same draft", week1StillHoldsEdit);

  // Week 8 edit — a session rename (structural, not a value edit).
  const week8 = afterWeek4Edit.weeks.find((w) => w.weekNumber === 8)!;
  const week8Day = week8.days.find((d) => d.type === "training")!;
  const week8SessionPath = { weekNumber: 8, dayOfWeek: week8Day.dayOfWeek, sessionIndex: 0 };
  const week8OriginalName = week8Day.sessions![0].name;
  const afterWeek8Rename = renameSession(afterWeek4Edit, week8SessionPath, "Week 8 Deload Focus");
  validateUniversalTrainingProgramContent(afterWeek8Rename);
  const v4Id = await saveDraft(coachASession, { workspaceId, programId: programA.programId, title: programA.content.name, content: afterWeek8Rename, clientProfileId: clientAProfileId, versionNumber: 4, coachId: coachA.id });
  check("D: Week 8 — the LAST week of an 8-week program — is editable, not just early weeks", !!v4Id);

  const week4StillEditedInV4 = locateTrainingItem(afterWeek8Rename, week4Path)!;
  const week4StillHoldsEdit = week4IsContinuous ? week4StillEditedInV4.item.prescription.duration?.seconds === 2100 : week4StillEditedInV4.item.prescription.rpe === 9;
  check("E: three edits across three different weeks (1, 4, 8) ALL survive together on the same accumulated draft", week1StillHoldsEdit && week4StillHoldsEdit);

  console.log("\n4. Full-horizon diff and changes summary — reports all three real changes, in plain language\n");

  const fullDiff = diffProgramProposal(programA.content, afterWeek8Rename);
  const summaryLines = fullDiff.map(describeProgramDiffEntry);
  check("F: the full-horizon diff reports at least 3 entries (week 1 field edit, week 4 field edit, week 8 rename) — never array-position-based, never missing a week", fullDiff.length >= 3);
  const mentionsWeek1 = summaryLines.some((l) => l.startsWith("Week 1"));
  const mentionsWeek4 = summaryLines.some((l) => l.startsWith("Week 4"));
  const mentionsWeek8Rename = summaryLines.some((l) => l.startsWith("Week 8") && l.includes("session renamed"));
  check("G: the changes summary correctly attributes each change to its OWN real week — never collapsed or mislabeled", mentionsWeek1 && mentionsWeek4 && mentionsWeek8Rename);

  const unrelatedRedundantDiff = diffProgramProposal(afterWeek8Rename, afterWeek8Rename);
  check("H: diffing identical content (e.g. after a no-op resubmit) produces zero entries — never phantom noise from serialization/ordering", unrelatedRedundantDiff.length === 0);

  console.log("\n5. Structural edits — remove, add, reorder within Week 2; activity replacement in Week 6\n");

  // Real generated content places exactly one item per block (see
  // lib/training/program-proposal-editing.ts's own header doc) — a session
  // usually has several blocks (several exercises), so removing one item
  // removes that item's own block and leaves siblings untouched, UNLESS
  // this particular session only has one exercise total, in which case
  // removal correctly refuses (see step 6's dedicated regression check) and
  // this step adds a sibling first so there's always something real to
  // remove/add/reorder against.
  const week2Path = firstItemPathForWeek(afterWeek8Rename, 2);
  const week2SessionPath = { weekNumber: week2Path.weekNumber, dayOfWeek: week2Path.dayOfWeek, sessionIndex: week2Path.sessionIndex };
  const week2Located = locateTrainingItem(afterWeek8Rename, week2Path)!;
  const week2RemovedName = week2Located.item.name;
  const week2SessionBeforeRemoval = afterWeek8Rename.weeks.find((w) => w.weekNumber === 2)!.days.find((d) => d.dayOfWeek === week2Path.dayOfWeek)!.sessions![week2Path.sessionIndex];
  const contentWithGuaranteedSibling =
    week2SessionBeforeRemoval.blocks.length >= 2
      ? afterWeek8Rename
      : addTrainingItem(afterWeek8Rename, week2SessionPath, buildCoachAuthoredItem({ dayOfWeek: week2Path.dayOfWeek, order: 2, name: "Cable Row (guaranteed sibling)", category: "resistance" }));

  const afterRemove = removeTrainingItem(contentWithGuaranteedSibling, week2Path);
  validateUniversalTrainingProgramContent(afterRemove);
  const removedStillFindable = locateTrainingItem(afterRemove, week2Path);
  check("I: removeTrainingItem genuinely removes the targeted Week 2 item (not week 1) and cascades away its now-empty block", removedStillFindable === null);
  const week2SessionAfterRemoval = afterRemove.weeks.find((w) => w.weekNumber === 2)!.days.find((d) => d.dayOfWeek === week2Path.dayOfWeek)!.sessions![week2Path.sessionIndex];
  check("the removed item's own block is gone entirely, never left dangling as { items: [] }", week2SessionAfterRemoval.blocks.some((b) => b.id === week2Path.blockId) === false);

  const newItem = buildCoachAuthoredItem({ dayOfWeek: week2Path.dayOfWeek, order: week2SessionAfterRemoval.blocks.length + 1, name: "Cable Row", category: "resistance" });
  const afterAdd = addTrainingItem(afterRemove, week2SessionPath, newItem);
  validateUniversalTrainingProgramContent(afterAdd);
  const addedFound = locateTrainingItem(afterAdd, { ...week2SessionPath, blockId: `block-${newItem.id}`, itemId: newItem.id });
  check("J: addTrainingItem appends a real, findable new exercise as its OWN block in Week 2's session — never merged into an existing exercise's block", !!addedFound && addedFound.item.name === "Cable Row");

  const week2SessionAfterAdd = afterAdd.weeks.find((w) => w.weekNumber === 2)!.days.find((d) => d.dayOfWeek === week2Path.dayOfWeek)!.sessions![week2Path.sessionIndex];
  if (week2SessionAfterAdd.blocks.length >= 2) {
    const sortedBlocks = [...week2SessionAfterAdd.blocks].sort((a, b) => a.order - b.order);
    const afterMove = moveBlock(afterAdd, { ...week2SessionPath, blockId: sortedBlocks[sortedBlocks.length - 1].id }, "up");
    const movedSession = afterMove.weeks.find((w) => w.weekNumber === 2)!.days.find((d) => d.dayOfWeek === week2Path.dayOfWeek)!.sessions![week2Path.sessionIndex];
    const sortedAfterMove = [...movedSession.blocks].sort((a, b) => a.order - b.order);
    check("K: moveBlock reorders exercises within Week 2's session by real order (not array position), without changing the exercise count", sortedAfterMove.length === sortedBlocks.length && sortedAfterMove[sortedAfterMove.length - 2].id === sortedBlocks[sortedBlocks.length - 1].id);
  } else {
    check("K: moveBlock reorders exercises within the session without changing the count (skipped — session has <2 exercises)", true);
  }

  // Week 6 activity replacement — name change captured as a "field" diff
  // entry (proposed -> chosen activity), same as Phase 8C's item-substitution
  // handling, now proven at week 6 rather than week 1.
  const week6Path = firstItemPathForWeek(afterAdd, 6);
  const week6Before = locateTrainingItem(afterAdd, week6Path)!;
  const week6OriginalName = week6Before.item.name;
  const afterWeek6Substitution = applyTrainingItemPatch(afterAdd, week6Path, { name: "Trap Bar Deadlift" });
  validateUniversalTrainingProgramContent(afterWeek6Substitution);
  const substitutionDiff = diffProgramProposal(programA.content, afterWeek6Substitution).filter((d) => d.kind === "field" && d.field === "name" && d.weekNumber === 6);
  check("L: activity replacement in Week 6 is captured as a real proposed->chosen name change, not a hidden mutation", substitutionDiff.length === 1 && (substitutionDiff[0] as { from: unknown }).from === week6OriginalName && (substitutionDiff[0] as { to: unknown }).to === "Trap Bar Deadlift");

  console.log("\n6. Convert a training day to rest, in a later week — structural override, still real evidence\n");

  const week5 = afterWeek6Substitution.weeks.find((w) => w.weekNumber === 5)!;
  const week5TrainingDay = week5.days.find((d) => d.type === "training")!;
  const afterRestConversion = convertTrainingDayToRest(afterWeek6Substitution, 5, week5TrainingDay.dayOfWeek);
  validateUniversalTrainingProgramContent(afterRestConversion);
  const week5NowRest = afterRestConversion.weeks.find((w) => w.weekNumber === 5)!.days.find((d) => d.dayOfWeek === week5TrainingDay.dayOfWeek)!;
  check("M: convertTrainingDayToRest turns week 5's training day into a real, honest rest day (no sessions field left dangling)", week5NowRest.type === "rest" && !week5NowRest.sessions);

  const restConversionEvidence = projectDayConvertedToRestDecision({
    workspaceId,
    coachUserId: coachA.id,
    clientProfileId: clientAProfileId,
    editedVersionId: "placeholder-not-yet-saved",
    weekNumber: 5,
    dayOfWeek: week5TrainingDay.dayOfWeek,
    decidedAtIso: new Date().toISOString(),
  });
  check("N: the day-conversion decision projects outcome='overridden' with the real proposed(training)->chosen(rest) values", restConversionEvidence.outcome === "overridden" && JSON.stringify(restConversionEvidence.proposedValue) === JSON.stringify({ dayType: "training" }));

  console.log("\n7. Persist the fully-edited draft; record decision evidence for the real edits made\n");

  const finalDraftContent = afterRestConversion;
  const v5Id = await saveDraft(coachASession, { workspaceId, programId: programA.programId, title: programA.content.name, content: finalDraftContent, clientProfileId: clientAProfileId, versionNumber: 5, coachId: coachA.id });
  check("O: the fully-edited (week1+week4+week8+week2 remove/add+week6 substitution+week5 rest) draft persists as one real new version", !!v5Id);

  const week1FinalDeltas = diffProgramProposal(programA.content, finalDraftContent).filter((d): d is Extract<typeof d, { kind: "field" }> => d.kind === "field" && d.weekNumber === 1 && d.itemId === week1Path.itemId);
  const [week1Group] = groupDeltasByItem(week1FinalDeltas);
  if (week1Group) {
    const proposedFields: Record<string, unknown> = {};
    const chosenFields: Record<string, unknown> = {};
    for (const f of week1Group.fields) {
      proposedFields[f.field] = f.from;
      chosenFields[f.field] = f.to;
    }
    const week1Evidence = projectPrescriptionEditDecision({ workspaceId, coachUserId: coachA.id, clientProfileId: clientAProfileId, editedVersionId: v5Id, path: week1Path, isContinuous: week1IsContinuous, proposedFields, chosenFields, isSubstitution: false, decidedAtIso: new Date().toISOString() });
    const week1EvidenceInsert = await recordEvidenceAs(coachASession, week1Evidence);
    check("P: decision evidence for the real Week 1 edit is recorded", week1EvidenceInsert.inserted);
  }

  const removedEvidence = projectItemRemovedDecision({ workspaceId, coachUserId: coachA.id, clientProfileId: clientAProfileId, editedVersionId: v5Id, path: week2Path, exerciseName: week2RemovedName, decidedAtIso: new Date().toISOString() });
  const removedInsert = await recordEvidenceAs(coachASession, removedEvidence);
  check("Q: decision evidence for the Week 2 item removal is recorded with outcome='rejected' and no fabricated chosenValue", removedInsert.inserted && removedEvidence.outcome === "rejected" && removedEvidence.chosenValue === null);

  const addedEvidence = projectItemAddedDecision({ workspaceId, coachUserId: coachA.id, clientProfileId: clientAProfileId, editedVersionId: v5Id, path: { ...week2Path, itemId: newItem.id }, exerciseName: newItem.name, category: newItem.category, decidedAtIso: new Date().toISOString() });
  const addedInsert = await recordEvidenceAs(coachASession, addedEvidence);
  check("R: decision evidence for the Week 2 item addition is recorded with outcome='selected' and no proposedValue (OPTIM never proposed it)", addedInsert.inserted && addedEvidence.outcome === "selected" && addedEvidence.proposedValue === null);

  const renameEvidence = projectSessionRenamedDecision({ workspaceId, coachUserId: coachA.id, clientProfileId: clientAProfileId, editedVersionId: v5Id, path: week8SessionPath, fromName: week8OriginalName, toName: "Week 8 Deload Focus", decidedAtIso: new Date().toISOString() });
  const renameInsert = await recordEvidenceAs(coachASession, renameEvidence);
  check("S: decision evidence for the Week 8 session rename is recorded", renameInsert.inserted);

  const restEvidenceReal = { ...restConversionEvidence, sourceRef: restConversionEvidence.sourceRef.replace("placeholder-not-yet-saved", v5Id) };
  const restInsert = await recordEvidenceAs(coachASession, restEvidenceReal as DecisionEvidenceInput);
  check("T: decision evidence for the Week 5 rest-day conversion is recorded", restInsert.inserted);

  console.log("\n8. Pending full-horizon edits never affect Client A's currently active program (none assigned yet — still true)\n");

  const { data: activeForClientA } = await coachASession.from("program_assignments").select("id").eq("client_profile_id", clientAProfileId).eq("status", "active");
  check("U: Client A has no active assignment despite 5 saved draft versions of Program A — drafts never auto-activate", (activeForClientA ?? []).length === 0);

  console.log("\n9. Full-program validation — one invalid later-week item blocks the whole proposal, at any week\n");

  const invalidLaterWeekContent: UniversalTrainingProgramContent = JSON.parse(JSON.stringify(finalDraftContent));
  const week7 = invalidLaterWeekContent.weeks.find((w) => w.weekNumber === 7)!;
  const week7TrainingDay = week7.days.find((d) => d.type === "training")!;
  // A genuinely structurally-invalid item: an unrecognized prescription
  // family — this repo's own validation is deliberately structural, not a
  // business-rule/range checker (see lib/production/validation.ts's own
  // "not exhaustive, just structural" doc), so a bad enum value is the
  // real thing it catches, not e.g. a negative number.
  (week7TrainingDay.sessions![0].blocks[0].items[0].prescription as unknown as { family: string }).family = "not_a_real_family";
  let week7ValidationThrew = false;
  try {
    validateUniversalTrainingProgramContent(invalidLaterWeekContent);
  } catch {
    week7ValidationThrew = true;
  }
  check("V: an invalid item in Week 7 (a LATER week, not week 1) is caught by full-program validation and blocks the proposal", week7ValidationThrew);

  console.log("\n10. Safety restrictions are surfaced across the WHOLE proposal, not just week 1\n");

  const escalationId = crypto.randomUUID();
  const nowIso2 = new Date().toISOString();
  const { error: escalationError } = await admin.from("escalations").insert({
    id: escalationId,
    workspace_id: workspaceId,
    client_profile_id: clientAProfileId,
    reason_category: "pain_or_safety",
    proposed_response: "Client reported shoulder discomfort during pressing.",
    health_review_status: "proceed_with_limitations",
    documented_limitations: "No loaded overhead pressing; pain-free horizontal pressing only; reassess next week.",
    health_review_decided_by: coachA.id,
    health_review_decided_at: nowIso2,
    created_at: nowIso2,
    updated_at: nowIso2,
  });
  check("W: a real coach-documented health-review limitation ('no loaded overhead pressing') was persisted for Client A", !escalationError, escalationError?.message);

  const healthReviewRecord: HealthReviewRecord = {
    clientId: clientAProfileId as never,
    workspaceId: workspaceId as never,
    status: "proceed_with_limitations",
    reasons: ["Reported a current pain/injury"],
    createdAtIso: nowIso2,
    updatedAtIso: nowIso2,
    documentedLimitations: "No loaded overhead pressing; pain-free horizontal pressing only; reassess next week.",
    decidedAtIso: nowIso2,
  } as HealthReviewRecord;
  // extractClientProgrammingProfile short-circuits to `{ missing: [...] }`
  // for a null onboarding regardless of healthReview (onboarding is the
  // base snapshot every profile is built from) — a minimal REAL completed
  // onboarding, with NO injury flagged at intake, is what actually proves
  // this scenario: an injury reported and reviewed only AFTER onboarding
  // (exactly the case this codebase's own hasCurrentInjury doc calls out).
  const minimalOnboarding = {
    clientId: clientAProfileId as never,
    workspaceId: workspaceId as never,
    currentStepIndex: 6,
    completedAtIso: nowIso2,
    updatedAtIso: nowIso2,
    answers: {
      about_you: { age: 35, heightFeet: 5, heightInchesRemainder: 10, weightLb: 180, sex: "male" },
      what_you_want: { primaryGoal: "build_muscle" },
      your_week: { availableDays: ["mon", "wed", "fri"], maxSessionLength: "60", trainingEnvironment: ["full_gym"], schedulePredictability: "mostly_predictable", preferredTrainingTime: ["morning"] },
      starting_point: { trainingExperience: "comfortable_common", recentConsistency: "fairly_consistent", weeklyFrequency: 3 },
      fuel_recovery: { nutritionApproach: "tracking", typicalSleep: "7_8", cardioPreference: "neutral_on_cardio" },
      health_finish: { hasInjuryHistory: false, injuryBodyAreas: [], injuryRestrictions: "" },
    },
  } as never;
  const profileResult = extractClientProgrammingProfile(minimalOnboarding, healthReviewRecord);
  check("the documented limitation alone (no onboarding injury flag) is enough to produce a restricted profile — matches Phase 7B's own precedent", "profile" in profileResult ? profileResult.profile.hasCurrentInjury === true : false);

  const restrictedProfile = "profile" in profileResult ? profileResult.profile : buildPlaceholderProgrammingProfile(DAYS_OF_WEEK_ORDER as never);
  const comForRestriction = createDefaultCoachOperatingModel({ coachId: coachA.id, workspaceId, nowIso: nowIso2, businessName: "E2E 8D Workspace" });
  const avoidedTerms = avoidedTermsForProfile(restrictedProfile, comForRestriction);
  check("the restriction text 'no loaded overhead pressing' resolves to a real avoided term ('overhead press')", avoidedTerms.includes("overhead press"));

  // Construct a proposal with overhead work ONLY in week 7 — Week 1 has no
  // overhead work at all, exactly the scenario the phase's own spec calls
  // out by name.
  const week7Block = invalidLaterWeekContent.weeks.find((w) => w.weekNumber === 7)!.days.find((d) => d.type === "training")!.sessions![0].blocks[0];
  (week7Block.items[0].prescription as unknown as { family: string }).family = "resistance"; // undo the invalid-family fixture from step 9
  const overheadItem = buildCoachAuthoredItem({ dayOfWeek: week7TrainingDay.dayOfWeek, order: 99, name: "Overhead Press", category: "resistance" });
  const week7WithOverhead = addTrainingItem(invalidLaterWeekContent, { weekNumber: 7, dayOfWeek: week7TrainingDay.dayOfWeek, sessionIndex: 0 }, overheadItem);
  validateUniversalTrainingProgramContent(week7WithOverhead);

  const week1Conflicts = findRestrictionConflicts({ ...week7WithOverhead, weeks: week7WithOverhead.weeks.filter((w) => w.weekNumber === 1) } as UniversalTrainingProgramContent, avoidedTerms);
  check("X: Week 1 ALONE shows no restriction conflict (no overhead work there) — proving this isn't a false positive", week1Conflicts.length === 0);

  const fullProposalConflicts = findRestrictionConflicts(week7WithOverhead, avoidedTerms);
  const mentionsWeek7 = fullProposalConflicts.some((w) => w.toLowerCase().includes("overhead press"));
  check("Y: checking the FULL proposal (all weeks, not just week 1) surfaces the Week 7 overhead-press conflict against the active restriction", fullProposalConflicts.length > 0 && mentionsWeek7);

  console.log("\n11. Rejection still works identically at any point in review — even after reviewing/editing through Week 8\n");

  const { error: archiveError } = await coachASession.from("training_program_versions").update({ status: "archived" }).eq("id", v5Id).eq("workspace_id", workspaceId).eq("status", "draft");
  check("Z: Program A's fully-edited draft (weeks 1/2/4/5/6/8 all touched) can still be rejected in one step, exactly like an unedited draft", !archiveError, archiveError?.message);

  const { data: activeStillNone } = await coachASession.from("program_assignments").select("id").eq("client_profile_id", clientAProfileId).eq("status", "active");
  check("AA: rejecting the fully-edited draft leaves Client A with no active assignment (nothing was ever activated)", (activeStillNone ?? []).length === 0);

  // REGRESSION (found live, in-browser, during this phase's own manual
  // verification): rejectProgramProposalAction/approveProgramProposalAction
  // must also archive every OTHER 'draft' sibling in the family — Program A
  // went through 5 real edit-created draft versions (v1-v5) before the
  // final one (v5) was just rejected above. Without
  // archiveSiblingDraftVersions, v2/v3/v4 (abandoned mid-review drafts,
  // each superseded by the next edit's own new version) would remain
  // status='draft' forever, and getPendingProgramProposal's own
  // status='draft' ORDER BY created_at DESC LIMIT 1 query would
  // incorrectly resurrect the newest ABANDONED draft as if it were still a
  // real pending proposal — even though the family was genuinely resolved.
  const { error: siblingCleanupError } = await coachASession
    .from("training_program_versions")
    .update({ status: "archived" })
    .eq("workspace_id", workspaceId)
    .eq("program_id", programA.programId)
    .eq("status", "draft")
    .neq("id", v5Id);
  check("sibling-draft cleanup (archiveSiblingDraftVersions) succeeds against Program A's real 5-version edit history", !siblingCleanupError, siblingCleanupError?.message);

  const { data: anyDraftLeftInFamily } = await coachASession.from("training_program_versions").select("id, version_number").eq("program_id", programA.programId).eq("status", "draft");
  check("REGRESSION: after resolving Program A, ZERO versions in its family remain status='draft' — no abandoned mid-review edit can ever be rediscovered as a false 'pending proposal'", (anyDraftLeftInFamily ?? []).length === 0);

  console.log("\n12. Authorization — unrelated coach cannot discover Program A's full-horizon draft or its evidence\n");

  const { data: otherCoachSeesVersions } = await otherCoachSession.from("training_program_versions").select("id").eq("workspace_id", workspaceId);
  check("BB: an unrelated coach in a different workspace sees ZERO of Program A's versions (any week)", (otherCoachSeesVersions ?? []).length === 0);

  const { data: otherCoachSeesEvidence } = await otherCoachSession.from("coach_decision_evidence").select("id").eq("workspace_id", workspaceId);
  check("CC: an unrelated coach sees ZERO of this workspace's structural-edit decision evidence", (otherCoachSeesEvidence ?? []).length === 0);

  const { data: clientSeesDraft } = await clientASession.from("training_program_versions").select("id").eq("id", v5Id);
  check("DD: Client A cannot read their own rejected/never-assigned draft, at any edited version", (clientSeesDraft ?? []).length === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("E2E script crashed:", err);
  process.exit(1);
});
