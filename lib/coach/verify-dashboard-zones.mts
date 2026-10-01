// Gate 2 — Coach dashboard launch pass: deterministic fixtures for every
// dashboard state the gate requires, run straight against the pure
// buildCoachDashboard (lib/coach/dashboard-zones.ts). The same fixtures
// drive the visual preview at /dev/coach-dashboard (lib/coach/dashboard-fixtures.ts).

import assert from "node:assert/strict";
import { buildCoachDashboard, relativeTime, formatPlainDate, HANDLED_WINDOW_DAYS } from "./dashboard-zones.ts";
import { DASHBOARD_FIXTURES, FIXTURE_NOW_ISO, fixtureInput, rosterClient, escalation } from "./dashboard-fixtures.ts";

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

const kinds = (items: { kind: string }[]) => items.map((i) => i.kind);

console.log("\n1. Completely quiet dashboard\n");

check("no clients, method confirmed: all zones empty and the briefing reassures", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.quiet.input);
  assert.equal(d.needsYou.length, 0);
  assert.equal(d.worthKnowing.length, 0);
  assert.equal(d.handled.length, 0);
  assert.equal(d.briefing.tone, "calm");
  assert.equal(d.briefing.headline, "Everything’s under control.");
  assert.equal(d.briefing.detail, "Nothing needs your attention right now.");
});

check("quiet with active, on-track clients: roster line says so, HANDLED stays empty (on-track is not handled work)", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.quietWithClients.input);
  assert.equal(d.needsYou.length, 0);
  assert.equal(d.handled.length, 0);
  assert.equal(d.rosterLine, "2 clients · 2 active, all on track");
  assert.equal(d.briefing.headline, "Everything’s under control.");
});

console.log("\n2. Invited / setup clients\n");

check("invited and onboarding clients are WORTH KNOWING, never NEEDS YOU, and say no action is needed", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.invitedAndSetup.input);
  const waiting = d.worthKnowing.filter((i) => i.kind === "invited" || i.kind === "onboarding");
  assert.equal(waiting.length, 2);
  assert.ok(waiting.every((i) => !i.actionRequired && /No action needed/.test(i.context ?? "")));
  assert.ok(!d.needsYou.some((i) => i.kind === "invited" || i.kind === "onboarding"));
});

check("a client who finished onboarding lands in NEEDS YOU with exactly what setup is missing", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.invitedAndSetup.input);
  const setup = d.needsYou.find((i) => i.kind === "client_setup");
  assert.ok(setup);
  assert.equal(setup.client?.name, "Priya Shah");
  assert.equal(setup.action?.label, "Finish client setup");
  assert.equal(setup.action?.href, "/coach/clients/c-priya");
  assert.deepEqual(setup.evidence, ["Still needed: an approved program, nutrition targets, a start date, and their time zone."]);
});

check("all four activation facts present → 'Ready to activate', mirroring the client page's own gate", () => {
  const input = fixtureInput({
    roster: [rosterClient({ clientId: "c-ready", name: "Ready Client", lifecycle: "coach_setup", setup: { hasProgram: true, hasNutrition: true, hasStartDate: true, hasConfirmedTimezone: true } })],
  });
  const d = buildCoachDashboard(input);
  assert.deepEqual(kinds(d.needsYou), ["ready_to_activate"]);
  assert.equal(d.needsYou[0].action?.label, "Activate Ready");
});

check("missing only the time zone is NOT ready to activate (client page requires it too)", () => {
  const input = fixtureInput({
    roster: [rosterClient({ clientId: "c-tz", name: "Tz Client", lifecycle: "coach_setup", setup: { hasProgram: true, hasNutrition: true, hasStartDate: true, hasConfirmedTimezone: false } })],
  });
  const d = buildCoachDashboard(input);
  assert.deepEqual(kinds(d.needsYou), ["client_setup"]);
  assert.deepEqual(d.needsYou[0].evidence, ["Still needed: their time zone."]);
});

check("more than three waiting clients collapse into one grouped line", () => {
  const roster = ["A", "B", "C", "D"].map((n, i) => rosterClient({ clientId: `c-${n}`, name: `${n}lex Person`, lifecycle: i < 3 ? "invited" : "onboarding" }));
  const d = buildCoachDashboard(fixtureInput({ roster }));
  assert.deepEqual(kinds(d.worthKnowing), ["waiting_group"]);
  assert.equal(d.worthKnowing[0].title, "Four clients are still onboarding");
});

console.log("\n3. First-program approval needed\n");

