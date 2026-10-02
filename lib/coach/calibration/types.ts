// Gate 3.1 — Calibration v2: shared types.
//
// v2 is an adaptive interview, not a fixed questionnaire. Every question
// declares:
//   - which chapter (module) it belongs to and when it applies (visibleIf),
//   - its control (single / multi / ranked / number / range / scale / text /
//     tags / boolean), or a layered "base rule → does it vary? → exceptions"
//     shape, a scenario decision policy, a group of parts, a safety policy
//     statement, or the Step 0 natural-description screen,
//   - its operational status (A live now / B live after Gate 3.1 / C captured
//     but not operational). Status C is recorded truthfully and never
//     presented as something OPTIM acts on.
//
// Pure data + types. No React, no Supabase, no clock reads.

export type CalibrationChapterId =
  | "your_coaching"
  | "philosophy"
  | "training"
  | "strength"
  | "physique"
  | "sport_performance"
  | "endurance"
  | "integration"
  | "general_fitness"
  | "weight_management"
  | "client_groups"
  | "nutrition"
  | "voice"
  | "messages"
  | "safety"
  | "situations"
  | "ai_authority"
  | "review";

export type AreaId = "strength" | "physique" | "general_fitness" | "weight_management" | "endurance" | "sport_performance";
export const AREA_IDS: AreaId[] = ["strength", "physique", "sport_performance", "endurance", "general_fitness", "weight_management"];

export type ModifierId = "older_adults" | "home_limited" | "postpartum" | "time_limited";
export type NutritionScope = "full" | "guidance" | "none";

/** A = live in production today; B = live after Gate 3.1; C = recorded for
 * future use — OPTIM doesn't act on it yet. */
export type OperationalStatus = "A" | "B" | "C";

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  /** Selecting it clears every other selection (e.g. "None"). */
  exclusive?: boolean;
}

/**
 * Numeric control spec. `min`/`max` are the wheel's TYPICAL bounds — a
 * convenience, never a validation limit: the coach can extend past them.
 * Only `hardMin`/`hardMax` (definitional limits such as "a week has 7 days"
 * or "a percentage can't be negative") are ever rejected.
 */
export interface NumberSpec {
  min: number;
  max: number;
  step: number;
  unit: string;
  hardMin?: number;
  hardMax?: number;
  /** Range only: the coach may optionally mark a preferred value inside it. */
  allowPreferred?: boolean;
  /** Range only: the upper end may be left open ("4 weeks or more"). */
  allowOpenMax?: boolean;
}

export type ControlSpec =
  | { kind: "single"; options: ChoiceOption[] }
  | { kind: "multi"; options: ChoiceOption[]; otherAllowed?: boolean }
  | { kind: "ranked"; options: ChoiceOption[]; maxSelections?: number }
  | { kind: "number"; spec: NumberSpec }
  | { kind: "range"; spec: NumberSpec }
  | { kind: "scale"; min: number; max: number; minLabel: string; maxLabel: string }
  | { kind: "text"; placeholder?: string; multiline?: boolean }
  | { kind: "tags"; placeholder?: string }
  | { kind: "boolean"; yesLabel?: string; noLabel?: string };

/** One "does it vary?" dimension for a layered question. */
export interface VariesDimension {
  id: string;
  /** e.g. "By exercise type". */
  label: string;
  /** The categories a coach can add an exception for. Empty for a
   * dimension that carries no per-key values (e.g. "varies across program
   * phases", applied by the consumer's own phase logic). */
  keys: ChoiceOption[];
}

// ---------------------------------------------------------------------------
// Decision policies (structured "it depends")
// ---------------------------------------------------------------------------

export type FactorType = "enum" | "number" | "boolean";

export interface FactorDef {
  id: string;
  label: string;
  type: FactorType;
  /** enum only; every enum factor implicitly also has "unknown". */
  options?: ChoiceOption[];
  unit?: string;
}

export type ConditionOp = "is" | "is_not" | "is_one_of" | "gte" | "lte" | "between";

export interface DecisionCondition {
  factor: string;
  op: ConditionOp;
  value: string | string[] | number | [number, number] | boolean;
}

export interface DecisionRule {
  /** Matches when every `all` condition holds AND (if any are given) at
   * least one `any` condition holds. One level of grouping — anything
   * broader is written as separate ordered rules. */
  when: { all?: DecisionCondition[]; any?: DecisionCondition[] };
  then: string[];
  note?: string;
}

