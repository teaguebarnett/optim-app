// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The canonical server-side chat pipeline: authenticate -> validate/rate-
// limit/persist the client message -> assemble tenant-isolated context ->
// evaluate authority -> run the AI decision pipeline -> persist the outcome
// -> return truthful state. This is the ONE place that orchestrates all of
// that; app/actions/chat.ts is a thin, client-callable wrapper that
// re-derives the caller's own identity server-side and calls in here.
//
// Two distinct Supabase clients are used deliberately, mirroring
// 20260909000008's own documented design: the caller's own authenticated
// client for anything RLS already permits a client/coach to do themselves
// (inserting their own client-authored message, reading their own
// conversation, a coach's own coach-authored insert), and the admin
// (service-role) client ONLY for the two things this schema deliberately
// gives no authenticated-role path to at all — writing an assistant/system
// message, and reading the workspace's Coach Playbook to build that
// message's context (a client session can never SELECT coach_playbooks; see
// that table's own RLS policy, and lib/production/playbooks.ts's own note).
// Every other read/write here goes through the caller's own session, so
// "normal application paths obey RLS" stays true for everything except
// those two narrowly-scoped, documented exceptions.
//
// Tenant isolation: every query below is keyed on a clientProfileId that
// was re-derived from the authenticated session (see
// resolveOwnClientIdentity in app/actions/chat.ts) or on a workspaceId the
// caller was independently proven to hold staff authority in — never on a
// value the browser supplied. RLS is the backstop, not the primary gate.

import { summarizeNutritionPlan } from "../nutrition/plan-display.ts";
import "server-only";
import { getSupabaseServerClient } from "../supabase/server.ts";
import { getSupabaseAdminClient } from "../supabase/admin.ts";
import { getAuthenticatedContext, requireWorkspaceRole, isWorkspaceStaffRole } from "./auth.ts";
import { UnauthorizedError } from "./errors.ts";
import { getClientProgramContext } from "./programs.ts";
import { runAssistantDecisionPipeline, providerFailureMessage, type ProviderFailureKind } from "../ai/pipeline.ts";
import { normalizeClientMessage, MAX_CLIENT_MESSAGE_CHARS, MAX_CONTEXT_HISTORY_MESSAGES, MAX_CONTEXT_PRIOR_RESOLUTIONS, type AssistantContextSnapshot } from "../ai/context.ts";
import type { CoachPlaybookContent } from "../coach/playbook.ts";
import { resolveCoachIntelligenceForClient } from "./coach-brain.ts";
import { methodAsPlaybookContent, systemDefaultPlaybookContent } from "../coach/coach-brain.ts";
import {
  resolveEffectiveAiAuthorityLevel,
  resolveAiActionDisposition,
  AI_AUTHORITY_LEVEL_LABELS,
  AI_AUTHORITY_LEVEL_DESCRIPTIONS,
} from "../coach/ai-authority.ts";
import { deriveProgramWeek, deriveProgramPhase } from "../scheduling/enrollment.ts";
import { resolveClientLocalDateIso } from "../shared/local-date.ts";
import { describeEscalationForAssistantMessage, isValidEscalationTransition } from "../communications/types.ts";
import type { AssistantDecisionKind } from "../ai/provider.ts";
import type { EscalationReason, EscalationStatus, MessageActorType } from "../communications/types.ts";
import type { HealthReviewStatus } from "../coach/types";
import type { DailyActivityContent } from "./validation.ts";

export class RateLimitExceededError extends Error {
  constructor(message = "You've sent a lot of messages very quickly — give me a moment to catch up.") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

export class InvalidMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMessageError";
  }
}

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_MESSAGES = 6;
/** How many days of real logged activity feed the "recent training"
 * summary. Bounded deliberately — this is a short derived sentence, never a
 * dump of per-set data. */
const RECENT_ACTIVITY_DAYS = 10;

export interface ConversationMessageView {
  id: string;
  actorType: MessageActorType;
  body: string;
  createdAtIso: string;
  /** Only ever present on assistant messages, and only non-sensitive route
   * audit metadata (see lib/ai/provider.ts's RouteAuditMeta). */
  routeMeta: Record<string, unknown> | null;
}

interface MessageRow {
  id: string;
  actor_type: string;
  body: string;
  created_at: string;
  route_meta?: unknown;
}

