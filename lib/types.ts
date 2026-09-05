// Core domain types for the OPTIM client prototype.
// Business rules live in lib/calculations.ts and lib/workout-analysis.ts,
// not in these type definitions.
//
// Client/coach identity now lives in lib/tenancy/types.ts (ClientProfile,
// CoachProfile) so every workspace can have its own — this file only
// re-imports the tenant-attribution types it needs to stamp onto records.

import type { ClientProfileId, CoachProfileId, WorkspaceId } from "./tenancy/types";

export type ClientId = ClientProfileId;

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export type MealPeriod =
  | "breakfast"
  | "postWorkout"
  | "lunch"
  | "dinner"
  | "snack";

export interface MacroValues {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealOption {
  id: string;
  period: MealPeriod;
  name: string;
  description: string;
  mainIngredients: string[];
  macros: MacroValues;
}

/** "photo-estimate" — logged through OPTIM's meal-photo estimator (see
 * lib/nutrition/vision-estimator.ts and components/nutrition/photo/) —
 * distinct from "manual" so the client's own typed entries and OPTIM's
 * photo estimates never present as the same provenance. Both still count
 * toward totals identically (see lib/calculations.ts's isMealCounted). */
export type MealSelectionSource = "option" | "manual" | "photo-estimate" | "skipped" | "planned-later";

export type MealEstimateConfidence = "high" | "medium" | "low";

/** One food item within an OPTIM photo-meal estimate. Editable by the
 * client in the review step before confirming — see
 * components/nutrition/photo/estimate-item-editor.tsx. */
export interface MealEstimateItem {
  id: string;
  name: string;
  quantityLabel: string;
  macros: MacroValues;
}

export interface PhotoMealEstimateSnapshot {
  items: MealEstimateItem[];
  confidence: MealEstimateConfidence;
}

export interface MealSelection {
  period: MealPeriod;
  source: MealSelectionSource;
  optionId?: string;
  manualName?: string;
  macros?: MacroValues;
  isEstimate?: boolean;
  completedAtIso?: string;
  skipReason?: SkipReason;
  skipNote?: string;
  /** Present only when source === "photo-estimate" — the item-level detail
   * behind the confirmed total, so reopening a photo-logged meal can show
   * (and let the client re-edit) exactly what was confirmed. */
  photoEstimate?: PhotoMealEstimateSnapshot;
}

export interface NutritionTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export type RpeValue = 6 | 7 | 8 | 9 | 10;

export interface PrescribedSet {
  setNumber: number;
  isWarmup: boolean;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: RpeValue;
  /** The coach's prescribed load for this set, when set. Working sets use
   * this to show a read-only "prescribed weight" instead of asking the
   * client to type one in — see components/workout/live/set-ready-panel.tsx
   * and set-logging-panel.tsx. Warm-up sets may also carry a (lighter)
   * suggested weight purely for non-interactive guidance text; it's never
   * required or logged. */
  prescribedWeightLb?: number;
  /** A single representative target rep count (derived from targetRepsLow/
   * High) so a working set can display and auto-log one crisp number
   * instead of asking the client to pick from a range — see
   * components/workout/live/set-ready-panel.tsx. */
  prescribedReps: number;
}

export interface PreviousPerformanceEntry {
  weightLb: number;
  reps: number;
  rpe: RpeValue;
}

/**
 * Phase 4.4B-2 — how a group of exercises relates to the ones around it in
 * the coach's programmed order. "straight" (the only value any real catalog
 * workout uses today) means this exercise is independent — the session flow
 * may defer or reorder it freely within the remaining queue. A shared
 * `blockId` with `type` "superset"/"circuit" would mark a *locked* group the
 * flow must never silently split apart (see lib/workout/session-flow.ts) —
 * structural support only; no current mock workout defines one, and this
 * phase does not build the authoring UI or a demonstration block.
 */
export type ExerciseBlockType = "straight" | "superset" | "circuit";

export interface ExerciseBlock {
  id: string;
  type: Exclude<ExerciseBlockType, "straight">;
}

export interface Exercise {
  id: string;
  order: number;
  name: string;
  warmupSets: number;
  workingSets: number;
  targetRepsLow: number;
  targetRepsHigh: number;
  targetRpe: RpeValue;
  restSeconds: number;
  tempo: string;
  cue: string;
  previousPerformance: PreviousPerformanceEntry[];
  prescribedSets: PrescribedSet[];
  /** Present only when this exercise is coach-configured as part of a
   * locked connected block (superset/circuit) — see ExerciseBlock. Absent
   * for every exercise in every real catalog workout today, meaning each
   * one is independently orderable/deferrable. */
  block?: ExerciseBlock;
  /** A coach-authored free-text warm-up instruction (e.g. "Complete 1–2
   * light feeler sets") that overrides the stepped warm-up otherwise
   * derived from this exercise's own warm-up prescribedSets — see
   * lib/workout/warmup.ts's resolveExerciseWarmupConfig. Absent for every
   * exercise in the real catalog today (they use real stepped prescribed
   * warm-up sets instead), but the derivation and live-flow rendering
   * support it for a future coach who prefers a simple instruction over
   * individually stepped sets. */
  warmupInstruction?: string;
  /** The id of another exercise in the same workout that the coach has
   * pre-approved as a substitute when equipment is unavailable. Absent
   * unless the coach has actually configured one — the live flow must
   * never invent a substitute when this is unset. */
  approvedSubstituteExerciseId?: string;
}

export interface Workout {
  id: string;
  /** The workspace whose program library this workout belongs to — program
   * content is workspace-specific even though today's prototype only has
   * one workspace's catalog. */
  workspaceId: WorkspaceId;
  name: string;
  dayOfWeek: DayOfWeek;
  focus: string;
  estimatedDurationMin: number;
  warmupOverview: string;
  coachNote: string;
  exercises: Exercise[];
}

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

// ---------------------------------------------------------------------------
// Coach-authored training protocols (Phase 5.2)
// ---------------------------------------------------------------------------

export interface ProgramDay {
  dayOfWeek: DayOfWeek;
  type: "training" | "rest";
  /** Full real, loggable Workout content — present only when type is
   * "training". A "training" day with no workout is an authoring gap, not
   * a valid assignable state — see lib/coach/training.ts's isValidWeek1. */
  workout?: Workout;
}

export interface ProgramWeek {
  weekNumber: number;
  /** Always exactly 7 entries, one per DayOfWeek, Monday-first — matching
   * lib/mock-data.ts's TRAINING_WEEK convention. */
  days: ProgramDay[];
}

/** A client's own independent copy of a training protocol — built directly
 * for this one client, or produced by assigning one of the coach's saved
 * CoachProgramTemplates (see lib/coach/types.ts). Lives on the client's own
 * AppState (see AppState.assignedProgram) so a later edit to the source
 * template, or to a different client's program, can never silently change
 * what this client is actually prescribed — see
 * lib/coach/training.ts's assignTemplateToClient. */
export interface ClientAssignedProgram {
  id: string;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  coachId: CoachProfileId;
  /** The template this was assigned from, kept only for the coach's own
   * reference — editing here never writes back to that template. Absent
   * for a program the coach built directly for this client. */
  sourceTemplateId?: string;
  name: string;
  durationWeeks: number;
  weeks: ProgramWeek[];
  /** "draft" is visible to the coach only (preview never implies the client
   * can see it) — activation requires a valid Week 1 on an "assigned"
   * program, never a draft. */
  status: "draft" | "assigned";
  createdAtIso: string;
  updatedAtIso: string;
}

export interface LoggedSet {
  id: string;
  exerciseId: string;
  setNumber: number;
  isWarmup: boolean;
  weightLb: number | null;
  reps: number | null;
  rpe: RpeValue | null;
  note?: string;
  completedAtIso?: string;
  status: "completed" | "skipped";
  skipReason?: SkipReason;
  /** True when the client confirmed this set was performed exactly as
   * prescribed (the default, low-friction path from the live guided flow —
   * see Phase 4.4B-2). False only when "Performed differently" was
   * explicitly selected, in which case weightLb/reps reflect the actual
   * values rather than the prescription. Undefined for sets with nothing to
   * compare against (a client-added extra set with no prescription) and for
   * older, pre-4.4B-2 persisted sets. */
  performedAsPrescribed?: boolean;
  /**
   * @deprecated Phase 4.4B-2.1 correction — this was presented/reasoned
   * about as the client's actual physiological rest, which the real
   * interaction (put down the weight, pick up the phone, open OPTIM, log
   * the set) cannot honestly measure — a real 15-30+ second handling delay
   * is baked into every reading. No code writes this field anymore; it's
   * kept only so already-persisted sets from before this correction still
   * type-check and load without a migration/data loss. Never read this as
   * rest duration — see `logIntervalSeconds` for the honestly-named
   * successor, and lib/workout/rest-policy.ts for the real rest guidance
   * (coach-prescribed baseline + RPE, no timestamps involved).
   */
  actualRestSeconds?: number;
  /** Wall-clock seconds between this set's completedAtIso and whenever the
   * session's rest-window bookkeeping last reset (see WorkoutSession.
   * restStartedAtIso) — a raw log/event interval, kept for diagnostic
   * purposes only. This is NOT physiological rest (see the deprecation note
   * on `actualRestSeconds` above for why) and must never be presented to
   * the client, or used by any guidance logic, as an actual rest duration. */
  logIntervalSeconds?: number;
}

export interface ExerciseLog {
  exerciseId: string;
  status: "not-started" | "in-progress" | "completed" | "skipped";
  loggedSets: LoggedSet[];
  skipReason?: SkipReason;
  skipNote?: string;
}

export type SkipReason =
  | "out-of-time"
  | "pain-or-discomfort"
  | "equipment-unavailable"
  | "feeling-sick"
  | "excessive-fatigue"
  | "schedule-conflict"
  | "forgot"
  | "other";

/**
 * Phase 4.4B-2.1 — a concise, high-value symptom-quality classification the
 * safety policy (lib/workout/pain-policy.ts) uses to distinguish ordinary
 * muscular fatigue from signals that should never be treated as
 * resume-eligible, regardless of how low the numeric rating is.
 */
export type PainSymptomQuality =
  | "sharp-pinching"
  | "aching"
  | "burning"
  | "numbness-tingling"
  | "instability-weakness"
  | "normal-fatigue"
  | "other";

export interface PainReport {
  id: string;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  createdAtIso: string;
  exerciseId?: string;
  location: string;
  ratingZeroToTen: number;
  onset: string;
  causedByMovement: string;
  continuedAfterSet: boolean;
  affectsOutsideGym: boolean;
  note?: string;
  /** Optional only so a pain report persisted before this correction still
   * loads — every report submitted through the current form always
   * includes it. See lib/workout/pain-policy.ts's classifySeverity. */
  symptomQuality?: PainSymptomQuality;
  /** Always true for a report created through the current flow — pain is an
   * always-escalate category. Optional only for the same backward-
   * compatibility reason as `symptomQuality`; treat a missing value as true
   * when reasoning about older records rather than assuming it doesn't need
   * review. */
  requiresCoachReview?: boolean;
}

export type WorkoutSessionStatus =
  | "not-started"
  | "in-progress"
  | "completed"
  /** The client ended the session before reaching "Complete workout," but
   * had already logged at least one valid working set. Distinct from
   * "skipped" (zero working sets ever completed) — a partial session must
   * never be described as skipped. See lib/state.ts's SKIP_WORKOUT case. */
  | "ended-early"
  | "skipped";

/**
 * Phase 4.4B-2 — the live guided flow's current focused surface, derived
 * from and persisted alongside canonical session state (never a competing
 * status model — WorkoutSessionStatus above remains the one source of truth
 * for not-started/in-progress/completed/etc). See lib/workout/session-flow.ts
 * for the pure transition logic that owns every move between these.
 */
export type WorkoutSessionPhase =
  | "session-warmup"
  | "exercise-intro"
  | "exercise-warmup"
  | "set-ready"
  | "set-logging"
  | "set-feedback"
  | "exercise-transition"
  | "session-summary"
  /** Phase 4.4B-2.1 — a safety interruption entered immediately after a
   * pain report is submitted. Blind progression to the next set/exercise is
   * suppressed until the client resolves it through one of the allowed
   * paths in lib/workout/pain-policy.ts (never by simply advancing) — see
   * WorkoutSession.activePainInterruption. */
  | "pain-review"
  /** Phase 4.4B-2.2 — shown before entering any exercise OTHER than the one
   * an active, unresolved pain report was reported on, once "Skip this
   * exercise"/"Continue with unaffected exercises" has moved past the
   * original interruption without resolving it. "Continue with unaffected
   * exercises" was previously treated as clearing the pain condition
   * outright — it must not: OPTIM cannot know whether a later exercise
   * involves the same painful area, so each one requires its own explicit,
   * once-per-exercise confirmation before it can begin. See
   * WorkoutSession.activePainInterruption.confirmedUnaffectedExerciseIds. */
  | "exercise-pain-check";

export type WarmupOutcomeStatus = "not-started" | "completed" | "skipped";

export interface WarmupOutcome {
  status: WarmupOutcomeStatus;
  skipReason?: SkipReason;
  skipNote?: string;
  completedAtIso?: string;
  /** How many configured stepped warm-up steps have been confirmed so far —
   * only meaningful when the exercise's resolved config mode is "stepped".
   * See lib/workout/warmup.ts. */
  stepsCompleted?: number;
}

/**
 * Phase 4.4B-2.1 — the deterministic safety classification a submitted pain
 * report resolves to (see lib/workout/pain-policy.ts's classifySeverity).
 * "resume-eligible" still requires an explicit client confirmation before
 * continuing — it is never automatic.
 */
export type PainSeverity = "resume-eligible" | "block-exercise";

/**
 * The one active safety interruption for the session, if any — canonical
 * session state, not component-local, so it survives refresh, leaving the
 * route, and resuming. Cleared (set to null) only through an allowed
 * resolution path (resume after explicit confirmation, skip the exercise,
 * substitute, or end the workout) — never by simply navigating away from
 * the pain-review phase.
 */
export interface PainInterruption {
  painReportId: string;
  exerciseId: string;
  setNumber: number | null;
  severity: PainSeverity;
  /** Only meaningful for "resume-eligible" — true once the client has
   * explicitly confirmed "The discomfort has fully resolved." Continuing
   * the exercise is only ever offered once this is true. */
  confirmedResolved: boolean;
  /**
   * Phase 4.4B-2.2 — exercise ids the client has explicitly confirmed
   * "This exercise feels unaffected" for, scoped to THIS exact
   * painReportId. "Continue with unaffected exercises"/"Skip this exercise"
   * on the originally-reported exercise resolves that exercise but never
   * this list — the report remains active for the rest of the session, and
   * every subsequent exercise (other than the one this report was made on,
   * which has its own stricter block/resume-eligible path) needs its own
   * confirmation before it can begin. A new pain report always gets a fresh
   * PainInterruption with an empty list, so an earlier confirmation can
   * never carry over to a different, unrelated report.
   *
   * Optional only so an interruption persisted before this correction still
   * loads — treat a missing value the same as an empty array everywhere
   * it's read (never assume already-confirmed).
   */
  confirmedUnaffectedExerciseIds?: string[];
}

/** One entry in the session's append-only lifecycle log — real, minimal
 * telemetry for a future coach surface, never inferred beyond what actually
 * happened. "route-entered"/"route-left" cover both the initial mount and
 * any later leave-and-return (the client's own device can't reliably
 * distinguish a deliberate pause from an accidental navigation, so this
 * names the real, honest event rather than overclaiming "resumed"). */
export interface WorkoutSessionEvent {
  type:
    | "started"
    | "route-entered"
    | "route-left"
    | "completed"
    /** Phase 4.4B-2.2 — the client explicitly confirmed a later exercise
     * "feels unaffected" while a pain report remained active, and continued
     * into it. Reuses this same append-only event log rather than a
     * separate audit system, so a coach reviewing the session can see
     * exactly which exercise this was and which report it was scoped to —
     * see exerciseId/painReportId below, and WorkoutSession.
     * activePainInterruption.confirmedUnaffectedExerciseIds for the current
     * live state this event records a history of. */
    | "exercise-continued-despite-pain";
  atIso: string;
  /** Only present for "exercise-continued-despite-pain". */
  exerciseId?: string;
  painReportId?: string;
}

export interface WorkoutSession {
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  workoutId: string;
  status: WorkoutSessionStatus;
  startedAtIso?: string;
  completedAtIso?: string;
  exerciseLogs: Record<string, ExerciseLog>;
  painReports: PainReport[];
  skipReason?: SkipReason;
  skipNote?: string;
  summary?: WorkoutSummary;

