// The coach's program review, organised for action: what NEEDS the coach (unanswered decisions, answered decisions
// whose change isn't applied yet, and any other approval blocker), and what's HANDLED. Pure presentation over the
// server-built review view — it decides nothing, changes nothing, and never relaxes approval: the view's `blockers`
// stay the only source of approval eligibility, and anything blocking that isn't a decision or a pending change is
// still listed (as a "problem"), so nothing that blocks approval is ever hidden.

import type { UnifiedReviewView } from "../production/unified-review.ts";

type Decision = UnifiedReviewView["decisions"][number];

export type ReviewTask =
  | { kind: "decide"; id: string; title: string; summary: string; decision: Decision }
  | { kind: "apply"; id: string; mode: "limit" | "remove"; title: string; summary: string; key: string; exercises: Array<{ name: string; sessions: number }> }
  | { kind: "problem"; id: string; title: string; summary: string };

export interface HandledItem {
  id: string;
  title: string;
  detail: string;
  /** The decision to re-open ("Change"), when it's still part of this review. */
  changeKey: string | null;
  /** An exclusion the coach can withdraw (re-opens its question). */
  withdrawKey: string | null;
}

/** Plain-language framing per decision kind. The decision's own full question and reason stay available verbatim. */
const FRAMING: Record<string, { title: string; summary: string }> = {
  documented_limitation_exercise_review: { title: "Named in your health notes", summary: "Your documented limitation names this exercise. It fits the confirmed restrictions, so it's in the program — keeping it is your call." },
  "documented_limitation_family:squat_family": { title: "Squat-family movement", summary: "Your notes say no squats. Lunges and split squats are single-leg squat patterns the confirmed restrictions don't cover." },
  "documented_limitation_family:direct_trunk": { title: "Direct core work", summary: "The limitation concerns the core. This works the abs directly, and no confirmed restriction covers it." },
  "documented_effort_rule:unsupported_trunk": { title: "Effort without trunk support", summary: "Your notes allow movements that need core stability only at low RPE. These are done standing or kneeling without trunk support, and nothing limits their effort yet." },
  "documented_effort_rule:load_sensitive": { title: "Allowed only below full effort", summary: "These fit your bracing limits only while kept submaximal (6+ reps, 2+ reps in reserve, trunk on the pad). Decide whether that's enough." },
  exercise_fit_uncertain: { title: "Restriction fit unconfirmed", summary: "OPTIM can't confirm these fit the confirmed restrictions." },
};
/** Short titles for program-level decisions; their question (specific numbers included) is the summary. */
const TITLES: Record<string, string> = {
  nutrition_training_basis: "Nutrition vs. the edited training",
  nutrition_training_days: "Nutrition training days",
  second_visit: "Second gym visit in a day",
  no_rest_day: "No rest day",
  cardio_clearance: "Cardio clearance",
  confirm_structured_limitations: "Restrictions don't match the health review",
  approved_program_conflicts: "Approved program conflicts with restrictions",
  pending_draft_conflicts: "Earlier draft conflicts with restrictions",
  resistance_unavailable: "Lifting couldn't be planned",
};

const firstSentence = (s: string) => (s.match(/^[^.?!]*[.?!]/)?.[0] ?? s).trim();

export function decisionFraming(d: Decision): { title: string; summary: string } {
  const f = FRAMING[d.about];
  if (f) return f;
  return { title: TITLES[d.about] ?? firstSentence(d.question).replace(/[.?!]$/, ""), summary: TITLES[d.about] ? d.question : d.why };
}

/** Which option is which, for exercise decisions (the stored answer is always the option's exact text). */
export function optionRole(d: Decision, option: string): "keep" | "limit" | "exclude" | "other" {
  if (!d.exercises?.length) return "other";
  if (option === d.excludeOption) return "exclude";
  if (option === d.effortLimitOption) return "limit";
  return option === d.options[0] ? "keep" : "other";
}

