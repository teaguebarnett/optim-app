// Unified Program U1 — evaluation runner. OFFLINE ONLY in this gate (no paid calls): every scenario runs the full
// orchestration with the router model (each domain's own scripted model) and is judged as ONE program.
//
//   node --experimental-strip-types lib/synthesis/unified/eval/run-eval.mts [--pack <file.md>]

import { writeFileSync } from "node:fs";
import { cardioModality } from "../../knowledge/cardio/modalities.ts";
import { runUnifiedProgram } from "../orchestrate.ts";
import type { UnifiedProgramProposal } from "../contract.ts";
import { NOW, routerModel } from "./fixtures.ts";
import { UNIFIED_SCENARIOS, scenarioHard } from "./scenarios.ts";

if (process.argv.includes("--live")) {
  console.error("Live evaluation isn't enabled for Unified Program U1 (no paid calls in this gate).");
  process.exit(2);
}
const packAt = process.argv.indexOf("--pack");
const pages: string[] = [];
let failures = 0;
console.log("\nUnified Program Intelligence U1 — offline evaluation (router → scripted domain models)\n");
for (const s of UNIFIED_SCENARIOS) {
  const m = routerModel();
  const input = s.input();
  const u = await runUnifiedProgram({ input, model: m, nowIso: NOW, approvedResistance: s.approved ?? null, proceedWithoutResistance: s.proceedWithoutResistance, maxAttempts: 1, runId: `eval-${s.id}` });
  const hard = scenarioHard(s, u, input);
  const quality = s.quality?.(u) ?? [];
  failures += hard.length ? 1 : 0;
  console.log(`${hard.length ? "FAIL" : " ok "}  ${s.id.padEnd(5)} ${u.status.padEnd(21)} calls=${u.provenance.modelCalls}  ${s.title}`);
  console.log(`              ${Object.values(u.domains).map((d) => `${d.domain} ${d.status}`).join(" · ")}${u.decisions.length ? ` · decisions: ${u.decisions.map((d) => d.about).join(", ")}` : ""}`);
  if (hard.length) console.log(`              HARD: ${hard.join("; ")}`);
  if (quality.length) console.log(`              quality: ${quality.map((q) => `${q.pass ? "✓" : "✗"} ${q.check}`).join(" · ")}`);
  pages.push(page(s.id, s.title, u));
}
console.log(`\n${UNIFIED_SCENARIOS.length - failures}/${UNIFIED_SCENARIOS.length} programs meet their whole-program invariants (scripted domain models — rails and coordination, not coaching quality).\n`);
if (packAt > 0) writeFileSync(process.argv[packAt + 1], [`# Unified Program U1 — offline review pack`, `Scripted domain models (rails and coordination only — not for coaching review).`, ...pages].join("\n\n"));
if (failures) process.exit(1);

function page(id: string, title: string, u: UnifiedProgramProposal): string {
  const day = (d: UnifiedProgramProposal["week"][number]) => `| ${d.day}${d.available ? "" : " (unavailable)"} | ${d.resistance ? `${d.resistance.focus}${d.resistance.lowerBody ? " (legs)" : ""} ${d.resistance.minutes}′ [${d.resistance.source === "approved_program" ? "approved" : "proposed"}]` : "—"} | ${d.cardio ? `${cardioModality(d.cardio.modality)?.name ?? d.cardio.modality} ${d.cardio.minutes}′ ${d.cardio.intensity}${d.cardio.type === "intervals" ? " intervals" : ""} (${d.cardio.placement})` : "—"} | ${d.visits} | ${d.totalMinutes || "—"} |`;
  return [
    `## ${id} — ${title}`,
    `**Status:** ${u.status} · model calls ${u.provenance.modelCalls}`,
    `**Objective:** ${u.objective.summary}${Object.entries(u.objective.byDomain).map(([d, t]) => `\n- ${d}: ${t}`).join("")}`,
    `**Domains:** ${Object.values(u.domains).map((d) => `${d.domain} **${d.status}** — ${d.summary}${d.reasons.length ? ` (${d.reasons.join("; ").slice(0, 300)})` : ""}`).join("\n\n")}`,
    `| Day | Lifting | Cardio | Visits | Minutes |\n|---|---|---|---|---|\n${u.week.map(day).join("\n")}`,
    `**Workload:** ${u.workload.trainingDays} training / ${u.workload.restDays} rest days; lifting ${u.workload.resistanceMinutes} min over ${u.workload.resistanceDays} days; cardio ${u.workload.cardioMinutes.total} min (${u.workload.cardioMinutes.easy} easy, ${u.workload.cardioMinutes.moderate} moderate, ${u.workload.cardioMinutes.vigorous} vigorous), ${u.workload.hardCardioSessions} hard.`,
    `**Recovery:** ${u.recovery.limited ? "limited — " + u.recovery.signals.join(" ") : "no limiting signals"}${u.recovery.considerations.map((c) => `\n- ${c}`).join("")}`,
    u.progression.alignment.length ? `**Progression alignment:**\n${u.progression.alignment.map((a) => `- ${a}`).join("\n")}` : "",
    u.crossDomain.errors.length ? `**Cross-domain errors:**\n${u.crossDomain.errors.map((e) => `- ${e}`).join("\n")}` : "",
    u.crossDomain.findings.length ? `**Cross-domain findings:**\n${u.crossDomain.findings.map((f) => `- [${f.severity}] ${f.message}`).join("\n")}` : "",
    u.decisions.length ? `**Prepared decisions:**\n${u.decisions.map((d) => `- [${d.source}: ${d.about}] ${d.question} Options: ${d.options.map((o, k) => `(${k + 1}) ${o}`).join(" ")} · Recommended: ${d.recommended ?? "—"}`).join("\n")}` : "",
    u.uncertainties.length ? `**Uncertainties:**\n${u.uncertainties.map((x) => `- ${x}`).join("\n")}` : "",
    u.escalations.length ? `**Escalations:**\n${u.escalations.map((e) => `- [${e.source}] ${e.why}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}
