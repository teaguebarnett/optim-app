// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// Deterministic fake ChatModelProvider — automated tests and explicit local
// E2E only (see lib/ai/resolve.ts's hard guard against this ever running
// silently, or at all, in a real Vercel Production deploy). Same input
// always produces the same AssistantDecision, which is what makes the
// scenario tests in verify-chat-intelligence.mts and the E2E script
// independently reproducible without a live model call.
//
// This still has to behave like a genuinely tolerant free-form assistant —
// "slang, typos, short messages, follow-ups, and unexpected wording" — not
// a rigid keyword whitelist, so it's built around loose substring/edit-
// distance-free matching over normalized text, with a fixed, safety-first
// precedence identical in spirit to lib/chat/assistant.ts's existing
// classifier (pain checked before anything else can absorb it; an explicit
// request for the coach always wins).

import type { AssistantDecision, ChatGenerationRequest, ChatGenerationResult, ChatModelProvider } from "../provider.ts";
import type { CoachPlaybookContent } from "../../coach/playbook.ts";
import type { AssistantContextSnapshot } from "../context.ts";

const GREETING_WORDS = ["hey", "hi", "hello", "yo", "yoo", "sup", "howdy", "hiya"];

const PAIN_KEYWORDS = ["pain", "hurt", "sore", "injur", "tweak", "strain", "sharp pain", "popped", "numb", "dizzy", "chest tight", "can't breathe", "cant breathe"];

/** Serious adherence / eating-behaviour / mental-health language — always a
 * coach decision, never an OPTIM answer, per the coach's own
 * disorderedEatingEscalation / mentalHealthEscalation safety policies (see
 * lib/coach/operating-model.ts). */
const SENSITIVE_KEYWORDS = ["purge", "starving myself", "stopped eating", "binge", "hate my body", "depressed", "hopeless", "hurt myself", "self harm", "not eating at all"];

/** Built from the REAL assigned coach's display name at call time — never a
 * hardcoded "Teague" (see lib/chat/assistant.ts's interpolateCoachName rule
 * and lib/tenancy/seed.ts's Teague/Alex fixture: this product has more than
 * one coach, and "talk to Alex" must escalate for Alex's clients exactly
 * the way "talk to Teague" does for Teague's). */
function explicitCoachRequestPhrases(coachDisplayName: string): string[] {
  const full = coachDisplayName.trim().toLowerCase();
  const first = full.split(/\s+/)[0] ?? "";
  const names = [full, first].filter((n) => n.length > 1);
  const generic = ["talk to my coach", "speak to my coach", "talk to the coach", "speak to the coach", "talk to a human", "speak to a human", "talk to a real person"];
  const named = names.flatMap((n) => [`talk to ${n}`, `speak to ${n}`, `message ${n} directly`, `get ${n}`, `want ${n}`, `need ${n}`, `ask ${n}`]);
  return [...generic, ...named];
}

/** A meaningful, permanent, high-impact change — never something OPTIM
 * settles on its own. Split from the propose_action list below: a GOAL
 * change is a methodology-level decision the coach owns outright
 * ("plan_change"), whereas a program/nutrition restructure is a concrete
 * proposed action the coach can approve or edit ("propose_action", which
 * lib/ai/pipeline.ts turns into an out-of-authority coach decision). */
const GOAL_CHANGE_KEYWORDS = ["change my goal", "switch my goal", "different goal", "new goal"];

const PERMANENT_CHANGE_KEYWORDS = [
  "change my program permanently",
  "change my whole program",
  "switch my whole program",
  "new program",
  "different program entirely",
  "quit this program",
  "restart my program",
  "change my program",
  "rewrite my program",
  "permanently",
];

const RPE_DEFINITION_KEYWORDS = ["rpe", "rir", "reps in reserve", "rate of perceived exertion"];

const SUBSTITUTION_KEYWORDS = ["instead of", "substitute", "swap", "replace", "can i use", "can i eat", "can i have"];
const FOOD_WORDS = ["chicken", "turkey", "rice", "protein", "meal", "food", "calor", "carb", "snack", "dinner", "lunch", "breakfast", "eating", "beef", "fish", "tofu", "yogurt", "eggs"];

const MISSED_WORKOUT_KEYWORDS = ["miss today", "going to miss", "gonna miss", "can't train today", "cant train today", "skip today", "missing my workout", "miss my workout"];

const TODAY_PLAN_KEYWORDS = ["what's today", "whats today", "what am i doing today", "today's workout", "todays workout", "what's my workout", "whats my workout", "what do i train"];