export interface DecisionPolicy {
  mode: "single" | "conditional";
  /** single: first = preferred, the rest = ordered fallbacks. */
  actions?: string[];
  /** conditional: checked top to bottom; first match wins. */
  rules?: DecisionRule[];
  /** conditional: required fallback. */
  otherwise?: string[];
  note?: string;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface NumberAnswer {
  value: number;
  unit: string;
  outsideTypical?: boolean;
}

export interface RangeAnswer {
  min: number;
  /** null = open-ended ("or more"). */
  max: number | null;
  unit: string;
  preferred?: number;
  outsideTypical?: boolean;
}

export type ControlAnswer = string | string[] | boolean | number | NumberAnswer | RangeAnswer;

export interface LayeredAnswer {
  base: ControlAnswer;
  /** "no" = the base rule always applies; otherwise a dimension id. */
  varies: string;
  exceptions?: Record<string, ControlAnswer>;
  note?: string;
}

export interface PolicyAnswer {
  stricter: string[];
}

export interface NotApplicableAnswer {
  notApplicable: true;
}

export type CalibrationAnswerValue = ControlAnswer | LayeredAnswer | DecisionPolicy | PolicyAnswer | NotApplicableAnswer | Record<string, unknown> | undefined;

/** The coach's raw v2 answer bag, keyed by answer key. Keys starting with
 * "__" are metadata (schema tag, needs-confirmation list, Step 0
 * interpretation snapshot) and are never methodology. */
export type CalibrationAnswers = Record<string, CalibrationAnswerValue>;

export const CALIBRATION_SCHEMA_KEY = "__schema";
export const CALIBRATION_SCHEMA_VERSION = 2;
/** Question ids whose value was mapped from a v1 answer whose meaning
 * changed — the coach must look at each before confirming. */
export const NEEDS_CONFIRMATION_KEY = "__needsConfirmation";
/** The Step 0 interpreter's suggestion, kept only as a record of what was
 * suggested. Never read as scope or methodology. */
export const STEP0_SUGGESTION_KEY = "__step0Suggestion";

// ---------------------------------------------------------------------------
// Derived context used for applicability
// ---------------------------------------------------------------------------

export interface CalibrationContext {
  areasConfirmed: boolean;
  areas: AreaId[];
  modifiers: ModifierId[];
  nutritionScope: NutritionScope | null;
  goals: string[];
  experience: string[];
  enduranceSports: string[];
  sportPerformanceSports: string[];
  programsResistance: boolean;
  /** Training base (T) applies. */
  training: boolean;
  weightManagement: boolean;
  answers: CalibrationAnswers;
}

// ---------------------------------------------------------------------------
// Question definitions
// ---------------------------------------------------------------------------

export type QuestionKind = "control" | "layered" | "scenario" | "group" | "policy" | "description";

export interface ScenarioSpec {
  actions: ChoiceOption[];
  factors: FactorDef[];
  /** Safety scenarios never offer "it depends". */
  allowDepends: boolean;
  /** single: allow ranking fallbacks after the preferred action. */
  allowFallbacks?: boolean;
}

export interface PolicySpec {
  /** Read-only statements of OPTIM's existing product minimum. */
  statements: string[];
  /** Optional stricter rules the coach may add. */
  stricter: ChoiceOption[];
}

export interface CalibrationQuestion {
  id: string;
  /** Storage key when two questions share one answer (asked once,
   * wherever it first applies). Defaults to id. */
  answerKey?: string;
  chapter: CalibrationChapterId;
  prompt: string;
  explanation?: string;
  kind: QuestionKind;
  control?: ControlSpec;
  /** Overrides `control` when its spec depends on earlier answers (e.g. the
   * coach's chosen volume unit or protein basis). */
  dynamicControl?: (ctx: CalibrationContext) => ControlSpec;
  /** layered only. Computed from the coach's answers (e.g. day counts inside
   * their own training-days range). */
  variesBy?: (ctx: CalibrationContext) => VariesDimension[];
  scenario?: ScenarioSpec;
  /** scenario only: actions computed from earlier answers. */
  dynamicActions?: (ctx: CalibrationContext) => ChoiceOption[];
  parts?: CalibrationQuestion[];
  policy?: PolicySpec;
  required: boolean;
  /** "Doesn't apply to how I coach" escape. */
  allowNotApplicable?: boolean;
  status: OperationalStatus;
  visibleIf?: (ctx: CalibrationContext) => boolean;
  /** A suggested starting value shown pre-selected (labelled as a
   * suggestion). It is saved only when the coach continues past it. */
  suggest?: (ctx: CalibrationContext) => CalibrationAnswerValue;
  /** Plain-language label used in Review/Settings summaries. */
  summaryLabel: string;
}

export interface CalibrationChapterMeta {
  id: CalibrationChapterId;
  title: string;
  description: string;
}
