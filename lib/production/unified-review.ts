// Gate U3B — Unified Coach Review and Prepared Decisions: the one coherent proposal a coach reviews, edits, approves
// or rejects. Every read and write goes through the caller's RLS-scoped Supabase client (same pattern as
// unified-drafts.ts), so the local e2e drives exactly this code with real signed-in sessions.
//
// - Edits never mutate a draft: each creates a NEW draft version in the same training program / nutrition plan family
//   (history kept), relinks the proposal, and is revalidated (lib/synthesis/unified/review.ts) against the current
//   client state, the confirmed restrictions and the coach's method.
// - Approval is the coach's decision bound to the exact draft versions + content hashes they reviewed. It publishes,
//   assigns and notifies NOTHING — atomic publication (U3C) will. Rejection archives the proposal's own drafts.
// - Nothing here touches an approved program, a confirmed restriction, the coach's method, or a domain the proposal
//   didn't produce, and nutrition edits can only change targets the coach's method prescribes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "../synthesis/reasoner/run.ts";
import type { SynthesisInput } from "../synthesis/synthesis-input.ts";
import type { FitnessKnowledgeRegistry } from "../synthesis/knowledge/types.ts";
import type { DomainId, UnifiedProgramProposal } from "../synthesis/unified/contract.ts";
import { approvalBlockers, documentedLimitations, reviewDecisions, revalidateDrafts, syncCardioSession, type RecordedAnswer, type ReviewDecision, type Revalidation } from "../synthesis/unified/review.ts";
import { applyTrainingItemPatch, removeTrainingItem, locateTrainingItem, type TrainingItemPatch, type TrainingItemPath } from "../training/program-proposal-editing.ts";
import type { UniversalTrainingProgramContent } from "../training/types.ts";
import type { AssignedNutritionPlan, NutritionTargets, PrescribedNutritionTargets } from "../types.ts";
import { summarizeNutritionPlan, type NutritionPlanSummary } from "../nutrition/plan-display.ts";
import { validateAssignedNutritionPlanContent, validateUniversalTrainingProgramContent } from "./validation.ts";
import { insertDraftNutritionVersion, insertDraftProgramVersion } from "./draft-versions.ts";
import type { UnifiedArtifacts } from "./unified-drafts.ts";

export interface ReviewEnv {
  supabase: SupabaseClient;
  userId: string;
  /** The client this review environment was built for — a proposal of any other client is refused. */
  clientProfileId: string;
  /** The client's CURRENT planning input (confirmed restrictions, availability, coach method). */
  input: SynthesisInput;
  knowledge: FitnessKnowledgeRegistry;
  /** The client's primary coach's active confirmed method version now. */
  currentMethodVersionId: string | null;
  /** The client's active program version now (for proposals built on an approved program). */
  activeProgramVersionId: string | null;
  nowIso: string;
}

export interface ReviewRevision {
  domain: "training" | "nutrition";
  fromVersionId: string;
  toVersionId: string;
  summary: string;
  byUserId: string;
  atIso: string;
}

