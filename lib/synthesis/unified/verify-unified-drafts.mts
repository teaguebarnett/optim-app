// Gate U2 — offline rails for executable unified drafts (no database; the persistence path is proven against the local
// stack by scripts/e2e-unified-drafts.mts). Cardio → executable content, the CR10 effort grammar, merge rules, content
// building from every lifting source, and execution in the real workout engine.

import assert from "node:assert/strict";
import { runCardioReasoner, type CardioReasonerResult } from "../reasoner/cardio/reasoner.ts";
import { scriptedCardio, fakeModel, NOW, scenarioInput, cardioCoach, UPPER_LOWER } from "../reasoner/cardio/eval/fixtures.ts";
import { programContent, LOWER, UPPER } from "../reasoner/cardio/eval/fixtures.ts";
import { cardioToSessions, mergeCardioIntoProgram, cardioOnlyProgram } from "./cardio-content.ts";
import { buildUnifiedTrainingContent, type UnifiedArtifacts } from "../../production/unified-drafts.ts";
import { validateSession, validateUniversalTrainingProgramContent } from "../../production/validation.ts";
import { createInitialState, reducer, buildStartedWorkoutSession } from "../../state.ts";
import { describeContinuousTarget, formatEffort, continuousCaptureFields } from "../../workout/continuous.ts";
import { describeIntervalPhaseTarget } from "../../workout/interval.ts";
import { FOUNDATION_KNOWLEDGE } from "../knowledge/registry.ts";
import type { Session } from "../../training/types.ts";
import type { UnifiedProgramProposal } from "./contract.ts";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  - ${name}`);
    console.log(`        ${(err as Error).message}`);
    failed++;
  }
}
type Planned = Extract<CardioReasonerResult, { status: "PLANNED" }>;
const planned = async (tweak?: Parameters<typeof scriptedCardio>[1], coach = cardioCoach(), goal = "get_stronger"): Promise<Planned> => {
  const r = await runCardioReasoner({ input: scenarioInput({ coach, patch: { what_you_want: { primaryGoal: goal } } }), model: fakeModel((ri) => scriptedCardio(ri as never, tweak)), nowIso: NOW, resistance: UPPER_LOWER(), maxAttempts: 1 });
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join(" | ") : r.status);
  return r as Planned;
};
const start = (s: Session) => {
  const base = createInitialState();
  return { ...base, workoutSession: buildStartedWorkoutSession({ existingSession: base.workoutSession, workoutId: s.id, resolvedWorkout: null, trainingSession: s, nowIso: NOW }) };
};

console.log("\nGate U2 — executable unified drafts (offline)\n");

await check("1. week 1 keeps the model's exact CR10 effort and talk-test anchor; nothing becomes a resistance RPE", async () => {
  const c = await planned();
  const conv = cardioToSessions(c);
  for (const s of c.plan.sessions) {
    const p = conv.byWeek.get(1)!.get(s.day)!.blocks[0].items[0].prescription;
    assert.equal(p.rpe, undefined);
    assert.equal(p.effort?.scale, "cr10");
    if (s.type === "steady") {
      assert.deepEqual([p.effort!.low, p.effort!.high, p.effort!.label, p.family, p.duration!.seconds], [s.effort.min, s.effort.max, s.intensity, "continuous", s.minutes * 60]);
      if (s.talk) assert.equal(p.effort!.talkTest, s.talk);
    } else {
      assert.deepEqual([p.family, p.rounds, p.workInterval!.seconds, p.recoveryInterval!.seconds, p.effort!.low, p.recoveryEffort!.high], ["interval", s.intervals!.rounds, s.intervals!.workSeconds, s.intervals!.recoverySeconds, s.intervals!.workEffort.min, s.intervals!.recoveryEffort.max]);
      assert.equal(p.effort!.talkTest, undefined, "no talk test on intervals");
    }
  }
});

await check("2. later weeks: intensity label → its CR10 band; interval structure carried from the contract (never invented)", async () => {
  const c = await planned();
  const conv = cardioToSessions(c);
  for (const w of c.plan.progression) for (const s of w.sessions) {
    const p = conv.byWeek.get(w.week)!.get(s.day)!.blocks[0].items[0].prescription;
    if (s.type === "intervals") assert.deepEqual([p.rounds, p.workInterval!.seconds], [s.intervals!.rounds, s.intervals!.workSeconds]);
    else assert.equal(p.effort!.label, s.intensity);
  }
  assert.equal(conv.weeks, 1 + c.plan.progression.length);
});

await check("3. heart rate appears only when the run offered zones (coach uses HR): bpm from the estimated max HR", async () => {
  const noHr = cardioToSessions(await planned());
  assert.ok([...noHr.byWeek.values()].every((m) => [...m.values()].every((s) => !s.blocks[0].items[0].prescription.heartRate)));
  const hr = cardioToSessions(await planned(undefined, cardioCoach({ g_intensity_guide: ["heart_rate", "rpe"] })));
  const anyHr = [...hr.byWeek.get(1)!.values()].map((s) => s.blocks[0].items[0].prescription.heartRate).find(Boolean);
  assert.ok(anyHr && anyHr.low > 80 && anyHr.high < 200 && /est\. max HR/.test(anyHr.zoneLabel ?? ""), JSON.stringify(anyHr));
});

await check("4. optional cardio stays optional; placement becomes the session's coach note", async () => {
  const c = await planned(undefined, cardioCoach({ t_cardio_roles: ["optional_low_intensity"] }));
  const conv = cardioToSessions(c);
  assert.ok([...conv.byWeek.values()].every((m) => [...m.values()].every((s) => s.optional === true && /Optional/.test(s.coachNote ?? ""))));
  const placed = await planned((p) => {
    p.sessions[0] = { ...p.sessions[0], day: "Tuesday", placement: "after_resistance", minutes: 15 };
    p.progression = [2, 3, 4].map((week) => ({ week, sessions: p.sessions.map((x: Record<string, unknown>) => ({ day: x.day, type: x.type, modality: x.modality, minutes: x.minutes, intensity: x.intensity, placement: x.placement, optional: x.optional, intervals: x.intervals ? { rounds: (x.intervals as { rounds: number }).rounds, workSeconds: (x.intervals as { workSeconds: number }).workSeconds, recoverySeconds: (x.intervals as { recoverySeconds: number }).recoverySeconds } : null })), deload: false, gate: "none", change: "Hold." }));
    p.dose.vsCoachRange = p.sessions.reduce((t: number, x: { minutes: number }) => t + x.minutes, 0) < 60 ? "below" : "within";
  });
  assert.ok(/same visit/.test(cardioToSessions(placed).byWeek.get(1)!.get("Tuesday")!.coachNote ?? ""));
});

await check("5. merge: lifting sessions are untouched, cardio is added on its day, rest days become cardio days, beyond the cardio horizon nothing is added; input not mutated", async () => {
  const c = await planned();
  const conv = cardioToSessions(c);
  const base = { ...programContent([{ day: "Monday", exercises: LOWER }, { day: "Tuesday", exercises: UPPER }, { day: "Thursday", exercises: LOWER }, { day: "Friday", exercises: UPPER }], 12) };
  const before = JSON.stringify(base);
  const merged = mergeCardioIntoProgram(base, conv);
  assert.equal(JSON.stringify(base), before, "input not mutated");
  for (const [k, w] of merged.weeks.entries()) for (const [j, d] of w.days.entries()) {
    const lifting = (d.sessions ?? []).filter((s) => !s.id.startsWith("cardio-"));
    assert.deepEqual(lifting, base.weeks[k].days[j].sessions ?? [], `week ${w.weekNumber} ${d.dayOfWeek} lifting changed`);
    if (w.weekNumber > conv.weeks) assert.ok(!(d.sessions ?? []).some((s) => s.id.startsWith("cardio-")), "cardio beyond its horizon");
  }
  const cardioDay = c.plan.sessions.find((s) => !["Monday", "Tuesday", "Thursday", "Friday"].includes(s.day));
  if (cardioDay) assert.equal(merged.weeks[0].days.find((d) => d.dayOfWeek === cardioDay.day)!.type, "training");
  validateUniversalTrainingProgramContent(merged);
});

await check("6. the grammar: CR10 effort only on aerobic families, 0–10, low ≤ high; resistance RPE semantics unchanged", () => {
  const s = (prescription: Record<string, unknown>) => ({ id: "s", name: "s", focus: "f", estimatedDurationMin: 30, blocks: [{ id: "b", kind: "straight", order: 1, items: [{ id: "i", order: 1, name: "x", category: prescription.family, prescription }] }] });
  validateSession(s({ family: "continuous", duration: { seconds: 1200 }, effort: { scale: "cr10", low: 2, high: 3, label: "easy", talkTest: "full_conversation" } }), "ok");
  assert.throws(() => validateSession(s({ family: "resistance", sets: 3, effort: { scale: "cr10", low: 7, high: 8 } }), "x"), /only valid for continuous or interval/);
  assert.throws(() => validateSession(s({ family: "continuous", duration: { seconds: 600 }, effort: { scale: "cr10", low: 4, high: 11 } }), "x"), /0 to 10/);
  assert.throws(() => validateSession(s({ family: "continuous", duration: { seconds: 600 }, effort: { scale: "cr10", low: 6, high: 4 } }), "x"), /can't exceed/);
  assert.throws(() => validateSession(s({ family: "continuous", duration: { seconds: 600 }, recoveryEffort: { scale: "cr10", low: 2, high: 3 } }), "x"), /only valid for interval/);
  validateSession(s({ family: "resistance", sets: 3, reps: { low: 5, high: 5 }, rpe: 8 }), "resistance RPE still valid");
});

await check("7. execution: converted steady and interval sessions run in the workout engine and show CR10 effort", async () => {
  const c = await planned();
  const conv = cardioToSessions(c);
  const all = [...conv.byWeek.values()].flatMap((m) => [...m.values()]);
  const steady = all.find((s) => s.blocks[0].items[0].prescription.family === "continuous")!;
  validateSession(steady, "steady");
  const it = steady.blocks[0].items[0];
  assert.ok(describeContinuousTarget(it.prescription).includes(formatEffort(it.prescription.effort!)));
  assert.equal(continuousCaptureFields(it.prescription).effort, true);
  let st = start(steady);
  st = reducer(st, { type: "BEGIN_CONTINUOUS_LOGGING" });
  st = reducer(st, { type: "LOG_CONTINUOUS_EXECUTION", exerciseId: it.id, actual: { duration: { seconds: it.prescription.duration!.seconds * 0.5 } } });
  assert.equal(st.workoutSession.continuousExecutions?.[it.id]?.status, "partial", "half the minutes is partial");
  const iv = all.find((s) => s.blocks[0].items[0].prescription.family === "interval")!;
  validateSession(iv, "interval");
  const ip = iv.blocks[0].items[0];
  assert.ok(describeIntervalPhaseTarget(ip.prescription, "recovery").some((l) => /effort/.test(l)));
  let ist = start(iv);
  ist = reducer(ist, { type: "BEGIN_INTERVAL_EXECUTION", exerciseId: ip.id });
  for (let k = 0; k < ip.prescription.rounds! * 2; k++) ist = reducer(ist, { type: "ADVANCE_INTERVAL_PHASE", exerciseId: ip.id });
  ist = reducer(ist, { type: "FINALIZE_INTERVAL_EXECUTION", exerciseId: ip.id });
  assert.equal(ist.workoutSession.continuousExecutions?.[ip.id]?.status, "completed");
});

await check("8. content from every lifting source: approved/pending copied unchanged as a NEW draft; none → cardio-only; nothing → no draft", async () => {
  const c = await planned();
  const u = { runId: "u-1", version: "unified-program-u1.0.0" } as UnifiedProgramProposal;
  const approved = { ...programContent([{ day: "Monday", exercises: LOWER }, { day: "Thursday", exercises: LOWER }], 8), status: "assigned" } as never;
  const mk = (resistance: UnifiedArtifacts["resistance"], cardio: UnifiedArtifacts["cardio"]) => buildUnifiedTrainingContent({ rowId: "row-1", artifacts: { resistance, cardio, nutrition: null }, proposal: u, knowledge: FOUNDATION_KNOWLEDGE, workspaceId: "ws-1", clientProfileId: "client-1", coachId: "coach-1", title: "Unified", nowIso: NOW });
  const fromApproved = mk({ source: "approved_program", versionId: "v-appr", content: approved }, c)!;
  assert.deepEqual([fromApproved.status, fromApproved.clientId, fromApproved.id, fromApproved.unifiedProvenance?.resistance.versionId], ["draft", "client-1", "unified-row-1", "v-appr"]);
  assert.equal((approved as { status: string }).status, "assigned", "the approved content object itself is untouched");
  validateUniversalTrainingProgramContent(fromApproved);
  const cardioOnly = mk({ source: "none" }, c)!;
  assert.ok(cardioOnly.weeks.length === cardioToSessions(c).weeks && cardioOnly.weeks.every((w) => w.days.every((d) => (d.sessions ?? []).every((s) => s.id.startsWith("cardio-")))));
  validateUniversalTrainingProgramContent(cardioOnly);
  assert.equal(mk({ source: "none" }, null), null, "no lifting and no cardio → no training draft");
  void cardioOnlyProgram;
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
