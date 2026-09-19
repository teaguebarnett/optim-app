// OPTIM Chat V1 — the assistant's deterministic response engine.
//
// Every client-authored message is classified into exactly one intent
// category by classifyClientMessage below, in a fixed, safety-first
// precedence order: an acknowledgement never escalates; pain/injury and
// program-change requests always escalate to the assigned coach BEFORE any
// routine keyword match gets a chance to answer them (see the pain-report
// interception note on lib/scripted-chat.ts's KEYWORD_MAP); only after both
// of those are ruled out does a routine scripted topic or a genuinely
// unsupported message get considered. This module never invents unrestricted
// assistant authority — categories "pain" and "program_change" are always
// coach-only handoffs, never answered here (see app/chat/page.tsx, which is
// the only place ChatMessage/ReviewRequest records actually get created from
// these classifications).
//
// Every response builder takes the client's real assigned-coach display name
// and interpolates it in — never a hardcoded "Teague" — so the exact same
// logic produces correct copy for any client/coach pairing (see
// interpolateCoachName and lib/tenancy/seed.ts's resolveAssignedCoachId,
// which is what resolves that name in the first place).

import { findScriptedResponse } from "../scripted-chat.ts";
import type { ScriptedChatTopic } from "../types";

export type ChatIntent =
  | { kind: "acknowledgement" }
  | { kind: "routine"; topic: ScriptedChatTopic }
  | { kind: "schedule_change" }
  | { kind: "pain" }
  | { kind: "program_change" }
  | { kind: "unsupported" };

// A short acknowledgement is matched only when it's the ENTIRE message (after
// trimming and stripping trailing punctuation) — "ok so my shoulder really
// hurts" must never be treated as a mere acknowledgement just because it
// starts with "ok". See isAcknowledgement.
const ACK_WORDS = new Set([
  "ok",
  "okay",
  "k",
  "kk",
  "thanks",
  "thank you",
  "thx",
  "ty",
  "sounds good",
  "got it",
  "cool",
  "great",
  "awesome",
  "perfect",
  "np",
  "no problem",
  "will do",
  "sure",
  "alright",
  "understood",
  "good",
  "nice",
]);

/** True only when the entire (trimmed, punctuation-stripped, lowercased)
 * message is a known short acknowledgement — never for a longer message that
 * merely contains one of these words. See the module doc's precedence note:
 * this is checked first so a real acknowledgement never triggers escalation
 * or a long fallback response. */
export function isAcknowledgement(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .trim();
  return ACK_WORDS.has(normalized);
}

const PAIN_KEYWORDS = ["pain", "hurt", "sore", "injur", "tweak", "strain", "ache", "aching"];

const FOOD_WORDS = [
  "chicken",
  "turkey",
  "rice",
  "protein",
  "meal",
  "food",
  "calor",
  "carb",
  "snack",
  "dinner",
  "lunch",
  "breakfast",
  "restaurant",
  "eating",
];

const PROGRAM_CHANGE_KEYWORDS = [
  "substitut",
  "swap",
  "switch",
  "instead of",
  "replace",
  "different exercise",
  "change my program",
  "change the program",
  "change my workout",
  "modify my workout",
  "add an exercise",
  "drop this exercise",
  "remove this exercise",
];

const SCHEDULE_KEYWORDS = [
  "schedule",
  "later today",
  "reschedule",
  "train later",
  "move my workout",
  "push my workout",
  "training time",
  "workout time",
];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function mentionsAny(normalized: string, words: string[]): boolean {
  return words.some((w) => normalized.includes(w));
}

/**
 * Classifies one client-authored message into exactly one intent category.
 * Pure and deterministic — same input always produces the same category, no
 * randomness or external state — which is what makes this independently
 * testable (see lib/chat/verify-chat.mts).
 */
