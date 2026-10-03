// Gate 4.0C-3 — runs Fitness Reasoner v1 for ONE client, in memory, for
// internal review. Authorizes the caller first, normalizes through the
// synthesis layer, calls the model through the canonical provider
// boundary, and never persists, approves or publishes anything.

import "server-only";
import { resolveStructuredJsonProvider } from "../ai/resolve.ts";
import { getAuthenticatedContext, isWorkspaceStaffRole, requireWorkspaceRole } from "./auth.ts";
import { UnauthorizedError } from "./errors.ts";
import { loadSynthesisInputForClient } from "./synthesis.ts";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { FOUNDATION_KNOWLEDGE } from "../synthesis/knowledge/registry.ts";
import { runFitnessReasoner, PROVIDER_FAILED_MESSAGE } from "../synthesis/reasoner/reasoner.ts";
import { reasonerReviewView, type ReasonerReviewView } from "../synthesis/reasoner/view.ts";

const REASONER_TIMEOUT_MS = 300_000;

export async function runFitnessReasonerPreview(params: { workspaceId: string; clientProfileId: string }): Promise<ReasonerReviewView> {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, params.workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  if (membership.role === "coach") {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.from("coach_client_assignments").select("coach_user_id").eq("client_profile_id", params.clientProfileId).eq("coach_user_id", ctx.userId).maybeSingle();
    if (!data) throw new UnauthorizedError();
  }
  const input = await loadSynthesisInputForClient(params.clientProfileId);
  const resolved = resolveStructuredJsonProvider();
  const model = resolved.provider
    ? { modelId: resolved.provider.modelId, generateJson: (r: { systemPrompt: string; userMessage: string; maxOutputTokens: number }) => resolved.provider!.generateJson({ ...r, timeoutMs: REASONER_TIMEOUT_MS, effort: "high" }) }
    : null;
  const result = await runFitnessReasoner({
    input,
    model,
    nowIso: new Date().toISOString(),
    // Safe metadata only — stage + error name / validator summary; never provider text or credentials.
    onDiagnostic: (d) => console.error(`runFitnessReasonerPreview: ${d.stage} (${d.detail.slice(0, 200)})`),
  });
  const view = reasonerReviewView(result, FOUNDATION_KNOWLEDGE);
  return result.status === "PROVIDER_FAILED" ? { ...view, message: PROVIDER_FAILED_MESSAGE } : view;
}