function rowToMessageView(row: MessageRow): ConversationMessageView {
  return {
    id: row.id,
    actorType: row.actor_type as MessageActorType,
    body: row.body,
    createdAtIso: row.created_at,
    routeMeta: (row.route_meta as Record<string, unknown> | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Conversation reads / routing
// ---------------------------------------------------------------------------

export async function getOrCreateDefaultConversationId(clientProfileId: string): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_or_create_default_conversation", { p_client_profile_id: clientProfileId });
  if (error) throw new Error(`getOrCreateDefaultConversationId failed: ${error.message}`);
  return data as string;
}

/** The client's currently OPEN temporary coach thread, if any — an
 * escalation at "approved"/"coach_responded" (see
 * lib/communications/types.ts's coachThreadLifecycle). Null once resolved,
 * at which point the default composer/routing returns to OPTIM with no
 * permanent DM channel left behind. */
export async function getOpenCoachThread(clientProfileId: string): Promise<{ conversationId: string; escalationId: string | null } | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, escalation_id")
    .eq("client_profile_id", clientProfileId)
    .eq("kind", "coach_escalation")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getOpenCoachThread failed: ${error.message}`);
  if (!data) return null;
  return { conversationId: data.id as string, escalationId: (data.escalation_id as string | null) ?? null };
}

export async function getConversationMessages(conversationId: string, limit = 50): Promise<ConversationMessageView[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("id, actor_type, body, created_at, route_meta")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`getConversationMessages failed: ${error.message}`);
  return (data ?? []).map((r) => rowToMessageView(r as MessageRow));
}

export interface ClientChatState {
  conversationId: string;
  /** True while a temporary coach thread is open. The UI uses this to show
   * the dynamic "<Coach> · Coach" label and to make the active human thread
   * obvious — never a standing OPTIM-vs-coach selector. */
  isCoachThread: boolean;
  /** Dynamic label from the REAL responding coach's profile, e.g.
   * "Teague · Coach". Null when routing to OPTIM. */
  coachThreadLabel: string | null;
  messages: ConversationMessageView[];
  /** Preserved, already-resolved coach threads — contextual history the
   * client can still read, never deleted. */
  resolvedCoachThreads: { conversationId: string; resolvedAtIso: string | null }[];
}

/** Everything the client's own chat screen needs on load. */
export async function getMyChatState(params: { clientProfileId: string; coachDisplayName: string }): Promise<ClientChatState> {
  const supabase = await getSupabaseServerClient();
  const openThread = await getOpenCoachThread(params.clientProfileId);
  const conversationId = openThread?.conversationId ?? (await getOrCreateDefaultConversationId(params.clientProfileId));
  const messages = await getConversationMessages(conversationId);

  const { data: resolvedRows, error: resolvedError } = await supabase
    .from("conversations")
    .select("id, resolved_at")
    .eq("client_profile_id", params.clientProfileId)
    .eq("kind", "coach_escalation")
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false });
  if (resolvedError) throw new Error(`getMyChatState (resolved threads) failed: ${resolvedError.message}`);

  return {
    conversationId,
    isCoachThread: openThread !== null,
    coachThreadLabel: openThread ? `${params.coachDisplayName} · Coach` : null,
    messages,
    resolvedCoachThreads: (resolvedRows ?? []).map((r) => ({ conversationId: r.id as string, resolvedAtIso: (r.resolved_at as string | null) ?? null })),
  };
}

async function checkRateLimit(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>, conversationId: string): Promise<void> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("conversation_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("actor_type", "client")
    .gte("created_at", since);
  if (error) throw new Error(`checkRateLimit failed: ${error.message}`);
  if ((count ?? 0) >= RATE_LIMIT_MAX_MESSAGES) throw new RateLimitExceededError();
}

// ---------------------------------------------------------------------------
// Playbook — admin-client read (see module doc), bootstrapping an honest
// default the first time a workspace ever needs one. This is a system-level
// "make sure something real exists to run on," analogous to
// createDefaultCoachOperatingModel's own documented default posture — never
// a rewrite of something a coach already deliberately configured, and never
// a silent edit of an existing approved version.
// ---------------------------------------------------------------------------

/**
 * Gate 3 — whose methodology applies to this client's chat: the client's
 * PRIMARY assigned coach's confirmed Coach Brain (lib/production/
 * coach-brain.ts's canonical read path), read via the service role because
 * the caller is the client. Replaces the old workspace-level bootstrap,
 * which silently created an "approved" playbook of OPTIM defaults on a
 * client's first message — a default must never become coach truth.
 *
 * No confirmed Brain → OPTIM's system defaults are used only as technical
 * scaffolding (formatting, the communication-policy shape), never persisted,
 * never presented to the model as the coach's methodology
 * (coachMethodConfirmed: false makes buildSystemPrompt restrict OPTIM to
 * logistics and escalate anything methodology-dependent), with the most
 * conservative authority (Advisor).
 */
async function resolveChatCoachContent(workspaceId: string, clientProfileId: string): Promise<{ content: CoachPlaybookContent; coachMethodConfirmed: boolean }> {
  const intelligence = await resolveCoachIntelligenceForClient({ workspaceId, clientProfileId });
  if (intelligence.method) return { content: methodAsPlaybookContent(intelligence.method), coachMethodConfirmed: true };
  const admin = getSupabaseAdminClient();
  const { data: workspaceRow } = await admin.from("workspaces").select("business_name").eq("id", workspaceId).maybeSingle();
  return {
    content: systemDefaultPlaybookContent({ workspaceId, nowIso: new Date().toISOString(), businessName: (workspaceRow?.business_name as string | undefined) ?? "OPTIM" }),
    coachMethodConfirmed: false,
  };
}

// ---------------------------------------------------------------------------
// Tenant-isolated context assembly
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Today's prescribed session, read out of the client's OWN active,
 * published program version — never a catalog/demo fixture. Returns null
 * when there's no program or the date falls outside it, which the prompt
 * renders honestly as "no active program" rather than inventing a session.
 *
 * Phase 5 — reads either shape: a legacy day carries `workout`, a real
 * universal (schemaVersion 2) day carries `sessions` instead — checking
 * only `workout` would silently misreport every universal training day as
 * a rest day (see this phase's completion report, "analytics/downstream
 * consumers"). Both shapes structurally satisfy this loose inline type
 * without a cast at the call site. */
function resolveTodayFocusLabel(
  program: {
    weeks: {
      weekNumber: number;
      days: { dayOfWeek: string; type: string; workout?: { name?: string; focus?: string }; sessions?: { name?: string; focus?: string }[] }[];
    }[];
  } | null,
  weekNumber: number | null,
  dateIso: string
): string | null {
  if (!program || weekNumber === null) return null;
  const week = program.weeks.find((w) => w.weekNumber === weekNumber);
  if (!week) return null;
  const dayName = DAY_NAMES[new Date(`${dateIso}T00:00:00Z`).getUTCDay()];
  const day = week.days.find((d) => d.dayOfWeek === dayName);
  if (!day) return null;
  if (day.type !== "training") return "Rest day";
  const primary = day.workout ?? day.sessions?.[0];
  if (!primary) return "Rest day";
  const focus = primary.focus ? ` — ${primary.focus}` : "";
  return `${primary.name ?? "Training"}${focus}`;
}

/** A short, honest adherence/RPE sentence derived from this client's OWN
 * daily_records. Never fabricated: with no logged days at all it returns
 * null and the prompt simply omits the section. */
function summarizeRecentActivity(rows: { date_iso: string; content: unknown }[]): string | null {
  if (rows.length === 0) return null;
  let completed = 0;
  let sessions = 0;
  const rpes: number[] = [];
  for (const row of rows) {
    const content = row.content as Partial<DailyActivityContent> | null;
    const training = content?.training as
      | { sessionStatus?: string; exerciseLogs?: Record<string, { loggedSets?: { rpe?: number | null }[] }> }
      | undefined;
    if (!training?.sessionStatus || training.sessionStatus === "not_started") continue;
    sessions += 1;
    if (training.sessionStatus === "completed") completed += 1;
    for (const log of Object.values(training.exerciseLogs ?? {})) {
      for (const set of log.loggedSets ?? []) {
        if (typeof set.rpe === "number") rpes.push(set.rpe);
      }
    }
  }
  if (sessions === 0) return null;
  const avgRpe = rpes.length > 0 ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : null;
  const rpePart = avgRpe ? `, average logged RPE ${avgRpe}` : "";
  return `${completed} of ${sessions} started sessions completed in the last ${RECENT_ACTIVITY_DAYS} days${rpePart}`;
}

/** Real, client-reported safety signals only — pain reports this client
 * actually logged during a session, plus the coach's own absolute override
 * rules from the Playbook. Never invented, never another client's. */
function collectSafetyFlags(rows: { date_iso: string; content: unknown }[], playbook: CoachPlaybookContent | null): string[] {
  const flags: string[] = [];
  for (const row of rows) {
    const content = row.content as Partial<DailyActivityContent> | null;
    const reports = (content?.training as { painReports?: { bodyPart?: string; note?: string }[] } | undefined)?.painReports ?? [];
    for (const report of reports) {
      const where = report.bodyPart ? ` (${report.bodyPart})` : "";
      flags.push(`Client logged a pain report on ${row.date_iso}${where}`);
    }
  }
  // Only a coach's CONFIRMED safety rules — OPTIM defaults are never
  // presented as that coach's rules for this client (Gate 3).
  if (playbook) for (const rule of playbook.operatingModel.safety.absoluteOverrideRules) flags.push(rule);
  return flags;
}

export async function assembleAssistantContext(params: {
  workspaceId: string;
  clientProfileId: string;
  clientDisplayName: string;
  coachDisplayName: string;
  playbook: CoachPlaybookContent;
  /** Gate 3 — false when the client's coach has no confirmed Coach Brain. */
  coachMethodConfirmed?: boolean;
}): Promise<AssistantContextSnapshot> {
  const supabase = await getSupabaseServerClient();

  const programContext = await getClientProgramContext({ workspaceId: params.workspaceId, clientProfileId: params.clientProfileId });
  const timeZone = programContext.enrollment?.timeZone ?? "UTC";
  const todayIso = resolveClientLocalDateIso(new Date(), timeZone);
  const sinceIso = new Date(Date.now() - RECENT_ACTIVITY_DAYS * 86_400_000).toISOString().slice(0, 10);

  // Every one of these is scoped to this client's own id. RLS independently
  // guarantees the same thing — a client session literally cannot read
  // another client's rows — but the query is written correctly first, per
  // "never rely on RLS alone to be the only backstop".
  const [{ data: clientRow }, { data: activityRows }, { data: resolvedRows }, { data: openRows }] = await Promise.all([
    supabase.from("client_profiles").select("goal").eq("id", params.clientProfileId).maybeSingle(),
    supabase
      .from("daily_records")
      .select("date_iso, content")
      .eq("client_profile_id", params.clientProfileId)
      .gte("date_iso", sinceIso)
      .order("date_iso", { ascending: false }),
    supabase
      .from("escalations")
      .select("reason_category, proposed_response, created_at")
      .eq("client_profile_id", params.clientProfileId)
      .eq("status", "resolved")
      .order("created_at", { ascending: false })
      .limit(MAX_CONTEXT_PRIOR_RESOLUTIONS),
    supabase
      .from("escalations")
      .select("id")
      .eq("client_profile_id", params.clientProfileId)
      .neq("status", "resolved")
      .limit(1),
  ]);

  const activity = (activityRows ?? []) as { date_iso: string; content: unknown }[];

  const weekNumber = programContext.enrollment ? deriveProgramWeek(programContext.enrollment, todayIso) : null;
  const phase = programContext.enrollment ? deriveProgramPhase(programContext.enrollment, todayIso) : null;
  const programWeekLabel =
    programContext.assignedProgram && weekNumber !== null
      ? `Week ${weekNumber} of ${programContext.assignedProgram.durationWeeks} (${(phase ?? "active_program").replaceAll("_", " ")})`
      : null;

  const plan = programContext.nutritionPlan;
  const targets = plan?.targets;
  // U3A — a method plan states exactly what's prescribed, and what isn't (so the Assistant never invents carbs/fat).
  const methodSummary = plan?.method ? summarizeNutritionPlan(plan) : null;
  const nutritionTargetsSummary = targets
    ? `${targets.calories} kcal, ${targets.proteinG}g protein, ${targets.carbsG}g carbs, ${targets.fatG}g fat`
    : methodSummary
      ? `${methodSummary.approach}${methodSummary.targets.length ? ` — ${methodSummary.targets.join(", ")}` : " — no calorie or macro numbers"}; anything not listed here is NOT prescribed, so don't quote a number for it${methodSummary.note ? `. ${methodSummary.note}` : ""}`
      : null;

  // Authority is resolved from the COACH's own persisted settings inside
  // the Playbook, for this specific client — never from anything the client
  // claimed in a message.
  const level = resolveEffectiveAiAuthorityLevel(params.playbook.aiAuthority, params.clientProfileId);
  const authoritySummary = `${AI_AUTHORITY_LEVEL_LABELS[level]} — ${AI_AUTHORITY_LEVEL_DESCRIPTIONS[level]} You may answer questions and give guidance within the Playbook, but you may never execute a program, nutrition, or schedule change yourself.`;

  return {
    clientDisplayName: params.clientDisplayName,
    coachDisplayName: params.coachDisplayName,
    hasActiveProgram: programContext.assignedProgram !== null,
    hasActiveNutritionAssignment: programContext.nutritionPlan !== null,
    programWeekLabel,
    todayFocusLabel: resolveTodayFocusLabel(programContext.assignedProgram, weekNumber, todayIso),
    goalSummary: (clientRow?.goal as string | null) ?? null,
    nutritionTargetsSummary,
    recentTrainingSummary: summarizeRecentActivity(activity),
    safetyFlags: collectSafetyFlags(activity, params.coachMethodConfirmed === false ? null : params.playbook),
    priorCoachResolutions: (resolvedRows ?? []).map((r) => {
      const reason = (r.reason_category as string).replaceAll("_", " ");
      const outcome = (r.proposed_response as string | null) ?? "resolved by the coach directly";
      return `Earlier ${reason} request — ${outcome}`;
    }),
    authoritySummary,
    hasOpenEscalation: (openRows ?? []).length > 0,
    coachMethodConfirmed: params.coachMethodConfirmed !== false,
  };
}

// ---------------------------------------------------------------------------
// The canonical send pipeline
// ---------------------------------------------------------------------------

export interface ClientChatSendResult {
  clientMessage: ConversationMessageView;
  responseMessages: ConversationMessageView[];
  /** True when the message went into an open temporary coach thread — no
   * assistant intelligence runs there, a real human is on the other end. */
  routedToCoachThread: boolean;
  providerFailure: ProviderFailureKind | null;
  /** The real persisted escalation id, or null. The UI must never render a
   * "sent to your coach" state from anything but this. */
  escalationId: string | null;
  /** True only when an escalation was genuinely required AND persistence
   * failed — the client was told honestly that nothing was sent. */
  escalationPersistenceFailed: boolean;
}

/** The seven escalation reasons mapped onto the AI-authority action
 * categories lib/coach/ai-authority.ts already models, so route_meta
 * records a real disposition from the existing authority resolver rather
 * than a second, parallel notion of authority invented here. */
function authorityCategoryFor(reason: EscalationReason | undefined): { domain: string; category: Parameters<typeof resolveAiActionDisposition>[1]; scope: "routine" | "major" } {
  switch (reason) {
    case "pain_or_safety":
      return { domain: "training_adjustment", category: "pain_or_injury", scope: "routine" };
    case "plan_change":
      return { domain: "training_adjustment", category: "training_change", scope: "major" };
    case "out_of_authority":
      return { domain: "training_adjustment", category: "out_of_bounds", scope: "routine" };
    case "adherence_or_sensitive":
      return { domain: "communication", category: "out_of_bounds", scope: "routine" };
    default:
      return { domain: "communication", category: "messaging_nudge", scope: "routine" };
  }
}

export async function sendClientChatMessage(params: {
  clientProfileId: string;
  workspaceId: string;
  clientDisplayName: string;
  coachDisplayName: string;
  body: string;
}): Promise<ClientChatSendResult> {
  const ctx = await getAuthenticatedContext();

  // 2. Validate + normalize. Never silently truncated — see
  //    normalizeClientMessage's own doc for why truncation is the wrong
  //    failure mode for a message that might end in a safety report.
  const normalized = normalizeClientMessage(params.body);
  if (!normalized.ok) {
    throw new InvalidMessageError(
      normalized.reason === "empty"
        ? "Message must not be empty."
        : `Message is too long — please keep it under ${MAX_CLIENT_MESSAGE_CHARS} characters.`
    );
  }
  const body = normalized.body;

  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();

  const openThread = await getOpenCoachThread(params.clientProfileId);
  const conversationId = openThread?.conversationId ?? (await getOrCreateDefaultConversationId(params.clientProfileId));

  await checkRateLimit(supabase, conversationId);

  // The client's own message goes in through the CLIENT's own session, so
  // conversation_messages_insert_client is what authorizes it — actor_type
  // and actor_user_id are both pinned by that policy, which is why a
  // browser cannot claim to be a coach or the assistant no matter what it
  // sends (see supabase/migrations/20260909000008_rls_policies.sql).
  const { data: clientMsgRow, error: clientMsgError } = await supabase
    .from("conversation_messages")
    .insert({ conversation_id: conversationId, workspace_id: params.workspaceId, actor_type: "client", actor_user_id: ctx.userId, body })
    .select("id, actor_type, body, created_at, route_meta")
    .single();
  if (clientMsgError) throw new Error(`sendClientChatMessage (client insert) failed: ${clientMsgError.message}`);
  const clientMessage = rowToMessageView(clientMsgRow as MessageRow);

  // Inside an open coach thread the client is talking directly to their
  // coach — OPTIM stays out of it entirely.
  if (openThread) {
    return {
      clientMessage,
      responseMessages: [],
      routedToCoachThread: true,
      providerFailure: null,
      escalationId: null,
      escalationPersistenceFailed: false,
    };
  }

  const { content: playbook, coachMethodConfirmed } = await resolveChatCoachContent(params.workspaceId, params.clientProfileId);
  const [context, history] = await Promise.all([
    assembleAssistantContext({
      workspaceId: params.workspaceId,
      clientProfileId: params.clientProfileId,
      clientDisplayName: params.clientDisplayName,
      coachDisplayName: params.coachDisplayName,
      playbook,
      coachMethodConfirmed,
    }),
    getConversationMessages(conversationId, MAX_CONTEXT_HISTORY_MESSAGES + 1),
  ]);

  // The message just inserted is already in `history`; drop it so the
  // provider sees it exactly once, as the current turn.
  const priorHistory = history.filter((m) => m.id !== clientMessage.id);
  const priorAssistantDecisionKind = resolvePriorAssistantDecisionKind(priorHistory);

  const result = await runAssistantDecisionPipeline({
    playbook,
    context,
    history: priorHistory.map((m) => ({ role: m.actorType, body: m.body })),
    clientMessage: body,
    priorAssistantDecisionKind,
  });

  if (!result.decision) {
    // Provider failed. An honest, controlled state: the client's message is
    // already persisted (nothing lost, no duplicate), no escalation was
    // created, and the reply says so explicitly rather than fabricating an
    // answer or claiming a handoff. The failure itself is recorded in
    // route_meta for audit.
    const failure = result.providerFailure ?? "unavailable";
    const assistantRow = await insertAssistantMessage(admin, {
      conversationId,
      workspaceId: params.workspaceId,
      body: providerFailureMessage(failure, params.coachDisplayName),
      routeMeta: { ...result.routeMeta, providerFailure: failure },
    });
    return {
      clientMessage,
      responseMessages: [rowToMessageView(assistantRow)],
      routedToCoachThread: false,
      providerFailure: failure,
      escalationId: null,
      escalationPersistenceFailed: false,
    };
  }

  const decision = result.decision;
  const authority = authorityCategoryFor(decision.escalationReason);
  const level = resolveEffectiveAiAuthorityLevel(playbook.aiAuthority, params.clientProfileId);
  const disposition = resolveAiActionDisposition(level, authority.category, authority.scope);
  const routeMeta = { ...result.routeMeta, authorityDomain: authority.domain, authorityDisposition: disposition };

  // 6/7. answer / clarify — a plain assistant reply, no escalation record,
  //      and (by rule 2 in lib/ai/pipeline.ts) no handoff claim in the text.
  if (decision.kind !== "escalate") {
    const assistantRow = await insertAssistantMessage(admin, {
      conversationId,
      workspaceId: params.workspaceId,
      body: decision.responseText,
      routeMeta,
    });
    return {
      clientMessage,
      responseMessages: [rowToMessageView(assistantRow)],
      routedToCoachThread: false,
      providerFailure: null,
      escalationId: null,
      escalationPersistenceFailed: false,
    };
  }

  // 6. Escalate — the record is created FIRST, and only a successfully
  //    persisted row is allowed to produce the "flagged for <coach>"
  //    sentence. create_escalation() deduplicates atomically, so repeating
  //    the same unresolved issue returns the existing id instead of opening
  //    a second escalation.
  const reason: EscalationReason = decision.escalationReason ?? "unresolved_uncertainty";
  const proposedResponse = decision.proposedAction
    ? `${decision.responseText}\n\nProposed action (${decision.proposedAction.domain}): ${decision.proposedAction.description}`
    : decision.responseText;

  const { data: escalationIdRaw, error: escalationError } = await supabase.rpc("create_escalation", {
    p_client_profile_id: params.clientProfileId,
    p_reason_category: reason,
    p_source_message_id: clientMessage.id,
    p_proposed_response: proposedResponse,
  });

  const escalationId = escalationError ? null : ((escalationIdRaw as string | null) ?? null);

  // describeEscalationForAssistantMessage is the only thing allowed to
  // produce the handoff sentence, and it can only be built from a real
  // record (see lib/communications/types.ts). With no row, there is no
  // sentence — the client is told plainly that nothing was sent.
  const handoffSentence = escalationId
    ? describeEscalationForAssistantMessage(
        {
          id: escalationId,
          workspaceId: params.workspaceId,
          clientProfileId: params.clientProfileId,
          sourceMessageId: clientMessage.id,
          reasonCategory: reason,
          status: "proposed",
          proposedResponse,
          coachAction: null,
          resolvedBy: null,
          resolvedAtIso: null,
          createdAtIso: new Date().toISOString(),
          updatedAtIso: new Date().toISOString(),
        },
        params.coachDisplayName
      )
    : null;

  const finalText = handoffSentence
    ? `${decision.responseText} ${handoffSentence}`
    : `${decision.responseText}\n\nI wasn't able to get this in front of ${params.coachDisplayName} just now — nothing has been sent. Please message them directly if it's urgent, or try again in a moment.`;

  const assistantRow = await insertAssistantMessage(admin, {
    conversationId,
    workspaceId: params.workspaceId,
    body: finalText,
    routeMeta: { ...routeMeta, escalationPersisted: escalationId !== null },
  });

  return {
    clientMessage,
    responseMessages: [rowToMessageView(assistantRow)],
    routedToCoachThread: false,
    providerFailure: null,
    escalationId,
    escalationPersistenceFailed: escalationId === null,
  };
}

/** The decision kind of the most recent assistant message in this
 * conversation, read from its own non-sensitive route_meta — which is what
 * makes lib/ai/pipeline.ts's "one clarification, then escalate" rule work
 * across requests without a second stored column. */
function resolvePriorAssistantDecisionKind(history: ConversationMessageView[]): AssistantDecisionKind | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (message.actorType === "client") continue;
    if (message.actorType !== "assistant") return null;
    const kind = message.routeMeta?.decisionKind;
    return typeof kind === "string" ? (kind as AssistantDecisionKind) : null;
  }
  return null;
}