interface ReviewRow {
  id: string;
  workspace_id: string;
  client_profile_id: string;
  title: string;
  status: string;
  approval_state: "proposed" | "approved" | "rejected";
  proposal: UnifiedProgramProposal;
  domain_runs: UnifiedArtifacts;
  nutrition_strategy: { reason: string; strategy: unknown } | null;
  training_program_version_id: string | null;
  nutrition_plan_version_id: string | null;
  resistance_source: "approved_program" | "proposed_program" | "existing_draft" | "none" | null;
  source_resistance_version_id: string | null;
  coach_decisions: Record<string, RecordedAnswer>;
  review_revisions: ReviewRevision[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}
const COLS = "id, workspace_id, client_profile_id, title, status, approval_state, proposal, domain_runs, nutrition_strategy, training_program_version_id, nutrition_plan_version_id, resistance_source, source_resistance_version_id, coach_decisions, review_revisions, reviewed_by, reviewed_at, rejection_reason, created_at";
const REVIEWABLE = ["draft_ready", "needs_coach_decision", "incomplete"];

export interface EvidenceItem {
  decision: string;
  because: string;
  sources: Array<{ id: string; title: string }>;
}

export interface UnifiedReviewView {
  rowId: string;
  title: string;
  status: string;
  approvalState: ReviewRow["approval_state"];
  createdAtIso: string;
  reviewedAtIso: string | null;
  rejectionReason: string | null;
  /** Where the lifting came from — lifting from an approved program is read-only here. */
  resistanceSource: ReviewRow["resistance_source"];
  proposal: Pick<UnifiedProgramProposal, "objective" | "domains" | "recovery" | "progression" | "monitoring" | "assumptions" | "uncertainties" | "escalations" | "questions"> & { coachMethodVersion: number | null; modelCalls: number };
  evidence: Partial<Record<DomainId, EvidenceItem[]>>;
  training: { versionId: string; content: UniversalTrainingProgramContent } | null;
  nutrition: { versionId: string; content: AssignedNutritionPlan; summary: NutritionPlanSummary } | null;
  /** Kept on the row when the strategy couldn't become a client plan (e.g. a minor's plan for human review). */
  nutritionStrategy: ReviewRow["nutrition_strategy"];
  revalidation: Revalidation;
  decisions: ReviewDecision[];
  staleReasons: string[];
  blockers: string[];
  revisions: ReviewRevision[];
  documentedLimitations: string | null;
}

export class ReviewConflictError extends Error {}

// --- Authorization ------------------------------------------------------------------------------------------------

/** The client's assigned coach or a workspace admin (owner / platform admin). The DB trigger enforces the same. */
async function assertReviewer(env: ReviewEnv, workspaceId: string, clientProfileId: string): Promise<void> {
  const { data: m } = await env.supabase.from("workspace_memberships").select("role, status").eq("workspace_id", workspaceId).eq("user_id", env.userId).maybeSingle();
  const role = m?.status === "active" ? (m.role as string) : null;
  if (role === "workspace_owner" || role === "platform_admin") return;
  if (role === "coach") {
    const { data } = await env.supabase.from("coach_client_assignments").select("coach_user_id").eq("client_profile_id", clientProfileId).eq("coach_user_id", env.userId).maybeSingle();
    if (data) return;
  }
  throw new Error("Only the client's assigned coach or a workspace admin can review this proposal.");
}

async function loadRow(env: ReviewEnv, rowId: string): Promise<ReviewRow> {
  const { data, error } = await env.supabase.from("unified_program_proposals").select(COLS).eq("id", rowId).maybeSingle();
  if (error) throw new Error(`unified review: ${error.message}`);
  if (!data) throw new Error("That unified proposal doesn't exist or isn't visible to you.");
  const row = data as ReviewRow;
  if (row.client_profile_id !== env.clientProfileId) throw new Error("That proposal belongs to a different client.");
  await assertReviewer(env, row.workspace_id, row.client_profile_id);
  return row;
}

async function trainingVersion(env: ReviewEnv, id: string | null) {
  if (!id) return null;
  const { data, error } = await env.supabase.from("training_program_versions").select("id, program_id, status, content").eq("id", id).single();
  if (error) throw new Error(`unified review (training version): ${error.message}`);
  return data as { id: string; program_id: string; status: string; content: UniversalTrainingProgramContent };
}
async function nutritionVersion(env: ReviewEnv, id: string | null) {
  if (!id) return null;
  const { data, error } = await env.supabase.from("nutrition_plan_versions").select("id, plan_id, status, content").eq("id", id).single();
  if (error) throw new Error(`unified review (nutrition version): ${error.message}`);
  return data as { id: string; plan_id: string; status: string; content: AssignedNutritionPlan };
}

const originalId = (row: ReviewRow, domain: "training" | "nutrition") => row.review_revisions.find((r) => r.domain === domain)?.fromVersionId ?? (domain === "training" ? row.training_program_version_id : row.nutrition_plan_version_id);

// --- Review model ---------------------------------------------------------------------------------------------------

function staleReasonsFor(env: ReviewEnv, row: ReviewRow): string[] {
  const p = row.proposal.provenance;
  const out: string[] = [];
  if (p.coachMethod?.versionId && env.currentMethodVersionId !== p.coachMethod.versionId) out.push("The coach's confirmed method changed since this proposal was prepared — prepare a new one.");
  if (sha256(env.input.client) !== p.clientState) out.push("The client's planning facts or confirmed restrictions changed since this proposal was prepared — prepare a new one.");
  if (sha256(env.input.goal) !== p.goalContract) out.push("The client's goal changed since this proposal was prepared — prepare a new one.");
  if (row.resistance_source === "approved_program" && env.activeProgramVersionId !== row.source_resistance_version_id) out.push("The client's approved program isn't the one this proposal was built around anymore.");
  return out;
}

function evidenceFor(env: ReviewEnv, a: UnifiedArtifacts): UnifiedReviewView["evidence"] {
  const title = (id: string) => {
    const e = (env.knowledge.get(id) ?? env.knowledge.concept(id)) as { name?: string } | undefined;
    return { id, title: e?.name ?? id };
  };
  const from = (ds: Array<{ decision: string; because: string; knowledgeRefs: string[] }>) => ds.map((d) => ({ decision: d.decision, because: d.because, sources: d.knowledgeRefs.map(title) }));
  const out: UnifiedReviewView["evidence"] = {};
  if (a.resistance?.source === "proposed_program") {
    const plan = a.resistance.result.plan as unknown as Record<string, { rationale?: string; name?: string } | undefined>;
    out.resistance = (["goalEmphasis", "frequency", "schedule", "architecture"] as const).filter((k) => plan[k]?.rationale).map((k) => ({ decision: k.replace(/([A-Z])/g, " $1").toLowerCase(), because: plan[k]!.rationale!, sources: [] }));
  }
  if (a.cardio?.status === "PLANNED") out.cardio = from(a.cardio.plan.decisions);
  if (a.nutrition && (a.nutrition.status === "PLANNED" || a.nutrition.status === "NEEDS_COACH_REVIEW")) out.nutrition = from(a.nutrition.plan.decisions);
  return out;
}

async function buildView(env: ReviewEnv, row: ReviewRow): Promise<UnifiedReviewView> {
  const [t, n, ot, on] = await Promise.all([
    trainingVersion(env, row.training_program_version_id),
    nutritionVersion(env, row.nutrition_plan_version_id),
    trainingVersion(env, originalId(row, "training")),
    nutritionVersion(env, originalId(row, "nutrition")),
  ]);
  const a = row.domain_runs;
  const revalidation = revalidateDrafts({
    input: env.input,
    knowledge: env.knowledge,
    proposal: row.proposal,
    resistanceSource: row.resistance_source,
    cardio: a.cardio ?? null,
    nutrition: a.nutrition ?? null,
    original: { training: ot?.content ?? null, nutrition: on?.content ?? null },
    current: { training: t?.content ?? null, nutrition: n?.content ?? null },
    versions: { training: t?.id ?? null, nutrition: n?.id ?? null },
  });
  const decisions = reviewDecisions(row.proposal, revalidation, row.coach_decisions ?? {});
  const staleReasons = row.approval_state === "proposed" ? staleReasonsFor(env, row) : [];
  const u = row.proposal;
  return {
    rowId: row.id,
    title: row.title,
    status: row.status,
    approvalState: row.approval_state,
    createdAtIso: row.created_at,
    reviewedAtIso: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    resistanceSource: row.resistance_source,
    proposal: { objective: u.objective, domains: u.domains, recovery: u.recovery, progression: u.progression, monitoring: u.monitoring, assumptions: u.assumptions, uncertainties: u.uncertainties, escalations: u.escalations, questions: u.questions, coachMethodVersion: u.provenance.coachMethod?.version ?? null, modelCalls: u.provenance.modelCalls },
    evidence: evidenceFor(env, a),
    training: t ? { versionId: t.id, content: t.content } : null,
    nutrition: n ? { versionId: n.id, content: n.content, summary: summarizeNutritionPlan(n.content) } : null,
    nutritionStrategy: row.nutrition_strategy,
    revalidation,
    decisions,
    staleReasons,
    blockers: row.approval_state === "proposed" ? approvalBlockers({ approvalState: row.approval_state, status: row.status, hasDrafts: !!(t || n), revalidation, decisions, staleReasons, escalations: u.escalations.length }) : [],
    revisions: row.review_revisions ?? [],
    documentedLimitations: documentedLimitations(env.input),
  };
}

/** The client's latest unified proposal that a coach can review (or the latest decided one, for the record). */
export async function getUnifiedReview(env: ReviewEnv, p: { workspaceId: string; clientProfileId: string }): Promise<UnifiedReviewView | null> {
  if (p.clientProfileId !== env.clientProfileId) throw new Error("That review belongs to a different client.");
  await assertReviewer(env, p.workspaceId, p.clientProfileId);
  const { data, error } = await env.supabase.from("unified_program_proposals").select(COLS).eq("workspace_id", p.workspaceId).eq("client_profile_id", p.clientProfileId).in("status", REVIEWABLE).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`unified review: ${error.message}`);
  return data ? buildView(env, data as ReviewRow) : null;
}

