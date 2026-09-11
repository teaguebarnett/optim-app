// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The provider-facing half of the canonical response pipeline: build the
// prompt, call the resolved provider, and turn its raw AssistantDecision
// into the one thing the persistence layer (lib/production/chat.ts) is
// allowed to act on. Authenticate/persist/assemble-context happen in that
// caller, not here — this module never touches Supabase directly, which is
// what keeps it independently testable against the fake provider with no
// database at all (see verify-chat-intelligence.mts).
//
// Three rules are enforced structurally here, not by trusting the model:
//
// 1. "propose_action must never bypass the coach's existing program
//    publication workflow." This phase never executes a proposed mutation,
//    regardless of AI Authority level — a propose_action decision always
//    becomes a coach escalation ("out_of_authority"), so authority controls
//    what OPTIM may say/promise autonomously, never what it may write to a
//    client's program from chat. A future phase that wires authority-gated
//    auto-execution starts from this exact seam.
//
// 2. "OPTIM may say something was sent to the coach only after a real
//    escalation record persisted." Every provider's text is untrusted, so
//    ANY handoff claim is stripped here — including from an "escalate"
//    decision, because at this point no escalation row exists yet and
//    create_escalation can still fail. The only code allowed to add that
//    sentence back is lib/production/chat.ts, and only from a real
//    persisted row via describeEscalationForAssistantMessage. That makes
//    "OPTIM cannot claim the coach was notified when persistence failed" a
//    structural property rather than a prompt-level hope.
//
// 3. "Ask ONE clarifying question before escalating." A second consecutive
//    unresolved clarify becomes an unresolved_uncertainty escalation rather
//    than an endless clarification loop — the caller passes the previous
//    assistant decision kind in, since this module holds no state.

import { buildSystemPrompt, boundAssistantContext, MAX_CONTEXT_HISTORY_MESSAGES, type AssistantContextSnapshot } from "./context.ts";
import { resolveChatModelProvider } from "./resolve.ts";
import { getAiEnvConfig } from "./env.ts";
import {
  AiProviderTimeoutError,
  AiProviderUnavailableError,
  AiProviderInvalidOutputError,
  type AssistantDecision,
  type AssistantDecisionKind,
  type ChatContextMessage,
  type RouteAuditMeta,
} from "./provider.ts";
import type { CoachPlaybookContent } from "../coach/playbook.ts";

export interface PipelineInput {
  playbook: CoachPlaybookContent;
  context: AssistantContextSnapshot;
  history: ChatContextMessage[];
  clientMessage: string;
  /** The kind of the immediately preceding assistant decision in this
   * conversation, or null when this is the first message or the previous
   * turn wasn't OPTIM's. Only used for rule 3 above. */
  priorAssistantDecisionKind?: AssistantDecisionKind | null;
  /** The effective AI-authority domain and disposition the caller already
   * resolved (lib/coach/ai-authority.ts), recorded in route_meta for audit.
   * Never used to widen what this pipeline is willing to do — see rule 1. */
  authorityDomain?: string;
  authorityDisposition?: string;
}

export type ProviderFailureKind = "timeout" | "unavailable" | "invalid_output" | "misconfigured";

export interface PipelineResult {
  /** Null only when the provider itself failed (timeout / unavailable /
   * invalid output / misconfigured) — the caller must render a controlled,
   * honest "couldn't reach OPTIM" state in that case, never a fabricated
   * answer and never a false escalation claim. */
  decision: AssistantDecision | null;
  providerFailure: ProviderFailureKind | null;
  routeMeta: RouteAuditMeta;
}

/** Sentences that assert a handoff already happened. Conservative and
 * sentence-scoped: only the offending sentence is dropped, so the useful
 * safety guidance around it survives. Deliberately does NOT match "your
 * coach can see this in your log" style statements, which are true of every
 * persisted message and claim nothing about an escalation. */
