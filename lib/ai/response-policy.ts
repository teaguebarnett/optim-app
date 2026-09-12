// Focused UX hardening pass — Concise, mobile-first OPTIM chat responses.
//
// The ONE centralized, provider-independent response-length contract for
// every OPTIM chat reply. Before this file existed, nothing in the pipeline
// told the model how long to write, and the Anthropic provider's
// max_tokens (1024) was generous enough that a routine question could come
// back as a multi-paragraph article. That combination — no length
// instruction plus a loose ceiling — was the actual cause of the
// wall-of-text problem, not the model or the safety/escalation logic.
//
// This is deliberately prompt-level, not a second model call and not
// post-hoc truncation: lib/ai/context.ts's buildSystemPrompt splices
// RESPONSE_LENGTH_POLICY into the system prompt shared by every provider,
// so any future non-Anthropic provider inherits the same contract for
// free. RESPONSE_MAX_OUTPUT_TOKENS is the one Anthropic-specific backstop
// (a provider concept the shared prompt can't express) — sized to comfortably
// exceed what the longest permitted category could ever need, so it bounds a
// truly runaway generation without ever being the thing that decides normal
// response length.

/** The four response categories are OPTIM's own product decision, not
 * something a separate classifier stage decides before generation — the
 * model picks the category and self-polices length against it in the same
 * pass that produces the AssistantDecision. Exported so tests assert the
 * prompt text and the numbers here can never drift apart. */
export const ROUTINE_WORD_TARGET = "40-90";
export const COMPLEX_WORD_TARGET = "60-110";
export const SAFETY_WORD_TARGET = "80-140";
export const EMERGENCY_WORD_TARGET_MAX = 160;

/** Anthropic's max_tokens ceiling for one chat response. ~160 words is
 * roughly 200-260 tokens once JSON-wrapped even accounting for
 * medical/safety vocabulary running heavier than average English text; this
 * leaves a comfortable margin above that so a genuinely necessary long
 * safety response is never cut off mid-sentence, while still bounding the
 * model far below the previous 1024-token ceiling that let an ordinary
 * question come back as an essay. */
export const RESPONSE_MAX_OUTPUT_TOKENS = 700;

export const RESPONSE_LENGTH_POLICY = `RESPONSE LENGTH — you communicate like a coach texting a client, never like an AI writing an article. Pick exactly one budget below, by what the message actually needs, and stay inside it:
- Routine coaching answer or clarification: ${ROUTINE_WORD_TARGET} words, usually 2-5 short sentences. Lead with the answer or action. Include only the most relevant reasoning. Ask at most one useful follow-up question.
- Complex but non-safety topic: ${COMPLEX_WORD_TARGET} words. Prioritize the immediate decision and the next action; do not walk through every possible scenario.
- Pain, injury, or any safety-sensitive concern: ${SAFETY_WORD_TARGET} words. State plainly what to stop or change right now, briefly explain the concern without diagnosing, mention only the most important red flags, include one concise statement about seeking professional medical care when relevant, and ask at most one decision-useful follow-up question.
- Genuine emergency risk: up to about ${EMERGENCY_WORD_TARGET_MAX} words, and only when that length is truly required for safety.
Never restate the same warning, context, or question in more than one form. Do not summarize what you just said. Avoid lists unless the client genuinely needs multiple distinct steps.`;

/** Simple whitespace word count — deterministic and good enough to check a
 * response is in the right ballpark. Shared by tests and any future
 * diagnostic script so there's exactly one definition of "word" in play. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}