async function insertAssistantMessage(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  params: { conversationId: string; workspaceId: string; body: string; routeMeta: Record<string, unknown> }
): Promise<MessageRow> {
  const { data, error } = await admin
    .from("conversation_messages")
    .insert({
      conversation_id: params.conversationId,
      workspace_id: params.workspaceId,
      actor_type: "assistant",
      body: params.body,
      route_meta: params.routeMeta,
    })
    .select("id, actor_type, body, created_at, route_meta")
    .single();
  if (error) throw new Error(`insertAssistantMessage failed: ${error.message}`);
  return data as MessageRow;
}

// ---------------------------------------------------------------------------
// Coach-side escalation workflow
// ---------------------------------------------------------------------------

async function requireCoachAuthority(workspaceId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  return ctx;
}

export interface EscalationView {
  id: string;
  clientProfileId: string;
  clientDisplayName: string;
  sourceMessageId: string | null;
  sourceMessageBody: string | null;
  reasonCategory: EscalationReason;
  status: EscalationStatus;
  proposedResponse: string | null;
  createdAtIso: string;
  /** Lower sorts first. Derived from the existing safety-first ordering the
   * coach's demo-mode "Needs attention" queue already uses (see
   * lib/coach/attention-queue.ts's ATTENTION_PRIORITY) so Supabase-mode
   * escalations are triaged in exactly the same order a coach already
   * knows, rather than inventing a second notion of urgency. */
  priority: number;
  /** Phase 7B — this specific escalation row's own real health-review
   * decision, if a coach has made one (see
   * lib/production/pain-safety.ts's recordHealthReviewDecision). Null on
   * every non-pain_or_safety row, and on a pain_or_safety row no coach has
   * decided on yet. Deliberately per-row, not the client-wide aggregate
   * resolveHealthReviewRecordForClient computes for programming-readiness
   * gating — this is what the coach's queue card reads/writes for THIS
   * report. */
  healthReviewStatus: HealthReviewStatus | null;
  documentedLimitations: string | null;
}