check("a verified first-program draft is NEEDS YOU with a direct route to the real review", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.firstProgram.input);
  const item = d.needsYou.find((i) => i.kind === "first_program");
  assert.ok(item);
  assert.equal(item.title, "First program ready for your approval");
  assert.equal(item.action?.label, "Review first program");
  assert.equal(item.action?.href, "/coach/clients/c-priya#proposal-review");
  assert.deepEqual(item.evidence, ["Strength Foundations · 8 weeks"]);
  assert.match(item.preparation ?? "", /Nothing reaches Priya until you approve it/);
});

check("the same client never gets both 'approve program' and 'finish setup'", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.firstProgram.input);
  assert.equal(d.needsYou.filter((i) => i.client?.id === "c-priya").length, 1);
});

check("an unverified draft says it can't be approved instead of offering approval", () => {
  const base = DASHBOARD_FIXTURES.firstProgram.input;
  const d = buildCoachDashboard({ ...base, programDrafts: base.programDrafts.map((p) => ({ ...p, verifiedInputs: false })) });
  const item = d.needsYou.find((i) => i.kind === "first_program");
  assert.equal(item?.title, "First program draft needs regenerating");
  assert.equal(item?.action?.label, "Review draft");
  assert.equal(item?.preparation, null);
});

check("only the newest draft per client counts (mirrors getPendingProgramProposal)", () => {
  const base = DASHBOARD_FIXTURES.firstProgram.input;
  const older = { ...base.programDrafts[0], versionId: "v-old", title: "Old Draft", createdAtIso: "2026-09-20T10:00:00.000Z" };
  const d = buildCoachDashboard({ ...base, programDrafts: [older, ...base.programDrafts] });
  const items = d.needsYou.filter((i) => i.kind === "first_program");
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].evidence, ["Strength Foundations · 8 weeks"]);
});

console.log("\n4. Escalation requiring the coach\n");

check("a chat escalation is NEEDS YOU with the client's words as evidence and OPTIM's draft as preparation", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.escalation.input);
  const item = d.needsYou[0];
  assert.equal(item.kind, "escalation");
  assert.equal(item.title, "Asked to change their plan");
  assert.match(item.context ?? "", /Plan changes are yours to make/);
  assert.equal(item.evidence[0], "“Can I swap Thursday's session for a long run? My race got moved up.”");
  assert.match(item.preparation ?? "", /A reply is drafted for you/);
  assert.equal(item.action?.label, "Respond to Marcus");
  assert.equal(item.attentionItemId, "esc-plan");
});

check("pain/safety always sorts first and is urgent, ahead of an adjustment and a plan change", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.mixed.input);
  assert.equal(d.needsYou[0].kind, "escalation");
  assert.equal(d.needsYou[0].urgent, true);
  assert.equal(d.needsYou[0].action?.label, "Review pain report");
  assert.ok(d.needsYou.slice(1).every((i) => !i.urgent));
});

check("a non-chat pain report never presents its recorded summary as a sendable reply", () => {
  const input = fixtureInput({
    roster: [rosterClient({ clientId: "c-j", name: "Jo Park", lifecycle: "active", programPhase: "active_program" })],
    openAttention: [escalation({ id: "esc-pain2", clientId: "c-j", clientDisplayName: "Jo Park", reason: "pain_or_safety", sourceMessageBody: null, proposedResponse: "Reported sharp knee pain during squats (7/10).", priority: 0 })],
  });
  const item = buildCoachDashboard(input).needsYou[0];
  assert.deepEqual(item.evidence, ["Reported sharp knee pain during squats (7/10)."]);
  assert.doesNotMatch(item.preparation ?? "", /reply is drafted/);
});

console.log("\n5. Escalation waiting on the client\n");

check("a coach_responded thread whose last message is the coach's moves to WORTH KNOWING", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.waitingOnClient.input);
  assert.equal(d.needsYou.length, 0);
  const item = d.worthKnowing.find((i) => i.kind === "waiting_on_client_reply");
  assert.ok(item);
  assert.equal(item.title, "Waiting on Marcus’s reply");
  assert.equal(item.actionRequired, false);
  assert.match(item.context ?? "", /No action needed until they respond/);
  assert.equal(d.briefing.headline, "You’re caught up.");
});

check("…but once the client replies in that thread, it's back in NEEDS YOU with their reply", () => {
  const base = DASHBOARD_FIXTURES.waitingOnClient.input;
  const d = buildCoachDashboard({ ...base, coachThreads: { "esc-thread": { lastActor: "client", lastMessageAtIso: "2026-09-30T13:00:00.000Z", lastClientMessage: "Thanks — Saturday works." } } });
  assert.deepEqual(kinds(d.needsYou), ["client_replied"]);
  assert.deepEqual(d.needsYou[0].evidence, ["“Thanks — Saturday works.”"]);
  assert.equal(d.needsYou[0].action?.label, "Reply to Marcus");
});

