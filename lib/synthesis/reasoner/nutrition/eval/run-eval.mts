// Nutrition Reasoner V1 — evaluation runner.
//
//   (default)               offline, scripted model — rails only, not coaching quality
//   --live                  real model via ANTHROPIC_API_KEY (never printed), production effort (medium)
//   --ledger <file>         required with --live: executed-call ledger (shared format with the resistance eval)
//   --max-calls <n>         hard cap on executed live calls (default 12)
//   --max-usd <n>           hard cap on estimated spend at published prices (required with --live)
//   --max-attempts <n>      model attempts per scenario (default 2; 1 = no repair calls)
//   --only N01,N02          scenario subset
//   --out <file>            JSON report (results, runs, quality)
//   --pack <file>           Markdown review pack for a qualified coach (representative plans)

import { writeFileSync } from "node:fs";
import { runNutritionReasoner, type NutritionReasonerResult } from "../reasoner.ts";
import { createLedger } from "../../eval/live-model.ts";
import { food } from "../../../knowledge/nutrition/foods.ts";
import { fakeModel, NOW, scriptedNutrition } from "./fixtures.ts";
import { NUTRITION_SCENARIOS, type NutritionScenario } from "./scenarios.ts";

const args = process.argv.slice(2);
const arg = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const live = args.includes("--live");
const ledgerPath = arg("--ledger");
const maxCalls = Number(arg("--max-calls") ?? 12);
const only = arg("--only") ? new Set(arg("--only")!.split(",")) : null;
const maxUsd = arg("--max-usd") ? Number(arg("--max-usd")) : null;
const maxAttempts = Number(arg("--max-attempts") ?? 2);
if (live && !ledgerPath) throw new Error("--live requires --ledger <file> so live calls are metered.");
if (live && !(maxUsd && maxUsd > 0)) throw new Error("--live requires --max-usd <dollars> so spend is capped.");
// Input estimate for the worst-case guard: measured with count_tokens on the largest scenario input (~7.4k tokens).
const meter = live ? createLedger(ledgerPath!, maxCalls, { maxUsd: maxUsd!, inputTokensEstimate: 7400 }) : null;

const selected = NUTRITION_SCENARIOS.filter((s) => !only || only.has(s.id));
if (live) {
  const need = selected.filter((s) => s.expectsModel).length;
  const used = meter!.read().calls;
  console.log(`Live budget: ${used}/${maxCalls} used; this run needs up to ${need} calls (+1 per repair).`);
  if (used + need > maxCalls) {
    console.log(`STOP: would exceed the ${maxCalls}-call cap. Reduce scope or get approval.`);
    process.exit(2);
  }
}
console.log(`\nNutrition Reasoner V1 — evaluation (${live ? "LIVE, medium effort" : "offline, scripted model"}; ${selected.length} scenarios)\n`);

interface Row { s: NutritionScenario; r: NutritionReasonerResult; hard: string[]; quality: Array<{ check: string; pass: boolean }>; ms: number }
const rows: Row[] = [];
for (const s of selected) {
  if (live && s.expectsModel && meter!.read().calls >= maxCalls) {
    console.log(`${s.id} skipped — call cap reached.`);
    continue;
  }
  const i = s.input();
  const model = !s.expectsModel ? fakeModel((ri) => scriptedNutrition(ri as never)) : live ? await meter!.liveModel(s.id, { effort: "medium" }) : fakeModel((ri) => scriptedNutrition(ri as never));
  const t = Date.now();
  const r = await runNutritionReasoner({ input: i, model, nowIso: NOW, training: s.training ?? null, runId: `eval-${s.id}`, maxAttempts });
  const hard = [...(s.expected.includes(r.status) ? [] : [`status ${r.status}, expected ${s.expected.join("/")}`]), ...(s.hard?.(r, i) ?? [])];
  const quality = r.status === "PLANNED" ? (s.quality?.(r, i) ?? []) : [];
  rows.push({ s, r, hard, quality, ms: Date.now() - t });
  const tok = `${r.run.totals.inputTokens}/${r.run.totals.outputTokens} tok`;
  console.log(`${s.id} ${s.title}\n   ${r.status} · ${r.run.totals.calls} call(s) · ${tok} · ${(r.run.totals.latencyMs / 1000).toFixed(1)} s model time${hard.length ? `\n   HARD FAIL: ${hard.join("; ")}` : ""}${r.status === "REJECTED" ? `\n   errors: ${r.errors.join(" | ").slice(0, 600)}` : ""}${quality.length ? `\n   quality: ${quality.map((q) => `${q.pass ? "✓" : "✗"} ${q.check}`).join(" · ")}` : ""}`);
}

const hardFails = rows.filter((x) => x.hard.length);
const q = rows.flatMap((x) => x.quality);
console.log(`\n${rows.length - hardFails.length}/${rows.length} scenarios met every hard check.`);
if (q.length) console.log(`Quality checks: ${q.filter((x) => x.pass).length}/${q.length} passed (signals for review — not pass/fail).`);
if (live) {
  const l = meter!.read();
  console.log(`Ledger: ${l.calls}/${maxCalls} executed calls · ${l.inputTokens} in / ${l.outputTokens} out tokens · ${(l.latencyMs / 1000).toFixed(0)} s model time · ≈$${(l.usd ?? 0).toFixed(2)} of $${maxUsd} cap`);
}
const out = arg("--out");
if (out) writeFileSync(out, JSON.stringify({ generatedAtIso: new Date().toISOString(), live, rows: rows.map((x) => ({ scenario: x.s.id, title: x.s.title, status: x.r.status, hard: x.hard, quality: x.quality, run: x.r.run })) }, null, 1));

