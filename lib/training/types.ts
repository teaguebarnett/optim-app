// Phase 1 — Universal Training Grammar (types only).
//
// Additive domain types for the destination architecture identified in the
// Phase 0 audit: Session -> Block -> TrainingItemInstance -> Prescription,
// with Execution kept as a distinct concept from Prescription. Nothing in
// this file is imported by any existing runtime code path yet — no UI, no
// session-flow, no generation engine, no production write path reads or
// writes this shape today. lib/types.ts's existing Exercise/Workout/
// PrescribedSet/ClientAssignedProgram remain the only types any real code
// uses; this file exists so later phases have a real, validated grammar to
// migrate onto incrementally (see the Phase 0 audit report, section 17).
//
// Storage strategy: training_program_versions.content stays exactly what it
// is today — one opaque, app-validated jsonb payload per version row (see
// supabase/migrations/20260909000004_programs_and_nutrition.sql's own
// documented normalization decision). A payload shaped by this file's
// UniversalTrainingProgramContent is distinguished from the legacy
// ClientAssignedProgram shape purely by a `schemaVersion: 2` tag — see
// lib/production/validation.ts's validateTrainingProgramVersionContent,
// which dispatches on that tag. No database migration is required to store
// either shape; both are just JSON.
//
// Ownership/scoping note (Phase 0 audit, sections 14/18): every content-
// bearing type below carries workspaceId/clientId/coachId exactly the way
// lib/types.ts's ClientAssignedProgram already does. This file introduces no
// workspace-wide sharing concept for program or client content, and no
// shared-catalog or shared-methodology type. Coach-private learning
// evidence, and any future shared/workspace-level standards, templates, or
// explicitly shared methodology, are an intentionally separate, later,
// additive decision — nothing in this file assumes or requires either model.

import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";
import type { RpeValue, DayOfWeek, SkipReason } from "../types";

// ---------------------------------------------------------------------------
// Prescription — the shared primitive vocabulary every execution family
// draws from. One typed object with a required `family` discriminant,
// rather than either a giant nullable-column table or an opaque blob: only
// the fields relevant to `family` are ever meaningful, but every field is
// named and typed. New primitives are additive fields, never a shape change
// to the discriminant itself — safe to extend without a migration.
// ---------------------------------------------------------------------------

/** The five V1 execution families from the Phase 0 audit's acceptance test
 * (section 44/spec section 36) — a user-facing rendering/authoring pattern,
 * not five separate backends. */
export type ExecutionFamily = "resistance" | "continuous" | "interval" | "circuit" | "quality";

export interface PrescriptionReps {
  low: number;
  high: number;
}

export interface PrescriptionLoad {
  value: number;
  unit: "lb" | "kg";
  /** Optional — set only when the coach prescribes relative to a known 1RM,
   * never fabricated when absent. */
  percent1rm?: number;
}

export interface PrescriptionDuration {
  seconds: number;
}

export interface PrescriptionDistance {
  value: number;
  unit: "m" | "mi" | "km";
}

export interface PrescriptionPace {
  value: number;
  unit: "min_per_mi" | "min_per_km";
}

export interface PrescriptionHeartRate {
  low: number;
  high: number;
  /** Coach-facing label only (e.g. "Zone 2") — never used for computation. */
  zoneLabel?: string;
}

export interface PrescriptionPower {
  watts: number;
}

export interface PrescriptionInterval {
  seconds: number;
}

export type PrescriptionSide = "left" | "right" | "alternating" | "bilateral";

export interface Prescription {
  family: ExecutionFamily;
  sets?: number;
  /** Phase 2 addition — a ramp-up set count before `sets`' working sets
   * begin, honest and general enough for any family (not legacy-only: a
   * runner's easy-pace minutes before pace work is the same concept). Added
   * while building the legacy adapter (lib/training/legacy-adapter.ts) to
   * avoid silently dropping lib/types.ts's Exercise.warmupSets, which real,
   * currently-working product behavior depends on (lib/workout/warmup.ts's
   * stepped warm-up derivation). */
  warmupSets?: number;
  reps?: PrescriptionReps;
  load?: PrescriptionLoad;
  rpe?: RpeValue;
  rir?: number;
  duration?: PrescriptionDuration;
  distance?: PrescriptionDistance;
  pace?: PrescriptionPace;
  heartRate?: PrescriptionHeartRate;
  power?: PrescriptionPower;
  rounds?: number;
  workInterval?: PrescriptionInterval;
  recoveryInterval?: PrescriptionInterval;
  restSeconds?: number;
  tempo?: string;
  cadence?: number;
  amrap?: boolean;
  completionTarget?: string;
  side?: PrescriptionSide;
  /** Phase 2 addition — mirrors lib/types.ts's Exercise.warmupInstruction: a
   * free-text override for this item's warm-up guidance, general enough for
   * any family. See the warmupSets doc above for why this was added here
   * rather than dropped by the legacy adapter. */
  warmupInstruction?: string;
}

