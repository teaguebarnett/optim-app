// Phase 5.5 — conversational program revision (spec Part 5).
//
// A real, deterministic instruction interpreter — not a live model call
// (see this repository's honest "no live provider yet" convention,
// activation-generation.ts's own module doc) — that recognizes concrete,
// real patterns from the coach's plain-language request and turns them into
// a structural change against the program's CURRENT-AND-FUTURE weeks only.
// Never touches a week the client has already started/completed (spec's
// "preserve unrelated prescriptions" + "never mutate historical completed
// workouts").

import { pickExercise } from "./activation-generation.ts";
import { EXERCISE_LIBRARY, findSubstitute, type EquipmentTag, type MovementPattern } from "./exercise-library.ts";
import type { ClientAssignedProgram, DayOfWeek, Exercise, ProgramWeek } from "../types";
import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

const DAY_NAME_PATTERN: Record<string, DayOfWeek> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export type RevisionPlanKind = "cap_session_length" | "substitute_exercise" | "reduce_week_fatigue" | "day_focus_shift" | "unrecognized";

export interface RevisionPlan {
  kind: RevisionPlanKind;
  /** Explicit week numbers mentioned in the instruction; empty means
   * "every current-and-future week." */
  targetWeeks: number[];
  targetDay?: DayOfWeek;
  capMinutes?: number;
  fromExerciseTerm?: string;
  focusPattern?: MovementPattern;
  summary: string;
}

function findMentionedWeek(instruction: string): number[] {
  const match = instruction.match(/week\s+(\d+)/i);
  return match ? [Number(match[1])] : [];
}

function findMentionedDay(instruction: string): DayOfWeek | undefined {
  const lower = instruction.toLowerCase();
  for (const [name, day] of Object.entries(DAY_NAME_PATTERN)) {
    if (lower.includes(name)) return day;
  }
  return undefined;
}

/**
 * Pure, deterministic interpretation — the same instruction always produces
 * the same plan. Recognizes the concrete patterns spec §5's own examples
 * use, plus reasonable keyword generalizations; anything else honestly
 * returns "unrecognized" rather than guessing at a structural change.
 */
export function interpretRevisionInstruction(instruction: string): RevisionPlan {
  const lower = instruction.toLowerCase();

  const minutesMatch = lower.match(/under\s+(\d+)\s*min|(\d+)\s*min(?:ute)?s?\s+(?:or less|cap|max)/);
  if (minutesMatch) {
    const capMinutes = Number(minutesMatch[1] ?? minutesMatch[2]);
    return { kind: "cap_session_length", targetWeeks: findMentionedWeek(instruction), capMinutes, summary: `Cap every session at ${capMinutes} minutes.` };
  }

  const replaceMatch = lower.match(/replace\s+([a-z\s]+?)\s+with|swap\s+(?:out\s+)?([a-z\s]+?)\s+for|(?:knee|shoulder|hip|back|wrist)[- ]tolerant alternative (?:to|for) ([a-z\s]+)/);
  if (replaceMatch) {
    const term = (replaceMatch[1] ?? replaceMatch[2] ?? replaceMatch[3] ?? "").trim();
    if (term) return { kind: "substitute_exercise", targetWeeks: findMentionedWeek(instruction), fromExerciseTerm: term, summary: `Replace ${term} with a safer/equivalent alternative.` };
  }

  if (/(reduce|less|lower).{0,20}(fatigue|volume|intensity)/.test(lower)) {
    const weeks = findMentionedWeek(instruction);
    return { kind: "reduce_week_fatigue", targetWeeks: weeks, summary: weeks.length > 0 ? `Reduce fatigue in week ${weeks[0]}.` : "Reduce fatigue in upcoming weeks." };
  }

  const day = findMentionedDay(instruction);
  if (day && /(lower[- ]body|upper[- ]body)/.test(lower)) {
    const focusPattern: MovementPattern = /lower[- ]body/.test(lower) ? "squat" : "push_horizontal";
    return { kind: "day_focus_shift", targetWeeks: findMentionedWeek(instruction), targetDay: day, focusPattern, summary: `Shift ${day} toward more ${/lower/.test(lower) ? "lower" : "upper"}-body emphasis.` };
  }

  return { kind: "unrecognized", targetWeeks: [], summary: "Couldn't confidently interpret this as a specific change — try naming a day, week, exercise, or a minute cap." };
}

// ---------------------------------------------------------------------------
// Applying a plan
// ---------------------------------------------------------------------------

export interface RevisionChange {
  weekNumber: number;
  dayOfWeek: DayOfWeek;
  field: string;
  before: string;
  after: string;
}

export interface ApplyRevisionResult {
  revisedProgram: ClientAssignedProgram;
  changes: RevisionChange[];
}

function weeksToTouch(program: ClientAssignedProgram, plan: RevisionPlan, currentWeekNumber: number): ProgramWeek["weekNumber"][] {
  if (plan.targetWeeks.length > 0) return plan.targetWeeks.filter((w) => w >= currentWeekNumber);
  return program.weeks.filter((w) => w.weekNumber >= currentWeekNumber).map((w) => w.weekNumber);
}

