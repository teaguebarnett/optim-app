// Gate 4.0C-2A — a plain, serializable view of a resistance planner run
// for the coach review surface (names resolved, no internal ids where a
// label exists). Read-only: nothing here publishes or persists.

import type { FitnessKnowledgeRegistry } from "../../knowledge/types.ts";
import type { PlannerRun } from "../../planner.ts";
import { ALL_CALIBRATION_ITEMS } from "../../../coach/calibration/questions.ts";
import { explainResistancePlan, type PlanExplanation } from "./explain.ts";

export interface PlannerReviewView {
  status: "NEEDS_INPUT" | "INVALID" | "PLANNED";
  missing?: Array<{ fact: string; why: string; blockedDecision: string; providedBy: string }>;
  errors?: string[];
  plan?: {
    frequency: number;
    split: string;
    weeks: number;
    emphasis: string;
    sessions: Array<{
      day: string;
      purpose: string;
      minutes: number;
      exercises: Array<{ name: string; role: string; week1: string; week2: string; repeatedReason?: string }>;
    }>;
    weekNotes: string[];
    weeklyDirectSets: Array<{ muscle: string; sets: number }>;
    progression: string;
    recovery: string;
    constraintsApplied: string[];
    warnings: string[];
    info: string[];
    why: PlanExplanation;
    inputs: { coachBrain: string; knowledge: string; planner: string; clientInputs: string[]; rules: string[] };
  };
}

const human = (s: string) => s.replace(/_/g, " ");

/** Coach-facing name for a constraint id (`<client>:<kind>[:<detail>]`) — no internal ids on screen. */
const CONSTRAINT_LABEL: Record<string, string> = {
  availability: "Available days",
  session_length: "Session length",
  equipment: "Equipment",
  client_reported_limitation: "Client-reported limitation",
  client_restriction_terms: "Client's own restriction words",
  coach_documented_limitation: "Your documented limitation",
  medical_review: "Health screen",
};
function constraintLabel(id: string): string {
  const [, kind, detail] = id.split(":");
  if (kind === "coach_structured") return detail === "health_review" ? "Your confirmed restrictions" : "Your structured restriction";
  return CONSTRAINT_LABEL[kind] ?? human(kind ?? id);
}
/** Replaces constraint ids and snake_case muscle ids inside generated sentences. */
const readable = (text: string) => text.replace(/[0-9a-f-]{8,}:[a-z_]+(?::[a-z_]+)?/gi, (m) => constraintLabel(m)).replace(/\b([a-z]+)_([a-z_]+)\b/g, (m) => human(m));

const SETTING_LABEL = new Map(ALL_CALIBRATION_ITEMS.map((q) => [q.id, q.summaryLabel]));
/** "t_sets.exceptions.main" → "Working sets per exercise (main lifts)". */
function settingLabel(key: string): string {
  const [root, , detail] = key.split(".");
  const base = SETTING_LABEL.get(root) ?? human(root);
  const qualifier = key.includes(".exceptions.") && detail ? ` (${detail === "main" ? "main lifts" : detail === "accessory" ? "accessories" : `${human(detail)}`})` : key.endsWith(".varies") ? " (varies by phase)" : "";
  return base + qualifier;
}

export function plannerReviewView(run: PlannerRun, knowledge: FitnessKnowledgeRegistry): PlannerReviewView {
  if (run.status === "NEEDS_INPUT") return { status: run.status, missing: run.missing.map((m) => ({ fact: m.fact, why: m.why, blockedDecision: m.blockedDecision, providedBy: m.providedBy })) };
  if (run.status === "INVALID") return { status: run.status, errors: run.errors };
  const s = run.spec;
  const r = s.resistance!.value;
  const fmt = (p: { sets: number; reps: { min: number; max: number }; effort: { metric: string; target: number | string } }) =>
    `${p.sets}×${p.reps.min === p.reps.max ? p.reps.min : `${p.reps.min}–${p.reps.max}`} @ ${p.effort.metric.toUpperCase()} ${p.effort.target}`;
  return {
    status: "PLANNED",
    plan: {
      frequency: s.frequency.value,
      split: human(s.weeklyStructure.value.name),
      weeks: s.durationWeeks!.value,
      emphasis: `${r.emphasis.primary}${r.emphasis.secondary ? ` + ${r.emphasis.secondary}` : ""}`,
      sessions: r.sessions.map((sess, si) => ({
        day: sess.day,
        purpose: sess.purpose,
        minutes: sess.estimatedMinutes,
        exercises: sess.exercises.map((x, xi) => ({
          name: knowledge.getExercise(x.exerciseId)?.name ?? x.exerciseId,
          role: x.role,
          week1: fmt(r.weeks[0].sessions[si][xi]),
          week2: r.weeks[1] ? fmt(r.weeks[1].sessions[si][xi]) : "—",
          ...(x.selection.repeatedReason ? { repeatedReason: readable(x.selection.repeatedReason.replace(/exercise\.[a-z0-9_]+/g, (id) => knowledge.getExercise(id)?.name ?? id)) } : {}),
        })),
      })),
      weekNotes: r.weeks.map((w) => `Week ${w.week}${w.kind === "deload" ? " (deload)" : ""}: ${readable(w.note)}`),
      weeklyDirectSets: Object.entries(r.weeklyMuscleSets)
        .filter(([, v]) => v.direct > 0)
        .map(([m, v]) => ({ muscle: human(m), sets: v.direct }))
        .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle)),
      progression: readable(`${s.progression!.rationale} ${s.progression!.value.rule}`),
      recovery: s.recovery!.rationale,
      constraintsApplied: s.constraintsApplied.map((c) => `${constraintLabel(c.constraintId)}: ${readable(c.how.replace(/exercise\.[a-z0-9_]+/g, (id) => knowledge.getExercise(id)?.name ?? id))}`),
      warnings: (s.quality ?? []).filter((q) => q.severity === "warning").map((q) => readable(q.message)),
      info: (s.quality ?? []).filter((q) => q.severity === "info").map((q) => readable(q.message.replace(/exercise\.[a-z0-9_]+/g, (id) => knowledge.getExercise(id)?.name ?? id))),
      why: (() => {
        const w = explainResistancePlan(s, knowledge);
        return { ...w, coachRules: [...new Set(w.coachRules.map(settingLabel))], constraints: w.constraints.map(readable) };
      })(),
      inputs: {
        coachBrain: s.provenance.coachBrain ? `method v${s.provenance.coachBrain.version}` : "none",
        knowledge: `Fitness Knowledge ${s.provenance.knowledge.version} (${s.provenance.knowledge.entries.length} entries)`,
        planner: `${s.provenance.planner.id} ${s.provenance.planner.version}`,
        // "onboarding.your_week.availableDays" → "Available days"
        clientInputs: s.provenance.clientInputs.map((ref) => {
          const key = ref.split(".").pop() ?? ref;
          const words = key.replace(/([A-Z])/g, " $1").toLowerCase().trim();
          return words.charAt(0).toUpperCase() + words.slice(1);
        }),
        rules: s.provenance.rules,
      },
    },
  };
}
