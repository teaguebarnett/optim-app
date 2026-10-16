// The coach program review's NEEDS YOU / HANDLED grouping (lib/coach/unified-review-tasks.ts) — pure, no DOM, no DB.
// The safety property: every approval blocker the server reports is represented as something the coach must do —
// the grouping never hides one, and never shows the review as clear while a blocker remains.
//
//   node --experimental-strip-types lib/coach/verify-unified-review-tasks.mts

import assert from "node:assert/strict";
import { handledItems, optionRole, reviewTasks } from "./unified-review-tasks.ts";
import type { UnifiedReviewView } from "../production/unified-review.ts";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}\n        ${(err as Error).message}`);
    failed++;
  }
}

const LIMIT = "Keep them with an effort limit (stay well short of failure)";
const EXCLUDE = "Exclude them for this client";
const ans = (answer: string, extra: Record<string, unknown> = {}) => ({ answer, question: "q", decidedBy: "c", decidedAtIso: "2026-10-16T00:00:00.000Z", ...extra });
const decision = (key: string, about: string, exercises: string[], answer: ReturnType<typeof ans> | null = null, options = ["Keep them as prescribed", LIMIT, EXCLUDE]) => ({ key, about, source: "resistance", question: `Question about ${exercises.join(", ")}?`, options, recommended: null, why: "why", exercises, excludeOption: EXCLUDE, effortLimitOption: LIMIT, origin: "revalidation", answer });

// The real client's state after the restriction-review fix: the pushdown limited (applied), four groups open.
function realView(over: Partial<UnifiedReviewView> = {}): UnifiedReviewView {
  return {
    decisions: [
      decision("pushdown", "documented_limitation_exercise_review", ["Cable Triceps Pushdown"], ans("Keep them with an effort limit (e.g. stay well short of failure)", { limitsEffort: ["Cable Triceps Pushdown"] }), ["Keep them as prescribed", "Keep them with an effort limit (e.g. stay well short of failure)", "Exclude them for this client (exercise decision)"]),
      decision("squat", "documented_limitation_family:squat_family", ["Reverse Lunge"]),
      decision("trunk", "documented_limitation_family:direct_trunk", ["Cable Crunch"]),
      decision("effort", "documented_effort_rule:unsupported_trunk", ["Straight-Arm Cable Pulldown", "Cable Glute Kickback"]),
      decision("load", "documented_effort_rule:load_sensitive", ["Hip Thrust Machine"], null, ["Keep them at the confirmed minimums", LIMIT, EXCLUDE]),
    ],
    blockers: ["4 coach decisions still need an answer."],
    effortLimits: [{ key: "pushdown", exercises: [{ name: "Cable Triceps Pushdown", harderIn: [] }] }],
    exclusions: [],
    ...over,
  } as unknown as UnifiedReviewView;
}

/** Every blocker is accounted for by a task (the decisions line by the decide tasks, the rest by apply/problem tasks). */
function assertNothingHidden(view: UnifiedReviewView) {
  const tasks = reviewTasks(view);
  for (const b of view.blockers) {
    const m = b.match(/^(\d+) coach decisions? still needs? an answer/);
    if (m) assert.equal(tasks.filter((t) => t.kind === "decide").length, Number(m[1]), `decide tasks match "${b}"`);
    else assert.ok(tasks.some((t) => (t.kind === "problem" && t.summary === b) || (t.kind === "apply" && t.exercises.some((e) => b.startsWith(e.name)))), `blocker shown: ${b}`);
  }
  if (view.blockers.length) assert.ok(tasks.length > 0, "never clear while a blocker remains");
}

console.log("\nProgram review — NEEDS YOU / HANDLED (offline)\n");

check("1. the real client's four open groups are the four NEEDS YOU items, in plain language; the saved pushdown limit is HANDLED (with Change), not asked again", () => {
  const v = realView();
  const tasks = reviewTasks(v);
  assert.deepEqual(tasks.map((t) => t.title), ["Squat-family movement", "Direct core work", "Effort without trunk support", "Allowed only below full effort"]);
  assert.ok(tasks.every((t) => t.kind === "decide"));
  const h = handledItems(v);
  assert.equal(h.length, 1);
  assert.equal(h[0].title, "Limited Cable Triceps Pushdown");
  assert.equal(h[0].changeKey, "pushdown");
  assertNothingHidden(v);
});

check("2. Keep / Limit effort / Exclude map to the decision's exact stored options (the answer saved is always the option text)", () => {
  const d = realView().decisions[4];
  assert.deepEqual(d.options.map((o) => optionRole(d, o)), ["keep", "limit", "exclude"]);
  const program = { ...d, exercises: undefined };
  assert.ok(program.options.every((o) => optionRole(program as never, o) === "other"), "program decisions keep their own wording");
});

check("3. an answered limit / exclusion not yet applied is an APPLY step that comes before open questions, and its blocker isn't duplicated", () => {
  const v = realView({
    decisions: realView().decisions.map((d) => (d.key === "effort" ? { ...d, answer: ans(LIMIT, { limitsEffort: d.exercises }) } : d.key === "squat" ? { ...d, answer: ans(EXCLUDE, { excludes: d.exercises }) } : d)) as never,
    effortLimits: [...realView().effortLimits, { key: "effort", exercises: [{ name: "Straight-Arm Cable Pulldown", harderIn: ["week 1 Tuesday", "week 2 Tuesday"] }, { name: "Cable Glute Kickback", harderIn: ["week 1 Saturday"] }] }],
    exclusions: [{ key: "squat", question: "q", decidedAtIso: "x", exercises: [{ name: "Reverse Lunge", presentIn: ["week 1 Saturday"] }] }],
    blockers: ["Straight-Arm Cable Pulldown is limited by your decision to stay well short of failure (3+ reps in reserve) but is prescribed harder (week 1 Tuesday, week 2 Tuesday) — apply the effort limit, or change your decision.", "Cable Glute Kickback is limited by your decision to stay well short of failure (3+ reps in reserve) but is prescribed harder (week 1 Saturday) — apply the effort limit, or change your decision.", "Reverse Lunge is excluded by your decision but is still in the program (week 1 Saturday) — remove or replace it, or change your decision.", "2 coach decisions still need an answer."],
  });
  const tasks = reviewTasks(v);
  assert.deepEqual(tasks.map((t) => t.kind), ["apply", "apply", "decide", "decide"]);
  assert.equal(tasks[0].title, "Apply your effort limit to 2 exercises");
  assert.equal(tasks[1].title, "Remove Reverse Lunge");
  assert.ok(!tasks.some((t) => t.kind === "problem"), "the limit / exclusion blockers are the apply steps, not repeated");
  assert.ok(!handledItems(v).some((h) => h.id.endsWith(":effort") || h.id.endsWith(":squat")), "not handled until applied");
  assertNothingHidden(v);
});

check("4. once applied they're HANDLED (an exclusion can be withdrawn); with no blockers there's nothing in NEEDS YOU", () => {
  const v = realView({
    decisions: [realView().decisions[0], { ...realView().decisions[4], answer: ans("Keep them at the confirmed minimums") }] as never,
    effortLimits: [...realView().effortLimits, { key: "effort", exercises: [{ name: "Straight-Arm Cable Pulldown", harderIn: [] }, { name: "Cable Glute Kickback", harderIn: [] }] }],
    exclusions: [{ key: "squat", question: "q", decidedAtIso: "x", exercises: [{ name: "Reverse Lunge", presentIn: [] }] }],
    blockers: [],
  });
  assert.deepEqual(reviewTasks(v), []);
  const h = handledItems(v);
  assert.deepEqual(h.map((x) => x.title), ["Limited Cable Triceps Pushdown", "Limited 2 exercises", "Excluded Reverse Lunge", "Allowed only below full effort"]);
  assert.equal(h.find((x) => x.title === "Excluded Reverse Lunge")!.withdrawKey, "squat");
});

check("5. any other blocker (an edit past a conditional fit, a stale proposal) is a FIX item, first, with its full text — never hidden", () => {
  const v = realView({
    blockers: ["The client's planning facts or confirmed restrictions changed since this proposal was prepared — prepare a new one.", "Hip Thrust Machine fits the confirmed restrictions only at 6+ reps and 2+ reps in reserve, but is prescribed harder (week 7 Wednesday).", "4 coach decisions still need an answer."],
  });
  const tasks = reviewTasks(v);
  assert.deepEqual(tasks.slice(0, 2).map((t) => t.title), ["This proposal is out of date", "Hip Thrust Machine is prescribed too hard"]);
  assert.ok(tasks.slice(0, 2).every((t) => t.kind === "problem" && v.blockers.includes(t.summary)));
  assertNothingHidden(v);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
