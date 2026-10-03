// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// Server-only, vendor-neutral chat-model provider boundary. Nothing above
// this file (lib/ai/pipeline.ts, lib/production/chat.ts, app/actions/chat.ts)
// ever imports @anthropic-ai/sdk or any other vendor SDK directly — every
// caller depends only on ChatModelProvider, so swapping the vendor or model
// later is a new file under lib/ai/providers/ plus one line in
// resolveChatModelProvider(), never a change scattered through the pipeline.
// "Do not hardcode the product permanently to one vendor or model" and "Do
// not select an irreversible long-term AI vendor architecture" — this
// interface is that guarantee made structural.
//
// The model may recommend a route (AssistantDecision) — server-side code in
// lib/ai/pipeline.ts is what actually enforces identity, RLS, safety,
// Playbook authority, and mutation permissions. A provider's output is
// always treated as an untrusted suggestion until validated.

import "server-only";

/** What gets logged as conversation_messages.route_meta — non-sensitive
 * audit metadata only. Never the raw prompt, the full Playbook content, or
 * any client health/PII detail — "Record enough non-sensitive metadata to
 * audit why the route occurred," not a prompt log. */
export interface RouteAuditMeta {
  decisionKind: AssistantDecisionKind;
  escalationReason?: string;
  authorityDomain?: string;
  authorityDisposition?: string;
  providerId: string;
  modelId: string;
  latencyMs: number;
}

export type AssistantDecisionKind = "answer" | "clarify" | "escalate" | "propose_action";

/** The seven approved escalation triggers, imported by value below from the
 * communications contracts rather than redeclared, so the AI layer and the
 * persistence layer can never drift on what a valid reason category is. */
export type { EscalationReason } from "../communications/types.ts";
import type { EscalationReason } from "../communications/types.ts";

/** A candidate mutation the model would like to make (e.g. "swap today's
 * exercise", "shift this week's calorie target"). Never executed directly
 * from this shape — lib/ai/pipeline.ts always turns a propose_action
 * decision into a persisted escalation for coach review in this phase (see
 * that file's own doc for why: no chat-triggered plan mutation bypasses the
 * coach's existing publication workflow). */
export interface ProposedAction {
  domain: string;
  description: string;
}

/** The one structured shape a provider must return. Validated (never cast)
 * by lib/ai/pipeline.ts's validateAssistantDecision before anything acts on
 * it — a provider is untrusted input, exactly like a client message. */
export interface AssistantDecision {
  kind: AssistantDecisionKind;
  /** Client-facing text for answer/clarify. For escalate, this is the
   * immediate safety/handoff reply shown before the coach ever responds —
   * never a claim that the coach was already notified (see
   * describeEscalationForAssistantMessage in lib/communications/types.ts,
   * which is what's actually allowed to say that, and only after a real
   * persisted escalation exists). */
  responseText: string;
  escalationReason?: EscalationReason;
  proposedAction?: ProposedAction;
}

export interface ChatContextMessage {
  role: "client" | "assistant" | "coach" | "system";
  body: string;
}

/** Everything a provider needs to produce one AssistantDecision. Assembled
 * exclusively by lib/ai/pipeline.ts from the authenticated caller's own
 * tenant-scoped data — see that file's assembleClientChatContext — never
 * passed in from client-supplied fields. */
export interface ChatGenerationRequest {
  systemPrompt: string;
  history: ChatContextMessage[];
  clientMessage: string;
  timeoutMs: number;
}

export interface ChatGenerationResult {
  decision: AssistantDecision;
  modelId: string;
  latencyMs: number;
}

export class AiProviderTimeoutError extends Error {
  constructor(message = "The AI provider did not respond in time.") {
    super(message);
    this.name = "AiProviderTimeoutError";
  }
}

export class AiProviderUnavailableError extends Error {
  /** Safe metadata only (category, status class, request id) — never message text from the provider. */
  readonly diagnostic?: import("./safe-errors.ts").ProviderDiagnostic;
  constructor(message = "The AI provider is unavailable.", diagnostic?: import("./safe-errors.ts").ProviderDiagnostic) {
    super(message);
    this.name = "AiProviderUnavailableError";
    this.diagnostic = diagnostic;
  }
}

/** Thrown when AI_PROVIDER names "fake" while the app is actually running
 * in Supabase mode outside of an explicit local/test context — "Never
 * silently use the fake provider in real Supabase mode." See
 * resolveChatModelProvider's own guard for exactly when this fires. */
export class AiProviderMisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderMisconfiguredError";
  }
}

/** A provider responded, but not with a structurally valid AssistantDecision
 * — never cast/guessed into one. See lib/ai/pipeline.ts's
 * validateAssistantDecision, the only place this is thrown from. */
export class AiProviderInvalidOutputError extends Error {
  constructor(reason: string) {
    super(`AI provider returned an invalid decision: ${reason}`);
    this.name = "AiProviderInvalidOutputError";
  }
}

export interface ChatModelProvider {
  readonly id: string;
  readonly modelId: string;
  generate(request: ChatGenerationRequest): Promise<ChatGenerationResult>;
}

/** Gate 4.0C-2A — a single structured-JSON completion (used to PROPOSE a
 * structured reading of coach-written text). Same boundary, same vendor
 * file, same untrusted-output posture as chat: the caller validates the
 * JSON against its own schema before using any of it. */
export interface StructuredJsonRequest {
  systemPrompt: string;
  userMessage: string;
  maxOutputTokens: number;
  timeoutMs: number;
  /** Reasoning effort; defaults to "medium". */
  effort?: "low" | "medium" | "high";
}

export interface StructuredJsonResult {
  json: unknown;
  usage: { inputTokens: number; outputTokens: number } | null;
  /** Provider request id when available (safe metadata). */
  requestId: string | null;
  latencyMs: number;
}

export interface StructuredJsonProvider {
  readonly id: string;
  readonly modelId: string;
  generateJson(request: StructuredJsonRequest): Promise<unknown>;
  /** Same call, plus safe metadata (token usage, request id, latency). */
  generateJsonWithMeta(request: StructuredJsonRequest): Promise<StructuredJsonResult>;
}
