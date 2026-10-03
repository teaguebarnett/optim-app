// Gate 4.0C-3A — repeatability metrics for runs with IDENTICAL normalized
// inputs. Different valid coaching expression is acceptable; a different
// interpretation of core coach/client truth is not. Metrics separate the
// two: "core" agreement (domain, emphasis, frequency, split, constraints,
// coach rules) vs "expression" variation (exercise overlap, purposes,
// volume distribution, progression pattern).

import type { FitnessKnowledgeRegistry } from "../../knowledge/types.ts";
import type { ReasonerResult } from "../reasoner.ts";

export interface VarianceReport {
  runs: number;
  statuses: Record<string, number>;
  hardRuleViolations: number;
  sameInputHash: boolean;
  core: {
    domain: string[];
    emphasis: string[];
    frequency: { values: number[]; distinct: number; range: number };
    split: string[];
    deloadWeeks: string[];
    durationWeeks: number[];
    coreAgreement: boolean;
  };
  expression: {
    exerciseOverlapMeanJaccard: number;
    mainLiftOverlapMeanJaccard: number;
    sessionSignatureAgreement: number;
    volumeCvMajorMuscles: number;
    repZonePatterns: string[];
    warningsPerRun: number[];
  };
  unexplainedVariation: string[];
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni ? inter / uni : 1;
};
const meanPairwise = (sets: Set<string>[]) => {
  const vals: number[] = [];
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) vals.push(jaccard(sets[i], sets[j]));
  return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : 1;
};
const distinct = <T>(xs: T[]) => [...new Set(xs.map((x) => JSON.stringify(x)))].map((x) => JSON.parse(x) as T);

export function varianceReport(results: ReasonerResult[], knowledge: FitnessKnowledgeRegistry): VarianceReport {
  const statuses: Record<string, number> = {};
  for (const r of results) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  const planned = results.filter((r): r is Extract<ReasonerResult, { status: "PLANNED" }> => r.status === "PLANNED");
  const plans = planned.map((r) => r.plan);
  const freq = plans.map((p) => p.frequency.daysPerWeek);
  const exSets = plans.map((p) => new Set(p.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))));
  const mainSets = plans.map((p) => new Set(p.sessions.flatMap((s) => s.exercises.filter((e) => e.role === "main").map((e) => e.exerciseId))));
  // Session signature: per session, the sorted set of main movement families trained.
  const family = (id: string) => knowledge.getExercise(id)?.patterns[0] ?? "?";
  const signature = (p: (typeof plans)[number]) => p.sessions.map((s) => [...new Set(s.exercises.map((e) => family(e.exerciseId)))].sort().join("+")).sort().join(" | ");
  const sigs = plans.map(signature);
  const modeSig = [...sigs].sort((a, b) => sigs.filter((x) => x === b).length - sigs.filter((x) => x === a).length)[0];
  const sigAgreement = sigs.length ? Math.round((sigs.filter((s) => s === modeSig).length / sigs.length) * 100) / 100 : 1;
  const majors = ["chest", "lats", "mid_back", "side_delts", "biceps", "triceps", "quadriceps", "hamstrings", "glutes", "calves"];
  const cvs: number[] = [];
  for (const m of majors) {
    const v = planned.map((r) => r.spec.resistance?.value.weeklyMuscleSets[m]?.direct ?? 0);
    const mean = v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
    if (mean === 0) continue;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, v.length));
    cvs.push(sd / mean);
  }
  const core = {
    domain: distinct(plans.map((p) => p.domain)),
    emphasis: distinct(plans.map((p) => `${p.goalEmphasis.primary}${p.goalEmphasis.secondary ? `+${p.goalEmphasis.secondary}` : ""}`)),
    frequency: { values: freq, distinct: new Set(freq).size, range: freq.length ? Math.max(...freq) - Math.min(...freq) : 0 },
    split: distinct(plans.map((p) => p.architecture.split)),
    deloadWeeks: distinct(plans.map((p) => p.progression.deloadWeeks.join(",") || "none")),
    durationWeeks: distinct(plans.map((p) => p.durationWeeks)),
    coreAgreement: false,
  };
  core.coreAgreement = core.domain.length <= 1 && core.emphasis.length <= 1 && core.frequency.range <= 1 && core.deloadWeeks.length <= 1;
  const unexplained: string[] = [];
  if (core.emphasis.length > 1) unexplained.push(`goal emphasis differs across runs: ${core.emphasis.join(" / ")}`);
  if (core.frequency.range > 1) unexplained.push(`frequency varies by more than one day: ${freq.join(", ")}`);
  if (core.domain.length > 1) unexplained.push(`domain differs: ${core.domain.join(" / ")}`);
  if (core.deloadWeeks.length > 1) unexplained.push(`deload interpretation differs: ${core.deloadWeeks.join(" / ")}`);
  if (results.some((r) => r.status !== results[0].status)) unexplained.push(`status differs: ${JSON.stringify(statuses)}`);
  return {
    runs: results.length,
    statuses,
    hardRuleViolations: results.filter((r) => r.status === "REJECTED").length,
    sameInputHash: new Set(results.map((r) => r.run.hashes.input)).size <= 1,
    core,
    expression: {
      exerciseOverlapMeanJaccard: meanPairwise(exSets),
      mainLiftOverlapMeanJaccard: meanPairwise(mainSets),
      sessionSignatureAgreement: sigAgreement,
      volumeCvMajorMuscles: cvs.length ? Math.round((cvs.reduce((s, x) => s + x, 0) / cvs.length) * 100) / 100 : 0,
      repZonePatterns: distinct(plans.map((p) => p.progression.repZones.join(">"))),
      warningsPerRun: planned.map((r) => r.quality.filter((q) => q.severity === "warning").length),
    },
    unexplainedVariation: unexplained,
  };
}
