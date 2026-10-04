// Gate 4.0C-4 — Fitness Reasoner production integration: offline tests.
// Scripted / mocked models only — no provider, no database. The database
// single-flight index and the UI are covered by the local E2E run.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FOUNDATION_KNOWLEDGE } from "../knowledge/registry.ts";
import { runFitnessReasoner, type ReasonerModel, type ReasonerResult } from "./reasoner.ts";
import { executeReasonerJob, isStale, outcomeForResult, parseEnabledClients, auditColumns, MESSAGES, STALE_AFTER_MS, type JobFinish } from "./proposal-job.ts";
import { plainLanguage, reasonerResultToProgramContent, reviewContext } from "./to-program.ts";
import { fakeModel, NOW, restrict, scenarioInput, scriptedOutput } from "./eval/fixtures.ts";
import { validateUniversalTrainingProgramContent } from "../../production/validation.ts";
import { hasVerifiedGenerationInputs } from "../../coach/generation-prerequisites.ts";
import { ONBOARDING_STEPS, visibleFieldsForStep } from "../../coach/onboarding-steps.ts";
import type { GenerationInputs } from "../../training/types.ts";

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
console.log("\nGate 4.0C-4 — Fitness Reasoner production integration\n");

const scripted = () => fakeModel((ri) => scriptedOutput(ri));
const run = (input = scenarioInput(), model: ReasonerModel | null = scripted()) => runFitnessReasoner({ input, model, nowIso: NOW, runId: "job-1" });
const planned = async (input = scenarioInput()) => {
  const r = await run(input);
  assert.equal(r.status, "PLANNED", r.status === "REJECTED" ? r.errors.join("; ") : r.status);
  return r as Extract<ReasonerResult, { status: "PLANNED" }>;
};
const inputs: GenerationInputs = { version: 1, recordedAtIso: NOW, coachMethod: { methodVersionId: "mv-eval-7", playbookVersion: 7, operatingModelVersion: 1, confirmedAtIso: NOW, summary: [] }, clientIntake: { source: "client_onboarding", completedAtIso: NOW, healthReview: "not_required", summary: [], assumptions: [] } };
const convert = (r: Extract<ReasonerResult, { status: "PLANNED" }>) => reasonerResultToProgramContent({ result: r, knowledge: FOUNDATION_KNOWLEDGE, programId: "reasoner-job-1", workspaceId: "ws-eval", clientProfileId: "client-eval", coachId: "coach-eval", title: "Training program", jobId: "job-1", generationInputs: inputs, nowIso: NOW });

/** Runs the job body with recording fakes. */
async function job(opts: { input?: ReturnType<typeof scenarioInput>; model?: ReasonerModel | null; save?: (r: unknown) => Promise<{ versionId: string } | { superseded: true } | { notSaved: string }>; loadThrows?: boolean }) {
  const finishes: JobFinish[] = [];
  let saves = 0;
  const model = opts.model === undefined ? scripted() : opts.model;
  await executeReasonerJob({
    jobId: "job-1",
    nowIso: () => NOW,
    loadInput: async () => {
      if (opts.loadThrows) throw new Error("load failed: secret-ish detail sk-ant-123");
      return opts.input ?? scenarioInput();
    },
    model: async () => model,
    saveDraft: async (r) => {
      saves++;
      return opts.save ? opts.save(r) : { versionId: "ver-1" };
    },
    finish: async (f) => {
      finishes.push(f);
    },
  });
  return { finishes, saves, calls: (model as { calls?: number } | null)?.calls ?? 0 };
}

await check("1. Controlled rollout: an explicit server-side allowlist; empty = nobody", () => {
  assert.equal(parseEnabledClients(undefined).size, 0);
  assert.equal(parseEnabledClients("").size, 0);
  const s = parseEnabledClients(" 659AA49C-1AC4-4369-8023-6267B8140F16 , not-a-uuid,,");
  assert.deepEqual([...s], ["659aa49c-1ac4-4369-8023-6267b8140f16"]);
});