export async function getUnifiedReviewById(env: ReviewEnv, rowId: string): Promise<UnifiedReviewView> {
  return buildView(env, await loadRow(env, rowId));
}

function requireOpen(row: ReviewRow) {
  if (row.approval_state !== "proposed") throw new ReviewConflictError(`This proposal was already ${row.approval_state}.`);
  if (!REVIEWABLE.includes(row.status)) throw new ReviewConflictError(`This proposal is ${row.status.replace(/_/g, " ")} and can't be reviewed.`);
}

// --- Decisions ------------------------------------------------------------------------------------------------------

export async function recordUnifiedDecision(env: ReviewEnv, p: { rowId: string; key: string; answer: string }): Promise<UnifiedReviewView> {
  const row = await loadRow(env, p.rowId);
  requireOpen(row);
  const answer = p.answer.trim();
  if (!answer || answer.length > 500) throw new Error("An answer of 1–500 characters is required.");
  const view = await buildView(env, row);
  const d = view.decisions.find((x) => x.key === p.key);
  if (!d) throw new ReviewConflictError("That decision is no longer part of this proposal — reload the review.");
  const next = { ...(row.coach_decisions ?? {}), [p.key]: { answer, question: d.question, decidedBy: env.userId, decidedAtIso: env.nowIso } };
  const { data, error } = await env.supabase.from("unified_program_proposals").update({ coach_decisions: next }).eq("id", row.id).eq("approval_state", "proposed").select("id");
  if (error) throw new Error(`recordUnifiedDecision: ${error.message}`);
  if (!data?.length) throw new ReviewConflictError("This proposal changed while you were answering — reload the review.");
  return getUnifiedReviewById(env, row.id);
}

