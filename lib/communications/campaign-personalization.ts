// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// Pure Adaptive Campaign personalization — deliberately split out of
// lib/production/campaigns.ts (which is "server-only" and needs a real
// Next.js request to even import, via getSupabaseServerClient's
// next/headers dependency) so this one deterministic, framework-independent
// function can be exercised directly by lib/ai/verify-chat-intelligence.mts
// and scripts/e2e-chat-intelligence.mts without dragging in Supabase or
// Next at all. lib/production/campaigns.ts imports and re-exports this —
// there is exactly one implementation, never a duplicate.

/** The recipient-specific facts a draft may reference. Every one is read
 * from that recipient's OWN records — never another client's, and never a
 * fabricated placeholder: a client with no goal on file renders the honest
 * fallback rather than an invented goal. */
export interface RecipientContext {
  displayName: string;
  goal: string | null;
  programName: string | null;
  programWeekLabel: string | null;
  nextStep: string | null;
}

const TOKEN_FALLBACKS: Record<keyof RecipientContext, string> = {
  displayName: "there",
  goal: "your current goal",
  programName: "your program",
  programWeekLabel: "your current block",
  nextStep: "your next session",
};

/** Deterministic, total interpolation of {{name}} / {{goal}} / {{program}} /
 * {{week}} / {{next}}. An unknown token is left untouched rather than
 * silently deleted, so a typo in a coach's template is visible in the
 * preview instead of producing a quietly wrong message. */
export function buildPersonalizedBody(template: string, context: RecipientContext): string {
  const values: Record<string, string> = {
    name: context.displayName || TOKEN_FALLBACKS.displayName,
    goal: context.goal ?? TOKEN_FALLBACKS.goal,
    program: context.programName ?? TOKEN_FALLBACKS.programName,
    week: context.programWeekLabel ?? TOKEN_FALLBACKS.programWeekLabel,
    next: context.nextStep ?? TOKEN_FALLBACKS.nextStep,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (whole, token: string) => values[token] ?? whole);
}
