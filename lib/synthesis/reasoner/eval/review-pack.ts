// Gate 4.0C-3A — concise human review pages for reasoner outputs, plus the
// rubric a coach fills in. The AI never scores itself here: the pack shows
// the plan and its provenance; a human judges it.

import type { FitnessKnowledgeRegistry } from "../../knowledge/types.ts";
import type { ReasonerResult } from "../reasoner.ts";
import type { Finding } from "./taxonomy.ts";

export const RUBRIC = [
  "Would an excellent coach intentionally design this weekly structure?",
  "Does the plan clearly reflect the stated goal?",
  "Does it reflect the coach's actual methodology?",
  "Does it fit the client's real life?",
  "Is exercise selection coherent?",
  "Are prescriptions coherent?",
  "Is progression coherent?",
  "Is unnecessary complexity minimized?",
  "Are important gaps surfaced honestly?",
  "Would the coach confidently send this after review?",
] as const;

/** One review record per output — a reviewer fills score (1–5) and notes; failure categories optional. */
export function rubricTemplate(id: string) {
  return { id, reviewer: "", reviewedAtIso: "", scores: Object.fromEntries(RUBRIC.map((q, i) => [`q${i + 1}`, { question: q, score: null as number | null, notes: "" }])), failureCategories: [] as string[], wouldSend: null as boolean | null, overallNotes: "" };
}

const fmtRange = (r: { min: number; max: number } | null, unit = "") => (r ? (r.min === r.max ? `${r.min}${unit}` : `${r.min}–${r.max}${unit}`) : "—");

