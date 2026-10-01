// Gate 2 — Coach dashboard launch pass: the real Supabase-mode read
// boundary for the live coach dashboard.
//
// Gathers already-persisted records into a CoachDashboardInput and nothing
// more — every zone decision lives in lib/coach/dashboard-zones.ts (pure,
// unit-tested). No schema change, no new table, no model call: one bounded
// query per source, regardless of roster size (the roster read itself is the
// existing listRosterForOwnWorkspace, unchanged apart from carrying through
// facts it already reads).
//
// Security: every read below runs as the CALLER's own authenticated session
// (getSupabaseServerClient — never the admin client), keyed on the
// workspaceId the attention inbox re-derived from that session
// (resolveOwnStaffWorkspace). RLS remains the backstop exactly as it is for
// every other coach read: escalations/conversations/messages are scoped by
// app_private.can_access_client, program versions by workspace staff.
//
// Failure posture: the attention inbox and roster are the dashboard's core —
// if they fail, the error propagates to app/coach/error.tsx as before. Every
// supporting read degrades to "unavailable", which the dashboard states
// plainly instead of rendering a falsely calm briefing.

import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { getAttentionInboxForRequest, type CoachAttentionInbox } from "./coach-operations.ts";
import { listRosterForOwnWorkspace } from "./roster.ts";
import { getOwnCoachIntelligence } from "./coach-brain.ts";
import { getEligibleCandidatesForReview, getMyLearnedRules, type EligibleCandidateSummary, type LearnedRuleRecord } from "./learned-rules.ts";
import { hasVerifiedGenerationInputs } from "../coach/generation-prerequisites.ts";
import {
  HANDLED_WINDOW_DAYS,
  type CoachDashboardInput,
  type DashboardCoachThread,
  type DashboardOptimAnswer,
  type DashboardProgramDraft,
  type DashboardResolvedEscalation,
} from "../coach/dashboard-zones.ts";
import type { EscalationReason } from "../communications/types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CoachDashboardData {
  inbox: CoachAttentionInbox;
  input: CoachDashboardInput;
  /** Raw records the existing confirmation/learned-rule components render. */
  patternCandidates: EligibleCandidateSummary[];
  learnedRules: LearnedRuleRecord[];
}

type Supabase = Awaited<ReturnType<typeof getSupabaseServerClient>>;

/** Who spoke last in each open coach_responded thread. A thread with no
 * readable messages is left out, so its escalation stays in NEEDS YOU. */