await check("2. PLANNED → exactly one Reasoner run, one draft save, job ready_for_review with the draft's version", async () => {
  const j = await job({});
  assert.equal(j.calls, 1, "one model call");
  assert.equal(j.saves, 1);
  assert.equal(j.finishes.length, 1);
  assert.deepEqual([j.finishes[0].status, j.finishes[0].programVersionId], ["ready_for_review", "ver-1"]);
  assert.ok(j.finishes[0].result?.run.runId === "job-1", "the run is persisted with the job");
});

await check("3. Unsupported domain → 'unsupported', no model call, no draft, no fallback planner", async () => {
  const marathon = scenarioInput({ patch: { what_you_want: { primaryGoal: "athletic_performance", secondaryGoals: [], successDefinition: "Run my first marathon in under 4 hours" } } });
  const j = await job({ input: marathon });
  assert.equal(j.finishes[0].status, "unsupported", JSON.stringify(j.finishes[0]));
  assert.equal(j.saves, 0);
  assert.equal(j.calls, 0);
  assert.equal(j.finishes[0].outcome.message, MESSAGES.unsupported);
});

await check("4. NEEDS_INPUT → 'needs_input' with what's missing and who provides it; no draft", async () => {
  const j = await job({ input: scenarioInput({ patch: { starting_point: { trainingExperience: undefined } } }) });
  assert.equal(j.finishes[0].status, "needs_input");
  assert.ok((j.finishes[0].outcome.missing ?? []).length > 0 && j.finishes[0].outcome.missing!.every((m) => ["client", "coach", "either"].includes(m.providedBy)));
  assert.equal(j.saves, 0);
});

await check("5. Provider failure / no provider / invalid output / load failure → 'failed' with fixed safe messages", async () => {
  const boom: ReasonerModel = { provider: "x", modelId: "x", generate: async () => { throw Object.assign(new Error("401 invalid x-api-key sk-ant-secret"), { name: "AiProviderUnavailableError" }); } };
  const a = await job({ model: boom });
  assert.deepEqual([a.finishes[0].status, a.finishes[0].failureCategory, a.finishes[0].outcome.message], ["failed", "provider_failed", MESSAGES.provider_failed]);
  const b = await job({ model: null });
  assert.equal(b.finishes[0].failureCategory, "provider_failed");
  const invalid = fakeModel(() => ({ status: "PLAN", plan: { domain: "resistance" } }));
  const c = await job({ model: invalid });
  assert.deepEqual([c.finishes[0].status, c.finishes[0].failureCategory], ["failed", "rejected_by_validators"]);
  assert.equal(invalid.calls, 2, "one repair attempt inside the single run — never a second run");
  const d = await job({ loadThrows: true });
  assert.equal(d.finishes[0].failureCategory, "provider_failed");
  for (const f of [a, b, c, d].map((x) => x.finishes[0])) assert.ok(!JSON.stringify(f.outcome).match(/sk-ant|x-api-key|401|stack|Error:/i), "no provider text, keys or stacks reach the coach");
  for (const x of [a, b, c, d]) assert.equal(x.saves, 0, "nothing saved, nothing substituted");
});

await check("6. Draft save problems: superseded / not saved / save throws → failed, never a duplicate", async () => {
  assert.equal((await job({ save: async () => ({ superseded: true }) })).finishes[0].failureCategory, "superseded");
  const ns = await job({ save: async () => ({ notSaved: "method changed" }) });
  assert.deepEqual([ns.finishes[0].failureCategory, ns.finishes[0].outcome.message], ["draft_not_saved", "method changed"]);
  const th = await job({ save: async () => { throw new Error("insert failed"); } });
  assert.deepEqual([th.finishes.length, th.finishes[0].failureCategory], [1, "draft_not_saved"]);
});

await check("7. Stale 'preparing' jobs (function died) are closable as timed out", () => {
  const t0 = Date.parse(NOW);
  assert.equal(isStale({ status: "preparing", created_at: NOW }, t0 + STALE_AFTER_MS - 1), false);
  assert.equal(isStale({ status: "preparing", created_at: NOW }, t0 + STALE_AFTER_MS + 1), true);
  assert.equal(isStale({ status: "ready_for_review", created_at: NOW }, t0 + 10 * STALE_AFTER_MS), false);
});