const NOTIFICATION_CLAIM_PATTERNS: RegExp[] = [
  /\bi(?:'ve| have)?\s+(?:just\s+|already\s+)?(?:sent|forwarded|passed|escalated|flagged|reported|relayed|shared|raised)\b/i,
  /\bi(?:'ve| have)?\s+(?:just\s+|already\s+)?(?:let|told|notified|messaged|pinged|alerted|contacted|looped)\b/i,
  /\bi(?:'ve| have)?\s+(?:just\s+|already\s+)?reached out\b/i,
  /\b(?:has|have)\s+been\s+(?:notified|alerted|informed|sent|flagged|told)\b/i,
  /\bsent\s+(?:this|it|that|your (?:message|request|note))\s+to\b/i,
];

/** Removes any sentence asserting an unverified handoff. See rule 2. */
export function stripUnverifiedNotificationClaims(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !NOTIFICATION_CLAIM_PATTERNS.some((p) => p.test(s)));
  return kept.join(" ").replace(/\s{2,}/g, " ").trim();
}

/** The honest client-facing text for each provider failure mode. Never a
 * fabricated answer, never a false "sent to your coach" — the client is
 * told plainly that OPTIM couldn't respond, that their message was saved,
 * and what the safest next action is. Exported so the persistence layer and
 * the scenario tests share exactly one source of this wording. */
export function providerFailureMessage(kind: ProviderFailureKind, coachDisplayName: string): string {
  const opening =
    kind === "timeout"
      ? "I couldn't put a response together in time."
      : kind === "invalid_output"
        ? "Something went wrong on my side and I couldn't produce a reliable answer."
        : kind === "misconfigured"
          ? "My assistant service isn't configured right now, so I can't answer."
          : "I'm having trouble reaching my assistant service right now.";
  return (
    `${opening} Your message is saved — nothing was lost, and nothing has been sent to ${coachDisplayName} yet. ` +
    `Please try again in a moment, or message ${coachDisplayName} directly if it's urgent. ` +
    `If this is about pain, a possible injury, or anything that feels unsafe, stop training and seek qualified medical care first.`
  );
}

export async function runAssistantDecisionPipeline(input: PipelineInput): Promise<PipelineResult> {
  const env = getAiEnvConfig();
  const context = boundAssistantContext(input.context);

  let provider;
  try {
    provider = resolveChatModelProvider(input.playbook, context);
  } catch {
    // AiProviderMisconfiguredError — a real, visible configuration fault
    // (no ANTHROPIC_API_KEY, or AI_PROVIDER=fake in a real production
    // deploy). Never silently substituted with the fake provider (see
    // lib/ai/resolve.ts's own guard); surfaced to the client as an honest
    // "can't answer" state, exactly like any other provider failure.
    return {
      decision: null,
      providerFailure: "misconfigured",
      routeMeta: { decisionKind: "answer", providerId: "unresolved", modelId: "unresolved", latencyMs: 0 },
    };
  }

  const systemPrompt = buildSystemPrompt(input.playbook, context);
  const boundedHistory = input.history.slice(-MAX_CONTEXT_HISTORY_MESSAGES);
  const baseMeta = {
    providerId: provider.id,
    modelId: provider.modelId,
    authorityDomain: input.authorityDomain,
    authorityDisposition: input.authorityDisposition,
  };

  try {
    const result = await provider.generate({
      systemPrompt,
      history: boundedHistory,
      clientMessage: input.clientMessage,
      timeoutMs: env.timeoutMs,
    });

    const decision = normalizeDecision(result.decision, input.priorAssistantDecisionKind ?? null);

    return {
      decision,
      providerFailure: null,
      routeMeta: {
        decisionKind: decision.kind,
        escalationReason: decision.escalationReason,
        ...baseMeta,
        latencyMs: result.latencyMs,
      },
    };
  } catch (err) {
    const failure: ProviderFailureKind =
      err instanceof AiProviderTimeoutError
        ? "timeout"
        : err instanceof AiProviderInvalidOutputError
          ? "invalid_output"
          : err instanceof AiProviderUnavailableError
            ? "unavailable"
            : "unavailable";
    return {
      decision: null,
      providerFailure: failure,
      routeMeta: { decisionKind: "answer", ...baseMeta, latencyMs: 0 },
    };
  }
}

/** Rules 1-3 from this file's module doc, applied to one raw provider
 * decision. Pure, total, and exported so verify-chat-intelligence.mts can
 * exercise every branch without an async provider round-trip. */
export function normalizeDecision(
  decision: AssistantDecision,
  priorAssistantDecisionKind: AssistantDecisionKind | null
): AssistantDecision {
  // Rule 2 first — applied to every kind, including escalate. At this point
  // no escalation row exists yet, so no text may claim one does.
  const responseText = stripUnverifiedNotificationClaims(decision.responseText);
  const safeText =
    responseText.length > 0
      ? responseText
      : "Let me make sure I understand — can you tell me a bit more about what you need?";

  // Rule 1 — a proposed mutation never executes; it becomes a coach
  // decision. proposedAction travels with it so the coach sees exactly what
  // OPTIM would have done.
  if (decision.kind === "propose_action") {
    return {
      kind: "escalate",
      escalationReason: "out_of_authority",
      responseText: safeText,
      proposedAction: decision.proposedAction,
    };
  }

  // Rule 3 — one clarification attempt, then escalate rather than loop.
  if (decision.kind === "clarify" && priorAssistantDecisionKind === "clarify") {
    return { kind: "escalate", escalationReason: "unresolved_uncertainty", responseText: safeText };
  }

  return { ...decision, responseText: safeText };
}
