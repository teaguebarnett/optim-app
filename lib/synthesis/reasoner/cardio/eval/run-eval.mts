// Cardio Reasoner V1 — evaluation runner.
//
//   (default)               offline, scripted model — rails only, not coaching quality
//   --live                  real model via ANTHROPIC_API_KEY (never printed), production effort (medium)
//   --ledger <file>         required with --live: executed-call ledger (shared format with resistance/nutrition)
//   --max-calls <n>         hard cap on executed live calls (default 10)
//   --max-usd <n>           hard cap on estimated spend at published prices (required with --live)
//   --max-attempts <n>      model attempts per scenario (default 2; 1 = no repair calls)
//   --only C01,C02          scenario subset
//   --out <file>            JSON report (results, full runs, quality)
//   --pack <file>           Markdown review pack (every generated program in full)
//
// A live run STOPS at the first provider failure (billing, auth, network) — it never resubmits into a rejection.

import { writeFileSync } from "node:fs";
import { createLedger } from "../../eval/live-model.ts";
import { cardioModality } from "../../../knowledge/cardio/modalities.ts";
import { runCardioReasoner, type CardioReasonerResult } from "../reasoner.ts";
import { CARDIO_SCENARIOS, scenarioHard, type CardioScenario } from "./scenarios.ts";
import { fakeModel, NOW, scriptedCardio } from "./fixtures.ts";

const args = process.argv.slice(2);
const arg = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const live = args.includes("--live");
const ledgerPath = arg("--ledger");
const maxCalls = Number(arg("--max-calls") ?? 10);
const maxUsd = arg("--max-usd") ? Number(arg("--max-usd")) : null;
const maxAttempts = Number(arg("--max-attempts") ?? 2);
const only = arg("--only") ? new Set(arg("--only")!.split(",")) : null;
if (live && !ledgerPath) throw new Error("--live requires --ledger <file> so live calls are metered.");
if (live && !(maxUsd && maxUsd > 0)) throw new Error("--live requires --max-usd <dollars> so spend is capped.");
// Input estimate for the worst-case guard: measured with count_tokens on the largest scenario input (V1.2: 7,391 tokens).
const meter = live ? createLedger(ledgerPath!, maxCalls, { maxUsd: maxUsd!, inputTokensEstimate: 7500 }) : null;

const selected = CARDIO_SCENARIOS.filter((s) => !only || only.has(s.id));
if (live) {
  const need = selected.filter((s) => s.expectsModel).length * maxAttempts;
  const used = meter!.read().calls;
  console.log(`Live budget: ${used}/${maxCalls} calls used; this run needs up to ${need}.`);
  if (used + need > maxCalls) {
    console.log(`STOP: would exceed the ${maxCalls}-call cap. Reduce scope or get approval.`);
    process.exit(2);
  }
}
console.log(`\nCardio Reasoner V1.2 — evaluation (${live ? "LIVE, medium effort" : "offline, scripted model"}; ${selected.length} scenarios)\n`);