await check("8. Audit columns: versions, hashes, tokens, latency from the ReasonerRun; outcome mapping covers every status", async () => {
  const r = await planned();
  const a = auditColumns(r.run);
  assert.ok(a.reasoner_version && a.prompt_version && a.knowledge_version && a.input_hash && a.client_state_hash && a.goal_contract_hash && a.constraint_set_hash);
  assert.equal(a.model_calls, 1);
  assert.equal(outcomeForResult(r).status, "ready_for_review");
});

await check("9. A PLANNED result becomes valid, approvable proposal content (existing lifecycle), weeks = the validated spec", async () => {
  const r = await planned();
  const c = convert(r);
  validateUniversalTrainingProgramContent(c);
  assert.ok(hasVerifiedGenerationInputs(c), "approval gate sees verified inputs");
  assert.equal(c.status, "draft");
  assert.equal(c.weeks.length, r.plan.durationWeeks);
  for (const w of c.weeks) assert.equal(w.days.length, 7);
  const spec = r.spec.resistance!.value.weeks;
  c.weeks.forEach((w, wi) => {
    const training = w.days.filter((d) => d.type === "training");
    assert.equal(training.length, r.plan.frequency.daysPerWeek);
    training.forEach((d) => {
      const si = r.plan.sessions.findIndex((s) => s.day === d.dayOfWeek);
      d.sessions![0].blocks.forEach((b, xi) => {
        const p = b.items[0].prescription;
        const x = spec[wi].sessions[si][xi];
        assert.deepEqual([p.sets, p.reps], [x.sets, { low: x.reps.min, high: x.reps.max }], `week ${w.weekNumber} ${d.dayOfWeek} item ${xi}`);
        if (p.rpe !== undefined) assert.ok(p.rpe >= 6 && p.rpe <= 10);
      });
    });
  });
  const text = JSON.stringify(c);
  assert.ok(!/providerError|"raw"|systemPrompt|attempts|sk-ant/.test(text), "no raw model JSON or provider internals in the proposal");
});

await check("10. Review context: NEEDS YOU carries coach decisions (blocked goal, uncertain fit); HANDLED carries what OPTIM applied", async () => {
  const bracing = restrict([{ kind: "avoid_demand", demand: "bracing", atOrAbove: "moderate" }]);
  const input = scenarioInput({ restrictions: bracing, patch: { what_you_want: { primaryGoal: "get_stronger", secondaryGoals: [], successDefinition: "Bench 405", targetLift: "exercise.barbell_bench_press", targetLiftValue: 405, targetLiftReps: 1 } } });
  const r = await planned(input);
  const ctx = reviewContext(r);
  assert.ok(ctx.needsYou.some((l) => /405 lb × 1/.test(l) && /Coach review/.test(l)), "blocked structured target is a coach decision");
  assert.ok(ctx.handled.some((l) => /Training days/.test(l)) && ctx.handled.some((l) => /set, rep, effort and rest ranges/.test(l)));
  assert.ok(ctx.decisions.length > 0);
});

await check("11. Structured lift target: optional intake fields → GoalContract.performanceTargets; others never see it", async () => {
  const step = ONBOARDING_STEPS.find((s) => s.id === "what_you_want")!;
  const keys = (a: Record<string, string | number | string[]>) => visibleFieldsForStep(step, a as Parameters<typeof visibleFieldsForStep>[1]).map((f) => f.key);
  assert.ok(!keys({ primaryGoal: "build_muscle", secondaryGoals: [] }).includes("targetLift"), "not shown without a strength goal");
  assert.ok(keys({ primaryGoal: "build_muscle", secondaryGoals: ["get_stronger"] }).includes("targetLift"), "shown for a secondary strength goal");
  assert.ok(!keys({ primaryGoal: "get_stronger", targetLift: "none" }).includes("targetLiftValue"));
  assert.ok(step.fields.filter((f) => f.key.startsWith("targetLift")).every((f) => !f.required), "never forced");
  const g = scenarioInput({ patch: { what_you_want: { primaryGoal: "get_stronger", secondaryGoals: [], successDefinition: "x", targetLift: "exercise.barbell_bench_press", targetLiftValue: 405, targetLiftReps: 1 } } }).goal;
  assert.deepEqual(g.performanceTargets.map((t) => [t.exercise, t.metric, t.value, t.unit, t.atReps, t.basis]), [["exercise.barbell_bench_press", "load", 405, "lb", 1, "client_reported"]]);
  assert.deepEqual(scenarioInput({ patch: { what_you_want: { primaryGoal: "get_stronger", secondaryGoals: [], successDefinition: "x", targetLift: "none" } } }).goal.performanceTargets, []);
  assert.deepEqual(scenarioInput().goal.performanceTargets, [], "existing free-text clients unchanged");
});