check("a coach_responded escalation with no readable thread stays in NEEDS YOU (never hidden on missing data)", () => {
  const base = DASHBOARD_FIXTURES.waitingOnClient.input;
  const d = buildCoachDashboard({ ...base, coachThreads: {} });
  assert.equal(d.needsYou.length, 1);
});

console.log("\n6. Pending adjustment proposal\n");

check("an adjustment proposal is NEEDS YOU and routes to the existing review flow", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.adjustment.input);
  const item = d.needsYou.find((i) => i.kind === "adjustment_proposal");
  assert.ok(item);
  assert.equal(item.action?.label, "Review adjustment");
  assert.equal(item.action?.href, "/coach/clients/c-marcus#proposal-review");
  assert.equal(item.context, "Two missed Thursday sessions in a row — moving lower-body work to Saturday.");
  assert.match(item.preparation ?? "", /Nothing changes for the client until you approve it/);
});

check("a client with a pending adjustment doesn't also get a separate program-draft item", () => {
  const base = DASHBOARD_FIXTURES.adjustment.input;
  const d = buildCoachDashboard({ ...base, programDrafts: [{ versionId: "v-adj", clientId: "c-marcus", title: "x", durationWeeks: 4, createdAtIso: FIXTURE_NOW_ISO, verifiedInputs: true }] });
  assert.equal(d.needsYou.filter((i) => i.client?.id === "c-marcus").length, 1);
});

console.log("\n7. Routine question answered by OPTIM\n");

check("OPTIM's own answers in the window are HANDLED, grouped per client, with the latest question", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.handled.input);
  const item = d.handled.find((i) => i.kind === "optim_answered");
  assert.ok(item);
  assert.equal(item.title, "Answered two questions from Priya");
  assert.equal(item.context, "Answered by OPTIM without escalating. No action needed.");
  assert.deepEqual(item.evidence, ["Most recent: “Is it fine to have my protein shake after dinner instead of after training?”"]);
});

check("answers older than the rolling window are excluded", () => {
  const base = DASHBOARD_FIXTURES.handled.input;
  const old = { messageId: "m-old", clientId: "c-priya", answeredAtIso: "2026-09-20T09:00:00.000Z", question: "Old question" };
  const d = buildCoachDashboard({ ...base, optimAnswers: [old] });
  assert.equal(d.handled.filter((i) => i.kind === "optim_answered").length, 0);
  assert.equal(HANDLED_WINDOW_DAYS, 7);
});

check("the briefing mentions OPTIM's answered questions as supporting context", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.handled.input);
  assert.match(d.briefing.detail ?? "", /OPTIM answered two routine questions this week\./);
});

console.log("\n8. Recently resolved escalation\n");

check("an escalation resolved in the window is HANDLED and names who resolved it", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.handled.input);
  const item = d.handled.find((i) => i.kind === "escalation_resolved");
  assert.ok(item);
  assert.equal(item.title, "You approved OPTIM’s reply to Marcus");
  assert.match(item.context ?? "", /^Plan change · resolved 1 day ago\.$/);
});

check("an escalation resolved more than 7 days ago is not HANDLED", () => {
  const base = DASHBOARD_FIXTURES.handled.input;
  const d = buildCoachDashboard({ ...base, resolvedEscalations: base.resolvedEscalations.map((e) => ({ ...e, resolvedAtIso: "2026-09-21T08:00:00.000Z" })) });
  assert.equal(d.handled.filter((i) => i.kind === "escalation_resolved").length, 0);
});

console.log("\n9. Mixed active dashboard\n");

check("the briefing leads with the safety report, then counts what else is waiting — not raw zone totals", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.mixed.input);
  assert.equal(d.briefing.tone, "urgent");
  assert.equal(d.briefing.headline, "Jo reported pain — start there.");
  assert.equal(d.briefing.detail, `Three other items also need you after that.`);
});

check("without a safety report, the briefing names clients and the kinds of decisions waiting", () => {
  const base = DASHBOARD_FIXTURES.mixed.input;
  const d = buildCoachDashboard({ ...base, openAttention: base.openAttention.filter((i) => i.escalationReason !== "pain_or_safety") });
  assert.equal(d.briefing.tone, "attention");
  assert.equal(d.briefing.headline, "Two clients need your attention.");
  assert.equal(d.briefing.detail, "One client question to respond to, one program adjustment to review, and one program to approve. OPTIM answered two routine questions this week.");
});

