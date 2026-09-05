// Small, pure UI-decision helpers factored out of the Chat composer/page so
// they're independently testable without a DOM — see lib/chat/verify-chat.mts.

/** Enter sends on desktop; Shift+Enter inserts a newline. Composed as a pure
 * predicate over just the two relevant key-event fields so the actual
 * keydown handler (components/chat/chat-composer.tsx) stays a one-line call
 * into this. */
export function isSendKeystroke(event: { key: string; shiftKey: boolean }): boolean {
  return event.key === "Enter" && !event.shiftKey;
}

/** Guards against a duplicate send from rapid double-taps/double-Enters —
 * the same trimmed text submitted again within `windowMs` of the last real
 * send is suppressed. A different message (even sent quickly) is always
 * allowed through; only an exact repeat within the window is blocked. */
export function shouldSuppressDuplicateSend(
  lastSent: { text: string; atMs: number } | null,
  candidateText: string,
  nowMs: number,
  windowMs = 800
): boolean {
  if (!lastSent) return false;
  return lastSent.text === candidateText && nowMs - lastSent.atMs < windowMs;
}

/** Whether the viewport is close enough to the bottom of the page that a new
 * message should auto-scroll into view — never yanks a client back down who
 * has deliberately scrolled up to read older messages. `threshold` is in
 * pixels. */
export function isNearBottom(scrollY: number, viewportHeight: number, scrollHeight: number, threshold = 120): boolean {
  return scrollHeight - (scrollY + viewportHeight) <= threshold;
}

/**
 * Picks which suggestion chips to show: recently-used ones are held back so
 * the exact same suggestion never immediately reappears after being tapped,
 * but the full set resets once every suggestion has been used at least once
 * (never leaving the client with an empty carousel). `usedIds` is expected
 * to be at most `all.length` entries — anything beyond that is treated as
 * "everything's been used" and reset.
 */
export function visibleSuggestionIds(all: string[], usedIds: readonly string[]): string[] {
  const used = new Set(usedIds);
  if (used.size >= all.length) return all;
  return all.filter((id) => !used.has(id));
}
