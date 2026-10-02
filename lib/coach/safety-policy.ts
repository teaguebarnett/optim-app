// Gate 3.1 — OPTIM's safety minimums, stated once.
//
// These sentences DESCRIBE behavior that already exists in production — they
// don't create it:
//   - live workout pain gate: lib/workout/pain-policy.ts (every report
//     interrupts progression and shows caution) + lib/production/
//     pain-safety.ts (a persisted health-safety escalation to the coach);
//   - possible injury: escalation + generation blocked while a health review
//     is open (lib/coach/generation-prerequisites.ts);
//   - chat never executes plan/nutrition/schedule changes
//     (lib/ai/pipeline.ts rule 1);
//   - serious mental-health / eating / adherence concerns escalate, and OPTIM
//     never diagnoses or implies messaging replaces professional care
//     (lib/ai/context.ts system prompt);
//   - pain/injury and emotional-distress messages always reach the coach
//     (below — enforced deterministically by lib/ai/communication-authority.ts).
// A coach can add stricter rules; nothing a coach answers can weaken these.

export const SAFETY_MINIMUM_STATEMENTS: string[] = [
  "Any pain reported during a workout stops progression on the spot, shows the client caution, and is escalated to you.",
  "Possible injuries are escalated to you, and OPTIM won't build a new program while a health review is open.",
  "OPTIM never changes a client's program, nutrition or schedule from chat — only your approval does.",
  "Pain, injury and emotional-distress messages always come to you.",
  "Serious mental-health, eating or adherence concerns are escalated to you.",
  "OPTIM never diagnoses, and never suggests that messaging you replaces medical or professional care.",
];

/** "Always respond personally" topics that are an OPTIM minimum for every
 * coach (Gate 3.1 decision D3 — stricter than before, never looser). */
export const POLICY_LOCKED_PERSONAL_TOPICS = ["pain_or_injury_report", "emotional_distress"] as const;

/** The coach's own topics plus OPTIM's locked minimum. */
export function effectiveMustRespondPersonally(coachTopics: readonly string[]): string[] {
  return [...new Set<string>([...POLICY_LOCKED_PERSONAL_TOPICS, ...coachTopics])];
}