const ACK_WORDS = new Set(["ok", "okay", "k", "kk", "thanks", "thank you", "thx", "ty", "cool", "great", "got it", "sounds good", "np"]);

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function mentionsAny(normalized: string, words: string[]): boolean {
  return words.some((w) => normalized.includes(w));
}

/** True only when the whole (trimmed, punctuation-stripped) message is a
 * short greeting/ack — never for a longer message that merely contains
 * "hey" as its first word ("hey my knee really hurts" must not short-circuit
 * here). */
function isBareGreetingOrAck(normalized: string): boolean {
  const stripped = normalized.replace(/[.!?,]+$/g, "").trim();
  return GREETING_WORDS.includes(stripped) || ACK_WORDS.has(stripped);
}

/** A message this fake provider genuinely can't classify with any
 * confidence — short, no recognizable topic word at all. Real free-form
 * unfamiliar slang ("yeet my workout") falls here rather than being forced
 * into a wrong bucket; the pipeline's own clarify-then-escalate rule (see
 * lib/ai/pipeline.ts) handles what happens on a second unresolved miss. */
function isAmbiguous(normalized: string): boolean {
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  const knownWords = [
    ...GREETING_WORDS,
    ...PAIN_KEYWORDS,
    ...RPE_DEFINITION_KEYWORDS,
    ...FOOD_WORDS,
    "workout",
    "training",
    "program",
    "nutrition",
    "schedule",
    "progress",
    "coach",
    "weight",
    "cardio",
    "sets",
    "reps",
  ];
  return !knownWords.some((w) => normalized.includes(w));
}

function buildSubstitutionAnswer(context: AssistantContextSnapshot, playbook: CoachPlaybookContent): string {
  const logic = playbook.operatingModel.programArchitecture.substitutionLogic || "match_movement_pattern_and_equipment";
  if (context.hasActiveNutritionAssignment) {
    const targets = context.nutritionTargetsSummary ? ` Your current targets are ${context.nutritionTargetsSummary}.` : "";
    return `Based on your nutrition plan and how ${context.coachDisplayName} likes substitutions handled (${logic.replaceAll("_", " ")}), that swap works as long as you keep the portion sized to hit the same protein — go ahead.${targets}`;
  }
  return `That substitution is fine within your current targets — go ahead. Once your nutrition plan is set up we can be more precise about exact portions.`;
}

function buildRpeAnswer(playbook: CoachPlaybookContent): string {
  const proximity = playbook.operatingModel.programArchitecture.proximityToFailure || "a couple of reps in reserve";
  return `RPE (Rate of Perceived Exertion) is a 1–10 scale for how hard a set felt — RPE 8 means you could have done about 2 more reps before failure. ${playbook.operatingModel.communication.tone === "encouraging_direct" ? "Your coach's plans are built around staying around " + proximity.replaceAll("_", " ") + " on most working sets." : ""}`.trim();
}

/** Follows the coach's own missed-workout policy from the Playbook
 * (communication.missedWorkoutFollowUp) rather than inventing a rule, and
 * answers within scheduling authority instead of escalating — a missed
 * session inside the coach's stated rules is explicitly a routine
 * interaction, not an escalation trigger. */
function buildMissedWorkoutAnswer(context: AssistantContextSnapshot, playbook: CoachPlaybookContent): string {
  if (!context.hasActiveProgram) {
    return "Got it — noted. Once your program is set up you'll be able to reschedule sessions right from Today.";
  }
  const followUp = playbook.operatingModel.communication.missedWorkoutFollowUp.replaceAll("_", " ");
  const focus = context.todayFocusLabel ? ` (${context.todayFocusLabel})` : "";
  return `No problem — life happens. You can move today's session${focus} to tomorrow or mark it as a rest day from the Today screen. ${context.coachDisplayName}'s approach here is a ${followUp}, so just get the next one in; one missed day doesn't undo the block.`;
}

/** The provider-agnostic decision logic shared by the fake provider and, in
 * spirit, what a real model's system prompt asks Claude to reproduce — kept
 * here (not duplicated) so the deterministic tests exercise the exact same
 * classification a human reading the spec's "Locked product model" section
 * would expect. Exported so verify-chat-intelligence.mts can test it
 * directly without going through the async provider interface. */