// --- Edits ------------------------------------------------------------------------------------------------------------

async function relink(env: ReviewEnv, row: ReviewRow, domain: "training" | "nutrition", expected: string, created: { versionId: string; table: "training_program_versions" | "nutrition_plan_versions" }, summary: string) {
  const col = domain === "training" ? "training_program_version_id" : "nutrition_plan_version_id";
  const revisions: ReviewRevision[] = [...(row.review_revisions ?? []), { domain, fromVersionId: expected, toVersionId: created.versionId, summary, byUserId: env.userId, atIso: env.nowIso }];
  const { data, error } = await env.supabase.from("unified_program_proposals").update({ [col]: created.versionId, review_revisions: revisions }).eq("id", row.id).eq("approval_state", "proposed").eq(col, expected).select("id");
  if (error || !data?.length) {
    // Never leave an orphaned draft that looks reviewable.
    await env.supabase.from(created.table).update({ status: "archived" }).eq("id", created.versionId).eq("status", "draft");
    if (error) throw new Error(`unified review (relink): ${error.message}`);
    throw new ReviewConflictError("Someone else changed this proposal first — reload the review and redo the edit.");
  }
}

const PATCH_LABEL: Record<string, string> = { sets: "sets", repsLow: "reps", repsHigh: "reps", rpe: "RPE", durationSeconds: "duration", effortLow: "effort", effortHigh: "effort", rounds: "rounds", workIntervalSeconds: "work interval", recoveryIntervalSeconds: "recovery interval", name: "exercise", restSeconds: "rest", loadValue: "load" };

export type TrainingEdit = { kind: "patch"; path: TrainingItemPath; patch: TrainingItemPatch } | { kind: "remove"; path: TrainingItemPath };

export async function editUnifiedTraining(env: ReviewEnv, p: { rowId: string; expectedVersionId: string; edit: TrainingEdit }): Promise<UnifiedReviewView> {
  const row = await loadRow(env, p.rowId);
  requireOpen(row);
  if (!row.training_program_version_id) throw new Error("This proposal has no training draft; one can't be added in review.");
  if (row.training_program_version_id !== p.expectedVersionId) throw new ReviewConflictError("The training draft changed since you opened it — reload the review.");
  const current = await trainingVersion(env, row.training_program_version_id);
  if (!current || current.status !== "draft") throw new ReviewConflictError("There's no training draft to edit.");
  const located = locateTrainingItem(current.content, p.edit.path);
  if (!located) throw new Error("No training item at that path.");
  if (row.resistance_source === "approved_program" && located.item.prescription.family === "resistance") throw new Error("This lifting comes from the client's approved program; change it through a program adjustment, not this review.");
  const next = p.edit.kind === "patch" ? syncCardioSession(applyTrainingItemPatch(current.content, p.edit.path, p.edit.patch), p.edit.path) : removeTrainingItem(current.content, p.edit.path);
  validateUniversalTrainingProgramContent(next);
  if (sha256(next) === sha256(current.content)) return getUnifiedReviewById(env, row.id);
  const created = await insertDraftProgramVersion(env.supabase, env.userId, { workspaceId: row.workspace_id, programId: current.program_id, title: next.name, content: next });
  const what = `${located.item.name} (week ${p.edit.path.weekNumber}, ${p.edit.path.dayOfWeek})`;
  await relink(env, row, "training", current.id, { versionId: created.versionId, table: "training_program_versions" }, p.edit.kind === "remove" ? `Removed ${what}` : `Edited ${what}: ${[...new Set(Object.keys(p.edit.patch).map((k) => PATCH_LABEL[k] ?? k))].join(", ")}`);
  return getUnifiedReviewById(env, row.id);
}