interface Row { s: CardioScenario; r: CardioReasonerResult; hard: string[]; quality: Array<{ check: string; pass: boolean }> }
const rows: Row[] = [];
let stopped: string | null = null;
for (const s of selected) {
  if (live && s.expectsModel && meter!.read().calls >= maxCalls) {
    console.log(`${s.id} skipped — call cap reached.`);
    continue;
  }
  const i = s.input();
  const model = !s.expectsModel || !live ? fakeModel((ri) => scriptedCardio(ri as never)) : await meter!.liveModel(s.id, { effort: "medium" });
  const r = await runCardioReasoner({ input: i, model, nowIso: NOW, resistance: s.resistance ?? null, runId: `eval-${s.id}`, maxAttempts });
  const hard = scenarioHard(s, r, i);
  const quality = r.status === "PLANNED" ? (s.quality?.(r, i) ?? []) : [];
  rows.push({ s, r, hard, quality });
  const t = r.run.totals;
  console.log(`${hard.length ? "FAIL" : " ok "}  ${s.id} ${s.title}\n      ${r.status} · ${t.calls} call(s) · ${t.inputTokens}/${t.outputTokens} tok · ${(t.latencyMs / 1000).toFixed(1)} s${hard.length ? `\n      HARD: ${hard.join("; ")}` : ""}${r.status === "REJECTED" ? `\n      errors: ${r.errors.join(" | ").slice(0, 900)}` : ""}${quality.length ? `\n      quality: ${quality.map((q) => `${q.pass ? "✓" : "✗"} ${q.check}`).join(" · ")}` : ""}`);
  if (live && r.status === "PROVIDER_FAILED") {
    stopped = `${s.id}: ${r.run.attempts.at(-1)?.providerError ?? "provider failure"}`;
    console.log(`\nSTOP: provider failure on ${stopped} — not resubmitting.`);
    break;
  }
}
const failures = rows.filter((x) => x.hard.length).length;
console.log(`\n${rows.length - failures}/${rows.length} scenarios meet their hard invariants.`);
if (live) {
  const l = meter!.read();
  console.log(`Ledger: ${l.calls}/${maxCalls} executed calls · ${l.inputTokens} in / ${l.outputTokens} out tokens · ${(l.latencyMs / 1000).toFixed(0)} s model time · ≈$${(l.usd ?? 0).toFixed(2)} of $${maxUsd} cap`);
}
const out = arg("--out");
if (out) writeFileSync(out, JSON.stringify({ generatedAtIso: new Date().toISOString(), live, stopped, rows: rows.map((x) => ({ scenario: x.s.id, title: x.s.title, status: x.r.status, hard: x.hard, quality: x.quality, run: x.r.run })) }, null, 1));