export function reviewPage(params: { id: string; title: string; result: ReasonerResult; knowledge: FitnessKnowledgeRegistry; findings: Finding[] }): string {
  const { result: r, knowledge: K } = params;
  const lines: string[] = [`## ${params.id}. ${params.title}`, "", `**Status:** ${r.status}${r.status === "PLANNED" ? ` · attempts ${r.attempts} · ${r.run.totals.inputTokens} in / ${r.run.totals.outputTokens} out tokens · ${(r.run.totals.latencyMs / 1000).toFixed(0)} s` : ""}`, ""];
  const input = r.run.input;
  if (input) {
    lines.push("**Client**", "");
    const f = input.client.facts;
    const pick = (k: string) => Object.entries(f).find(([ref]) => ref.endsWith(k))?.[1];
    lines.push(`- Goal: ${input.goal.primary}${input.goal.secondary.length ? ` (+ ${input.goal.secondary.join(", ")})` : ""}${input.goal.success ? ` — “${input.goal.success}”` : ""}`);
    lines.push(`- Experience ${String(pick("trainingExperience") ?? "—")}, trains ${String(pick("weeklyFrequency") ?? "—")}×/wk now, available ${input.bounds.available.join(", ") || "—"}, ${input.bounds.minutes ?? "—"} min/session`);
    if (pick("trainingNotes")) lines.push(`- Notes: “${String(pick("trainingNotes"))}”`);
    lines.push(`- Equipment: ${input.equipment.available.join(", ")}; apparatus known: ${input.equipment.apparatus.join(", ") || "none"}`);
    lines.push("", "**Coach method (rules that matter)**", "");
    for (const [, label, value] of input.coach.rules) lines.push(`- ${label}: ${Array.isArray(value) ? value.join(value.length === 2 && typeof value[0] === "number" ? "–" : ", ") : String(value)}`);
    lines.push("", "**Constraints enforced**", "");
    if (!input.constraints.length) lines.push("- (none beyond availability, session length and equipment)");
    for (const c of input.constraints) lines.push(`- ${c.rules.join("; ")}`);
  }
  if (r.status === "PLANNED") {
    const p = r.plan;
    lines.push("", "**Plan**", "", `- ${p.frequency.daysPerWeek} days/week · ${p.architecture.name} (${p.architecture.split}) · ${p.durationWeeks} weeks · ${p.goalEmphasis.primary}${p.goalEmphasis.secondary ? ` + ${p.goalEmphasis.secondary}` : ""}`, "");
    lines.push("| Day | Session | Purpose | Exercises (sets × reps @ RIR, rest) |", "|---|---|---|---|");
    for (const s of p.sessions) {
      const ex = s.exercises
        .map((e) => {
          const name = K.getExercise(e.exerciseId)?.name ?? e.exerciseId;
          const sp = r.spec.resistance?.value.weeks[0]?.sessions[p.sessions.indexOf(s)]?.[s.exercises.indexOf(e)];
          const rest = sp?.restMinutes ? `${fmtRange({ min: Math.round(sp.restMinutes.min * 60), max: Math.round(sp.restMinutes.max * 60) })}s` : "";
          // The exercise's own effort RANGE (Gate 4.0C-3B: a single hard-end number hid deliberate ranges).
          const effort = e.rir ? (sp?.effort.metric === "rpe" ? ` @ RPE ${fmtRange({ min: 10 - e.rir.max, max: 10 - e.rir.min })}` : ` @ RIR ${fmtRange(e.rir)}`) : sp && sp.effort.metric !== "plain" ? ` @ ${sp.effort.metric.toUpperCase()} ${sp.effort.target}` : "";
          return `${e.role === "main" ? "**" : ""}${name}${e.role === "main" ? "**" : ""} ${e.sets}×${fmtRange(e.reps)}${effort}${rest ? `, ${rest}` : ""}${e.note ? ` _(${e.note})_` : ""}`;
        })
        .join("<br>");
      lines.push(`| ${s.day.slice(0, 3)} | ${s.title} | ${s.purpose} | ${ex} |`);
    }
    if (p.goalAccess.length) lines.splice(lines.indexOf("**Plan**") + 1, 0, "", "**Goal access**", "", ...p.goalAccess.map((g) => `- ${g.target}: ${K.getExercise(g.exerciseId)?.name ?? g.exerciseId} — ${g.status === "blocked" ? `**direct work blocked** (${g.blockedBy}). Interim: ${g.interim ?? "—"} Coach review required before direct progression resumes.` : "trained directly."}`));
    if (input?.anchors) lines.push("", `- Anchors: ${input.anchors.days.value} days (${input.anchors.days.basis})${input.anchors.weeks ? `; ${input.anchors.weeks.value} weeks (${input.anchors.weeks.basis})` : ""}${p.deviations.length ? ` · **Deviations:** ${p.deviations.map((d) => `${d.field}: ${d.because}`).join("; ")}` : " · no deviations"}`);
    lines.push("", `- Progression: ${p.progression.model} — ${p.progression.rationale}${p.progression.deloadWeeks.length ? ` (deload weeks ${p.progression.deloadWeeks.join(", ")})` : ""}`);
    // Gate 4.0C-3C — phases rendered from the computed weeks (OPTIM's week notes), never from free prose alone.
    const weeks = r.spec.resistance?.value.weeks ?? [];
    for (const ph of p.progression.phases) lines.push(`  - Weeks ${fmtRange(ph.weeks)} — **${ph.focus}** (${ph.intent}): ${weeks.filter((w) => w.week >= ph.weeks.min && w.week <= ph.weeks.max).map((w) => `w${w.week} ${w.note.replace(`${ph.focus}. `, "")}`).join(" · ")}`);
    // What the phases actually do to each session's first two exercises (computed weeks, first week of each phase).
    const firsts = p.progression.phases.map((ph) => weeks.find((w) => w.week === ph.weeks.min)).filter((w): w is NonNullable<typeof w> => !!w);
    if (firsts.length) {
      lines.push("", "_Computed prescription at the start of each phase (effort shown at its hardest end that week):_", "", `| Exercise (session) | ${firsts.map((w) => `Week ${w.week}`).join(" | ")} |`, `|---|${firsts.map(() => "---").join("|")}|`);
      p.sessions.forEach((s, si) => s.exercises.slice(0, 2).forEach((e, xi) => {
        const cell = (w: (typeof firsts)[number]) => {
          const x = w.sessions[si]?.[xi];
          return x ? `${x.sets}×${fmtRange(x.reps)}${x.effort.metric !== "plain" ? ` @ ${x.effort.metric.toUpperCase()} ${x.effort.target}` : ""}` : "—";
        };
        lines.push(`| ${K.getExercise(e.exerciseId)?.name ?? e.exerciseId} (${s.day.slice(0, 3)}) | ${firsts.map(cell).join(" | ")} |`);
      }));
    }
    lines.push("", "**Why (major decisions and their provenance)**", "");
    for (const d of p.decisions.slice(0, 8)) lines.push(`- **${d.decision}** — ${d.because} _[coach: ${d.coachRuleKeys.join(", ") || "—"}; client: ${d.clientFactRefs.map((x) => x.split(".").pop()).join(", ") || "—"}; evidence: ${d.knowledgeRefs.map((x) => x.split("#")[1]).join(", ") || "—"}]_`);
    lines.push("", "**Constraints applied**", "");
    for (const c of r.spec.constraintsApplied) lines.push(`- ${c.constraintId.split(":").slice(1).join(":") || c.constraintId}: ${c.how}`);
    const attention = [...p.conflicts.map((c) => `Tension with method (${c.coachRuleKey}): ${c.issue}`), ...p.assumptions.map((a) => `Assumption: ${a}`), ...p.unresolved.map((u) => `Open (${u.providedBy}): ${u.fact} — ${u.why}`), ...r.quality.filter((q) => q.severity === "warning").map((q) => `Validator warning: ${q.message}`)];
    lines.push("", "**Needs attention**", "", ...(attention.length ? attention.map((a) => `- ${a}`) : ["- nothing flagged"]));
  } else if (r.status === "NEEDS_INPUT") {
    lines.push("", "**Needs input**", "", ...r.missing.map((m) => `- ${m.fact} — ${m.why} (blocks: ${m.blockedDecision}; from: ${m.providedBy})`));
  } else if (r.status === "DOMAIN_NOT_YET_SUPPORTED") {
    lines.push("", `**Routing:** ${r.routing.primary} — ${r.message}`);
  } else if (r.status === "REJECTED") {
    lines.push("", "**Rejected by validators**", "", ...r.errors.map((e) => `- ${e}`));
  } else {
    lines.push("", `**Provider:** ${r.message}`);
  }
  if (params.findings.length) lines.push("", "**Failure taxonomy (machine-detected)**", "", ...params.findings.map((f) => `- ${f.category} → ${f.subsystem}: ${f.evidence}`));
  lines.push("", "_Human review: fill the matching record in `review-template.json` (scores 1–5 for the 10 rubric questions)._", "");
  return lines.join("\n");
}