const DECISIONS_LINE = /coach decisions? still needs? an answer/;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A short name for a blocker; the blocker's full text is always shown with it. */
function problemTitle(b: string): string {
  const m = b.match(/^(.+?) fits the confirmed restrictions only/) ?? b.match(/^(.+?) is prescribed/);
  if (m) return `${m[1]} is prescribed too hard`;
  const c = b.match(/^(.+?) conflicts with the confirmed restrictions/);
  if (c) return `${c[1]} conflicts with a restriction`;
  if (/changed since this proposal was prepared|isn't the one this proposal was built around/.test(b)) return "This proposal is out of date";
  const first = firstSentence(b).replace(/[.]$/, "");
  return first.length <= 70 ? first : `${first.slice(0, first.lastIndexOf(" ", 67))}…`;
}

export function reviewTasks(view: UnifiedReviewView): ReviewTask[] {
  const tasks: ReviewTask[] = [];
  for (const d of view.decisions.filter((x) => !x.answer)) tasks.push({ kind: "decide", id: `decide:${d.key}`, ...decisionFraming(d), decision: d });

  const covered = new Set<string>();
  for (const x of view.effortLimits) {
    const pending = x.exercises.filter((e) => e.harderIn.length);
    if (!pending.length) continue;
    pending.forEach((e) => covered.add(`${e.name} is limited by your decision`));
    tasks.push({ kind: "apply", id: `limit:${x.key}`, mode: "limit", key: x.key, title: pending.length === 1 ? `Apply your effort limit to ${pending[0].name}` : `Apply your effort limit to ${plural(pending.length, "exercise")}`, summary: `You chose to keep ${pending.length === 1 ? "it" : "these"} with an effort limit. Applying caps ${pending.length === 1 ? "it" : "each one"} at RPE 7 (3+ reps in reserve) in every week.`, exercises: pending.map((e) => ({ name: e.name, sessions: e.harderIn.length })) });
  }
  for (const x of view.exclusions) {
    const pending = x.exercises.filter((e) => e.presentIn.length);
    if (!pending.length) continue;
    pending.forEach((e) => covered.add(`${e.name} is excluded by your decision`));
    tasks.push({ kind: "apply", id: `remove:${x.key}`, mode: "remove", key: x.key, title: pending.length === 1 ? `Remove ${pending[0].name}` : `Remove ${plural(pending.length, "excluded exercise")}`, summary: `You chose to exclude ${pending.length === 1 ? "it" : "these"}. Removing takes ${pending.length === 1 ? "it" : "them"} out of every week of the program.`, exercises: pending.map((e) => ({ name: e.name, sessions: e.presentIn.length })) });
  }

  // Every other approval blocker stays visible, verbatim.
  view.blockers
    .filter((b) => !DECISIONS_LINE.test(b) && ![...covered].some((c) => b.startsWith(c)))
    .forEach((b, i) => tasks.push({ kind: "problem", id: `problem:${i}`, title: problemTitle(b), summary: b }));
  // Problems first, then changes the coach already decided (the immediate next step), then open questions.
  const rank = { problem: 0, apply: 1, decide: 2 } as const;
  return tasks.map((t, i) => ({ t, i })).sort((a, b) => rank[a.t.kind] - rank[b.t.kind] || a.i - b.i).map((x) => x.t);
}

export function handledItems(view: UnifiedReviewView): HandledItem[] {
  const out: HandledItem[] = [];
  const seen = new Set<string>();
  for (const x of view.effortLimits) {
    if (x.exercises.some((e) => e.harderIn.length)) continue;
    seen.add(x.key);
    const live = view.decisions.some((d) => d.key === x.key);
    out.push({ id: `limit:${x.key}`, title: `Limited ${x.exercises.length === 1 ? x.exercises[0].name : plural(x.exercises.length, "exercise")}`, detail: `${x.exercises.length === 1 ? "" : `${x.exercises.map((e) => e.name).join(", ")} — `}RPE 7 or easier (3+ reps in reserve) in every week.`, changeKey: live ? x.key : null, withdrawKey: null });
  }
  for (const x of view.exclusions) {
    if (x.exercises.some((e) => e.presentIn.length)) continue;
    seen.add(x.key);
    out.push({ id: `exclude:${x.key}`, title: `Excluded ${x.exercises.length === 1 ? x.exercises[0].name : plural(x.exercises.length, "exercise")}`, detail: `${x.exercises.length === 1 ? "" : `${x.exercises.map((e) => e.name).join(", ")} — `}removed from every week.`, changeKey: null, withdrawKey: x.key });
  }
  for (const d of view.decisions) {
    if (!d.answer || seen.has(d.key)) continue;
    // A limit/exclusion still being applied is a task, not handled.
    if (view.effortLimits.some((x) => x.key === d.key) || view.exclusions.some((x) => x.key === d.key)) continue;
    out.push({ id: `answer:${d.key}`, title: decisionFraming(d).title, detail: `${d.exercises?.length ? `${d.exercises.join(", ")} — ` : ""}${d.answer.answer}`, changeKey: d.key, withdrawKey: null });
  }
  return out;
}