const pack = arg("--pack");
if (pack) {
  const name = (id: string) => cardioModality(id)?.name ?? id;
  const r2 = (p: { min: number; max: number } | null | undefined) => (p ? `${p.min}–${p.max}` : "—");
  const pages = rows.filter((x) => x.s.expectsModel).map(({ s, r }) => {
    const head = `## ${s.id} — ${s.title}\n\n**Status:** ${r.status}`;
    if (r.status === "REJECTED") return `${head}\n\n**Validator errors:**\n${r.errors.map((e) => `- ${e}`).join("\n")}`;
    if (r.status !== "PLANNED") return `${head}\n\n${JSON.stringify(r.run.result, null, 1)}`;
    const p = r.plan;
    const ri = r.run.input!;
    return [
      head,
      `**Context:** goal ${ri.goal.primary}${ri.hybrid ? " (hybrid)" : ""} · purpose ${ri.purpose} · coach roles ${ri.coach.allowedRoles.join("/")} · minutes ${JSON.stringify(ri.bounds.minutesByRole)} · max hard ${ri.bounds.maxHardSessions} · easy-start weeks ${ri.bounds.easyStartWeeks} · recovery-limited ${ri.bounds.recoveryLimited} · resistance ${ri.resistance ? ri.resistance.days.map((d) => `${d.day.slice(0, 3)} ${d.focus}${d.lowerBody ? "+legs" : ""} ${d.minutes}m`).join(", ") : "none"} · capacity ≤${ri.capacity.weeklyMaxMinutes ?? "∞"} min/wk${ri.endurance ? ` · discipline ${ri.endurance.discipline ?? "unknown"}` : ""}`,
      `**Warranted:** ${p.warranted} · **Role:** ${p.role} · **Dose vs coach range:** ${p.dose.vsCoachRange} — _${p.dose.rationale}_`,
      `**Intensity method:** ${p.intensityMethod.primary} — _${p.intensityMethod.rationale}_`,
      `**Objective:** ${p.objective.summary} — _${p.objective.rationale}_`,
      `| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Optional | Purpose |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n${p.sessions.map((x) => `| ${x.day} | ${x.type} | ${name(x.modality)} | ${x.minutes} | ${x.intensity} | ${r2(x.effort)} | ${x.talk ?? "—"} | ${r2(x.hrPct)} | ${x.intervals ? `${x.intervals.rounds}×${x.intervals.workSeconds}s/${x.intervals.recoverySeconds}s @${r2(x.intervals.workEffort)}/${r2(x.intervals.recoveryEffort)}` : "—"} | ${x.placement} | ${x.optional ? "yes" : "no"} | ${x.purpose}${x.note ? ` (${x.note})` : ""} |`).join("\n")}`,
      p.steps ? `**Steps:** ${r2(p.steps.target)} — _${p.steps.rationale}_` : "",
      `**Progression (OPTIM's totals):**\n${r.review.progression.map((x) => `- ${x}`).join("\n")}\n\n${p.progression.map((w) => `- W${w.week}: ${w.deload ? "(deload) " : ""}${w.gate !== "none" ? `[gate: ${w.gate}] ` : ""}${w.sessions.map((x) => `${x.day.slice(0, 3)} ${name(x.modality)} ${x.minutes}′ ${x.intensity}${x.type === "intervals" ? " intervals" : ""}${x.optional ? " (optional)" : ""}${x.placement !== "separate_day" ? ` [${x.placement}]` : ""}`).join(", ") || "—"} — _${w.change}_`).join("\n")}`,
      r.review.recoveryStrategy ? `**Recovery strategy:** ${r.review.recoveryStrategy}` : "",
      r.review.coachDecisions.length ? `**Prepared coach decisions:**\n${r.review.coachDecisions.map((d) => `- [${d.about}] ${d.text} → ${d.question ?? "—"} Options: ${d.options.map((o, k) => `(${k + 1}) ${o}`).join(" ")} · Recommended: ${d.recommended ?? "—"} — _${d.why ?? ""}_`).join("\n")}` : "",
      `**Placement:** ${p.placementRationale}`,
      `**Monitoring:** ${p.monitoring.measures.join(", ")}; review after ${p.monitoring.reviewAfterWeeks} wk`,
      `**Adjustments:**\n${p.adjustments.map((a) => `- ${a.signal} (${a.afterWeeks} wk) → ${a.direction} ${a.what}: ${a.change}`).join("\n") || "—"}`,
      `**Assumptions:** ${p.assumptions.join(" · ") || "—"}`,
      `**Uncertainties:**\n${p.uncertainties.map((u) => `- ${u.about}: ${u.impact}`).join("\n") || "—"}`,
      `**Coach questions:**\n${p.coachQuestions.map((q) => `- ${q.question} — _${q.why}_`).join("\n") || "—"}`,
      `**Decisions:**\n${p.decisions.map((d) => `- [${d.topic}] ${d.decision} — ${d.because} (coach: ${d.coachRuleKeys.join(", ") || "—"}; client: ${d.clientFactRefs.join(", ") || "—"}; evidence: ${d.knowledgeRefs.join(", ") || "—"})`).join("\n")}`,
      `**OPTIM review:** ${r.review.workload.statement}${r.review.withheld.length ? ` Withheld: ${r.review.withheld.map((w) => `${w.modality} (${w.why})`).join("; ")}.` : ""}${r.review.quality.length ? `\nQuality flags: ${r.review.quality.map((q) => `${q.code}: ${q.message}`).join(" | ")}` : ""}${r.review.questions.length ? `\nOPTIM questions: ${r.review.questions.join(" | ")}` : ""}`,
    ].filter(Boolean).join("\n\n");
  });
  writeFileSync(pack, [`# Cardio Reasoner V1.2 — review pack`, `Generated ${new Date().toISOString().slice(0, 10)} · ${live ? "live model (production model, medium effort)" : "scripted model (rails only — not for coaching review)"}.`, ...pages].join("\n\n"));
}
if (failures || stopped) process.exit(1);