await check("12. Authority boundaries (source): the Reasoner path never publishes, assigns or edits method/constraints", () => {
  const actions = readFileSync(new URL("../../../app/actions/production-programs.ts", import.meta.url), "utf8");
  const section = actions.slice(actions.indexOf("Gate 4.0C-4 — Fitness Reasoner proposals"), actions.indexOf("export interface ProgramProposalReviewView"));
  assert.ok(section.length > 500);
  assert.ok(!/publishProgramVersion|assignProgramVersionToClient|assign_active_program_version|confirm_coach_method|structured_limitations|generateUniversalProgramProposalContent|buildUniversalProgramForDirection/.test(section), "no publish/assign/method/constraint writes or legacy fallback");
  assert.ok(/getPendingProgramProposal/.test(section) && /requireAssignedCoachAuthority/.test(section) && /isReasonerProposalEnabled/.test(section));
  const runner = readFileSync(new URL("../../production/reasoner-proposals.ts", import.meta.url), "utf8");
  assert.ok(!/publishProgramVersion|assignProgramVersionToClient|assign_active_program_version|coach_method|structured_limitations|training_program_versions/.test(runner.replace(/\/\/.*$/gm, "")), "runner writes only its job row");
  assert.ok(/isLocalSupabase\(\)/.test(runner) && /OPTIM_REASONER_TEST_PROVIDER/.test(runner), "test provider gated to a local stack");
  const ws = readFileSync(new URL("../../../components/coach/live-client-workspace.tsx", import.meta.url), "utf8");
  assert.ok(/reasonerAvailability\.enabled \?[\s\S]*ReasonerProposalPanel[\s\S]*: \([\s\S]*LiveProposalGenerateForm/.test(ws), "legacy form unchanged for non-enabled clients");
  const migration = readFileSync(new URL("../../../supabase/migrations/20261004000031_reasoner_generation_jobs.sql", import.meta.url), "utf8");
  assert.ok(/unique index reasoner_generation_jobs_one_in_flight_per_client[\s\S]*where status = 'preparing'/.test(migration), "single-flight enforced by the database");
  assert.ok(!/to anon/.test(migration) && /is_workspace_staff/.test(migration), "staff-only");
});

await check("13. Coach-facing text never shows internal codes (constraint aliases, K/U fit codes)", async () => {
  assert.equal(plainLanguage("U: the only vertical pull — coach review."), "Uncertain fit (needs your review): the only vertical pull — coach review.");
  assert.equal(plainLanguage("K: trunk on the bench."), "Conditional fit: trunk on the bench.");
  assert.equal(plainLanguage("C1 blocks every squat pattern; U-rated pulls need a ruling."), "your confirmed restrictions blocks every squat pattern; uncertain-fit pulls need a ruling.");
  assert.equal(plainLanguage("lat pulldown (U constraint fit): the only vertical pull."), "lat pulldown (uncertain fit): the only vertical pull.");
  assert.equal(plainLanguage("Coach method tension (t_sets.exceptions.main): Main sets cap at 3."), "Tension with your method: Main sets cap at 3.");
  const bracing = restrict([{ kind: "avoid_demand", demand: "bracing", atOrAbove: "moderate" }]);
  const r = await planned(scenarioInput({ restrictions: bracing }));
  const text = JSON.stringify(convert(r).reasonerProvenance) + JSON.stringify(convert(r).weeks[0]);
  assert.ok(!/\bC\d+\b|U-rated|K-rated|"[KU]:|\(t_[a-z]/.test(text), text.match(/\bC\d+\b|U-rated|K-rated|"[KU]:|\(t_[a-z]/)?.[0]);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
