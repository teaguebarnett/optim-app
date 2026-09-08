// OPTIM Phase 5.0C — Pre-start program timing verification.
//
// Exercises resolveProgramTiming/describeProgramTimingForCoach directly
// (lib/scheduling/program-timing.ts) — the fix for a real bug found during
// verification: an active client whose program start date hadn't arrived
// yet in their own local calendar showed a fully actionable Today
// experience with no program-week label, and the coach side showed
// "Week — of 8". Run with: npm run verify:program-timing

import assert from "node:assert/strict";

import { resolveProgramTiming, describeProgramTimingForCoach } from "./program-timing.ts";
import { buildProgramEnrollmentForClient, deriveProgramWeek } from "./enrollment.ts";
import { WORKSPACE_OPTIM_ID } from "../tenancy/seed.ts";

let passed = 0;
let failed = 0;

function check(description: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${description}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  - ${description}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

const CLIENT_ID = "client-pre-start-fixture";

console.log("\n1. Active client before their start date (pre-program)\n");

check("A client one calendar day before a Monday start date is pre-program, not active", () => {
  // 2026-08-30 is a Sunday; 2026-08-31 is the following Monday — a real
  // week boundary, exactly the scenario the original bug report hit.
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31",
    durationWeeks: 8,
    timeZone: "UTC",
    now: new Date("2026-08-30T12:00:00.000Z"),
  });
  const timing = resolveProgramTiming(enrollment, "2026-08-30");
  assert.equal(timing.phase, "pre_program");
  assert.equal(timing.week, null);
  assert.equal(timing.daysUntilStart, 1);
});

check("Pre-program never reports a week number — null, not a fabricated 1 or 0", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-09-07",
    durationWeeks: 12,
    timeZone: "UTC",
  });
  const timing = resolveProgramTiming(enrollment, "2026-08-30");
  assert.equal(timing.phase, "pre_program");
  assert.equal(timing.week, null);
  assert.ok((timing.daysUntilStart ?? 0) > 0);
});

check("The coach-facing label never renders 'Week — of N' for a pre-program client — it names the real start date instead", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31",
    durationWeeks: 8,
    timeZone: "UTC",
  });
  const timing = resolveProgramTiming(enrollment, "2026-08-30");
  const label = describeProgramTimingForCoach(timing, enrollment.durationWeeks, "Aug 31");
  assert.equal(label.includes("—"), false);
  assert.equal(label.includes("Week"), false);
  assert.equal(label, "Starts tomorrow · 8-week program");
});

check("A start date several days out reads 'Starts <date>', not 'tomorrow'", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-09-14",
    durationWeeks: 12,
    timeZone: "UTC",
  });
  const timing = resolveProgramTiming(enrollment, "2026-08-30");
  const label = describeProgramTimingForCoach(timing, enrollment.durationWeeks, "Sep 14");
  assert.equal(label, "Starts Sep 14 · 12-week program");
});

console.log("\n2. Active client exactly on their start date\n");

check("On the exact local start date, phase is active_program and week is 1 — regardless of which weekday the start date falls on", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31", // Monday
    durationWeeks: 8,
    timeZone: "UTC",
  });
  const timing = resolveProgramTiming(enrollment, "2026-08-31");
  assert.equal(timing.phase, "active_program");
  assert.equal(timing.week, 1);
  assert.equal(timing.daysUntilStart, null);
});

check("A mid-week start date also resolves to Week 1 on that exact day", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-09-02", // Wednesday
    durationWeeks: 10,
    timeZone: "UTC",
  });
  const timing = resolveProgramTiming(enrollment, "2026-09-02");
  assert.equal(timing.phase, "active_program");
  assert.equal(timing.week, 1);
});

check("The coach-facing label on the start date reads 'Week 1 of N'", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31",
    durationWeeks: 8,
    timeZone: "UTC",
  });
  const timing = resolveProgramTiming(enrollment, "2026-08-31");
  assert.equal(describeProgramTimingForCoach(timing, 8, "Aug 31"), "Week 1 of 8");
});

console.log("\n3. Active client after their start date\n");

check("The day after a Monday start date is still Week 1 (same training week)", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31",
    durationWeeks: 8,
    timeZone: "UTC",
  });
  const timing = resolveProgramTiming(enrollment, "2026-09-01");
  assert.equal(timing.phase, "active_program");
  assert.equal(timing.week, 1);
});

check("Eight full weeks after the start date correctly reports Week 2", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31",
    durationWeeks: 8,
    timeZone: "UTC",
  });
  const timing = resolveProgramTiming(enrollment, "2026-09-07"); // the following Monday
  assert.equal(timing.week, 2);
});

check("Past the enrollment's full duration, phase is post_program with no week number", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-01-05",
    durationWeeks: 8,
    timeZone: "UTC",
  });
  const timing = resolveProgramTiming(enrollment, "2026-03-15");
  assert.equal(timing.phase, "post_program");
  assert.equal(timing.week, null);
  assert.equal(describeProgramTimingForCoach(timing, 8, "Jan 5"), "Program complete · 8 weeks");
});

