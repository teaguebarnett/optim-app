// Gate 5C — Coach-Response Authority Enforcement.
//
// Structural (not merely prompt-level) enforcement of two coach-configured
// Playbook fields: `coachMustRespondPersonally` and `aiMayRespondDirectly`.
// lib/coach/playbook.ts's renderPlaybookForPrompt already tells the model
// about these — this module is the backstop for when the model doesn't
// comply, mirroring lib/ai/pipeline.ts's own "three rules enforced
// structurally here, not by trusting the model" posture (rules 1-3 in that
// file's own doc) with a fourth: a coach's own explicit communication-
// authority choice is never left to the model's judgment alone.
//
// Detection is deliberately a bounded, documented keyword/phrase match —
// not full language understanding, and not a second model call. It trades
// perfect recall for something auditable and unit-testable; a phrase this
// list doesn't anticipate still reaches the model, which has its own
// independent prompt-level instruction (lib/coach/playbook.ts) and, for
// pain/safety specifically, the platform-level "always escalate" rule in
// lib/ai/context.ts's BASE_SYSTEM_PROMPT — this is an additional backstop,
// never the only safety net. See this phase's own report for exactly what
// still needs live-conversation testing against real client phrasing this
// list cannot anticipate.

import type { AssistantDecision, EscalationReason } from "./provider.ts";

/** One pattern set per `coachMustRespondPersonally` enum value — see
 * lib/coach/coach-onboarding-questions.ts's comm_must_respond_personally
 * options; every key here must be a real option value there.
 *
 * Deliberately conservative on pain_or_injury_report: it does NOT match a
 * bare "sore" (extremely common, routine post-training language — matching
 * it would flood the coach with false escalations for ordinary soreness)
 * but does match an explicit pain/injury/strain report. */
const MUST_RESPOND_PERSONALLY_PATTERNS: Record<string, RegExp[]> = {
  pain_or_injury_report: [
    /\bpain\b/i,
    /\bhurts?\b/i,
    /\bhurting\b/i,
    /\binjur(?:y|ed|ies)\b/i,
    /\bsprain(?:ed)?\b/i,
    /\bstrain(?:ed)?\b/i,
    /\btweak(?:ed)?\s+my\b/i,
    /\bpulled\s+(?:a\s+)?muscle\b/i,
  ],
  emotional_distress: [
    /\boverwhelm(?:ed|ing)?\b/i,
    /\bdepress(?:ed|ion)\b/i,
    /\banxi(?:ety|ous)\b/i,
    /\bburn(?:ed|t)?\s*out\b/i,
    /\bwant\s+to\s+give\s+up\b/i,
    /\bcan'?t\s+do\s+this\s+anymore\b/i,
    /\breally\s+struggling\b/i,
  ],
  billing_or_account: [
    /\bbill(?:ing)?\b/i,
    /\binvoice\b/i,
    /\bcharge[ds]?\b/i,
    /\bsubscription\b/i,
    /\bpayment\b/i,
    /\brefund\b/i,
    /\bcredit\s+card\b/i,
    /\bcancel\s+my\s+(?:membership|account|subscription)\b/i,
  ],
  major_goal_change_request: [
    /\bchange\s+my\s+goal\b/i,
    /\bnew\s+goal\b/i,
    /\bswitch\s+(?:my\s+)?(?:focus|program)\s+to\b/i,
    /\bdifferent\s+goal\b/i,
  ],
};

/** The deterministic EscalationReason each must-respond-personally topic
 * forces, when this module overrides the model's own decision. Two of the
 * four map cleanly onto an existing reason (lib/communications/types.ts):
 * pain_or_injury_report -> pain_or_safety, major_goal_change_request ->
 * plan_change. emotional_distress uses adherence_or_sensitive (that
 * reason's own doc: "a serious adherence/mental-health/eating concern").
 * billing_or_account has NO matching reason in the fixed 7-value enum
 * (mirrors a real database CHECK constraint — adding one needs a
 * migration, out of this fix's scope), so it is mapped to the closest
 * available approximation, out_of_authority (a billing question is outside
 * OPTIM's fitness-coaching authority). This approximation is reported, not
 * hidden — see this phase's own report. */
const FORCED_ESCALATION_REASON: Record<string, EscalationReason> = {
  pain_or_injury_report: "pain_or_safety",
  emotional_distress: "adherence_or_sensitive",
  billing_or_account: "out_of_authority",
  major_goal_change_request: "plan_change",
};

/** True when a client's message matches one of this coach's configured
 * must-respond-personally topics. Pure and exported so it's independently
 * testable with no AssistantDecision required. Returns the first matching
 * topic (coachMustRespondPersonally order), or null. */
export function detectMustRespondPersonallyTopic(clientMessage: string, coachMustRespondPersonally: string[]): string | null {
  for (const topic of coachMustRespondPersonally) {
    const patterns = MUST_RESPOND_PERSONALLY_PATTERNS[topic];
    if (!patterns) continue;
    if (patterns.some((pattern) => pattern.test(clientMessage))) return topic;
  }
  return null;
}

/**
 * The structural backstop. Called from lib/ai/pipeline.ts AFTER
 * normalizeDecision, on the already-normalized decision — it can only ever
 * MOVE a decision toward escalation, never turn a real escalation back into
 * an answer, and never edits responseText (a forced escalation still
 * carries whatever guidance the model already wrote, exactly like every
 * other escalate decision — see AssistantDecision's own doc on why
 * responseText is preserved through an escalate).
 *
 * Two independent triggers, either forces `kind: "escalate"`:
 *  1. This coach's aiMayRespondDirectly is empty — the unambiguous signal
 *     for the onboarding question's "None — I want to see everything
 *     first" (lib/coach/playbook.ts's own doc explains why empty, not the
 *     literal string "none", is the real persisted signal). Forces
 *     escalation for every non-escalate message, no keyword matching
 *     needed, since the coach asked to see literally everything.
 *  2. The client's message matches one of this coach's own
 *     coachMustRespondPersonally topics (detectMustRespondPersonallyTopic).
 */
export function enforceCoachCommunicationAuthority(
  decision: AssistantDecision,
  clientMessage: string,
  communication: { aiMayRespondDirectly: string[]; coachMustRespondPersonally: string[] }
): AssistantDecision {
  if (decision.kind === "escalate") return decision;

  if (communication.aiMayRespondDirectly.length === 0) {
    return { kind: "escalate", escalationReason: "out_of_authority", responseText: decision.responseText };
  }

  const topic = detectMustRespondPersonallyTopic(clientMessage, communication.coachMustRespondPersonally);
  if (topic) {
    return { kind: "escalate", escalationReason: FORCED_ESCALATION_REASON[topic], responseText: decision.responseText };
  }

  return decision;
}
