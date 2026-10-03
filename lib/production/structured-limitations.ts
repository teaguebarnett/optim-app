// Gate 4.0C-2A — coach language → confirmed structured limitations, and
// the review-only resistance planner preview, for the production client
// workspace.
//
// - proposeStructuredLimitations: reads the coach's documented limitation
//   (the existing health-review decision) and asks OPTIM's interpreter for
//   a PROPOSAL. Nothing is stored.
// - confirmStructuredLimitations: the coach's explicit confirmation — the
//   only write. Validated, stored on the same escalations row as the raw
//   text, and recorded as decision evidence (proposal vs. choice).
// - previewResistancePlan: runs the new planner in memory. Never publishes.
//
// Every entry point authorizes the caller as staff with authority over the
// client before reading anything.

import "server-only";
import { resolveStructuredJsonProvider } from "../ai/resolve.ts";
import { redactSecrets } from "../ai/safe-errors.ts";
import { recordDecisionEvidence } from "./decision-evidence.ts";
import { getAuthenticatedContext, isWorkspaceStaffRole, requireWorkspaceRole } from "./auth.ts";
import { UnauthorizedError } from "./errors.ts";
import { resolveHealthReviewRecordForClient } from "./pain-safety.ts";
import { loadSynthesisInputForClient } from "./synthesis.ts";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { FOUNDATION_KNOWLEDGE } from "../synthesis/knowledge/registry.ts";
import { buildConfirmation, isCurrentFor, parseStoredLimitations, type StoredStructuredLimitations } from "../synthesis/limitations/confirm.ts";
import { interpretLimitationText, type InterpretationProposal } from "../synthesis/limitations/interpret.ts";
import { RESOLVED_HEALTH_REVIEW_STATUSES } from "../coach/types.ts";
import { runPlanner } from "../synthesis/planner.ts";
import { RESISTANCE_PLANNER } from "../synthesis/planners/resistance/planner.ts";
import { plannerReviewView, type PlannerReviewView } from "../synthesis/planners/resistance/view.ts";

async function requireClientCoachAuthority(workspaceId: string, clientProfileId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  const supabase = await getSupabaseServerClient();
  const { data: profile } = await supabase.from("client_profiles").select("id").eq("id", clientProfileId).eq("workspace_id", workspaceId).maybeSingle();
  if (!profile) throw new UnauthorizedError();
  if (membership.role === "coach") {
    const { data } = await supabase.from("coach_client_assignments").select("coach_user_id").eq("client_profile_id", clientProfileId).eq("coach_user_id", ctx.userId).maybeSingle();
    if (!data) throw new UnauthorizedError();
  }
  return ctx;
}

export interface LimitationsState {
  /** The coach's documented limitation, verbatim (null when none). */
  documentedText: string | null;
  escalationId: string | null;
  status: "no_limitation" | "needs_confirmation" | "confirmed" | "stale" | "review_open";
  confirmed: StoredStructuredLimitations | null;
}

export async function getLimitationsState(params: { workspaceId: string; clientProfileId: string }): Promise<LimitationsState> {
  await requireClientCoachAuthority(params.workspaceId, params.clientProfileId);
  const review = await resolveHealthReviewRecordForClient(params.clientProfileId, params.workspaceId);
  if (!review) return { documentedText: null, escalationId: null, status: "no_limitation", confirmed: null };
  if (!RESOLVED_HEALTH_REVIEW_STATUSES.has(review.status)) return { documentedText: null, escalationId: review.decisionEscalationId ?? null, status: "review_open", confirmed: null };
  const text = review.documentedLimitations?.trim() || null;
  if (!text) return { documentedText: null, escalationId: review.decisionEscalationId ?? null, status: "no_limitation", confirmed: null };
  const stored = parseStoredLimitations(review.structuredLimitations, FOUNDATION_KNOWLEDGE);
  const status = !stored ? "needs_confirmation" : isCurrentFor(stored, text) ? "confirmed" : "stale";
  return { documentedText: text, escalationId: review.decisionEscalationId ?? null, status, confirmed: stored };
}