const pack = arg("--pack");
if (pack) {
  const name = (id: string) => food(id)?.name ?? id;
  const range = (g: { min: number; max: number } | null, u: string) => (g ? `${g.min}–${g.max} ${u}` : "—");
  const pages = rows.map(({ s, r }) => {
    const head = `## ${s.id} — ${s.title}\n\nStatus: **${r.status}**`;
    if (r.status === "ESCALATE") return `${head}\n\n${r.escalations.map((e) => `- ${e.why}`).join("\n")}`;
    if (r.status === "NEEDS_INPUT") return `${head}\n\n${r.missing.map((m) => `- ${m.fact}: ${m.why}`).join("\n")}`;
    if (r.status !== "PLANNED" && r.status !== "NEEDS_COACH_REVIEW") return `${head}\n\n${r.status === "REJECTED" ? r.errors.join("\n") : "message" in r ? r.message : ""}`;
    const p = r.plan;
    const routed = r.status === "NEEDS_COACH_REVIEW" ? [`**NOT A PRESCRIPTION — routed to qualified human review.** Restrictive items OPTIM won't prescribe for a client under 18:\n${r.restrictions.map((x) => `- ${x}`).join("\n")}`] : [];
    return [
      head,
      ...routed,
      `**Objective:** ${p.objective.summary} — ${p.objective.rationale}`,
      `**Approach:** ${p.approach.id} — ${p.approach.rationale}`,
      `**Energy:** ${p.energy.mode}${p.energy.kcal ? ` ${range(p.energy.kcal, "kcal")}` : ""}${p.energy.rate ? ` · stated rate ${p.energy.rate.min} to ${p.energy.rate.max}%/wk` : ""} — ${p.energy.rationale}${r.run.energy ? ` _(OPTIM: maintenance ${r.run.energy.maintenanceKcal.low}–${r.run.energy.maintenanceKcal.high}, band ${r.run.energy.targetBand?.low}–${r.run.energy.targetBand?.high}${r.run.energy.sessionKcal ? `, session ${r.run.energy.sessionKcal.low}–${r.run.energy.sessionKcal.high} kcal above rest` : ""})_` : ""}`,
      ...(r.review.rate ? [`**OPTIM rate estimate:** ${r.review.rate.statement}`] : []),
      ...(p.dayVariation ? [`**Training vs rest days:** ${p.dayVariation.strategy}${p.dayVariation.trainingDayKcal ? ` — training ${range(p.dayVariation.trainingDayKcal, "kcal")}, rest ${range(p.dayVariation.restDayKcal, "kcal")}` : ""}${p.dayVariation.note ? ` — ${p.dayVariation.note}` : ""}`] : []),
      `**Protein:** ${range(p.protein.grams, "g")} — ${p.protein.rationale}  \n**Carbohydrate:** ${range(p.carbohydrate.grams, "g")} — ${p.carbohydrate.rationale}  \n**Fat:** ${range(p.fat.grams, "g")} — ${p.fat.rationale}`,
      `**Meals (${p.meals.perDay}/day):** ${p.meals.rationale}\n${p.meals.slots.map((m) => `- ${m.name} (${m.timing}) — _${m.intent}_ · ${m.foods.map(name).join(", ")}`).join("\n")}`,
      `**Training:** before — ${p.training.before}; after — ${p.training.after}${p.training.during ? `; during — ${p.training.during}` : ""}`,
      `**Substitutions:** ${p.foods.substitutions.map((x) => `${name(x.for)} → ${x.use.map(name).join(" / ")} (${x.why})`).join("; ") || "—"}`,
      `**Habits:** ${p.habits.join(" · ") || "—"}  \n**Hydration:** ${p.hydration}  \n**Supplements:** ${p.supplements.map((x) => `${x.name} (${x.why})`).join("; ") || "none"}`,
      `**Monitoring:** ${p.monitoring.measures.join(", ")} — ${p.monitoring.cadence}; review after ${p.monitoring.reviewAfterWeeks} week(s)`,
      `**Adjustments (OPTIM's reading of the structure, then the model's explanation):**\n${p.adjustments.map((a, k) => `- ${r.review.adjustments[k]} — _${a.change}_`).join("\n") || "—"}`,
      `**Uncertainties:** ${p.uncertainties.map((u) => `${u.about} (${u.impact})`).join("; ") || "—"}  \n**Coach questions:** ${[...p.coachQuestions.map((x) => x.question), ...r.review.questions].join(" · ") || "—"}`,
      `**OPTIM review items:** ${[...r.review.screening, ...r.review.warnings, ...r.review.quality.map((x) => x.message)].join(" · ")}`,
      `**Key decisions:**\n${p.decisions.map((d) => `- [${d.topic}] ${d.decision} — ${d.because}`).join("\n")}`,
    ].join("\n\n");
  });
  writeFileSync(pack, [`# Nutrition Reasoner V1 — coaching review pack`, `Generated ${new Date().toISOString().slice(0, 10)} · ${live ? "live model (production model, medium effort)" : "scripted model (rails only — not for coaching review)"}. A qualified coach should judge each plan; the AI does not score itself.`, ...pages].join("\n\n"));
}
if (hardFails.length) process.exit(1);