console.log("\n4. Local calendar-date handling and Week 1 derivation consistency\n");

check("resolveProgramTiming's week matches deriveProgramWeek exactly whenever active — one source of truth, not two computations that could drift", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31",
    durationWeeks: 12,
    timeZone: "UTC",
  });
  for (const dateIso of ["2026-08-31", "2026-09-10", "2026-11-01"]) {
    assert.equal(resolveProgramTiming(enrollment, dateIso).week, deriveProgramWeek(enrollment, dateIso));
  }
});

check("A timezone-agnostic ISO date string drives the phase — the same calendar date is pre-program or active consistently regardless of the enrollment's configured timeZone value", () => {
  const enrollmentUtc = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31",
    durationWeeks: 8,
    timeZone: "UTC",
  });
  const enrollmentNy = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31",
    durationWeeks: 8,
    timeZone: "America/New_York",
  });
  assert.equal(resolveProgramTiming(enrollmentUtc, "2026-08-30").phase, resolveProgramTiming(enrollmentNy, "2026-08-30").phase);
});

console.log("\n5. No pre-start progress mutation\n");

check("Deriving pre-start timing is read-only — the same enrollment object is returned unmodified by reference-equal fields", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31",
    durationWeeks: 8,
    timeZone: "UTC",
  });
  const before = JSON.stringify(enrollment);
  resolveProgramTiming(enrollment, "2026-08-30");
  resolveProgramTiming(enrollment, "2026-08-31");
  resolveProgramTiming(enrollment, "2026-09-15");
  assert.equal(JSON.stringify(enrollment), before);
});

check("Repeated pre-start evaluation on the same date is idempotent — never advances week or phase just from being checked again", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-08-31",
    durationWeeks: 8,
    timeZone: "UTC",
  });
  const first = resolveProgramTiming(enrollment, "2026-08-30");
  const second = resolveProgramTiming(enrollment, "2026-08-30");
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------

console.log("\n7. Phase 5.6A.4 — the exact E2E verification scenario (Sep 8 today, Sep 14 start)\n");

check("September 13 (the day before a Sep 14 Monday start) is still pre-program, in a non-UTC timezone", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-09-14",
    durationWeeks: 12,
    timeZone: "America/Chicago",
  });
  const timing = resolveProgramTiming(enrollment, "2026-09-13");
  assert.equal(timing.phase, "pre_program");
  assert.equal(timing.week, null);
  assert.equal(timing.daysUntilStart, 1);
});

check("September 14 itself is Day 1 — active_program, Program Week 1", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-09-14",
    durationWeeks: 12,
    timeZone: "America/Chicago",
  });
  const timing = resolveProgramTiming(enrollment, "2026-09-14");
  assert.equal(timing.phase, "active_program");
  assert.equal(timing.week, 1);
  assert.equal(deriveProgramWeek(enrollment, "2026-09-14"), 1);
});

check("No program date/week can ever be derived before September 14 — every date from Sep 1 through Sep 13 is honestly pre_program with a null week", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-09-14",
    durationWeeks: 12,
    timeZone: "America/Chicago",
  });
  for (let day = 1; day <= 13; day++) {
    const dateIso = `2026-09-${String(day).padStart(2, "0")}`;
    const timing = resolveProgramTiming(enrollment, dateIso);
    assert.equal(timing.phase, "pre_program", `expected ${dateIso} to be pre_program`);
    assert.equal(timing.week, null, `expected ${dateIso} to have no program week`);
  }
});

check("A later date correctly reports its real program day/week distance from the canonical Sep 14 start — Sep 21 is Week 2, Sep 28 is Week 3", () => {
  const enrollment = buildProgramEnrollmentForClient({
    workspaceId: WORKSPACE_OPTIM_ID,
    clientId: CLIENT_ID,
    startDateIso: "2026-09-14",
    durationWeeks: 12,
    timeZone: "America/Chicago",
  });
  assert.equal(resolveProgramTiming(enrollment, "2026-09-21").week, 2);
  assert.equal(resolveProgramTiming(enrollment, "2026-09-28").week, 3);
});

check("Date-only phase/week derivation never shifts with the enrollment's configured timezone — Chicago, UTC, and Tokyo all agree on the same calendar date", () => {
  for (const timeZone of ["America/Chicago", "UTC", "Asia/Tokyo"]) {
    const enrollment = buildProgramEnrollmentForClient({
      workspaceId: WORKSPACE_OPTIM_ID,
      clientId: CLIENT_ID,
      startDateIso: "2026-09-14",
      durationWeeks: 12,
      timeZone,
    });
    assert.equal(resolveProgramTiming(enrollment, "2026-09-13").phase, "pre_program", timeZone);
    assert.equal(resolveProgramTiming(enrollment, "2026-09-14").phase, "active_program", timeZone);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
