// Gate 4.0C-1 — server adapter: assembles a client's SynthesisInput from the
// canonical records, after authorizing the caller. Read-only — it writes
// nothing and adds no table. Not wired into any route yet; the first
// domain planner will be its first caller.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { canReadSynthesisState, type SynthesisActor } from "../synthesis/access.ts";
import { deriveClientState } from "../synthesis/client-state.ts";
import { FOUNDATION_KNOWLEDGE } from "../synthesis/knowledge/registry.ts";
import { buildSynthesisInput, type SynthesisInput } from "../synthesis/synthesis-input.ts";
import { getAuthenticatedContext } from "./auth.ts";
import { resolveCoachIntelligenceForClient } from "./coach-brain.ts";
import { UnauthorizedError } from "./errors.ts";
import { getOnboardingProgressForClient } from "./onboarding.ts";
import { resolveHealthReviewRecordForClient } from "./pain-safety.ts";

export async function loadSynthesisInputForClient(clientProfileId: string): Promise<SynthesisInput> {
  const ctx = await getAuthenticatedContext();
  const supabase = await getSupabaseServerClient();

  const { data: target, error } = await supabase.from("client_profiles").select("id, workspace_id").eq("id", clientProfileId).maybeSingle();
  if (error) throw new Error(`loadSynthesisInputForClient failed: ${error.message}`);
  if (!target) throw new UnauthorizedError(`User ${ctx.userId} cannot read synthesis state for ${clientProfileId}.`);
  const workspaceId = target.workspace_id as string;

  const [{ data: own }, { data: assignment }] = await Promise.all([
    supabase.from("client_profiles").select("id").eq("user_id", ctx.userId).maybeSingle(),
    supabase.from("coach_client_assignments").select("client_profile_id").eq("coach_user_id", ctx.userId).eq("client_profile_id", clientProfileId).maybeSingle(),
  ]);
  const actor: SynthesisActor = {
    userId: ctx.userId,
    memberships: ctx.memberships.map((m) => ({ workspaceId: m.workspaceId, role: m.role })),
    ownClientProfileId: (own?.id as string | undefined) ?? null,
    assignedClientProfileIds: assignment ? [clientProfileId] : [],
  };
  if (!canReadSynthesisState(actor, { clientProfileId, workspaceId })) {
    throw new UnauthorizedError(`User ${ctx.userId} cannot read synthesis state for ${clientProfileId}.`);
  }

  const [onboarding, healthReview, intelligence] = await Promise.all([
    getOnboardingProgressForClient(clientProfileId),
    resolveHealthReviewRecordForClient(clientProfileId, workspaceId),
    resolveCoachIntelligenceForClient({ workspaceId, clientProfileId }),
  ]);

  return buildSynthesisInput({
    knowledge: FOUNDATION_KNOWLEDGE,
    coachMethod: intelligence.method,
    client: deriveClientState({ clientProfileId, workspaceId, onboarding, healthReview }),
  });
}