export interface NutritionEdit {
  /** Only targets the plan already prescribes can change (null = keep). Legacy four-number plans: all four. */
  targets?: Partial<Record<keyof PrescribedNutritionTargets, number>>;
  meals?: Array<{ index: number; intent?: string; timing?: string }>;
  habits?: string[];
}

/** Pure: the edited nutrition content, or an error — never adds a target the method doesn't prescribe. */
export function applyNutritionEdit(content: AssignedNutritionPlan, edit: NutritionEdit): AssignedNutritionPlan {
  const next: AssignedNutritionPlan = structuredClone(content);
  const keys = Object.keys(edit.targets ?? {}) as Array<keyof PrescribedNutritionTargets>;
  if (next.method) {
    const m = next.method;
    for (const k of keys) {
      if (m.prescribed[k] === null) throw new Error(`This plan doesn't prescribe a ${k.replace(/G$/, "")} target — the coach's method sets which targets exist.`);
      const v = edit.targets![k]!;
      if (!Number.isFinite(v) || v <= 0) throw new Error(`${k} must be a positive number.`);
      const delta = v - m.prescribed[k]!;
      m.prescribed[k] = Math.round(v);
      for (const day of [m.trainingDay, m.restDay]) if (day && day[k] !== null) day[k] = Math.round(day[k]! + delta);
    }
    const all = (["calories", "proteinG", "carbsG", "fatG"] as const).every((k) => m.prescribed[k] !== null);
    next.targets = all ? ({ calories: m.prescribed.calories!, proteinG: m.prescribed.proteinG!, carbsG: m.prescribed.carbsG!, fatG: m.prescribed.fatG! } as NutritionTargets) : null;
    if (next.usesTrainingRestSplit && all && m.trainingDay && m.restDay) {
      next.trainingDayTargets = { ...(m.trainingDay as NutritionTargets) };
      next.restDayTargets = { ...(m.restDay as NutritionTargets) };
    }
    for (const e of edit.meals ?? []) {
      const slot = m.meals[e.index];
      if (!slot) throw new Error(`No meal ${e.index + 1} in this plan.`);
      if (e.intent !== undefined) slot.intent = e.intent.trim();
      if (e.timing !== undefined) slot.timing = e.timing.trim();
    }
    if (edit.habits) m.habits = edit.habits.map((h) => h.trim()).filter(Boolean);
  } else {
    if (!next.targets) throw new Error("This plan has no targets to edit.");
    for (const k of keys) next.targets[k] = Math.round(edit.targets![k]!);
    if (edit.meals?.length || edit.habits) throw new Error("This plan has no structured meals or habits to edit.");
  }
  return next;
}

