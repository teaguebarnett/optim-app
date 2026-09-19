// Coach-guidance card aggregation. Surfaces only real, already-existing
// evidence: coach-sent ChatMessage records and coach-authored Corrections.
// Never a hardcoded note, never content whose authorship isn't explicit.

import type { Correction } from "../history/types";
import type { ChatMessage } from "../types";
import type { CoachGuidanceCardModel } from "./types";

/** Gate 3D — a message counts as coach guidance when it's either directly
 * coach-authored (sender === "coach") or an assistant message relaying a
 * coach's own real, resolved decision (relayedCoachDecision — see
 * lib/coach/review-lifecycle.ts's resolveReviewRequest, the exact mechanism
 * a coach's Gate 3C nutrition approval/correction already resolves
 * through). An ordinary assistant reply with no relayedCoachDecision (e.g.
 * OPTIM's own acknowledgement that a request was sent) is never coach
 * guidance — this never widens to "any assistant message." No new
 * messaging/decision mechanism is introduced; this only recognizes a shape
 * that already exists. */
function isCoachAttributedMessage(m: ChatMessage): boolean {
  return m.sender === "coach" || !!m.relayedCoachDecision;
}

/** The real coach identity behind a qualifying message: a relayed
 * decision's own embedded coachDisplayName (captured at resolution time —
 * see resolveReviewRequest) when present, otherwise the generically-passed
 * assigned-coach name a direct coach message already used before this
 * change. */
function coachAttributedAuthorName(m: ChatMessage, fallbackCoachDisplayName: string): string {
  return m.relayedCoachDecision?.coachDisplayName ?? fallbackCoachDisplayName;
}

export function aggregateCoachGuidance(
  chatMessages: ChatMessage[],
  corrections: Correction[],
  coachDisplayName: string
): CoachGuidanceCardModel {
  const coachMessages = chatMessages
    .filter(isCoachAttributedMessage)
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
    latestMessage: latest ? { text: latest.text, authorName: coachAttributedAuthorName(latest, coachDisplayName), createdAtIso: latest.createdAtIso } : null,
    recentCorrections: coachCorrections,
  };
}