async function readCoachThreads(supabase: Supabase, workspaceId: string, escalationIds: string[]): Promise<Record<string, DashboardCoachThread>> {
  if (escalationIds.length === 0) return {};
  const { data: convos, error } = await supabase
    .from("conversations")
    .select("id, escalation_id")
    .eq("workspace_id", workspaceId)
    .eq("kind", "coach_escalation")
    .in("escalation_id", escalationIds);
  if (error) throw new Error(error.message);
  const escalationByConversation = new Map((convos ?? []).map((c) => [c.id as string, c.escalation_id as string]));
  if (escalationByConversation.size === 0) return {};

  const { data: messages, error: msgError } = await supabase
    .from("conversation_messages")
    .select("conversation_id, actor_type, body, created_at")
    .in("conversation_id", [...escalationByConversation.keys()])
    .in("actor_type", ["client", "coach"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (msgError) throw new Error(msgError.message);

  const threads: Record<string, DashboardCoachThread> = {};
  for (const m of messages ?? []) {
    const escalationId = escalationByConversation.get(m.conversation_id as string);
    if (!escalationId || threads[escalationId]) continue; // newest first — first seen is the latest
    const lastActor = m.actor_type === "client" ? "client" : "coach";
    threads[escalationId] = {
      lastActor,
      lastMessageAtIso: m.created_at as string,
      lastClientMessage: lastActor === "client" ? (m.body as string) : null,
    };
  }
  return threads;
}

/** The newest still-draft proposal per client (the one the client
 * workspace's ProgramProposalReview shows — getPendingProgramProposal's own
 * ordering). Selects only small JSON paths, never full program content. A
 * client whose newest draft is an adjustment is skipped: the attention
 * inbox's adjustment item already covers it. */
async function readProgramDrafts(supabase: Supabase, workspaceId: string): Promise<DashboardProgramDraft[]> {
  const { data, error } = await supabase
    .from("training_program_versions")
    .select("id, created_at, proposed_for_client_profile_id, name:content->>name, weeks:content->>durationWeeks, adjustment:content->adjustmentProvenance, inputs:content->generationInputs")
    .eq("workspace_id", workspaceId)
    .eq("status", "draft")
    .not("proposed_for_client_profile_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const drafts: DashboardProgramDraft[] = [];
  for (const row of data ?? []) {
    const clientId = row.proposed_for_client_profile_id as string;
    if (seen.has(clientId)) continue;
    seen.add(clientId);
    if (row.adjustment) continue;
    const weeks = Number(row.weeks);
    drafts.push({
      versionId: row.id as string,
      clientId,
      title: typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
      durationWeeks: Number.isInteger(weeks) && weeks > 0 ? weeks : null,
      createdAtIso: row.created_at as string,
      verifiedInputs: hasVerifiedGenerationInputs({ generationInputs: row.inputs ?? undefined }),
    });
  }
  return drafts;
}

/** Replies OPTIM sent on its own in the window: assistant messages in a
 * client's standing OPTIM conversation whose recorded decision was "answer"
 * — excluding coach-approved drafts (those were the coach's decision),
 * provider failures, clarifying questions, and escalation hand-offs. Each is
 * paired with the client message it answered when that's in the window. */
async function readOptimAnswers(supabase: Supabase, workspaceId: string, sinceIso: string): Promise<DashboardOptimAnswer[]> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("id, conversation_id, actor_type, body, route_meta, created_at, conversations!inner(client_profile_id, kind)")
    .eq("workspace_id", workspaceId)
    .eq("conversations.kind", "optim_default")
    .in("actor_type", ["client", "assistant"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const lastClientMessage = new Map<string, string>();
  const answers: DashboardOptimAnswer[] = [];
  for (const m of [...(data ?? [])].reverse()) {
    const conversationId = m.conversation_id as string;
    if (m.actor_type === "client") {
      lastClientMessage.set(conversationId, m.body as string);
      continue;
    }
    const meta = (m.route_meta ?? {}) as Record<string, unknown>;
    const isOptimAnswer = meta.decisionKind === "answer" && meta.providerId !== "coach-approved" && !meta.approvedByUserId && !meta.providerFailure;
    if (!isOptimAnswer) continue;
    const convo = m.conversations as unknown as { client_profile_id: string } | null;
    if (!convo) continue;
    answers.push({
      messageId: m.id as string,
      clientId: convo.client_profile_id,
      answeredAtIso: m.created_at as string,
      question: lastClientMessage.get(conversationId) ?? null,
    });
  }
  return answers;
}

async function readResolvedEscalations(supabase: Supabase, workspaceId: string, sinceIso: string): Promise<DashboardResolvedEscalation[]> {
  const { data, error } = await supabase
    .from("escalations")
    .select("id, client_profile_id, reason_category, coach_action, resolved_at, conversation_messages(body)")
    .eq("workspace_id", workspaceId)
    .eq("status", "resolved")
    .gte("resolved_at", sinceIso)
    .order("resolved_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const source = r.conversation_messages as unknown as { body: string } | null;
    return {
      id: r.id as string,
      clientId: r.client_profile_id as string,
      reason: r.reason_category as EscalationReason,
      coachAction: (r.coach_action as DashboardResolvedEscalation["coachAction"]) ?? null,
      resolvedAtIso: r.resolved_at as string,
      sourceMessageBody: source?.body ?? null,
    };
  });
}

export async function getCoachDashboardData(nowIso: string = new Date().toISOString()): Promise<CoachDashboardData> {
  // Core reads — a failure here is a real error, never a quiet dashboard.
  const inbox = await getAttentionInboxForRequest();
  const { workspaceId } = inbox;
  const { rows } = await listRosterForOwnWorkspace();

  const supabase = await getSupabaseServerClient();
  const sinceIso = new Date(Date.parse(nowIso) - HANDLED_WINDOW_DAYS * DAY_MS).toISOString();
  const unavailable: string[] = [];

  async function supporting<T>(label: string | null, read: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await read();
    } catch (err) {
      console.error(`coach dashboard: ${label ?? "supporting read"} failed — ${err instanceof Error ? err.message : String(err)}`);
      if (label) unavailable.push(label);
      return fallback;
    }
  }

  const threadEscalationIds = inbox.open.filter((i) => i.escalationStatus === "coach_responded").map((i) => i.id);

  const [coachThreads, programDrafts, optimAnswers, resolvedEscalations, methodConfirmed, patternCandidates, learnedRules] = await Promise.all([
    // A failed thread read keeps those items in NEEDS YOU (safe default), so
    // it isn't reported as missing information.
    supporting(null, () => readCoachThreads(supabase, workspaceId, threadEscalationIds), {} as Record<string, DashboardCoachThread>),
    supporting("program drafts", () => readProgramDrafts(supabase, workspaceId), [] as DashboardProgramDraft[]),
    supporting("OPTIM’s recent answers", () => readOptimAnswers(supabase, workspaceId, sinceIso), [] as DashboardOptimAnswer[]),
    supporting("recently resolved items", () => readResolvedEscalations(supabase, workspaceId, sinceIso), [] as DashboardResolvedEscalation[]),
    supporting(
      "your coaching method status",
      // Gate 3 — the coach's own confirmed Coach Brain, never the legacy
      // workspace playbook (whose auto-created "approved" row proves nothing).
      async () => (await getOwnCoachIntelligence()).method !== null,
      null as boolean | null
    ),
    supporting("pattern suggestions", () => getEligibleCandidatesForReview(workspaceId), [] as EligibleCandidateSummary[]),
    supporting("your confirmed patterns", () => getMyLearnedRules(workspaceId), [] as LearnedRuleRecord[]),
  ]);

  const input: CoachDashboardInput = {
    nowIso,
    openAttention: inbox.open,
    coachThreads,
    roster: rows.map((r) => ({
      clientId: r.clientId,
      name: r.name,
      lifecycle: r.lifecycle,
      archived: r.archived,
      invitedAtIso: r.invitedAtIso,
      onboardingUpdatedAtIso: r.onboardingUpdatedAtIso,
      setup: r.setup,
      programPhase: r.programPhase,
      programStartDateIso: r.programStartDateIso,
    })),
    programDrafts,
    optimAnswers,
    resolvedEscalations,
    patternCandidates: patternCandidates.map((c) => ({ candidateSignature: c.candidateSignature, summary: c.summary, lastObservedIso: c.lastObservedIso })),
    methodConfirmed,
    unavailable,
  };

  return { inbox, input, patternCandidates, learnedRules };
}
