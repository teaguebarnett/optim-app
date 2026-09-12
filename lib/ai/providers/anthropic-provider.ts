// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The one real ChatModelProvider adapter, using the official
// @anthropic-ai/sdk. This is the ONLY file in the repository that imports
// that package — see lib/ai/provider.ts's own doc for why every caller
// depends on the vendor-neutral interface instead.
//
// Asks Claude to return a single JSON object matching AssistantDecision's
// shape and parses/validates it before ever returning it — the model's raw
// text is untrusted input exactly like a client message, never cast
// directly. Bounded timeout (per-request override) and bounded retries
// (maxRetries at client construction) per the phase's "reasonable timeouts,
// bounded retries, rate limiting, and controlled provider-unavailable
// behavior" requirement.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  AiProviderInvalidOutputError,
  AiProviderTimeoutError,
  AiProviderUnavailableError,
  type AssistantDecision,
  type AssistantDecisionKind,
  type ChatGenerationRequest,
  type ChatGenerationResult,
  type ChatModelProvider,
  type EscalationReason,
} from "../provider.ts";
import { RESPONSE_MAX_OUTPUT_TOKENS } from "../response-policy.ts";

const VALID_KINDS: AssistantDecisionKind[] = ["answer", "clarify", "escalate", "propose_action"];
const VALID_REASONS: EscalationReason[] = [
  "pain_or_safety",
  "plan_change",
  "out_of_authority",
  "unresolved_uncertainty",
  "conflicting_information",
  "adherence_or_sensitive",
  "explicit_request",
];

const DECISION_INSTRUCTIONS = `
Respond with ONLY a single JSON object (no markdown fences, no extra prose) matching exactly this shape:
{"kind": "answer" | "clarify" | "escalate" | "propose_action", "responseText": string, "escalationReason"?: one of ${JSON.stringify(VALID_REASONS)}, "proposedAction"?: {"domain": string, "description": string}}
"escalationReason" is required when kind is "escalate", and must be one of the listed values. Never include any text outside the JSON object.`;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new AiProviderInvalidOutputError("no JSON object found in model output");
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch (err) {
    throw new AiProviderInvalidOutputError(`model output was not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function validateDecision(raw: unknown): AssistantDecision {
  if (typeof raw !== "object" || raw === null) throw new AiProviderInvalidOutputError("decision is not an object");
  const obj = raw as Record<string, unknown>;

  if (typeof obj.kind !== "string" || !VALID_KINDS.includes(obj.kind as AssistantDecisionKind)) {
    throw new AiProviderInvalidOutputError(`"kind" must be one of ${VALID_KINDS.join(", ")}`);
  }
  if (typeof obj.responseText !== "string" || obj.responseText.trim().length === 0) {
    throw new AiProviderInvalidOutputError('"responseText" must be a non-empty string');
  }

  const kind = obj.kind as AssistantDecisionKind;
  let escalationReason: EscalationReason | undefined;
  if (kind === "escalate") {
    if (typeof obj.escalationReason !== "string" || !VALID_REASONS.includes(obj.escalationReason as EscalationReason)) {
      throw new AiProviderInvalidOutputError(`kind "escalate" requires a valid "escalationReason", one of ${VALID_REASONS.join(", ")}`);
    }
    escalationReason = obj.escalationReason as EscalationReason;
  }

  let proposedAction: AssistantDecision["proposedAction"];
  if (kind === "propose_action") {
    const pa = obj.proposedAction as Record<string, unknown> | undefined;
    if (!pa || typeof pa.domain !== "string" || typeof pa.description !== "string") {
      throw new AiProviderInvalidOutputError('kind "propose_action" requires "proposedAction": {domain, description}');
    }
    proposedAction = { domain: pa.domain, description: pa.description };
  }

  return { kind, responseText: obj.responseText, escalationReason, proposedAction };
}

export class AnthropicChatModelProvider implements ChatModelProvider {
  readonly id = "anthropic";
  readonly modelId: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, modelId: string) {
    this.modelId = modelId;
    this.client = new Anthropic({ apiKey, maxRetries: 1 });
  }

  async generate(request: ChatGenerationRequest): Promise<ChatGenerationResult> {
    const start = Date.now();
    const messages: Anthropic.MessageParam[] = [
      ...request.history
        .filter((m) => m.role === "client" || m.role === "coach" || m.role === "assistant")
        .map((m): Anthropic.MessageParam => ({ role: m.role === "assistant" || m.role === "coach" ? "assistant" : "user", content: m.body })),
      { role: "user", content: request.clientMessage },
    ];

    try {
      const response = await this.client.messages.create(
        {
          model: this.modelId,
          max_tokens: RESPONSE_MAX_OUTPUT_TOKENS,
          system: `${request.systemPrompt}\n${DECISION_INSTRUCTIONS}`,
          messages,
          output_config: { effort: "medium" },
        },
        { timeout: request.timeoutMs }
      );

      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!textBlock) throw new AiProviderInvalidOutputError("model response contained no text block");

      const decision = validateDecision(extractJsonObject(textBlock.text));
      return { decision, modelId: this.modelId, latencyMs: Date.now() - start };
    } catch (err) {
      if (err instanceof AiProviderInvalidOutputError) throw err;
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AiProviderTimeoutError();
      if (err instanceof Anthropic.RateLimitError) throw new AiProviderUnavailableError("Anthropic rate limit exceeded");
      if (err instanceof Anthropic.APIError) throw new AiProviderUnavailableError(`Anthropic API error: ${err.message}`);
      throw new AiProviderUnavailableError(err instanceof Error ? err.message : String(err));
    }
  }
}