export async function editUnifiedNutrition(env: ReviewEnv, p: { rowId: string; expectedVersionId: string; edit: NutritionEdit }): Promise<UnifiedReviewView> {
  const row = await loadRow(env, p.rowId);
  requireOpen(row);
  if (!row.nutrition_plan_version_id) throw new Error(`This proposal has no nutrition plan (nutrition is ${row.proposal.domains.nutrition.status.toLowerCase().replace(/_/g, " ")}); one can't be added in review.`);
  if (row.nutrition_plan_version_id !== p.expectedVersionId) throw new ReviewConflictError("The nutrition draft changed since you opened it — reload the review.");
  const current = await nutritionVersion(env, row.nutrition_plan_version_id);
  if (!current || current.status !== "draft") throw new ReviewConflictError("There's no nutrition draft to edit.");
  const next = applyNutritionEdit(current.content, p.edit);
  validateAssignedNutritionPlanContent(next);
  if (sha256(next) === sha256(current.content)) return getUnifiedReviewById(env, row.id);
  const created = await insertDraftNutritionVersion(env.supabase, env.userId, { workspaceId: row.workspace_id, planId: current.plan_id, title: `${row.title} — nutrition`, content: next });
  const NLABEL: Record<string, string> = { calories: "calories", proteinG: "protein (g)", carbsG: "carbs (g)", fatG: "fat (g)" };
  const parts = [...Object.entries(p.edit.targets ?? {}).map(([k, v]) => `${NLABEL[k] ?? k} → ${v}`), ...(p.edit.meals?.length ? [`${p.edit.meals.length} meal note(s)`] : []), ...(p.edit.habits ? ["habits"] : [])];
  await relink(env, row, "nutrition", current.id, { versionId: created.versionId, table: "nutrition_plan_versions" }, `Edited nutrition: ${parts.join(", ")}`);
  return getUnifiedReviewById(env, row.id);
}

// --- Approve / reject -------------------------------------------------------------------------------------------------

/** Records the coach's approval of exactly the versions they reviewed. Publishes, assigns and notifies nothing. */
export async function approveUnifiedProposal(env: ReviewEnv, p: { rowId: string; expected: { training: string | null; nutrition: string | null } }): Promise<UnifiedReviewView> {
  const row = await loadRow(env, p.rowId);
  requireOpen(row);
  if (row.training_program_version_id !== p.expected.training || row.nutrition_plan_version_id !== p.expected.nutrition) throw new ReviewConflictError("The drafts changed since you reviewed them — reload and review again before approving.");
  const view = await buildView(env, row);
  if (view.blockers.length) throw new Error(`This proposal can't be approved yet: ${view.blockers.join(" ")}`);
  const hashes = { training: view.training ? sha256(view.training.content) : null, nutrition: view.nutrition ? sha256(view.nutrition.content) : null };
  const { data, error } = await env.supabase
    .from("unified_program_proposals")
    .update({ approval_state: "approved", reviewed_by: env.userId, reviewed_at: env.nowIso, approved_training_version_id: row.training_program_version_id, approved_nutrition_version_id: row.nutrition_plan_version_id, approved_content_hashes: hashes })
    .eq("id", row.id)
    .eq("approval_state", "proposed")
    .select("id");
  if (error) throw new Error(`approveUnifiedProposal: ${error.message}`);
  if (!data?.length) throw new ReviewConflictError("This proposal changed while you were approving — reload the review.");
  return getUnifiedReviewById(env, row.id);
}

/** Rejects the proposal and archives its own drafts (every version this review created) — nothing else. */
export async function rejectUnifiedProposal(env: ReviewEnv, p: { rowId: string; reason?: string }): Promise<UnifiedReviewView> {
  const row = await loadRow(env, p.rowId);
  if (row.approval_state === "rejected") return buildView(env, row);
  requireOpen(row);
  const reason = p.reason?.trim() ? p.reason.trim().slice(0, 1000) : null;
  const { data, error } = await env.supabase.from("unified_program_proposals").update({ approval_state: "rejected", reviewed_by: env.userId, reviewed_at: env.nowIso, rejection_reason: reason }).eq("id", row.id).eq("approval_state", "proposed").select("id");
  if (error) throw new Error(`rejectUnifiedProposal: ${error.message}`);
  if (!data?.length) throw new ReviewConflictError("This proposal changed while you were rejecting it — reload the review.");
  const trainingIds = [...new Set([row.training_program_version_id, ...row.review_revisions.filter((r) => r.domain === "training").flatMap((r) => [r.fromVersionId, r.toVersionId])].filter((x): x is string => !!x))];
  const nutritionIds = [...new Set([row.nutrition_plan_version_id, ...row.review_revisions.filter((r) => r.domain === "nutrition").flatMap((r) => [r.fromVersionId, r.toVersionId])].filter((x): x is string => !!x))];
  // Only this proposal's own drafts (U2 creates them for the proposal; the coach's source draft is never linked).
  if (trainingIds.length) await env.supabase.from("training_program_versions").update({ status: "archived" }).in("id", trainingIds).eq("status", "draft");
  if (nutritionIds.length) await env.supabase.from("nutrition_plan_versions").update({ status: "archived" }).in("id", nutritionIds).eq("status", "draft");
  return getUnifiedReviewById(env, row.id);
}
