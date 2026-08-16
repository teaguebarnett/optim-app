// Coach-guidance card aggregation. Surfaces only real, already-existing
// evidence: coach-sent ChatMessage records and coach-authored Corrections.
// Never a hardcoded note, never content whose authorship isn't explicit.

import type { Correction } from "../history/types";
import type { ChatMessage } from "../types";
import type { CoachGuidanceCardModel } from "./types";

export function aggregateCoachGuidance(
  chatMessages: ChatMessage[],
  corrections: Correction[],
  coachDisplayName: string
): CoachGuidanceCardModel {
  const coachMessages = chatMessages
    .filter((m) => m.sender === "coach")
    .slice()
    .sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1));
  const latest = coachMessages[0] ?? null;

  const coachCorrections = corrections
    .filter((c) => c.authorship.authorKind === "coach")
    .slice()
    .sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1))
    .slice(0, 5)
    .map((c) => ({
      dateIso: c.effectiveDateIso,
      fieldPath: c.fieldPath,
      reason: c.reason ?? null,
      authorName: coachDisplayName,
      authorKind: c.authorship.authorKind,
    }));

  return {
    hasNewGuidance: !!latest || coachCorrections.length > 0,
    latestMessage: latest ? { text: latest.text, authorName: coachDisplayName, createdAtIso: latest.createdAtIso } : null,
    recentCorrections: coachCorrections,
  };
}