export function classifyClientMessage(text: string): ChatIntent {
  if (isAcknowledgement(text)) return { kind: "acknowledgement" };

  const normalized = normalize(text);

  // Safety-critical: checked before anything else that could otherwise
  // answer or absorb pain/injury language into a routine topic.
  if (mentionsAny(normalized, PAIN_KEYWORDS)) return { kind: "pain" };

  // An exercise/program-change request that also mentions food is treated as
  // the routine meal-substitution topic instead (see FOOD_WORDS) — "can I
  // substitute turkey for chicken" must never be escalated as a program
  // change, and "can I substitute incline press for flat press" must never
  // be answered as if it were a food question.
  if (mentionsAny(normalized, PROGRAM_CHANGE_KEYWORDS) && !mentionsAny(normalized, FOOD_WORDS)) {
    return { kind: "program_change" };
  }

  if (mentionsAny(normalized, SCHEDULE_KEYWORDS)) return { kind: "schedule_change" };

  const topic = findScriptedResponse(text);
  if (topic) return { kind: "routine", topic };

  return { kind: "unsupported" };
}

/** Resolves every "{{coach}}" placeholder in a scripted/template response to
 * the client's real assigned coach's display name. Every response string
 * this module (or lib/mock-data.ts's SCRIPTED_CHAT_TOPICS) produces must be
 * passed through this before it's ever shown — never a hardcoded coach name
 * baked into the string itself. */
export function interpolateCoachName(text: string, coachName: string): string {
  return text.replaceAll("{{coach}}", coachName);
}

export function scheduleChangePromptText(): string {
  return "Sure — let's update today's plan. Use the button below to set a new time, mark today as a rest day, or let me know you're not sure yet.";
}

/** Safety guidance + immediate, honest handoff + the one minimal follow-up
 * question — never a diagnosis, never a program change. See the
 * COACH-ONLY DECISIONS / pain-injury flow requirements this implements. */
export function painSafetyReplyText(coachName: string): string {
  return `Stop that movement for now, and don't push through pain that's getting worse. I've sent this to ${coachName} so they can take a look — I can't diagnose it or change your program myself. Can you tell me roughly where it hurts and what it feels like (sharp, dull, tight)?`;
}

export function programChangeAckReplyText(coachName: string): string {
  return `I can't make that change myself — exercise substitutions and program changes go through ${coachName}. I've sent them your request. Is there anything else about it they should know?`;
}

/** Gate 3B — the nutrition-specific counterpart to programChangeAckReplyText,
 * used when a meal substitution or deviation raised from Nutrition (see
 * components/meals/meal-selection-sheet.tsx) doesn't match a registered
 * lib/nutrition/substitution.ts bounded rule closely enough to answer
 * automatically. Never claims OPTIM approved anything itself. */
export function nutritionChangeAckReplyText(coachName: string): string {
  return `I can't approve that on my own — anything outside an already-validated swap goes through ${coachName}. I've sent them your request. Is there anything else about it they should know?`;
}

export function unsupportedHandoffReplyText(coachName: string): string {
  return `I've sent this to ${coachName} so they can take a look.`;
}

/** Gate 2C — the one-line system confirmation shown after a client
 * deliberately taps "Talk to {coach}," distinct from every other handoff
 * copy in this file: those describe OPTIM routing something IT classified;
 * this describes the client's own explicit choice, so the wording says
 * "you asked" rather than "I've sent this." Never claims the coach has
 * already replied — see ChatHandoffState's "pending_coach_review". */
export function talkToCoachRequestedSystemText(coachName: string): string {
  return `You asked to talk to ${coachName} directly — sent, awaiting a reply.`;
}

/** Gate 2C human-QA correction — once the request talkToCoachRequestedSystemText
 * described has actually been resolved, "awaiting a reply" is stale: the
 * reply is right there in the transcript below it. See
 * components/chat/message-bubble.tsx, which chooses between this and
 * talkToCoachRequestedSystemText live from the linked ReviewRequest's own
 * `resolved` field — never by editing the stored message. */
export function talkToCoachRepliedSystemText(coachName: string): string {
  return `You asked to talk to ${coachName} directly — ${coachName} replied.`;
}

export function scheduleUpdateConfirmationText(
  coachName: string,
  result: { kind: "scheduled"; timeLabel: string } | { kind: "rest_day" } | { kind: "unsure" }
): string {
  const detail =
    result.kind === "scheduled"
      ? `Training moved to ${result.timeLabel}.`
      : result.kind === "rest_day"
        ? "Today is now set as a rest day."
        : "Noted — you're not sure yet, so today's plan stays flexible.";
  return `${detail} ${coachName} can see this update.`;
}
