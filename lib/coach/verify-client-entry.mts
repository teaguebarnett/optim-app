// Gate 4.0B — real client entry: an accepted invitation leads into
// onboarding (never the daily app's "setup in progress"), state comes only
// from real records, resume lands where the client left off, and the
// client is never asked for their email again. Pure.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientOnboardingRedirect, resolveHomeRoute } from "./routing.ts";
import { deriveLifecycle } from "./roster.ts";
import { ONBOARDING_STEPS, findVisibleMomentIndex, momentsForStep, resumeMomentIndex } from "./onboarding-steps.ts";
import { resolvePostSignInDestination } from "../auth/post-sign-in.ts";
import type { ClientLifecycleStatus } from "./types";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}

const ID = "client-123";
const step = (id: string) => ONBOARDING_STEPS.find((s) => s.id === id)!;

console.log("\n1. State comes from real records — missing data never means complete\n");

check("accepted, nothing started (no onboarding row) → invited, not complete", () => {
  assert.equal(deriveLifecycle({ enrollmentStatus: "invited", onboardingExists: false, onboardingCompletedAtIso: null }), "invited");
  assert.equal(deriveLifecycle({ enrollmentStatus: null, onboardingExists: false, onboardingCompletedAtIso: null }), "invited");
});

check("started, not finished → onboarding", () => {
  assert.equal(deriveLifecycle({ enrollmentStatus: "invited", onboardingExists: true, onboardingCompletedAtIso: null }), "onboarding");
});

check("finished only with an explicit completion → coach_setup", () => {
  assert.equal(deriveLifecycle({ enrollmentStatus: "invited", onboardingExists: true, onboardingCompletedAtIso: "2026-10-02T10:00:00Z" }), "coach_setup");
});

console.log("\n2. Routing: unfinished onboarding always goes to onboarding\n");

check("invited / onboarding → the onboarding route", () => {
  assert.equal(clientOnboardingRedirect("invited", ID), `/onboarding/${ID}`);
  assert.equal(clientOnboardingRedirect("onboarding", ID), `/onboarding/${ID}`);
});

check("finished or later states stay put (onboarding never restarts)", () => {
  for (const l of ["coach_setup", "active", "paused", "completed"] as ClientLifecycleStatus[]) assert.equal(clientOnboardingRedirect(l, ID), null, l);
  assert.equal(resolveHomeRoute("client", "coach_setup", ID), `/setup-status/${ID}`);
  assert.equal(resolveHomeRoute("client", "active", ID), "/today");
});

check("sign-in still sends a client to the client app (which then routes by state); coach/admin areas stay closed", () => {
  const client = { isPlatformStaff: false, isWorkspaceStaff: false, isClient: true };
  assert.equal(resolvePostSignInDestination(null, client), "/today");
  assert.equal(resolvePostSignInDestination("/coach", client), "/today");
  assert.equal(resolvePostSignInDestination("/admin", client), "/today");
  // Sign-in itself is unchanged: the client app's layout routes by state.
  assert.equal(resolvePostSignInDestination(`/onboarding/${ID}`, client), "/today");
});

console.log("\n3. Resume lands on the right screen\n");

check("nothing answered → the chapter's first screen", () => {
  assert.equal(resumeMomentIndex(step("about_you"), {}), 0);
});

check("first screens answered → the first screen not yet answered (optional screens are never skipped)", () => {
  const s = step("your_week");
  const moments = momentsForStep(s);
  assert.ok(moments.length > 2);
  // Answer every required field in the first moment only.
  const firstKeys = new Set(moments[0]);
  const answers: Record<string, unknown> = {};
  for (const f of s.fields.filter((x) => firstKeys.has(x.key))) answers[f.key] = f.type === "multi_select" || f.type === "day_selector" ? [f.options?.[0]?.value ?? "monday"] : (f.options?.[0]?.value ?? 1);
  const at = resumeMomentIndex(s, answers as never);
  assert.equal(at, 1, `resumed at ${at}`);
  const goals = step("what_you_want");
  const gm = momentsForStep(goals);
  const firstOnly: Record<string, unknown> = {};
  for (const f of goals.fields.filter((x) => gm[0].includes(x.key))) firstOnly[f.key] = f.type === "multi_select" ? [f.options?.[0]?.value] : f.options?.[0]?.value;
  assert.equal(resumeMomentIndex(goals, firstOnly as never), 1, "an optional second screen isn't skipped");
});

check("a fully answered chapter resumes on its last screen (confirm and move on)", () => {
  const s = step("what_you_want");
  const answers: Record<string, unknown> = {};
  for (const f of s.fields) answers[f.key] = f.type === "multi_select" ? [f.options?.[0]?.value] : (f.options?.[0]?.value ?? "x");
  const at = resumeMomentIndex(s, answers as never);
  // The last VISIBLE screen: a trailing conditional moment (Gate 4.0C-4's optional
  // lift target, shown only for a strength goal) is skipped when it doesn't apply.
  assert.equal(at, findVisibleMomentIndex(s, answers as never, momentsForStep(s).length - 1, -1));
  assert.ok(at >= momentsForStep(s).length - 3);
});

console.log("\n4. Identity and tone\n");

check("onboarding never asks for an email (the invitation already established it)", () => {
  for (const s of ONBOARDING_STEPS) for (const f of s.fields) assert.ok(!/email/i.test(`${f.key} ${f.label}`), `${s.id}.${f.key}`);
});

check("client entry copy avoids reassurance and hype", () => {
  const banned = /don.t worry|it.s (okay|ok) (if|to)|not judging|no judg|you.ve got this|let.s crush|beast mode/i;
  const text = [
    readFileSync(new URL("../../components/onboarding/onboarding-welcome.tsx", import.meta.url), "utf8"),
    ...ONBOARDING_STEPS.map((s) => `${s.title} ${s.description}`),
  ].join("\n");
  assert.ok(!banned.test(text), (text.match(banned) ?? [])[0]);
});

check("the welcome names the real coach (never a hardcoded person) with a 'your coach' fallback", () => {
  const src = readFileSync(new URL("../../components/onboarding/onboarding-welcome.tsx", import.meta.url), "utf8");
  assert.ok(/coachName/.test(src) && /Your coach/.test(src));
  assert.ok(!/Teague|Tristan/.test(src));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