  // --- Phase 4.4B-2: guided live-flow state ---
  phase: WorkoutSessionPhase;
  /** Stable exercise id the client is currently engaged with — never a raw
   * array index (a Phase 4.4B-2 correction: an index into the coach's
   * planned order breaks the moment an exercise is deferred/reordered).
   * Null only before the session has started. */
  currentExerciseId: string | null;
  /** The effective remaining order of exercise ids yet to be resolved,
   * starting as the workout's own authored order. Deferring an exercise
   * moves its id to the end of this list rather than dropping it — see
   * lib/workout/session-flow.ts's deferExercise. */
  exerciseQueue: string[];
  /** Exercise ids in the order they were actually first engaged —
   * append-only, distinct from the coach's planned order, for telemetry and
   * coach review of what really happened. */
  actualExerciseOrder: string[];
  /** Exercise ids currently deferred ("do later") and not yet resolved. */
  deferredExerciseIds: string[];
  /** The exercise id that was current immediately before the most recent
   * resolve/defer handoff — purely for the exercise-transition surface to
   * say what just happened ("Nice work on X") without re-deriving it from
   * the queue. Null until the first handoff occurs. */
  lastResolvedExerciseId: string | null;
  /** The absolute prescribed working-set number currently being worked
   * within currentExerciseId — null outside a set-focused phase. */
  currentSetNumber: number | null;
  /** Internal bookkeeping timestamp — when the log/event-interval window
   * most recently reset (immediately after a set was logged/skipped). Used
   * only to derive the next set's `logIntervalSeconds` (a diagnostic log
   * interval, never physiological rest — see LoggedSet.logIntervalSeconds
   * and the deprecation note on LoggedSet.actualRestSeconds). Never shown
   * to the client directly; there is no rest timer in the live flow. */
  restStartedAtIso?: string;
  /** The once-per-session preparation routine outcome, sourced from the
   * real Workout.warmupOverview text — see lib/workout/warmup.ts. */
  sessionWarmup: WarmupOutcome;
  /** Per-exercise warm-up outcome, keyed by exercise id. */
  exerciseWarmups: Record<string, WarmupOutcome>;
  /** Append-only session lifecycle events. */
  events: WorkoutSessionEvent[];
  /** Phase 4.4B-2.1 — the current safety interruption, if any. Optional
   * (rather than required-and-defaulted) so already-persisted sessions from
   * before this correction still load without a migration step; treat a
   * missing value the same as `null` (no active interruption) everywhere
   * it's read. */
  activePainInterruption?: PainInterruption | null;
}

export interface WorkoutSummary {
  exercisesCompleted: number;
  exercisesSkipped: number;
  workingSetsCompleted: number;
  skippedSetsCount: number;
  missingRpeCount: number;
  averageRpe: number | null;
  painReportCount: number;
  durationMin: number;
  headline: string;
  detail: string;
  needsReview: boolean;
  /** True only when every prescribed working set has a valid logged RPE —
   * no skips anywhere in the session. Drives "Completed" vs "Submitted with
   * skipped work" in the UI. */
  fullyCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Daily plan / timeline
// ---------------------------------------------------------------------------

export type DailyTaskId =
  | "morning-weight"
  | "breakfast"
  | "workout"
  | "post-workout-meal"
  | "lunch"
  | "cardio"
  | "dinner"
  | "snack"
  | "daily-completion";

export type DailyTaskState =
  | "locked"
  | "upcoming"
  | "recommended-now"
  | "in-progress"
  | "completed"
  | "partially-completed"
  | "skipped"
  | "missed"
  | "needs-attention"
  | "awaiting-review";

export interface DailyTask {
  id: DailyTaskId;
  label: string;
  state: DailyTaskState;
}

export interface DailyPlan {
  dayOfWeek: DayOfWeek;
  dateIso: string;
  programWeek: number;
  programTotalWeeks: number;
  workoutId: string;
  cardioTarget: CardioTarget;
}

export interface CardioTarget {
  activity: string;
  durationMin: number;
  heartRateRangeLow: number;
  heartRateRangeHigh: number;
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

/**
 * One coach-approved cardio option. A CardioPrescription can list several —
 * e.g. a default steady-state option plus an approved time-saving
 * alternative — but the coach still controls exactly which options exist;
 * the client only ever picks among what's already approved, never an
 * arbitrary substitution.
 */
export interface CardioOption {
  id: string;
  type: string;
  displayName: string;
  isDefault: boolean;
  /** Short client-facing description of when this option makes sense, e.g.
   * "Approved time-saving alternative when you're short on time." */
  intendedUse: string;
  targetDurationMin: number;
  heartRateRangeLow?: number;
  heartRateRangeHigh?: number;
  /** Coach-authored protocol/instructions. Only ever real, coach-approved
   * content — never invented. */
  protocol: string;
}

/** A client's approved cardio plan for a given prescribed session. Coach-
 * controlled and configurable per client — see lib/mock-data.ts's
 * CARDIO_PRESCRIPTIONS_BY_CLIENT. Most clients will have exactly one option;
 * only a plan with more than one should ever show a picker. */
export interface CardioPrescription {
  options: CardioOption[];
  /** Which days of the week the coach has actually assigned cardio —
   * coach-controlled and configurable per client, exactly like `options`
   * above. A client with no explicit schedule configured gets no assigned
   * days at all (see lib/mock-data.ts's DEFAULT_CARDIO_PRESCRIPTION), never
   * a default "every day" assumption. See isCardioAssignedForDay(). */
  assignedDays: DayOfWeek[];
}

export interface CardioLog {
  /** "partial" — the client stopped before completing the target duration
   * but had already logged some real time (durationMin > 0) when they
   * skipped. Distinct from "skipped" (zero minutes logged) the same way a
   * workout can be "ended-early" rather than "skipped" — see
   * WorkoutSessionStatus and Phase 4.1's cardio-partial correction. */
  status: "not-started" | "in-progress" | "completed" | "partial" | "skipped";
  durationMin: number;
  /** Which approved CardioOption this log reflects — null/undefined until
   * the client starts or completes cardio using a specific option. Switching
   * options never rewrites a previously completed log; it only changes what
   * a *new* session is tracked against. */
  selectedOptionId?: string;
  note?: string;
  skipReason?: SkipReason;
  completedAtIso?: string;
}

export interface MorningWeightLog {
  weightLb: number | null;
  loggedAtIso?: string;
  skipped: boolean;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatSender = "client" | "assistant" | "coach" | "system";

export type ChatAttachmentKind = "photo" | "video" | "document" | "voice";

/** One attachment on a ChatMessage. `url` is produced by whatever
 * ChatAttachmentStorage adapter built it (see lib/chat/attachments.ts) — the
 * default prototype adapter creates a local, in-memory object URL, but every
 * other field here is storage-agnostic so a future secure-upload adapter can
 * swap in without touching the message model. */
export interface ChatAttachment {
  id: string;
  kind: ChatAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  /** Voice and video only. */
  durationSeconds?: number;
}

/** A canonical-state change Chat already actually performed (never merely
 * claimed) — attached to the confirmation message so both the transcript
 * and a future coach workspace can see exactly what changed and when. */
export type ChatActionKind = "training_time_set" | "training_rest_day" | "training_unsure";

export interface ChatActionPerformed {
  kind: ChatActionKind;
  /** Human-readable summary of what changed, e.g. "Training moved to 6:30 PM." */
  detail: string;
}

/** Whether this message (or the request it produced) is waiting on the
 * assigned coach. "none" — the default when omitted — never needs to be
 * written explicitly. */
export type ChatHandoffState = "pending_coach_review" | "resolved";

/** Local prototype send-state for a client-authored message — there is no
 * real network layer here, so "sending"/"failed" only ever reflect the
 * synchronous local dispatch itself, never a real delivery guarantee. */
export type ChatDeliveryState = "sending" | "sent" | "failed";

export interface ChatMessage {
  id: string;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  /** The client's assigned coach at the time this message was sent (see
   * lib/tenancy/types.ts's ClientProfile.primaryCoachId, resolved through
   * lib/tenancy/seed.ts's resolveAssignedCoachId) — every coach message,
   * escalation, notification, attachment, and review request routes through
   * this, stamped centrally by the reducer exactly like workspaceId/clientId
   * (see lib/state.ts's ADD_CHAT_MESSAGE). Never a hardcoded coach identity. */
  assignedCoachId: CoachProfileId;
  /** Set only for sender === "coach", so a coach-authored message keeps its
   * author's identity even in a workspace with multiple coaches later. The
   * assistant is never attributed to a coach — see sender === "assistant". */
  authorCoachId?: string;
  sender: ChatSender;
  text: string;
  createdAtIso: string;
  isScripted?: boolean;
  attachments?: ChatAttachment[];
  actionPerformed?: ChatActionPerformed;
  /** Present when this message is the subject of (or the status line for) a
   * coach-review handoff — see lib/state.ts's CREATE_CHAT_REVIEW_REQUEST. */
  handoffState?: ChatHandoffState;
  deliveryState?: ChatDeliveryState;
  /** True only on an assistant message that should render the inline
   * "Update training time" quick action (opens the same wheel-style
   * TrainingTimeSheet Today/Training already use) — see app/chat/page.tsx. */
  promptsSchedulePicker?: boolean;
}

export interface ScriptedChatTopic {
  id: string;
  prompt: string;
  responseSender: Extract<ChatSender, "assistant" | "coach">;
  /** May contain the literal placeholder "{{coach}}" — always resolved
   * through lib/chat/assistant.ts's interpolateCoachName before display,
   * never the client's assigned coach's name hardcoded here. */
  response: string;
}

// ---------------------------------------------------------------------------
// Review requests (things awaiting Teague's attention)
// ---------------------------------------------------------------------------

export type ReviewRequestKind =
  | "pain-report"
  | "rpe-anomaly"
  | "workout-skipped"
  | "schedule-change"
  /** A client-specific technique concern flagged from the live workout —
   * distinct from a routine educational question OPTIM answers itself. See
   * components/workout/live/need-help-sheet.tsx and the FLAG_TECHNIQUE_QUESTION
   * action in lib/state.ts. */
  | "technique-flag"
  /** An exercise substitution or broader program-change request raised in
   * Chat — OPTIM never approves or invents this itself (see
   * lib/chat/assistant.ts); it's always routed to the assigned coach. */
  | "program-change-request";

/** A review's explicit, persistent place in its resolution lifecycle —
 * never inferred solely from the `resolved` boolean (kept only for
 * backward-compatible read sites; see ReviewRequest.resolved). Opening a
 * review's detail view never changes its status; only a deliberate
 * "Start review" / "Reviewed — no change needed" / "Resolve review" /
 * "Reopen" action does — see lib/coach/review-lifecycle.ts. */
export type ReviewRequestStatus = "needs_review" | "in_progress" | "resolved";

/** The two deliberate final outcomes a coach can choose when resolving a
 * review — distinct so the resolved history can show which one it was,
 * never collapsing "nothing needed to change" and "I made a change" into
 * one undifferentiated "resolved" state. */
export type ReviewResolutionAction = "reviewed_no_change" | "resolved";

/** How urgently this review needs the coach's attention — "high" is
 * reserved for pain/injury/health/safety kinds, which also require a
 * resolution note (see lib/coach/review-lifecycle.ts's
 * requiresResolutionNote). */
export type ReviewSeverity = "high" | "normal";

export interface ReviewRequest {
  id: string;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  /** The coach this request is routed to — see ChatMessage.assignedCoachId's
   * doc; the same resolveAssignedCoachId call stamps both. */
  assignedCoachId: CoachProfileId;
  /** The ChatMessage (if any) this request originated from — lets a future
   * coach workspace pull the full conversation context, including any
   * attachments, straight from the thread rather than duplicating them onto
   * the request itself. */
  sourceMessageId?: string;
  /** Identifies the real underlying event this review is about (a
   * PainReport's id, a specific workout instance, a chat message id) when
   * one exists — lets creation stay idempotent: one review per assigned
   * coach/client/kind/sourceEventId, never a second record for the same
   * event on a retry, route change, or reload. See
   * lib/coach/review-lifecycle.ts's findDuplicateReviewRequest. */
  sourceEventId?: string;
  kind: ReviewRequestKind;
  severity: ReviewSeverity;
  createdAtIso: string;
  /** Bumped on every lifecycle transition (start/resolve/reopen), not just
   * creation — lets the Resolved history and any future "last touched"
   * display stay accurate without a separate audit log. */
  updatedAtIso: string;
  summary: string;
  status: ReviewRequestStatus;
  /** Kept in sync with status (true iff status === "resolved") — every read
   * site that predates the full lifecycle only ever checked this boolean,
   * and continues to work unmodified. */
  resolved: boolean;
  resolutionAction?: ReviewResolutionAction;
  resolutionNote?: string;
  resolvedAtIso?: string;
  resolvedByCoachId?: CoachProfileId;
}