check("every zone in the mixed fixture is populated and correctly separated", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.mixed.input);
  assert.ok(d.needsYou.every((i) => i.actionRequired && i.zone === "needs_you"));
  assert.ok(d.worthKnowing.every((i) => !i.actionRequired && i.zone === "worth_knowing"));
  assert.ok(d.handled.every((i) => !i.actionRequired && i.zone === "handled"));
  assert.ok(d.worthKnowing.some((i) => i.kind === "waiting_on_client_reply"));
  assert.ok(d.worthKnowing.some((i) => i.kind === "program_starting"));
});

console.log("\n10. No calibration completion\n");

check("an unconfirmed method is a NEEDS YOU item linking to the real confirmation card", () => {
  const d = buildCoachDashboard(DASHBOARD_FIXTURES.uncalibrated.input);
  assert.deepEqual(kinds(d.needsYou), ["confirm_method"]);
  assert.equal(d.needsYou[0].action?.href, "/coach/settings#coaching-method");
  assert.equal(d.briefing.headline, "One thing needs you today.");
  assert.equal(d.briefing.detail, "Confirm your coaching method so OPTIM can start building client programs.");
  assert.notEqual(d.briefing.headline, "Everything’s under control.");
});

check("with the method unconfirmed, a verified first-program draft says approval must wait (approval re-checks the method)", () => {
  const d = buildCoachDashboard({ ...DASHBOARD_FIXTURES.firstProgram.input, methodConfirmed: false });
  assert.deepEqual(d.needsYou.map((i) => i.kind), ["confirm_method", "first_program"]);
  assert.equal(d.needsYou[1].context, "Confirm your coaching method first — the draft can’t be approved until you do.");
  assert.equal(d.needsYou[1].title, "First program drafted");
});

check("an unknown method state (read failed) never claims either way", () => {
  const d = buildCoachDashboard({ ...DASHBOARD_FIXTURES.uncalibrated.input, methodConfirmed: null });
  assert.equal(d.needsYou.length, 0);
});

check("a confirmed method produces no calibration item", () => {
  const d = buildCoachDashboard({ ...DASHBOARD_FIXTURES.uncalibrated.input, methodConfirmed: true });
  assert.ok(!d.needsYou.some((i) => i.kind === "confirm_method"));
});

console.log("\n11. Boundaries and formatting\n");

check("a failed supporting read never yields 'Everything's under control'", () => {
  const d = buildCoachDashboard(fixtureInput({ unavailable: ["program drafts"] }));
  assert.notEqual(d.briefing.headline, "Everything’s under control.");
  assert.equal(d.briefing.headline, "Nothing that needs you came up.");
  assert.equal(d.incompleteNotice, "Couldn’t load program drafts just now. Refresh to try again.");
});

check("a failed read still shows everything that DID load in NEEDS YOU", () => {
  const d = buildCoachDashboard({ ...DASHBOARD_FIXTURES.escalation.input, unavailable: ["OPTIM’s recent answers"] });
  assert.equal(d.needsYou.length, 1);
  assert.equal(d.briefing.tone, "attention");
});

check("archived clients never appear anywhere", () => {
  const input = fixtureInput({ roster: [rosterClient({ clientId: "c-arch", name: "Archived Person", lifecycle: "coach_setup", archived: true })] });
  const d = buildCoachDashboard(input);
  assert.equal(d.needsYou.length + d.worthKnowing.length + d.handled.length, 0);
  assert.equal(d.rosterLine, null);
});

check("no item in any fixture has an empty title or a fabricated action href", () => {
  for (const [name, f] of Object.entries(DASHBOARD_FIXTURES)) {
    const d = buildCoachDashboard(f.input);
    for (const i of [...d.needsYou, ...d.worthKnowing, ...d.handled]) {
      assert.ok(i.title.length > 0, `${name}: empty title`);
      if (i.action) assert.match(i.action.href, /^\/coach(\/|$)/, `${name}: ${i.action.href}`);
      if (i.actionRequired) assert.ok(i.action, `${name}: action required but no action (${i.kind})`);
    }
  }
});

check("relative time is timezone-independent and plain", () => {
  assert.equal(relativeTime("2026-09-30T11:59:30.000Z", "2026-09-30T12:00:00.000Z"), "just now");
  assert.equal(relativeTime("2026-09-30T09:00:00.000Z", "2026-09-30T12:00:00.000Z"), "3 hours ago");
  assert.equal(relativeTime("2026-09-29T11:00:00.000Z", "2026-09-30T12:00:00.000Z"), "1 day ago");
});

check("a plain start date formats without shifting a day", () => {
  assert.equal(formatPlainDate("2026-10-05"), "Monday, October 5");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