/** Maps each escalation reason onto the priority the existing attention
 * queue already assigns to the equivalent review kind: pain/safety first,
 * then an authority boundary, then a plan-change decision, then the rest. */
const ESCALATION_PRIORITY: Record<EscalationReason, number> = {
  pain_or_safety: 0,
  adherence_or_sensitive: 0.5,
  out_of_authority: 0.75,
  plan_change: 1,
  conflicting_information: 1.5,
  explicit_request: 1.75,
  unresolved_uncertainty: 2,
};

/** Every escalation this coach can currently access. RLS's
 * escalations_select (app_private.can_access_client) is what actually
 * scopes this: a workspace owner sees the whole workspace's escalations, a
 * plain coach sees only their assigned clients', and a coach in another
 * workspace gets none — all without this function branching on role at all.
 * Note what is NOT here: routine OPTIM conversation, which never creates an
 * escalation row and therefore never reaches the coach's inbox. */
export async function getWorkspaceEscalations(workspaceId: string, statuses?: EscalationStatus[]): Promise<EscalationView[]> {
  await requireCoachAuthority(workspaceId);
  const supabase = await getSupabaseServerClient();
  let query = supabase
    .from("escalations")
    .select(
      "id, client_profile_id, source_message_id, reason_category, status, proposed_response, created_at, health_review_status, documented_limitations, client_profiles!inner(display_name), conversation_messages(body)"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (statuses && statuses.length > 0) query = query.in("status", statuses);
  const { data, error } = await query;
  if (error) throw new Error(`getWorkspaceEscalations failed: ${error.message}`);

  return (data ?? [])
    .map((r) => {
      const reason = r.reason_category as EscalationReason;
      const clientProfile = r.client_profiles as unknown as { display_name: string } | null;
      const sourceMessage = r.conversation_messages as unknown as { body: string } | null;
      return {
        id: r.id as string,
        clientProfileId: r.client_profile_id as string,
        clientDisplayName: clientProfile?.display_name ?? "Client",
        sourceMessageId: (r.source_message_id as string | null) ?? null,
        sourceMessageBody: sourceMessage?.body ?? null,
        reasonCategory: reason,
        status: r.status as EscalationStatus,
        proposedResponse: (r.proposed_response as string | null) ?? null,
        createdAtIso: r.created_at as string,
        priority: ESCALATION_PRIORITY[reason],
        healthReviewStatus: (r.health_review_status as HealthReviewStatus | null) ?? null,
        documentedLimitations: (r.documented_limitations as string | null) ?? null,
      };
    })
    .sort((a, b) => a.priority - b.priority || b.createdAtIso.localeCompare(a.createdAtIso));
}

async function getEscalation(workspaceId: string, escalationId: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("escalations")
    .select("id, client_profile_id, workspace_id, status, reason_category, proposed_response, source_message_id")
    .eq("id", escalationId)
    .eq("workspace_id", workspaceId)
    .single();
  if (error) throw new Error(`getEscalation failed: ${error.message}`);
  return data;
}

/** Every status change goes through isValidEscalationTransition first — the
 * application refuses an illegal transition before the database ever sees
 * it — and is written with an `eq("status", from)` guard so a repeated or
 * concurrent action safely no-ops instead of double-transitioning. */
async function transitionEscalation(
  workspaceId: string,
  escalationId: string,
  from: EscalationStatus,
  to: EscalationStatus,
  patch: Record<string, unknown>
) {
  if (!isValidEscalationTransition(from, to)) {
    throw new Error(`Invalid escalation transition: ${from} -> ${to}`);
  }
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("escalations")
    .update({ status: to, updated_at: new Date().toISOString(), ...patch })
    .eq("id", escalationId)
    .eq("workspace_id", workspaceId)
    .eq("status", from);
  if (error) throw new Error(`transitionEscalation failed: ${error.message}`);
}

/** The coach approves OPTIM's own proposed response as-is. Delivered with
 * truthful authorship — still actor_type "assistant", because OPTIM's own
 * words are what goes out — plus approval metadata in route_meta proving a
 * real human reviewed it first. Resolves the escalation: approving a
 * one-shot reply deliberately does not open an ongoing thread. */
export async function approveEscalationResponse(params: { workspaceId: string; escalationId: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const escalation = await getEscalation(params.workspaceId, params.escalationId);
  if (!escalation.proposed_response) throw new Error("No proposed response to approve.");

  const conversationId = await getOrCreateDefaultConversationId(escalation.client_profile_id as string);
  const admin = getSupabaseAdminClient();
  await insertAssistantMessage(admin, {
    conversationId,
    workspaceId: params.workspaceId,
    body: escalation.proposed_response as string,
    routeMeta: {
      decisionKind: "answer",
      providerId: "coach-approved",
      modelId: "n/a",
      latencyMs: 0,
      approvedByUserId: ctx.userId,
      approvedAtIso: new Date().toISOString(),
    },
  });

  await transitionEscalation(params.workspaceId, params.escalationId, escalation.status as EscalationStatus, "resolved", {
    coach_action: "approved",
    resolved_by: ctx.userId,
    resolved_at: new Date().toISOString(),
  });
}

/** The coach edits OPTIM's draft before sending. The coach materially
 * authored the final text, so it is delivered as a coach-attributed message
 * ("coach-authored responses retain actor type coach") through the caller's
 * OWN authenticated session — conversation_messages_insert_coach already
 * permits exactly this, so no admin client is involved. */
export async function editAndSendEscalationResponse(params: { workspaceId: string; escalationId: string; editedBody: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const escalation = await getEscalation(params.workspaceId, params.escalationId);
  const normalized = normalizeClientMessage(params.editedBody);
  if (!normalized.ok) throw new InvalidMessageError("Response must not be empty.");

  const conversationId = await getOrCreateDefaultConversationId(escalation.client_profile_id as string);
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("conversation_messages").insert({
    conversation_id: conversationId,
    workspace_id: params.workspaceId,
    actor_type: "coach",
    actor_user_id: ctx.userId,
    body: normalized.body,
  });
  if (error) throw new Error(`editAndSendEscalationResponse failed: ${error.message}`);

  await transitionEscalation(params.workspaceId, params.escalationId, escalation.status as EscalationStatus, "resolved", {
    coach_action: "edited",
    resolved_by: ctx.userId,
    resolved_at: new Date().toISOString(),
  });
}

/** Opens (or continues) the TEMPORARY two-way coach thread. A real
 * conversation row of kind 'coach_escalation', bound to exactly this one
 * escalation, which the client and coach exchange messages in until
 * resolveCoachThread closes it. The client-facing label is built from the
 * authenticated coach's own profile by the caller — never hardcoded — and
 * no permanent DM channel is created: once resolved, routing returns to
 * OPTIM and there is no standing coach conversation left behind. */
export async function openPersonalResponseThread(params: { workspaceId: string; escalationId: string; body: string }): Promise<{ conversationId: string }> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const escalation = await getEscalation(params.workspaceId, params.escalationId);
  const normalized = normalizeClientMessage(params.body);
  if (!normalized.ok) throw new InvalidMessageError("Message must not be empty.");
  const supabase = await getSupabaseServerClient();
  const currentStatus = escalation.status as EscalationStatus;

  if (currentStatus === "resolved") {
    throw new Error("Cannot respond personally to an already-resolved escalation.");
  }

  // Advance to coach_responded from wherever the escalation legally is,
  // always through a valid transition (never a direct jump):
  // pending -> proposed -> approved -> coach_responded.
  if (currentStatus === "pending") {
    await transitionEscalation(params.workspaceId, params.escalationId, "pending", "proposed", {});
    await transitionEscalation(params.workspaceId, params.escalationId, "proposed", "approved", { coach_action: "personal_response" });
    await transitionEscalation(params.workspaceId, params.escalationId, "approved", "coach_responded", {});
  } else if (currentStatus === "proposed") {
    await transitionEscalation(params.workspaceId, params.escalationId, "proposed", "approved", { coach_action: "personal_response" });
    await transitionEscalation(params.workspaceId, params.escalationId, "approved", "coach_responded", {});
  } else if (currentStatus === "approved") {
    await transitionEscalation(params.workspaceId, params.escalationId, "approved", "coach_responded", { coach_action: "personal_response" });
  }
  // currentStatus === "coach_responded": the thread is already open; a
  // second personal message needs no transition at all.

  const { data: existingConvo } = await supabase.from("conversations").select("id").eq("escalation_id", params.escalationId).maybeSingle();
  let conversationId = existingConvo?.id as string | undefined;
  if (!conversationId) {
    const { data: newConvo, error: convoError } = await supabase
      .from("conversations")
      .insert({
        workspace_id: params.workspaceId,
        client_profile_id: escalation.client_profile_id,
        kind: "coach_escalation",
        status: "open",
        escalation_id: params.escalationId,
      })
      .select("id")
      .single();
    if (convoError) throw new Error(`openPersonalResponseThread (conversation) failed: ${convoError.message}`);
    conversationId = newConvo.id as string;
  }

  const { error: msgError } = await supabase.from("conversation_messages").insert({
    conversation_id: conversationId,
    workspace_id: params.workspaceId,
    actor_type: "coach",
    actor_user_id: ctx.userId,
    body: normalized.body,
  });
  if (msgError) throw new Error(`openPersonalResponseThread (message) failed: ${msgError.message}`);

  return { conversationId };
}

/** Explicitly closes the temporary coach thread. Future client messages
 * naturally return to OPTIM, because sendClientChatMessage only ever routes
 * into an OPEN coach_escalation conversation and this sets it to resolved.
 * The conversation itself is preserved, never deleted — it stays readable
 * as contextual history, and the resolution becomes future client context
 * through assembleAssistantContext's priorCoachResolutions. */
export async function resolveCoachThread(params: { workspaceId: string; escalationId: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const escalation = await getEscalation(params.workspaceId, params.escalationId);
  const supabase = await getSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const { error: convoError } = await supabase
    .from("conversations")
    .update({ status: "resolved", resolved_at: nowIso, resolved_by: ctx.userId })
    .eq("escalation_id", params.escalationId);
  if (convoError) throw new Error(`resolveCoachThread (conversation) failed: ${convoError.message}`);

  await transitionEscalation(params.workspaceId, params.escalationId, escalation.status as EscalationStatus, "resolved", {
    resolved_by: ctx.userId,
    resolved_at: nowIso,
  });
}

/** The coach resolves an escalation with no client-facing message at all —
 * "the coach must be able to ... resolve without messaging." */
export async function resolveEscalationWithoutMessaging(params: { workspaceId: string; escalationId: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const escalation = await getEscalation(params.workspaceId, params.escalationId);
  const currentStatus = escalation.status as EscalationStatus;
  if (currentStatus === "pending") {
    await transitionEscalation(params.workspaceId, params.escalationId, "pending", "proposed", {});
  }
  const from = currentStatus === "pending" ? "proposed" : currentStatus;
  await transitionEscalation(params.workspaceId, params.escalationId, from, "resolved", {
    resolved_by: ctx.userId,
    resolved_at: new Date().toISOString(),
  });
}

/** The coach's own view of the temporary thread bound to one escalation —
 * "the active human thread must be clear on both sides." */
export async function getCoachThreadMessagesForEscalation(params: { workspaceId: string; escalationId: string }): Promise<ConversationMessageView[]> {
  await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("escalation_id", params.escalationId)
    .eq("workspace_id", params.workspaceId)
    .maybeSingle();
  if (error) throw new Error(`getCoachThreadMessagesForEscalation failed: ${error.message}`);
  if (!data) return [];
  return getConversationMessages(data.id as string);
}

/** The coach reading one client's full chat history from the client record
 * — every conversation this client has ever had, including resolved coach
 * threads, scoped by RLS to clients this coach may actually access. */
export async function getClientChatHistoryForCoach(params: { workspaceId: string; clientProfileId: string }): Promise<
  { conversationId: string; kind: string; status: string; messages: ConversationMessageView[] }[]
> {
  await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, kind, status")
    .eq("client_profile_id", params.clientProfileId)
    .order("opened_at", { ascending: true });
  if (error) throw new Error(`getClientChatHistoryForCoach failed: ${error.message}`);

  const conversations = (data ?? []) as { id: string; kind: string; status: string }[];
  return Promise.all(
    conversations.map(async (c) => ({
      conversationId: c.id,
      kind: c.kind,
      status: c.status,
      messages: await getConversationMessages(c.id),
    }))
  );
}