export async function proposeStructuredLimitations(params: { workspaceId: string; clientProfileId: string }): Promise<InterpretationProposal> {
  const state = await getLimitationsState(params);
  if (!state.documentedText) throw new Error("There's no documented limitation to interpret.");
  const resolved = resolveStructuredJsonProvider();
  const model = resolved.provider
    ? { modelId: resolved.provider.modelId, generateJson: (r: { systemPrompt: string; userMessage: string; maxOutputTokens: number }) => resolved.provider!.generateJson({ ...r, timeoutMs: resolved.timeoutMs }) }
    : null;
  if (!resolved.provider) console.error(`proposeStructuredLimitations: interpreter unavailable (${JSON.stringify({ ...resolved.diagnostic, keyProblem: resolved.keyProblem ?? null })})`);
  // Only the coach's limitation text and the canonical vocabulary are sent — no client identity or other health details.
  return interpretLimitationText({
    sourceText: state.documentedText,
    knowledge: FOUNDATION_KNOWLEDGE,
    model,
    unavailableReason: resolved.provider ? undefined : resolved.reason,
    // Safe metadata only (category / status class / request id) — never provider text or credentials.
    onDiagnostic: (d) => console.error(`proposeStructuredLimitations: ${d.outcome} (${redactSecrets(JSON.stringify({ detail: d.detail, diagnostic: d.diagnostic ?? null }))})`),
  });
}

export interface ConfirmLimitationsInput {
  workspaceId: string;
  clientProfileId: string;
  escalationId: string;
  sourceText: string;
  proposal: InterpretationProposal | null;
  selectedOptionIds: string[];
  clarificationAnswers: Record<string, string>;
  noExerciseRestrictions: boolean;
}

export async function confirmStructuredLimitations(input: ConfirmLimitationsInput): Promise<{ ok: true; record: StoredStructuredLimitations } | { ok: false; errors: string[] }> {
  const ctx = await requireClientCoachAuthority(input.workspaceId, input.clientProfileId);
  const state = await getLimitationsState(input);
  if (!state.documentedText || state.escalationId !== input.escalationId) return { ok: false, errors: ["This limitation changed or was replaced — reload and review it again."] };
  if (state.documentedText !== input.sourceText.trim()) return { ok: false, errors: ["The documented limitation changed since you opened it — reload and review it again."] };
  const nowIso = new Date().toISOString();
  const built = buildConfirmation({ sourceText: state.documentedText, proposal: input.proposal, selectedOptionIds: input.selectedOptionIds, clarificationAnswers: input.clarificationAnswers, noExerciseRestrictions: input.noExerciseRestrictions, coachUserId: ctx.userId, nowIso }, FOUNDATION_KNOWLEDGE);
  if (!built.ok) return built;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("escalations")
    .update({ structured_limitations: built.record, structured_limitations_confirmed_by: ctx.userId, structured_limitations_confirmed_at: nowIso, updated_at: nowIso })
    .eq("id", input.escalationId)
    .eq("workspace_id", input.workspaceId)
    .eq("client_profile_id", input.clientProfileId)
    .eq("reason_category", "pain_or_safety")
    .select("id");
  // Database without migration 030 yet: say so plainly rather than surfacing a column error.
  if (error && (error.code === "42703" || error.code === "PGRST204" || /structured_limitations/.test(error.message))) return { ok: false, errors: ["Saving confirmed limitations isn't enabled on this server yet. Nothing was saved."] };
  if (error) throw new Error(`confirmStructuredLimitations failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error("confirmStructuredLimitations: the health-review record wasn't found for this client.");

  // History (best-effort, after the canonical write), like recordHealthReviewDecision.
  try {
    const chosen = built.record.restrictions.map((r) => r.optionId);
    const proposed = input.proposal?.interpreter.kind === "model" ? input.proposal.restrictions.map((r) => r.optionId) : null;
    await recordDecisionEvidence({
      workspaceId: input.workspaceId,
      coachUserId: ctx.userId,
      clientProfileId: input.clientProfileId,
      decisionDomain: "safety",
      decisionType: "structured_limitations_confirmation",
      outcome: !proposed ? "selected" : JSON.stringify([...proposed].sort()) === JSON.stringify([...chosen].sort()) ? "approved" : "edited",
      proposedValue: proposed ? { optionIds: proposed, sourceText: built.record.sourceText } : null,
      chosenValue: { optionIds: chosen, sourceText: built.record.sourceText },
      escalationId: input.escalationId,
      sourceRef: `structured-limitations:${input.escalationId}:${nowIso}`,
      decidedAtIso: nowIso,
    });
  } catch (err) {
    console.error(`confirmStructuredLimitations: decision evidence failed (confirmation already saved): ${err instanceof Error ? err.message : String(err)}`);
  }
  return { ok: true, record: built.record };
}

/** The new resistance planner, run in memory for coach review. Never persisted or published. */
export async function previewResistancePlan(params: { workspaceId: string; clientProfileId: string }): Promise<PlannerReviewView> {
  await requireClientCoachAuthority(params.workspaceId, params.clientProfileId);
  const input = await loadSynthesisInputForClient(params.clientProfileId);
  return plannerReviewView(runPlanner(RESISTANCE_PLANNER, input, { nowIso: new Date().toISOString() }), FOUNDATION_KNOWLEDGE);
}