// ---------------------------------------------------------------------------
// TrainingItemInstance / Block / Session — universal session composition,
// generalizing lib/types.ts's flat Workout.exercises: Exercise[] and its
// dormant, never-implemented ExerciseBlockType stub.
// ---------------------------------------------------------------------------

export interface TrainingItemInstance {
  id: string;
  order: number;
  /** Reference into a future shared/coach-custom training-item catalog —
   * absent for a one-off, coach-typed item exactly like today's free-text
   * Exercise.name. Not defined in this phase; deferred, not blocked. */
  catalogItemId?: string;
  name: string;
  category: ExecutionFamily;
  coachCue?: string;
  prescription: Prescription;
  /** Mirrors lib/types.ts's Exercise.approvedSubstituteExerciseId — a
   * coach-pre-approved substitute, never invented at runtime. */
  substituteItemId?: string;
}

/** Generalizes lib/types.ts's ExerciseBlockType ("straight"/"superset"/
 * "circuit", never actually read by lib/workout/session-flow.ts today) into
 * a first-class composition object instead of a same-session sibling-linking
 * hack. */
export type BlockKind = "straight" | "superset" | "circuit" | "interval" | "warmup" | "cooldown" | "custom";

export interface Block {
  id: string;
  kind: BlockKind;
  order: number;
  rounds?: number;
  restBetweenItemsSeconds?: number;
  restBetweenRoundsSeconds?: number;
  timeCapSeconds?: number;
  completionRule?: string;
  items: TrainingItemInstance[];
}

/** Generalizes lib/types.ts's Workout — a scheduled training event that may
 * contain multiple blocks across multiple modalities (spec section 14's
 * "warm-up -> plyometrics -> strength -> conditioning -> mobility" hybrid
 * session), rather than one flat exercise list. */
export interface Session {
  id: string;
  name: string;
  focus: string;
  estimatedDurationMin: number;
  warmupOverview?: string;
  coachNote?: string;
  blocks: Block[];
}

// ---------------------------------------------------------------------------
// Execution — what actually happened, kept as a distinct concept from
// Prescription (Phase 0 audit, section 9). Generalizes lib/types.ts's
// LoggedSet (strength) and CardioLog (cardio) into one shape spanning every
// execution family, preserving the same performedAsPrescribed discipline.
// ---------------------------------------------------------------------------

export type ExecutionStatus = "completed" | "skipped" | "partial";

export interface ExecutionRecord {
  id: string;
  trainingItemInstanceId: string;
  /** Which round of a multi-round Block this reflects — absent for a
   * single-round item. */
  roundNumber?: number;
  status: ExecutionStatus;
  /** True only when every populated field of `actual` (if any) matches the
   * item's own prescription exactly — mirrors LoggedSet.performedAsPrescribed
   * exactly, including its "never invent, only record" discipline. */
  performedAsPrescribed: boolean;
  /** Only the primitives that actually differ from the prescription need to
   * be populated here — a partial Prescription, never a full duplicate. */
  actual?: Partial<Prescription>;
  completedAtIso?: string;
  skipReason?: SkipReason;
  note?: string;
}

// ---------------------------------------------------------------------------
// Program content — the shape training_program_versions.content takes once
// schemaVersion is 2. A row with no schemaVersion field keeps validating as
// lib/types.ts's ClientAssignedProgram (legacy) — see
// lib/production/validation.ts's validateTrainingProgramVersionContent.
// ---------------------------------------------------------------------------

export interface UniversalProgramDay {
  dayOfWeek: DayOfWeek;
  type: "training" | "rest";
  /** One or more sessions for this day — generalizes ProgramDay's single
   * optional `workout` to support e.g. an AM/PM split. Required (non-empty)
   * whenever type is "training"; absent for a rest day. */
  sessions?: Session[];
}

export interface UniversalProgramWeek {
  weekNumber: number;
  /** Always exactly 7 entries, one per DayOfWeek, Monday-first — same
   * invariant as lib/types.ts's ProgramWeek. */
  days: UniversalProgramDay[];
}

export interface UniversalTrainingProgramContent {
  schemaVersion: 2;
  id: string;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  coachId: CoachProfileId;
  sourceTemplateId?: string;
  name: string;
  durationWeeks: number;
  weeks: UniversalProgramWeek[];
  /** Phase 6B — a concise, real (never fabricated post-hoc) explanation of
   * why generation chose this structure for this client, surfaced for
   * coach review (spec: "generated program proposals retain enough
   * structured rationale that later coach review can explain relevant
   * decisions"). Built directly from the real ProgramDirectionSummary the
   * generator actually selected (lib/coach/program-directions.ts) — never
   * a separate, independently-drifting description. Optional: absent for
   * content that predates this field or wasn't produced through the
   * direction-based generator. */
  generationRationale?: string;
  status: "draft" | "assigned";
  createdAtIso: string;
  updatedAtIso: string;
}