export function classifyForFakeProvider(
  clientMessageRaw: string,
  context: AssistantContextSnapshot,
  playbook: CoachPlaybookContent
): AssistantDecision {
  const normalized = normalize(clientMessageRaw);

  // Safety-critical: always checked first, exactly like lib/chat/assistant.ts.
  // Note what this text does NOT say: that the coach has been notified.
  // No provider is allowed to make that claim — only
  // lib/production/chat.ts appends it, and only from a real persisted
  // escalation row via describeEscalationForAssistantMessage. See
  // lib/ai/pipeline.ts's stripUnverifiedNotificationClaims, which enforces
  // that structurally for every provider, including a real model that
  // ignores its system prompt.
  if (mentionsAny(normalized, PAIN_KEYWORDS)) {
    return {
      kind: "escalate",
      escalationReason: "pain_or_safety",
      responseText:
        "Stop that movement for now, and don't push through pain that's getting worse. I can't diagnose it or change your program myself. This isn't a substitute for professional medical care — if it's severe, sudden, or you're worried, please seek that first. Can you tell me roughly where it hurts and what it feels like?",
    };
  }

  if (mentionsAny(normalized, SENSITIVE_KEYWORDS)) {
    return {
      kind: "escalate",
      escalationReason: "adherence_or_sensitive",
      responseText:
        "Thank you for telling me — that matters, and it deserves a real person rather than an automated answer. I'm not able to advise on this myself. If you're in immediate distress, please contact a qualified professional or an emergency service right away.",
    };
  }

  if (mentionsAny(normalized, explicitCoachRequestPhrases(context.coachDisplayName))) {
    return {
      kind: "escalate",
      escalationReason: "explicit_request",
      responseText: `Of course — ${context.coachDisplayName} can pick this up with you directly. Anything you'd like me to pass along with it?`,
    };
  }

  if (mentionsAny(normalized, GOAL_CHANGE_KEYWORDS)) {
    return {
      kind: "escalate",
      escalationReason: "plan_change",
      responseText: `Changing your goal reshapes your whole plan, so that's ${context.coachDisplayName}'s call rather than mine. What's prompting the change?`,
    };
  }

  if (mentionsAny(normalized, PERMANENT_CHANGE_KEYWORDS)) {
    return {
      kind: "propose_action",
      responseText: `A permanent program change is bigger than I can make on my own — ${context.coachDisplayName} decides that one. I can put the request in front of them with what you've told me.`,
      proposedAction: {
        domain: "training_adjustment",
        description: `Client requested a permanent training program change: "${clientMessageRaw.slice(0, 200)}"`,
      },
    };
  }

  if (isBareGreetingOrAck(normalized)) {
    return { kind: "answer", responseText: `Hey! How's it going today?` };
  }

  if (mentionsAny(normalized, RPE_DEFINITION_KEYWORDS)) {
    return { kind: "answer", responseText: buildRpeAnswer(playbook) };
  }

  if (mentionsAny(normalized, SUBSTITUTION_KEYWORDS) && mentionsAny(normalized, FOOD_WORDS)) {
    return { kind: "answer", responseText: buildSubstitutionAnswer(context, playbook) };
  }

  if (mentionsAny(normalized, MISSED_WORKOUT_KEYWORDS)) {
    return { kind: "answer", responseText: buildMissedWorkoutAnswer(context, playbook) };
  }

  // A question about today's own prescribed session — answered directly
  // from assembled context, never escalated.
  if (mentionsAny(normalized, TODAY_PLAN_KEYWORDS)) {
    if (context.todayFocusLabel) {
      return { kind: "answer", responseText: `Today is ${context.todayFocusLabel}${context.programWeekLabel ? ` — ${context.programWeekLabel}` : ""}. Open the Today screen and it'll walk you through it set by set.` };
    }
    return { kind: "answer", responseText: "You don't have an active program assigned yet, so there's nothing prescribed for today. Your coach will publish one and it'll show up on Today." };
  }

  if (isAmbiguous(normalized)) {
    return {
      kind: "clarify",
      responseText: `Just to make sure I help with the right thing — are you asking about today's training, your nutrition, or something else?`,
    };
  }

  return {
    kind: "answer",
    responseText: `Got it — noted. Let me know if you want more detail on today's plan.`,
  };
}

export class FakeChatModelProvider implements ChatModelProvider {
  readonly id = "fake";
  readonly modelId = "fake-deterministic-v1";

  private readonly playbook: CoachPlaybookContent;
  private readonly context: AssistantContextSnapshot;

  constructor(playbook: CoachPlaybookContent, context: AssistantContextSnapshot) {
    this.playbook = playbook;
    this.context = context;
  }

  async generate(request: ChatGenerationRequest): Promise<ChatGenerationResult> {
    const start = Date.now();
    // Deterministic hook for the provider-failure scenario test: a message
    // literally containing this marker simulates an unavailable provider,
    // never triggered by any real client wording.
    if (request.clientMessage.includes("__SIMULATE_PROVIDER_FAILURE__")) {
      throw new Error("Simulated provider failure");
    }
    const decision = classifyForFakeProvider(request.clientMessage, this.context, this.playbook);
    return { decision, modelId: this.modelId, latencyMs: Date.now() - start };
  }
}
