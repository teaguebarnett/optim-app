// Cardio Reasoner V1 — evaluation runner. OFFLINE ONLY in this gate: every scenario runs against the scripted model
// (rails, routing, safety and workload accounting — not coaching quality). A capped live run reuses the shared
// ledger (../../eval/live-model.ts) and is deliberately not wired here until it is authorized.
//
//   node --experimental-strip-types lib/synthesis/reasoner/cardio/eval/run-eval.mts [--json <path>]

import { writeFileSync } from "node:fs";
import { CARDIO_SCENARIOS, scenarioHard } from "./scenarios.ts";
import { fakeModel, NOW, scriptedCardio } from "./fixtures.ts";
import { runCardioReasoner } from "../reasoner.ts";

if (process.argv.includes("--live")) {
  console.error("Live evaluation isn't enabled for Cardio Reasoner V1 yet (no paid calls in this gate).");
  process.exit(2);
}
const jsonAt = process.argv.indexOf("--json");
const rows: Array<Record<string, unknown>> = [];
let hardFailures = 0;
console.log("\nCardio Reasoner V1 — offline evaluation (scripted model)\n");
for (const s of CARDIO_SCENARIOS) {
  const m = fakeModel((ri) => scriptedCardio(ri as never));
  const input = s.input();
  const r = await runCardioReasoner({ input, model: m, nowIso: NOW, resistance: s.resistance ?? null, runId: s.id });
  const hard = scenarioHard(s, r, input);
  hardFailures += hard.length ? 1 : 0;
  const detail = r.status === "PLANNED" ? r.review.workload.statement : r.status === "NEEDS_INPUT" ? `needs ${r.missing.map((x) => x.fact).join(", ")}` : r.status === "ESCALATE" ? r.escalations.map((e) => e.code).join(", ") : r.status === "REJECTED" ? r.errors.join(" | ") : "message" in r ? r.message : "";
  console.log(`${hard.length ? "FAIL" : " ok "}  ${s.id.padEnd(5)} ${r.status.padEnd(15)} calls=${m.calls}  ${s.title}`);
  console.log(`              ${detail}`);
  if (hard.length) console.log(`              HARD: ${hard.join("; ")}`);
  rows.push({ id: s.id, category: s.category, title: s.title, status: r.status, expected: s.expected, calls: m.calls, hard, detail, ...(r.status === "PLANNED" ? { workload: r.review.workload, withheld: r.review.withheld, quality: r.review.quality } : {}) });
}
console.log(`\n${CARDIO_SCENARIOS.length - hardFailures}/${CARDIO_SCENARIOS.length} scenarios meet their hard invariants (scripted model; quality checks are for the live run).\n`);
if (jsonAt > 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify({ generatedAt: new Date().toISOString(), mode: "offline_scripted", rows }, null, 2));
if (hardFailures) process.exit(1);
