// Gate 4.0C-2A (internal QA) — a compact summary of a LEGACY generated
// proposal, to compare against the new resistance planner's proposal for
// the same client. Read-only; reports the facts the dogfood failures were
// about (training days, repeated exercises, cloned weeks).

import type { UniversalTrainingProgramContent } from "../training/types.ts";

export interface LegacyProposalSummary {
  directionLabel: string;
  trainingDaysPerWeek: number;
  weeks: number;
  week1: Array<{ day: string; sessions: Array<{ name: string; exercises: string[] }> }>;
  /** Exercise name → number of week-1 sessions it appears in (only those > 1). */
  repeatedInWeek1: Array<{ name: string; sessions: number }>;
  /** True when every week has the same exercise layout as week 1. */
  weeksShareLayout: boolean;
}

export function summarizeLegacyProposal(content: UniversalTrainingProgramContent): LegacyProposalSummary {
  const layout = (w: UniversalTrainingProgramContent["weeks"][number]) =>
    JSON.stringify(w.days.map((d) => (d.sessions ?? []).map((s) => s.blocks.flatMap((b) => b.items.map((i) => i.name)))));
  const first = content.weeks[0];
  const week1 = (first?.days ?? [])
    .filter((d) => d.type === "training")
    .map((d) => ({ day: d.dayOfWeek, sessions: (d.sessions ?? []).map((s) => ({ name: s.name, exercises: s.blocks.flatMap((b) => b.items.map((i) => i.name)) })) }));
  const counts = new Map<string, number>();
  for (const d of week1) for (const s of d.sessions) for (const n of new Set(s.exercises)) counts.set(n, (counts.get(n) ?? 0) + 1);
  return {
    directionLabel: (content as { directionLabel?: string }).directionLabel ?? "—",
    trainingDaysPerWeek: week1.length,
    weeks: content.weeks.length,
    week1,
    repeatedInWeek1: [...counts.entries()].filter(([, n]) => n > 1).map(([name, sessions]) => ({ name, sessions })),
    weeksShareLayout: content.weeks.length > 1 && content.weeks.every((w) => layout(w) === layout(first)),
  };
}