/**
 * Applies a plan to only the program's current-and-future weeks — every
 * week strictly before `currentWeekNumber` passes through completely
 * untouched (spec: "never rewrite completed or historical prescriptions").
 * Returns a real, concrete before/after change list — never a claim of
 * change with nothing actually different.
 */
export function applyProgramRevision(program: ClientAssignedProgram, plan: RevisionPlan, currentWeekNumber: number, equipment: EquipmentTag[]): ApplyRevisionResult {
  const touchWeeks = new Set(weeksToTouch(program, plan, currentWeekNumber));
  const changes: RevisionChange[] = [];

  const weeks = program.weeks.map((week) => {
    if (!touchWeeks.has(week.weekNumber)) return week;

    const days = week.days.map((day) => {
      if (day.type !== "training" || !day.workout) return day;
      if (plan.targetDay && day.dayOfWeek !== plan.targetDay) return day;

      let exercises = day.workout.exercises;

      if (plan.kind === "cap_session_length" && plan.capMinutes) {
        while (exercises.length > 1 && estimateDuration(exercises) > plan.capMinutes) {
          const dropped = exercises[exercises.length - 1];
          changes.push({ weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, field: "exercise removed", before: dropped.name, after: "(removed to fit session cap)" });
          exercises = exercises.slice(0, -1);
        }
      }

      if (plan.kind === "substitute_exercise" && plan.fromExerciseTerm) {
        exercises = exercises.map((ex) => {
          if (!ex.name.toLowerCase().includes(plan.fromExerciseTerm!)) return ex;
          const source = EXERCISE_LIBRARY.find((e) => e.name === ex.name);
          const substitute = source ? findSubstitute(source, equipment) : null;
          if (!substitute) return ex;
          changes.push({ weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, field: "exercise", before: ex.name, after: substitute.name });
          return { ...ex, id: `${ex.id}-revised`, name: substitute.name, cue: substitute.cue };
        });
      }

      if (plan.kind === "reduce_week_fatigue") {
        exercises = exercises.map((ex) => {
          const reducedSets = Math.max(1, Math.round(ex.workingSets * 0.8));
          const reducedRpe = Math.max(6, ex.targetRpe - 1) as typeof ex.targetRpe;
          if (reducedSets === ex.workingSets && reducedRpe === ex.targetRpe) return ex;
          changes.push({ weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, field: `${ex.name} volume/intensity`, before: `${ex.workingSets} sets @ RPE ${ex.targetRpe}`, after: `${reducedSets} sets @ RPE ${reducedRpe}` });
          return { ...ex, workingSets: reducedSets, targetRpe: reducedRpe };
        });
      }

      if (plan.kind === "day_focus_shift" && plan.focusPattern) {
        const isolationIndex = exercises.findIndex((ex) => EXERCISE_LIBRARY.find((e) => e.name === ex.name)?.pattern === "isolation");
        if (isolationIndex !== -1) {
          const replacement = pickExercise(plan.focusPattern, equipment, [], new Set(exercises.map((e) => e.name)));
          if (replacement) {
            const before = exercises[isolationIndex];
            changes.push({ weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, field: "exercise (focus shift)", before: before.name, after: replacement.name });
            exercises = exercises.map((ex, i) => (i === isolationIndex ? { ...ex, id: `${ex.id}-revised`, name: replacement.name, cue: replacement.cue } : ex));
          }
        }
      }

      if (exercises === day.workout.exercises) return day;
      const estimatedDurationMin = Math.round(Math.min(estimateDuration(exercises), 120));
      return { ...day, workout: { ...day.workout, exercises, estimatedDurationMin } };
    });

    return { ...week, days };
  });

  return { revisedProgram: { ...program, weeks, updatedAtIso: new Date().toISOString() }, changes };
}

function estimateDuration(exercises: Exercise[]): number {
  return exercises.reduce((sum, e) => sum + (e.warmupSets + e.workingSets) * (e.restSeconds + 45), 0) / 60;
}

// ---------------------------------------------------------------------------
// Persisted revision record (append-only history + restore)
// ---------------------------------------------------------------------------

export interface ProgramRevisionRecord {
  id: string;
  clientId: ClientProfileId;
  workspaceId: WorkspaceId;
  coachId: CoachProfileId;
  instruction: string;
  plan: RevisionPlan;
  changes: RevisionChange[];
  /** A full snapshot of the program BEFORE this revision — what "Undo"/
   * "restore" reverts to. Storing the whole program (not a diff) keeps
   * restoration trivial and unambiguous, at the cost of some redundancy —
   * an acceptable tradeoff for a prototype with no real storage limits. */
  programBeforeRevision: ClientAssignedProgram;
  programAfterRevision: ClientAssignedProgram;
  createdAtIso: string;
  /** Undefined until the coach explicitly confirms — see spec §5's
   * "require confirmation before applying meaningful structural changes."
   * A record with no confirmedAtIso was previewed but never applied to the
   * client's real assignedProgram. */
  confirmedAtIso?: string;
  /** Set only when this revision itself is a restoration of an earlier one
   * — points at that earlier revision's id. */
  restoredFromRevisionId?: string;
}
