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
 * not five separate backends. "quality" is the original Phase 0 stub for
 * qualitative/non-standard work; it has never been implemented and is left
 * untouched here (still validated, still never routed anywhere) — Phase
 * 11C's power and mobility work are distinct, UX-differentiated families in
 * their own right (spec section 3: "do not force everything into
 * resistance"), not a reuse of that stub. */
export type ExecutionFamily = "resistance" | "continuous" | "interval" | "circuit" | "quality" | "power" | "mobility";

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
  /** Phase 11C — a plyometric/power-specific repetition primitive, distinct
   * from `reps` (spec section 6: "20 contacts ≠ 20 reps automatically" — no
   * fake conversion between the two). Present only when the coach
   * genuinely prescribes ground-contact count as the per-set target (e.g.
   * "Pogo Jump, 3 x 20 contacts"); absent otherwise. Purely additive: no
   * schema/DB migration, same posture as every other field on this
   * already-flexible, jsonb-backed grammar. */
  contacts?: number;
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
  /** Phase 11A — a distance-based recovery target ("200m easy jog
   * recovery"), distinct from `distance` (the WORK interval's own
   * distance) and from `recoveryInterval` (a DURATION-based recovery).
   * Purely additive: no schema/DB migration, since Prescription lives
   * entirely inside the already-flexible training_program_versions.content
   * jsonb payload — same posture as every other additive field this
   * codebase has added onto Prescription (e.g. warmupSets,
   * warmupInstruction). Optional; absent for a time-based or
   * duration-recovery interval, never fabricated. */
  recoveryDistance?: PrescriptionDistance;
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
export type BlockKind = "straight" | "superset" | "circuit" | "interval" | "warmup" | "cooldown" | "custom" | "emom";

/** Phase 11D — how a `kind:"circuit"` block decides it's finished. Absent
 * (or "fixed_rounds") preserves Phase 11B's exact existing behavior byte
 * for byte: the block ends once `rounds` real rounds are completed, with
 * no time enforcement even if `timeCapSeconds` happens to also be set
 * (advisory-only in that case — this codebase never silently repurposes
 * an existing field's meaning just because a new one now exists nearby).
 * "time_cap" is a genuine AMRAP: `rounds` is deliberately left undefined
 * (unbounded — "as many rounds as possible"), and the block ends only
 * when the client's own real elapsed time reaches `timeCapSeconds`
 * (spec section 7: "do not flatten AMRAP into a guessed fixed number of
 * rounds"). "rounds_or_time_cap" is a real time-capped circuit (spec
 * section 45): a genuine `rounds` target is ALSO set, and the block ends
 * at whichever real condition — full rounds, or the time cap — is
 * reached first. See lib/workout/circuit.ts's own doc for the execution
 * mechanics each mode drives. */
export type BlockTerminationMode = "fixed_rounds" | "time_cap" | "rounds_or_time_cap";

export interface Block {
  id: string;
  kind: BlockKind;
  order: number;
  /** Phase 11B — a coach-owned display name for the block, most relevant
   * for a real circuit (spec section 28: "MetCon A", "Saturday Burner",
   * "Elon Conditioning Hell" — the branding is coach-owned; internally it
   * remains `kind: "circuit"`, never derived from the name). Purely
   * additive: no schema/DB migration, same posture as every other field
   * added directly onto this already-flexible, jsonb-backed grammar.
   * Optional and never required — a block with no name falls back to a
   * generic "Circuit" label wherever it's displayed. Phase 11D extends
   * this same principle to AMRAP/EMOM/custom-named protocols (spec
   * section 6/30: "Elon Death Set Finisher From Hell" is pure display
   * data — it never appears as a hard-coded string anywhere in product
   * logic, and never influences execution semantics). */
  name?: string;
  /** For a `kind:"circuit"` block: the real round target (Phase 11B),
   * intentionally left undefined for a `terminationMode:"time_cap"` AMRAP
   * (see BlockTerminationMode's own doc). For a `kind:"emom"` block
   * (Phase 11D): reused as the real total CADENCE WINDOW count (e.g.
   * "EMOM x 10" -> rounds: 10) — a window is this format's own natural
   * "one full repeat" unit, exactly the same concept `rounds` already
   * expresses for circuit/AMRAP, so this deliberately does not introduce
   * a separately-named `totalWindows` field for what is semantically the
   * identical "how many times does this block's content repeat" number. */
  rounds?: number;
  restBetweenItemsSeconds?: number;
  restBetweenRoundsSeconds?: number;
  timeCapSeconds?: number;
  completionRule?: string;
  /** Phase 11D — see BlockTerminationMode's own doc. Only meaningful for
   * `kind:"circuit"`; absent/ignored for every other block kind. */
  terminationMode?: BlockTerminationMode;
  /** Phase 11D — the real cadence, in seconds, between one EMOM window's
   * start and the next (60 for a plain EMOM, 120 for E2MOM, 180 for
   * E3MOM, spec section 11's own "a bounded cadenceSeconds concept may be
   * cleaner than three separate method types" — audited and adopted
   * rather than hard-coding three near-identical execution engines). Only
   * meaningful for `kind:"emom"`. */
  cadenceSeconds?: number;
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

/** Phase 11A — one interval round's real outcome, bounded to exactly the
 * primitives that matter for coaching review (spec section 9's own example:
 * "Round 1: 45, Round 2: 45, Round 3: 41, Round 4: skipped..."). Reflects
 * the round's WORK phase specifically — recovery is guidance-only and never
 * separately logged, matching spec section 13's minimal-logging-burden
 * requirement. A round simply absent from ExecutionRecord.roundActuals
 * means it was never reached (honest partial completion — spec section 9's
 * "never fabricate the final two rounds"), distinct from a round present
 * with status "skipped" (the client explicitly skipped that one round while
 * continuing the activity — spec section 15). */
export interface IntervalRoundActual {
  roundNumber: number;
  status: "completed" | "skipped";
  /** Real elapsed seconds in the work phase, captured from a real timestamp
   * anchor (see lib/workout/interval.ts) for a time-based interval — never
   * assumed equal to the prescribed target. Absent for a distance-based
   * interval with no client-entered actual. */
  actualWorkSeconds?: number;
  /** Client-entered actual distance covered in the work phase — only
   * meaningful for a distance-based interval, and only populated when the
   * client actually provided one (never inferred). */
  actualWorkDistanceValue?: number;
  completedAtIso?: string;
}

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
  /** Phase 11A — present ONLY for an interval-family execution: the real,
   * bounded per-round history (spec section 10's preferred representation —
   * "one TrainingItemInstance -> one prescription -> execution containing
   * bounded round-level actuals," never six fake exercises). Prescribed and
   * performed remain separate: this array is the actual, `roundNumber`/
   * `actual` above stay describing the ITEM as a whole (e.g. an aggregate
   * RPE), and the prescription itself (item.prescription.rounds) is never
   * mutated to reflect what happened. Absent for every non-interval
   * execution. */
  roundActuals?: IntervalRoundActual[];
  /** Phase 11B — present ONLY for an item that is a member of a `kind:
   * "circuit"` Block: this item's own real outcome, once per circuit round
   * it was actually exposed to. Deliberately a SEPARATE, distinctly-named
   * field from `roundActuals` (interval) even though structurally similar
   * — spec section 10's own "do not confuse a circuit round with a
   * resistance set" extends to never confusing a circuit round with an
   * interval round either; the two are different repetition concepts with
   * different completion semantics (a circuit round is a whole-BLOCK
   * repetition spanning several DIFFERENT items; an interval round is one
   * item's own work/recovery cycle). Uses the general `Partial<Prescription>`
   * actual shape (reps/load/RPE for resistance, duration/distance for
   * continuous) rather than interval's narrow work-seconds/work-distance
   * fields, since a circuit item keeps its own real family-specific
   * prescription (spec section 3: "each item retains its own real
   * Prescription") — never reinterpreted as a resistance set or an
   * interval work phase. */
  circuitRoundActuals?: CircuitRoundActual[];
  /** Phase 11C — present ONLY for a power/plyometric-family execution: the
   * real, per-set history (spec section 33's own acceptance case: "3 3 3
   * 2", never collapsed into a single aggregate). Deliberately a separate,
   * distinctly-named field from roundActuals/circuitRoundActuals even
   * though structurally similar — the same "never confuse one repetition
   * concept with another" discipline those two fields' own docs establish,
   * extended to a THIRD, genuinely different one: a power set is neither a
   * circuit's whole-block round nor an interval's work/recovery cycle. */
  powerSetActuals?: PowerSetActual[];
  /** Phase 11C — present ONLY for a mobility-family execution: the real,
   * per-set (and, when the item requires both sides, per-side) history —
   * spec section 36's own acceptance case ("Set 1 left/right complete, Set
   * 2 left complete, right skipped -> partial"). Same "never confuse with
   * another repetition concept" discipline as powerSetActuals/
   * roundActuals/circuitRoundActuals. */
  mobilitySetActuals?: MobilitySetActual[];
  /** Phase 11D — present ONLY for an item assigned to one or more windows
   * of a real `kind:"emom"` block: the real, per-window history (spec
   * section 10's acceptance case: "Minutes 1-7 completed, Minute 8
   * partial [i.e. skipped], Minutes 9-10 not reached"). A window an item
   * was never assigned to (the cadence cycled to a different item that
   * window) simply never appears here — same "never fabricate" discipline
   * as every other *Actual type. Deliberately distinct from
   * circuitRoundActuals even though structurally identical, because an
   * EMOM window is a cadence-timed unit, never a circuit round (spec
   * section 33: "do not confuse a circuit round with an EMOM window"). */
  emomWindowActuals?: EmomWindowActual[];
}

/** Phase 11B — see ExecutionRecord.circuitRoundActuals's own doc. A round
 * simply absent from the array means that item was never reached in that
 * round (honest partial completion, mirroring IntervalRoundActual's own
 * "never fabricate" discipline) — distinct from a round present with
 * status "skipped" (the client explicitly skipped that one exposure while
 * the circuit continued — spec section 14). */
export interface CircuitRoundActual {
  roundNumber: number;
  status: "completed" | "skipped";
  /** Phase 12B — which side this exposure resolved, only ever present when
   * the item's own prescription genuinely has a side concept (mirrors
   * MobilitySetActual.side exactly, same "left"/"right" vocabulary, no new
   * type introduced). A bilateral/alternating item contributes TWO
   * CircuitRoundActual entries sharing one roundNumber (side "left" then
   * side "right" — see lib/workout/mobility.ts's requiresBothSides, the
   * one shared source of truth for which items need this, reused as-is
   * rather than re-decided here); a fixed left-only/right-only item
   * contributes its one real exposure honestly labeled with that side;
   * absent entirely for an item with no side concept at all — identical to
   * every non-sided circuit item today (resistance/continuous/interval/
   * power/unsided mobility), so this field changes nothing for them. */
  side?: "left" | "right";
  /** Only the primitives that actually differ from the item's own
   * prescription — same discipline as ExecutionRecord.actual itself,
   * never a full duplicate. */
  actual?: Partial<Prescription>;
  skipReason?: SkipReason;
  completedAtIso?: string;
}

/** Phase 11C — see ExecutionRecord.powerSetActuals's own doc. A set simply
 * absent from the array means it was never reached (honest partial
 * completion, matching every other *RoundActual/*SetActual type's "never
 * fabricate" discipline). */
export interface PowerSetActual {
  setNumber: number;
  status: "completed" | "skipped";
  /** Only the primitives that actually differ from the item's own
   * prescription (reps, contacts, or distance — whichever the item's real
   * prescription specifies) — never a full duplicate. */
  actual?: Partial<Prescription>;
  skipReason?: SkipReason;
  completedAtIso?: string;
}

/** Phase 11C — see ExecutionRecord.mobilitySetActuals's own doc. `side` is
 * the RESOLVED side this one exposure reflects — "left"/"right" when the
 * item's prescription.side is "bilateral"/"alternating" (both sides must
 * be resolved separately, so a single set number can appear twice, once
 * per side) or the item's own fixed single side; absent when the item has
 * no side concept at all (prescription.side undefined). */
export interface MobilitySetActual {
  setNumber: number;
  side?: "left" | "right";
  status: "completed" | "skipped";
  actual?: Partial<Prescription>;
  skipReason?: SkipReason;
  completedAtIso?: string;
}

/** Phase 11D — see ExecutionRecord.emomWindowActuals's own doc. `window`
 * is the real, 1-indexed cadence window this exposure belongs to — never
 * inferred from array position (spec section 39: "do not use display name
 * as identity" extends to "never depend on array position alone" for
 * every repeated-exposure concept in this grammar). A window simply
 * absent means it was never reached/attempted — honest, never a
 * fabricated completion (spec section 22). */
export interface EmomWindowActual {
  window: number;
  status: "completed" | "skipped";
  actual?: Partial<Prescription>;
  skipReason?: SkipReason;
  completedAtIso?: string;
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
  /** What a fresh-generation proposal was actually built from — the
   * coach-confirmed method version and the client intake it used (see
   * lib/coach/generation-prerequisites.ts). Absent on legacy content and
   * adjustment proposals; a fresh proposal without it is unverified and
   * cannot be approved. */
  generationInputs?: GenerationInputs;
  /** Phase 8C — the real ProgramDirectionSummary.label this content was
   * generated from (e.g. "Best fit — Push/Pull/Legs"), preserved the same
   * way generationRationale already is: content.name may later be
   * overwritten with a coach-chosen title (see
   * app/actions/production-programs.ts's createProgramProposalAction), so
   * this is what lets the review/approval decision-evidence flow recover
   * "what direction did OPTIM actually propose" without re-deriving it
   * from a title that may no longer contain it. Optional: absent for
   * content that predates this field. */
  directionLabel?: string;
  /** Phase 10A — the real, immutable historical record of which
   * coach-confirmed learned rules (lib/coach/rule-application.ts) actually
   * influenced THIS proposal at generation time. Frozen the moment this
   * content is created (published content is already immutable — see the
   * training_program_versions migration's prevent_published_version_mutation
   * trigger) — never recomputed from "whichever rules are active now."
   * A rule id here remains truthful provenance even after that rule is
   * later deactivated/superseded: coach_learned_rules rows are never
   * deleted (only their `status` changes), so a historical lookup by id
   * still resolves the rule's own real, unchanged summary/scope/direction.
   * Optional/absent for content generated before this field existed, or
   * for a coach/client with no active learned rules at generation time —
   * both read as "no rule provenance," never a fabricated one. Purely
   * informational: nothing in program validation/execution/generation
   * reads this field back. */
  appliedLearnedRuleIds?: string[];
  /** Phase 10A — a deliberately narrow, bounded subset of Phase 9C's own
   * skippedRules diagnostics: only rule ids skipped for
   * "explicit_methodology_conflict" (spec section 20's own guidance —
   * "only surface skipped-rule information if it materially explains
   * something surprising"; every other skip reason — context_mismatch,
   * unsupported_rule_family, outranked_by_more_specific_rule — is
   * mechanical/internal and not persisted here). Never a full diagnostics
   * dump. */
  methodologyConflictedLearnedRuleIds?: string[];
  /** Phase 10B — present ONLY on a draft created by the adjustment-
   * proposal engine (lib/adjustment/build-proposal.ts), never on a
   * fresh-generation proposal. The real, immutable record of which
   * ClientStateFinding produced this specific proposed change, against
   * which exact active program version, and why — frozen at proposal
   * build time, same additive-jsonb-field posture as
   * appliedLearnedRuleIds above (no schema/column migration). Purely
   * informational: nothing in generation/execution/validation reads this
   * back to change behavior. */
  adjustmentProvenance?: AdjustmentProvenance;
  /** Gate 4.0C-4 — present ONLY on a draft prepared by the Fitness Reasoner.
   * The coach-facing review context (NEEDS YOU / WORTH KNOWING / HANDLED) plus
   * stable references to the persisted reasoner_generation_jobs row and its
   * ReasonerRun for audit. Additive jsonb field (no column migration), same
   * posture as adjustmentProvenance; nothing in execution reads it. */
  reasonerProvenance?: ReasonerProvenance;
  /** Gate 4.0C-4 dogfood fix — set ONLY on the client-facing version created at
   * approval from a reviewed Reasoner draft (client-safe copy, identical
   * training). Points back to the reviewed draft; such a version is never
   * itself approvable. */
  clientFacingFrom?: { reviewedVersionId: string; jobId: string };
  status: "draft" | "assigned";
  createdAtIso: string;
  updatedAtIso: string;
}

/** Gate 4.0C-4 — see UniversalTrainingProgramContent.reasonerProvenance. */
export interface ReasonerProvenance {
  version: 1;
  jobId: string;
  runId: string;
  reasonerVersion: string;
  promptVersion: string;
  knowledgeVersion: string;
  modelId: string;
  inputHash: string;
  generatedAtIso: string;
  /** One-line summary of the structure decision. */
  headline: string;
  /** Decisions the coach must make before (or when) sending. */
  needsYou: string[];
  /** Context worth reading, no action required. */
  worthKnowing: string[];
  /** What OPTIM already accounted for (constraints, coach rules, anchors). */
  handled: string[];
  /** The main decisions and the evidence each rests on (plain language). */
  decisions: Array<{ decision: string; because: string; evidence: string[] }>;
  /** Explicit coach resolutions of blocking review decisions (Gate 4.0C-4
   * dogfood fix). Appended on a NEW draft version each time — never edited in
   * place — so the version history is the audit trail. */
  decisionResolutions?: DecisionResolution[];
  /** Fitness Reasoner repair recommendations after a coach edit (Gate 4.0C-4),
   * appended on a new draft version — coach-reviewable, never auto-applied. */
  repairRecommendations?: RepairRecommendationRecord[];
  /** Gate 4.0C-5 — the material planning-state key this draft was solved under (run.planningState.key). */
  planningKey?: string;
  /** Gate 4.0C-5 — set when this draft is a Reasoner REVISION of an earlier draft in the same program. */
  revision?: RevisionProvenance;
}

/** Gate 4.0C-5 — why and from what a revision was prepared (the superseded draft stays archived, unchanged). */
export interface RevisionProvenance {
  supersedesVersionId: string;
  supersedesJobId: string;
  trigger: "limitations_confirmed" | "fit_decision" | "preflight_answered" | "coach_requested";
  previousPlanningKey: string | null;
  planningKey: string;
  /** What changed in the authoritative state (plain language lines per part). */
  changes: Array<{ part: string; added: string[]; removed: string[] }>;
  reasons: string[];
  requestedBy: string;
  requestedAtIso: string;
}

export interface RepairRecommendationRecord {
  /** The program-integrity decision key it answers (stale if the key changes). */
  key: string;
  verdict: "repair" | "no_confident_repair";
  rationale: string;
  recommendation: { exerciseId: string; exerciseName: string; days: string[]; sets: number; reps: { min: number; max: number }; rir: { min: number; max: number } | null; why: string } | null;
  alternatives: string[];
  tradeoff: string | null;
  /** Deterministic reasons a model suggestion was rejected (never applied). */
  rejected: string[];
  model: { provider: string; modelId: string; promptVersion: string; inputTokens: number | null; outputTokens: number | null; latencyMs: number | null };
  requestedBy: string;
  createdAtIso: string;
}

/** A coach's explicit resolution of one blocking review decision. */
export interface DecisionResolution {
  key: string;
  exerciseId: string;
  exerciseName: string;
  /** accepted_replacement / accepted_tradeoff resolve PROGRAM-INTEGRITY decisions (post-edit). */
  resolution: "accepted_with_conditions" | "removed" | "accepted_replacement" | "accepted_tradeoff" | "accepted_limitation";
  /** accepted_limitation (Gate 4.0C-5): the exact adequacy findings the coach accepted — reopens if they change. */
  adequacySignature?: string;
  /** accepted_limitation: the accepted findings in plain language (shown back in review). */
  limitations?: string[];
  /** accepted_with_conditions: the exercise's eligibility fingerprint under the restrictions in force when the
   * coach accepted it — the acceptance is stale (reopens) if the confirmed restrictions change it. */
  fitBasis?: string;
  /** accepted_tradeoff: the deficiency the coach consciously accepted (weekly sets) — invalidated if it gets worse. */
  tradeoff?: Array<{ dimension: string; label: string; before: number; after: number; minAfter: number }>;
  /** accepted_replacement: what was added, where, and whether it came from OPTIM's recommendation. */
  replacement?: { exerciseId: string; exerciseName: string; days: string[]; fromRecommendation: boolean };
  /** The conditions the coach accepted (accept) — shown back in review. */
  conditions: string[];
  resolvedBy: string;
  resolvedAtIso: string;
}

export interface AdjustmentProvenanceChange {
  weekNumber: number;
  dayOfWeek: string;
  description: string;
}

export interface AdjustmentProvenance {
  adjustmentType: string;
  scope: string;
  rationale: string;
  sourceFindingDomain: string;
  sourceFindingType: string;
  sourceEvidenceRefs: string[];
  activeProgramVersionId: string;
  learnedRuleIdsUsed: string[];
  changeDescriptions: AdjustmentProvenanceChange[];
  proposalSignature: string;
  /** Gate 3 — the confirmed Coach Brain method version this adjustment was
   * computed under (see GenerationInputs.coachMethod.methodVersionId). */
  methodVersionId?: string;
}

export interface GenerationInputs {
  version: 1;
  recordedAtIso: string;
  /** One short sentence on why this plan fits (absent on proposals made
   * before it was recorded). */
  rationale?: string;
  /** Supporting points shown under "Why this plan". */
  whyThisPlan?: string[];
  coachMethod: {
    /** Gate 3 — the coach_method_versions row (the client's primary coach's
     * confirmed Coach Brain method) this proposal was generated under.
     * Approval requires it to still be that coach's active version. Absent
     * on proposals made before Gate 3 (built from legacy workspace
     * scaffolding) — those can't be approved. */
    methodVersionId?: string;
    playbookVersion: number;
    operatingModelVersion: number;
    confirmedAtIso: string;
    summary: Array<{ label: string; value: string }>;
  };
  clientIntake: {
    source: "client_onboarding";
    completedAtIso: string;
    healthReview: "not_required" | "resolved";
    summary: Array<{ label: string; value: string }>;
    /** Plain-language assumptions for optional intake answers the client
     * left blank — shown, never hidden. */
    assumptions: string[];
  };
}
