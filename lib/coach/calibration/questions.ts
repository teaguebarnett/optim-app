// Gate 3.1 — the v2 calibration question bank.
//
// Organized by reusable modules, never per-sport surveys. Step 0 ("Tell OPTIM
// what you coach") produces SUGGESTED coaching areas; only the coach's
// confirmation (coaching_areas) decides which modules apply. Each module
// asks the coach's base rule first; contextual exceptions open only when the
// coach says the rule varies; the condition builder opens only when a
// scenario genuinely "depends".
//
// Operational status per question (see types.ts): A live now, B live after
// Gate 3.1, C recorded for future use — OPTIM doesn't act on it yet.

import type {
  CalibrationChapterMeta,
  CalibrationContext,
  CalibrationQuestion,
  ChoiceOption,
  FactorDef,
  NumberSpec,
  VariesDimension,
} from "./types.ts";
import { SAFETY_MINIMUM_STATEMENTS } from "../safety-policy.ts";

export const CALIBRATION_CHAPTERS: CalibrationChapterMeta[] = [
  { id: "your_coaching", title: "What you coach", description: "Who you work with and what you help them do." },
  { id: "philosophy", title: "Your coaching philosophy", description: "What success looks like and how your coaching runs." },
  { id: "training", title: "How you build training", description: "Your base rules — exceptions only where they really differ." },
  { id: "strength", title: "Strength specifics", description: "Main lifts, testing and peaking." },
  { id: "physique", title: "Physique specifics", description: "Volume, techniques and exercise selection." },
  { id: "sport_performance", title: "Sport performance", description: "Seasons, competition and speed work." },
  { id: "endurance", title: "Endurance", description: "Volume, intensity and event preparation." },
  { id: "integration", title: "Combining strength and endurance", description: "How the two fit in one week." },
  { id: "general_fitness", title: "General fitness", description: "Intensity, activity and habits." },
  { id: "weight_management", title: "Weight management", description: "Rate of change, levers and breaks." },
  { id: "client_groups", title: "Specific client groups", description: "Rules you use only for certain clients." },
  { id: "nutrition", title: "Nutrition", description: "How you coach food and fueling." },
  { id: "voice", title: "How you communicate", description: "Your voice, so OPTIM sounds like you." },
  { id: "messages", title: "Messages OPTIM handles", description: "What OPTIM may answer and what always comes to you." },
  { id: "safety", title: "Safety and non-negotiables", description: "OPTIM's safety minimums and your own stricter rules." },
  { id: "situations", title: "Common situations", description: "Optional — how you'd handle situations that come up." },
  { id: "ai_authority", title: "AI coaching authority", description: "How much you want OPTIM to take on." },
  { id: "review", title: "Review your method", description: "Confirm how OPTIM understands you." },
];

export const CHAPTER_ORDER = CALIBRATION_CHAPTERS.map((c) => c.id);

// ---------------------------------------------------------------------------
// Shared vocab
// ---------------------------------------------------------------------------

const opts = (pairs: [string, string][]): ChoiceOption[] => pairs.map(([value, label]) => ({ value, label }));

export const AREA_OPTIONS: ChoiceOption[] = [
  { value: "strength", label: "Strength", description: "Powerlifting, weightlifting, strongman or athletic strength" },
  { value: "physique", label: "Physique / hypertrophy", description: "Building muscle, bodybuilding, aesthetics" },
  { value: "sport_performance", label: "Sport performance", description: "Athletes in a sport — speed, power, conditioning" },
  { value: "endurance", label: "Endurance", description: "Running, cycling, triathlon, swimming, rowing" },
  { value: "general_fitness", label: "General fitness", description: "Health, fitness and consistency for everyday people" },
  { value: "weight_management", label: "Weight management", description: "Fat loss and keeping it off" },
];

export const STRENGTH_SPECIALTY_OPTIONS = opts([
  ["powerlifting", "Powerlifting"],
  ["weightlifting", "Olympic weightlifting"],
  ["strongman", "Strongman"],
  ["athletic_strength", "Athletic strength / development"],
  ["general_strength", "General strength"],
]);

export const SPORT_OPTIONS = opts([
  ["soccer", "Soccer"],
  ["american_football", "American football"],
  ["basketball", "Basketball"],
  ["rugby", "Rugby"],
  ["baseball_softball", "Baseball / softball"],
  ["ice_hockey", "Ice hockey"],
  ["tennis", "Tennis"],
  ["volleyball", "Volleyball"],
  ["lacrosse", "Lacrosse"],
  ["combat_sports", "Combat sports"],
  ["track_field", "Track & field"],
]);

export const ENDURANCE_SPORT_OPTIONS = opts([
  ["running", "Running"],
  ["cycling", "Cycling"],
  ["triathlon", "Triathlon"],
  ["swimming", "Swimming"],
  ["rowing", "Rowing"],
]);

const EXPERIENCE_KEYS = opts([
  ["beginner", "Beginners"],
  ["intermediate", "Intermediate"],
  ["advanced", "Advanced"],
]);

const EXERCISE_TYPE_KEYS = opts([
  ["main", "Main lifts"],
  ["accessory", "Accessories"],
]);

const SEASON_KEYS = opts([
  ["off_season", "Off-season"],
  ["pre_season", "Pre-season"],
  ["in_season", "In-season"],
]);

const GOAL_KEYS = opts([
  ["lose_fat", "Fat loss"],
  ["maintenance", "Maintenance / recomposition"],
  ["build_muscle", "Muscle gain"],
]);

const EVENT_KEYS = opts([
  ["5k_10k", "5K / 10K"],
  ["half_marathon", "Half marathon"],
  ["marathon", "Marathon"],
  ["ultra", "Ultra"],
  ["sprint_olympic_tri", "Sprint / Olympic triathlon"],
  ["long_course_tri", "70.3 / Ironman"],
  ["cycling_event", "Cycling event"],
]);

function dim(id: string, label: string, keys: ChoiceOption[]): VariesDimension {
  return { id, label, keys };
}

const byExperience = () => dim("experience_level", "By client experience level", EXPERIENCE_KEYS);
const byExerciseType = () => dim("exercise_type", "Main lifts vs accessories", EXERCISE_TYPE_KEYS);
const bySeason = () => dim("season_phase", "By season phase", SEASON_KEYS);

/** Day-count exception keys, only inside the coach's own training-days range. */
function dayCountKeys(ctx: CalibrationContext): ChoiceOption[] {
  const days = ctx.answers.t_days as { base?: { min?: number; max?: number | null } } | undefined;
  const lo = Math.max(1, Math.floor(days?.base?.min ?? 2));
  const hi = Math.min(7, Math.floor(days?.base?.max ?? 6));
  const keys: ChoiceOption[] = [];
  for (let d = lo; d <= Math.max(lo, hi); d++) keys.push({ value: String(d), label: `${d} days a week` });
  return keys;
}

const num = (min: number, max: number, step: number, unit: string, extra: Partial<NumberSpec> = {}): NumberSpec => ({ min, max, step, unit, ...extra });

// ---------------------------------------------------------------------------
// Visibility helpers
// ---------------------------------------------------------------------------

const has = (ctx: CalibrationContext, area: string) => ctx.areas.includes(area as never);
const hasMod = (ctx: CalibrationContext, mod: string) => ctx.modifiers.includes(mod as never);
const ans = (ctx: CalibrationContext, key: string) => ctx.answers[key];
const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
const nutritionOn = (ctx: CalibrationContext) => ctx.nutritionScope === "full" || ctx.nutritionScope === "guidance";
const nutritionFull = (ctx: CalibrationContext) => ctx.nutritionScope === "full";
const endurance = (ctx: CalibrationContext) => has(ctx, "endurance");
const advancedServed = (ctx: CalibrationContext) => ctx.experience.includes("advanced");

// ---------------------------------------------------------------------------
// Factor catalog (situations)
// ---------------------------------------------------------------------------

const F = {
  adherence: { id: "adherence", label: "Adherence", type: "enum", options: opts([["high", "High"], ["moderate", "Moderate"], ["low", "Low"]]) },
  stallWeeks: { id: "stall_weeks", label: "How long it's stalled", type: "number", unit: "weeks" },
  performance: { id: "performance", label: "Training performance", type: "enum", options: opts([["improving", "Improving"], ["stable", "Stable"], ["declining", "Declining"]]) },
  recovery: { id: "recovery", label: "Recovery", type: "enum", options: opts([["good", "Good"], ["acceptable", "Acceptable"], ["poor", "Poor"]]) },
  hunger: { id: "hunger", label: "Hunger", type: "enum", options: opts([["normal", "Normal"], ["high", "High"]]) },
  activityTrend: { id: "activity_trend", label: "Daily activity trend", type: "enum", options: opts([["up", "Going up"], ["stable", "Stable"], ["down", "Going down"]]) },
  rateSoFar: { id: "rate_so_far", label: "Rate of change so far", type: "enum", options: opts([["on_target", "On target"], ["slower", "Slower than target"], ["faster", "Faster than target"]]) },
  phaseWeeks: { id: "phase_weeks", label: "Weeks into the current phase", type: "number", unit: "weeks" },
  preference: { id: "client_preference", label: "What the client prefers", type: "enum", options: opts([["more_food", "More food"], ["more_activity", "More activity"], ["no_preference", "No preference"]]) },
  missedCount: { id: "missed_count", label: "Sessions missed", type: "number", unit: "sessions" },
  daysLeft: { id: "days_left", label: "Days left in the week", type: "number", unit: "days" },
  sessionType: { id: "session_type", label: "Which session", type: "enum", options: opts([["key", "A key session"], ["supporting", "A supporting session"]]) },
  reason: { id: "reason", label: "Why", type: "enum", options: opts([["illness", "Illness"], ["schedule", "Schedule"], ["motivation", "Motivation"], ["travel", "Travel"]]) },
  nights: { id: "poor_nights", label: "Poor nights in a row", type: "number", unit: "nights" },
  weeksTrend: { id: "trend_weeks", label: "How long the trend has lasted", type: "number", unit: "weeks" },
  experience: { id: "experience", label: "Client experience", type: "enum", options: EXPERIENCE_KEYS },
  phase: { id: "program_phase", label: "Program phase", type: "enum", options: opts([["early", "Early"], ["middle", "Middle"], ["late", "Late / peaking"]]) },
  eventSoon: { id: "event_within_weeks", label: "Weeks until their event", type: "number", unit: "weeks" },
  aboveTarget: { id: "percent_above_target", label: "How far faster than target", type: "number", unit: "%" },
  tracking: { id: "tracking_consistency", label: "Logging consistency", type: "enum", options: opts([["consistent", "Consistent"], ["patchy", "Patchy"], ["none", "Not logging"]]) },
} satisfies Record<string, FactorDef>;

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

type Q = CalibrationQuestion;

function situation(id: string, prompt: string, actions: [string, string][], factors: FactorDef[], visibleIf?: (ctx: CalibrationContext) => boolean, summaryLabel?: string): Q {
  return {
    id,
    chapter: "situations",
    prompt,
    kind: "scenario",
    scenario: { actions: opts(actions), factors, allowDepends: true, allowFallbacks: true },
    required: false,
    status: "C",
    visibleIf,
    summaryLabel: summaryLabel ?? prompt,
  };
}

// ---------------------------------------------------------------------------
// Step 0 — What you coach
// ---------------------------------------------------------------------------

const YOUR_COACHING: Q[] = [
  {
    id: "coaching_areas",
    chapter: "your_coaching",
    prompt: "Tell OPTIM what you coach.",
    explanation: "Describe who you work with, what you help them accomplish, and the kinds of training or coaching you provide. OPTIM will suggest the areas to calibrate — you confirm or change them.",
    kind: "description",
    control: { kind: "multi", options: AREA_OPTIONS },
    required: true,
    status: "B",
    summaryLabel: "Coaching areas",
  },
  {
    id: "strength_specialties",
    chapter: "your_coaching",
    prompt: "What kind of strength coaching do you do?",
    kind: "control",
    control: { kind: "multi", options: STRENGTH_SPECIALTY_OPTIONS, otherAllowed: true },
    required: false,
    status: "C",
    visibleIf: (c) => has(c, "strength"),
    summaryLabel: "Strength specialties",
  },
  {
    id: "sport_performance_sports",
    chapter: "your_coaching",
    prompt: "Which sports do your athletes play?",
    kind: "control",
    control: { kind: "multi", options: SPORT_OPTIONS, otherAllowed: true },
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "sport_performance"),
    summaryLabel: "Sports",
  },
  {
    id: "endurance_sports",
    chapter: "your_coaching",
    prompt: "Which endurance sports do you coach?",
    kind: "control",
    control: { kind: "multi", options: ENDURANCE_SPORT_OPTIONS, otherAllowed: true },
    required: true,
    status: "B",
    visibleIf: (c) => endurance(c),
    summaryLabel: "Endurance sports",
  },
  {
    id: "client_groups",
    chapter: "your_coaching",
    prompt: "Who do you work with?",
    kind: "group",
    required: true,
    status: "B",
    summaryLabel: "Clients",
    parts: [
      {
        id: "experience_levels",
        chapter: "your_coaching",
        prompt: "Experience levels you coach",
        kind: "control",
        control: { kind: "multi", options: EXPERIENCE_KEYS },
        required: true,
        status: "B",
        summaryLabel: "Experience levels",
      },
      {
        id: "client_modifiers",
        chapter: "your_coaching",
        prompt: "Do you use a specific approach for any of these groups?",
        explanation: "Only choose a group if you coach them differently. Those rules then apply only to clients in that group.",
        kind: "control",
        control: {
          kind: "multi",
          options: [
            { value: "older_adults", label: "Older adults (50+)", description: "I use an older-adult-specific approach" },
            { value: "home_limited", label: "Home or limited equipment" },
            { value: "postpartum", label: "Postpartum / return to training" },
            { value: "time_limited", label: "Very time-limited clients" },
            { value: "none", label: "None — the same approach for everyone", exclusive: true },
          ],
        },
        required: true,
        status: "B",
        summaryLabel: "Client-group approaches",
      },
    ],
  },
  {
    id: "nutrition_scope",
    chapter: "your_coaching",
    prompt: "Do you coach nutrition?",
    kind: "control",
    control: {
      kind: "single",
      options: [
        { value: "full", label: "Yes — full nutrition coaching", description: "Targets, plans or structured guidance" },
        { value: "guidance", label: "General guidance only", description: "Principles, not targets or plans" },
        { value: "none", label: "No — nutrition isn't part of my coaching" },
      ],
    },
    required: true,
    status: "B",
    summaryLabel: "Nutrition coaching",
  },
  {
    id: "practice_goals",
    chapter: "your_coaching",
    prompt: "Which goals do you help clients reach?",
    explanation: "Suggested from your coaching areas — adjust them so they match what you actually do.",
    kind: "control",
    control: {
      kind: "multi",
      options: opts([
        ["build_muscle", "Build muscle"],
        ["lose_fat", "Lose fat"],
        ["recomposition", "Body recomposition"],
        ["get_stronger", "Get stronger"],
        ["athletic_performance", "Athletic performance"],
        ["endurance_event", "Endurance events / races"],
        ["general_health", "Health & consistency"],
      ]),
    },
    required: true,
    status: "A",
    suggest: (c) => {
      const s = new Set<string>();
      if (has(c, "strength")) s.add("get_stronger");
      if (has(c, "physique")) s.add("build_muscle");
      if (has(c, "sport_performance")) s.add("athletic_performance");
      if (has(c, "endurance")) s.add("endurance_event");
      if (has(c, "general_fitness")) s.add("general_health");
      if (has(c, "weight_management")) s.add("lose_fat");
      return [...s];
    },
    summaryLabel: "Goals",
  },
  {
    id: "programs_resistance",
    chapter: "your_coaching",
    prompt: "Do you program resistance training for your clients?",
    kind: "control",
    control: { kind: "boolean", yesLabel: "Yes", noLabel: "No" },
    required: true,
    status: "B",
    visibleIf: (c) => !has(c, "strength") && !has(c, "physique") && (has(c, "general_fitness") || has(c, "weight_management") || has(c, "sport_performance")),
    summaryLabel: "Programs resistance training",
  },
];

// ---------------------------------------------------------------------------
// Universal core
// ---------------------------------------------------------------------------

const PHILOSOPHY: Q[] = [
  {
    id: "practice_success_definition",
    chapter: "philosophy",
    prompt: "In a sentence or two, what does successful coaching look like to you?",
    kind: "control",
    control: { kind: "text", multiline: true },
    required: true,
    status: "B",
    summaryLabel: "What success looks like",
  },
  {
    id: "program_format",
    chapter: "philosophy",
    prompt: "How is your programming structured?",
    kind: "control",
    control: { kind: "single", options: opts([["fixed_length", "Fixed-length programs"], ["rolling_blocks", "Ongoing, in rolling blocks"], ["both", "Both, depending on the client"]]) },
    required: true,
    status: "C",
    summaryLabel: "Program structure",
  },
  {
    id: "program_length",
    chapter: "philosophy",
    prompt: "How long is a typical program or training block?",
    kind: "layered",
    control: { kind: "range", spec: num(2, 24, 1, "weeks", { hardMin: 1, allowPreferred: true }) },
    variesBy: (c) => (endurance(c) || has(c, "sport_performance") ? [dim("event", "By event", EVENT_KEYS)] : []),
    required: true,
    status: "B",
    summaryLabel: "Program length",
  },
  {
    id: "practice_excluded",
    chapter: "philosophy",
    prompt: "Are there goals or client situations you don't take on?",
    explanation: "Recorded for future use — OPTIM doesn't screen clients against this yet. Clients under 17 are already excluded by OPTIM.",
    kind: "control",
    control: {
      kind: "multi",
      options: [
        ...opts([["contest_prep", "Contest prep"], ["return_from_surgery", "Return from surgery"], ["eating_disorder_history", "Active eating-disorder history"], ["extreme_weight_goals", "Extreme weight goals"]]),
        { value: "none", label: "None — I take a broad range of clients", exclusive: true },
      ],
    },
    required: false,
    status: "C",
    summaryLabel: "Clients you don't take on",
  },
  {
    id: "checkin_rhythm",
    chapter: "philosophy",
    prompt: "How often do you check in with an active client?",
    kind: "control",
    control: { kind: "number", spec: num(1, 30, 1, "days", { hardMin: 1 }) },
    required: true,
    status: "C",
    summaryLabel: "Check-in rhythm",
  },
];

/** Directness/warmth/accountability a voice sample implies — a suggestion the
 * coach confirms or adjusts on the fine-tune screen (never saved unseen). */
export const VOICE_SAMPLE_PRESETS: Record<string, { tone: string; directness: number; warmth: number; accountability: number; followUp: string }> = {
  direct_concise: { tone: "direct", directness: 4, warmth: 2, accountability: 4, followUp: "same_day_direct_check_in" },
  warm_curious: { tone: "warm", directness: 2, warmth: 4, accountability: 2, followUp: "same_day_gentle_check_in" },
  explain_reasoning: { tone: "explanatory", directness: 3, warmth: 3, accountability: 3, followUp: "same_day_explain_impact" },
  highly_accountable: { tone: "accountable", directness: 5, warmth: 2, accountability: 5, followUp: "same_day_firm_check_in" },
};

const VOICE: Q[] = [
  {
    id: "comm_voice_sample",
    chapter: "voice",
    prompt: "A client misses their second session this week without saying anything. Which reply sounds most like you?",
    kind: "control",
    control: {
      kind: "single",
      options: [
        { value: "direct_concise", label: "“Noticed you missed the last two sessions — what's going on? Let's get back on track today.”", description: "Direct, concise, action-first" },
        { value: "warm_curious", label: "“Hey! Haven't seen you log the last couple of sessions — everything okay? No judgment, just checking in.”", description: "Warm, curious, low-pressure" },
        { value: "explain_reasoning", label: "“Missing back-to-back sessions will slow your progress — let's figure out what happened and adjust the rest of the week.”", description: "Explains the stakes, then acts" },
        { value: "highly_accountable", label: "“That's twice this week now. Check in with me before you skip a third.”", description: "High accountability, firm" },
      ],
    },
    required: true,
    status: "A",
    summaryLabel: "Voice",
  },
  {
    id: "comm_fine_tune",
    chapter: "voice",
    prompt: "Fine-tune your voice",
    explanation: "Set from the reply you chose — adjust anything that isn't quite you.",
    kind: "group",
    required: true,
    status: "A",
    summaryLabel: "Directness, warmth and accountability",
    parts: [
      { id: "comm_directness", chapter: "voice", prompt: "Directness", kind: "control", control: { kind: "scale", min: 1, max: 5, minLabel: "Gentle", maxLabel: "Very direct" }, required: true, status: "A", summaryLabel: "Directness", suggest: (c) => VOICE_SAMPLE_PRESETS[String(ans(c, "comm_voice_sample"))]?.directness },
      { id: "comm_warmth", chapter: "voice", prompt: "Warmth", kind: "control", control: { kind: "scale", min: 1, max: 5, minLabel: "Matter-of-fact", maxLabel: "Very warm" }, required: true, status: "A", summaryLabel: "Warmth", suggest: (c) => VOICE_SAMPLE_PRESETS[String(ans(c, "comm_voice_sample"))]?.warmth },
      { id: "comm_accountability", chapter: "voice", prompt: "Accountability", kind: "control", control: { kind: "scale", min: 1, max: 5, minLabel: "Light touch", maxLabel: "Firm" }, required: true, status: "B", summaryLabel: "Accountability", suggest: (c) => VOICE_SAMPLE_PRESETS[String(ans(c, "comm_voice_sample"))]?.accountability },
    ],
  },
  {
    id: "comm_writing",
    chapter: "voice",
    prompt: "How you write",
    kind: "group",
    required: true,
    status: "A",
    summaryLabel: "Writing style",
    parts: [
      { id: "comm_message_length", chapter: "voice", prompt: "Typical message length", kind: "control", control: { kind: "single", options: opts([["short", "Short — a sentence or two"], ["medium", "Medium — a short paragraph"], ["long", "Long — I like to fully explain"]]) }, required: true, status: "A", summaryLabel: "Message length" },
      { id: "comm_technical_language", chapter: "voice", prompt: "How technical your language is", kind: "control", control: { kind: "single", options: opts([["plain", "Plain — no jargon"], ["moderate", "Moderate — I explain terms"], ["technical", "Technical — my clients know the terms"]]) }, required: true, status: "B", summaryLabel: "Technical language" },
    ],
  },
  {
    id: "comm_humor",
    chapter: "voice",
    prompt: "How much humor do you use with clients?",
    kind: "control",
    control: { kind: "single", options: opts([["rarely", "Rarely"], ["sometimes", "Sometimes"], ["often", "Often"]]) },
    required: false,
    status: "B",
    summaryLabel: "Humor",
  },
  {
    id: "comm_avoided_phrases",
    chapter: "voice",
    prompt: "Any phrases, tones or approaches OPTIM should never use for you?",
    kind: "control",
    control: { kind: "tags", placeholder: "e.g. no exclamation marks, never say “cheat meal”" },
    required: false,
    status: "B",
    summaryLabel: "Phrases to avoid",
  },
  {
    id: "comm_reinforce",
    chapter: "voice",
    prompt: "Which client behaviors do you reinforce most?",
    kind: "control",
    control: { kind: "multi", options: opts([["consistency", "Consistency over intensity"], ["honest_reporting", "Honest reporting"], ["communication", "Proactive communication"], ["effort", "Visible effort"], ["patience", "Patience with the process"]]) },
    required: false,
    status: "C",
    summaryLabel: "Behaviors you reinforce",
  },
];

const MESSAGES: Q[] = [
  {
    id: "comm_ai_direct_response",
    chapter: "messages",
    prompt: "Which client messages can OPTIM answer directly, without you reviewing them first?",
    kind: "control",
    control: {
      kind: "multi",
      options: [
        ...opts([["routine_logistics", "Routine logistics (“what time is my session?”)"], ["how_to_log_a_meal", "How to log something"], ["exercise_how_to", "How to perform an exercise"]]),
        { value: "none", label: "None — I want to see everything first", exclusive: true },
      ],
    },
    required: true,
    status: "A",
    summaryLabel: "OPTIM may answer directly",
  },
  {
    id: "comm_must_respond_personally",
    chapter: "messages",
    prompt: "Which other situations do you always want to answer personally?",
    explanation: "Pain or injury reports and emotional distress always come to you — that's an OPTIM safety minimum.",
    kind: "control",
    control: { kind: "multi", options: opts([["billing_or_account", "Billing or account questions"], ["major_goal_change_request", "A major goal-change request"]]) },
    required: false,
    status: "A",
    summaryLabel: "Always answered by you",
  },
];

const SAFETY: Q[] = [
  {
    id: "safety_policy",
    chapter: "safety",
    prompt: "OPTIM's safety minimums",
    explanation: "These apply to every client, whatever your settings. You can add stricter rules — never looser ones.",
    kind: "policy",
    policy: {
      statements: SAFETY_MINIMUM_STATEMENTS,
      stricter: [{ value: "escalate_medical_before_reply", label: "Escalate medical questions to me before OPTIM replies at all" }],
    },
    required: true,
    status: "B",
    summaryLabel: "Your stricter safety rules",
  },
  {
    id: "scn_pain",
    chapter: "safety",
    prompt: "When a client reports pain during a workout, what should OPTIM tell them to do while it reaches you?",
    kind: "control",
    control: { kind: "single", options: opts([["stop_exercise_and_notify", "Stop that exercise"], ["stop_workout_and_notify", "Stop the whole session (stricter)"]]) },
    required: true,
    status: "A",
    summaryLabel: "Pain during a workout",
  },
  {
    id: "scn_possible_injury",
    chapter: "safety",
    prompt: "When something sounds like a possible injury, how do you usually follow up?",
    explanation: "This always escalates to you — this is your own follow-up approach.",
    kind: "control",
    control: { kind: "single", options: opts([["pause_plan_and_escalate", "Pause their plan until I review it"], ["modify_and_escalate", "Train around it until I review it"]]) },
    required: true,
    status: "A",
    summaryLabel: "Possible injury",
  },
  {
    id: "safety_absolute_rules",
    chapter: "safety",
    prompt: "Any hard rules of your own OPTIM should never break?",
    explanation: "These are added on top of OPTIM's safety minimums — they can only make things stricter.",
    kind: "control",
    control: { kind: "tags", placeholder: "e.g. no barbell work in a client's first two weeks" },
    required: false,
    status: "A",
    summaryLabel: "Your hard rules",
  },
];

// ---------------------------------------------------------------------------
// Training base (T)
// ---------------------------------------------------------------------------

const t = (c: CalibrationContext) => c.training;
const effortMetrics = (c: CalibrationContext) => arr(ans(c, "t_effort_metric"));
const onlyPlainEffort = (c: CalibrationContext) => {
  const m = effortMetrics(c);
  return m.length > 0 && m.every((v) => v === "plain_cues");
};

const TRAINING: Q[] = [
  {
    id: "t_days",
    chapter: "training",
    prompt: "How many days a week do your clients usually train?",
    kind: "layered",
    control: { kind: "range", spec: num(1, 7, 1, "days/week", { hardMin: 1, hardMax: 7 }) },
    variesBy: (c) => (has(c, "sport_performance") ? [bySeason()] : []),
    required: true,
    status: "A",
    visibleIf: t,
    summaryLabel: "Training days",
  },
  {
    id: "t_session_length",
    chapter: "training",
    prompt: "How long are your sessions, usually?",
    kind: "control",
    control: { kind: "range", spec: num(20, 120, 5, "min", { hardMin: 1, allowPreferred: true }) },
    required: true,
    status: "B",
    visibleIf: t,
    summaryLabel: "Session length",
  },
  {
    id: "t_splits",
    chapter: "training",
    prompt: "Which training splits do you use?",
    kind: "layered",
    control: { kind: "multi", options: opts([["full_body", "Full body"], ["upper_lower", "Upper / lower"], ["push_pull_legs", "Push / pull / legs"], ["body_part_split", "Body-part split"], ["full_body_high_frequency", "High-frequency full body"]]) },
    variesBy: (c) => [dim("day_count", "Depends on how many days the client has", dayCountKeys(c))],
    required: true,
    status: "A",
    visibleIf: t,
    summaryLabel: "Splits",
  },
  {
    id: "t_sets",
    chapter: "training",
    prompt: "How many working sets per exercise, usually?",
    kind: "layered",
    control: { kind: "range", spec: num(1, 8, 1, "sets", { hardMin: 1 }) },
    variesBy: (c) => [byExerciseType(), byExperience(), ...(has(c, "sport_performance") ? [bySeason()] : [])],
    required: true,
    status: "A",
    visibleIf: t,
    summaryLabel: "Working sets per exercise",
  },
  {
    id: "t_reps",
    chapter: "training",
    prompt: "What rep range do you build most training around?",
    kind: "layered",
    control: { kind: "range", spec: num(1, 30, 1, "reps", { hardMin: 1 }) },
    variesBy: () => [byExerciseType(), dim("program_phase", "Shifts across program phases", [])],
    required: true,
    status: "B",
    visibleIf: t,
    summaryLabel: "Rep range",
  },
  {
    id: "t_effort_metric",
    chapter: "training",
    prompt: "How do you express training effort?",
    kind: "control",
    control: {
      kind: "multi",
      options: [
        { value: "rir", label: "Reps in reserve (RIR)" },
        { value: "rpe", label: "RPE" },
        { value: "percent_1rm", label: "Percentages of 1RM" },
        { value: "velocity", label: "Bar speed (velocity)" },
        { value: "fixed_loads", label: "Fixed loads I set" },
        { value: "plain_cues", label: "Plain effort cues (no numbers)" },
      ],
    },
    required: true,
    status: "A",
    visibleIf: t,
    summaryLabel: "How effort is expressed",
  },
  {
    id: "t_effort_rir",
    chapter: "training",
    prompt: "How close to failure should most working sets end?",
    explanation: "In reps left in the tank. Even if you program by percentages or bar speed, this is how hard sets should feel.",
    kind: "layered",
    control: { kind: "range", spec: num(0, 5, 0.5, "reps in reserve", { hardMin: 0 }) },
    variesBy: (c) => [byExerciseType(), ...(has(c, "sport_performance") ? [bySeason()] : [])],
    required: true,
    status: "B",
    visibleIf: (c) => t(c) && effortMetrics(c).length > 0 && !onlyPlainEffort(c),
    summaryLabel: "Effort (reps in reserve)",
  },
  {
    id: "t_effort_plain",
    chapter: "training",
    prompt: "How hard should most working sets feel?",
    kind: "control",
    control: {
      kind: "single",
      options: [
        { value: "comfortable", label: "Comfortable — about 4 or more reps left in the tank" },
        { value: "challenging", label: "Challenging but doable — about 2–3 reps left" },
        { value: "very_hard", label: "Very hard — about 0–1 reps left" },
      ],
    },
    required: true,
    status: "B",
    visibleIf: (c) => t(c) && onlyPlainEffort(c),
    summaryLabel: "How hard sets should feel",
  },
  {
    id: "t_percent_1rm",
    chapter: "training",
    prompt: "What percentage range do most working sets use?",
    kind: "control",
    control: { kind: "range", spec: num(50, 100, 2.5, "% of 1RM", { hardMin: 0, hardMax: 100 }) },
    required: true,
    status: "C",
    visibleIf: (c) => t(c) && effortMetrics(c).includes("percent_1rm"),
    summaryLabel: "Percentage of 1RM",
  },
  {
    id: "t_progression_method",
    chapter: "training",
    prompt: "How do you progress a client from week to week?",
    explanation: "Pick your main method first; add others in the order you'd use them.",
    kind: "layered",
    control: {
      kind: "ranked",
      options: opts([
        ["add_load_when_reps_hit", "Add load when they hit the target reps"],
        ["double_progression", "Double progression (reps first, then load)"],
        ["add_reps_or_sets", "Add reps or sets"],
        ["percentage_waves", "Percentage waves"],
        ["autoregulated", "Autoregulated by RPE / RIR"],
        ["small_steps_by_feel", "Add a little when it feels easier"],
      ]),
    },
    variesBy: () => [byExerciseType(), byExperience()],
    required: true,
    status: "A",
    visibleIf: t,
    summaryLabel: "Week-to-week progression",
  },
  {
    id: "t_long_term_structure",
    chapter: "training",
    prompt: "How do you structure training over the long term?",
    kind: "layered",
    control: { kind: "single", options: opts([["none_formal", "No formal structure"], ["linear_phases", "Linear phases"], ["block", "Block periodization"], ["undulating", "Undulating (varied week to week)"], ["conjugate", "Conjugate"]]) },
    variesBy: () => [byExperience()],
    required: true,
    status: "B",
    visibleIf: (c) => t(c) && (has(c, "strength") || has(c, "sport_performance") || advancedServed(c)),
    summaryLabel: "Long-term structure",
  },
  {
    id: "t_deload_approach",
    chapter: "training",
    prompt: "How do you handle deloads?",
    kind: "control",
    control: { kind: "single", options: opts([["fixed", "On a schedule"], ["as_needed", "Only when fatigue calls for it"], ["none", "I don't program deloads"]]) },
    required: true,
    status: "A",
    visibleIf: t,
    summaryLabel: "Deloads",
  },
  {
    id: "t_deload_every",
    chapter: "training",
    prompt: "How often do you schedule a deload?",
    kind: "control",
    control: { kind: "range", spec: num(3, 12, 1, "weeks", { hardMin: 1 }) },
    required: true,
    status: "B",
    visibleIf: (c) => t(c) && ans(c, "t_deload_approach") === "fixed",
    summaryLabel: "Deload every",
  },
  {
    id: "t_deload_triggers",
    chapter: "training",
    prompt: "What tells you a client needs a deload?",
    kind: "control",
    control: { kind: "multi", options: opts([["performance_drop", "Performance dropping"], ["rising_effort", "Effort rising at the same loads"], ["poor_recovery", "Poor sleep or recovery"], ["joint_aches", "Achy joints"], ["motivation_drop", "Motivation dropping"], ["client_request", "The client asks"]]) },
    required: false,
    status: "C",
    visibleIf: (c) => t(c) && ans(c, "t_deload_approach") === "as_needed",
    summaryLabel: "Deload triggers",
  },
  {
    id: "t_warmup",
    chapter: "training",
    prompt: "How do you approach warm-ups?",
    kind: "control",
    control: { kind: "single", options: opts([["ramped_warmup_sets", "Ramped warm-up sets before working weight"], ["general_then_specific", "General movement prep, then a specific ramp-up"], ["minimal", "Minimal — a light first set is enough"]]) },
    required: true,
    status: "A",
    visibleIf: t,
    summaryLabel: "Warm-ups",
  },
  {
    id: "t_swap_rule",
    chapter: "training",
    prompt: "When an exercise has to be swapped, how should the replacement be chosen?",
    kind: "control",
    control: { kind: "single", options: opts([["same_pattern_and_equipment", "Same movement pattern, available equipment"], ["closest_available", "Closest available option"], ["ask_client", "Ask the client what they can do"], ["ask_coach", "Ask me first"]]) },
    required: true,
    status: "B",
    visibleIf: t,
    summaryLabel: "Exercise swaps",
  },
  {
    id: "t_exercises_avoided",
    chapter: "training",
    prompt: "Any exercises you avoid prescribing?",
    kind: "control",
    control: { kind: "tags", placeholder: "e.g. behind-the-neck press" },
    required: false,
    status: "A",
    visibleIf: t,
    summaryLabel: "Exercises you avoid",
  },
  {
    id: "t_rest_periods",
    chapter: "training",
    prompt: "How long do clients rest between working sets?",
    kind: "layered",
    control: { kind: "range", spec: num(0.5, 5, 0.5, "min", { hardMin: 0 }) },
    variesBy: () => [byExerciseType()],
    required: false,
    status: "C",
    visibleIf: t,
    summaryLabel: "Rest between sets",
  },
  {
    id: "t_when_short",
    chapter: "training",
    prompt: "When a session has to be shorter, what goes first?",
    kind: "control",
    control: { kind: "ranked", options: opts([["drop_accessories", "Drop accessories"], ["fewer_sets", "Fewer sets"], ["superset", "Superset exercises"], ["shorter_rest", "Shorter rest"], ["main_lift_only", "Keep only the main lift"]]) },
    required: false,
    status: "C",
    visibleIf: t,
    summaryLabel: "When short on time",
  },
  {
    id: "t_cardio_roles",
    chapter: "training",
    prompt: "What role does cardio play in your programs?",
    kind: "control",
    control: {
      kind: "multi",
      options: [
        ...opts([["optional_low_intensity", "Optional, low-intensity extra"], ["fat_loss", "Part of fat-loss work"], ["conditioning", "Conditioning, for everyone"], ["health", "General health"]]),
        { value: "none", label: "Rarely part of my programs", exclusive: true },
      ],
    },
    required: true,
    status: "A",
    visibleIf: (c) => t(c) && !endurance(c),
    summaryLabel: "Cardio",
  },
  {
    id: "t_cardio_minutes",
    chapter: "training",
    prompt: "Roughly how many minutes of cardio a week?",
    kind: "control",
    control: { kind: "range", spec: num(0, 300, 15, "min/week", { hardMin: 0 }) },
    required: false,
    status: "C",
    visibleIf: (c) => t(c) && !endurance(c) && arr(ans(c, "t_cardio_roles")).length > 0 && !arr(ans(c, "t_cardio_roles")).includes("none"),
    summaryLabel: "Weekly cardio",
  },
];

// ---------------------------------------------------------------------------
// Strength (S)
// ---------------------------------------------------------------------------

const STRENGTH: Q[] = [
  {
    id: "s_lift_frequency",
    chapter: "strength",
    prompt: "How many times a week does a client train each main lift, including variations?",
    kind: "control",
    control: { kind: "range", spec: num(1, 6, 1, "times/week", { hardMin: 0, hardMax: 14 }) },
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "strength"),
    summaryLabel: "Main-lift frequency",
  },
  {
    id: "s_variations",
    chapter: "strength",
    prompt: "Which main-lift variations do you rely on?",
    kind: "control",
    control: {
      kind: "multi",
      options: [...opts([["paused", "Paused"], ["tempo", "Tempo"], ["pins_boards", "Pins / boards"], ["grip_stance", "Grip or stance variations"], ["specialty_bars", "Specialty bars"]]), { value: "rarely", label: "I rarely use variations", exclusive: true }],
      otherAllowed: true,
    },
    required: false,
    status: "C",
    visibleIf: (c) => has(c, "strength"),
    summaryLabel: "Lift variations",
  },
  {
    id: "s_max_testing",
    chapter: "strength",
    prompt: "How do you test strength?",
    kind: "control",
    control: { kind: "single", options: opts([["true_max", "True 1RM tests"], ["amrap_e1rm", "AMRAP sets / estimated maxes"], ["rpe_e1rm", "Estimated maxes from RPE"], ["meet_only", "Only at competition"], ["no_testing", "I don't test maxes"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "strength"),
    summaryLabel: "Strength testing",
  },
  {
    id: "s_peaking",
    chapter: "strength",
    prompt: "Do you peak clients for meets or tests?",
    kind: "control",
    control: { kind: "boolean" },
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "strength"),
    summaryLabel: "Peaking",
  },
  {
    id: "s_taper_weeks",
    chapter: "strength",
    prompt: "How long is your peak or taper?",
    kind: "control",
    control: { kind: "range", spec: num(1, 6, 1, "weeks", { hardMin: 0 }) },
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "strength") && ans(c, "s_peaking") === true,
    summaryLabel: "Peak / taper length",
  },
  {
    id: "s_weight_class",
    chapter: "strength",
    prompt: "Do you manage weight-class making for competitions?",
    explanation: "Recorded for future use — OPTIM never acts on weight-class plans.",
    kind: "control",
    control: { kind: "boolean" },
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "strength") && ans(c, "s_peaking") === true,
    summaryLabel: "Weight-class making",
  },
  {
    id: "s_weight_class_cut",
    chapter: "strength",
    prompt: "In the final week, how much bodyweight do you plan to cut at most?",
    kind: "control",
    control: { kind: "range", spec: num(0, 8, 0.5, "% bodyweight", { hardMin: 0, hardMax: 100 }) },
    required: false,
    status: "C",
    visibleIf: (c) => has(c, "strength") && ans(c, "s_weight_class") === true,
    summaryLabel: "Final-week cut",
  },
];

// ---------------------------------------------------------------------------
// Physique (P)
// ---------------------------------------------------------------------------

const PHYSIQUE: Q[] = [
  {
    id: "p_weekly_sets",
    chapter: "physique",
    prompt: "How many hard sets per muscle per week, usually?",
    kind: "layered",
    control: { kind: "range", spec: num(4, 30, 1, "sets/muscle/week", { hardMin: 0 }) },
    variesBy: () => [dim("muscle_priority", "Priority vs maintenance muscles", opts([["priority", "Priority muscles"], ["maintenance", "Maintenance muscles"]]))],
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "physique"),
    summaryLabel: "Weekly sets per muscle",
  },
  {
    id: "p_intensity_techniques",
    chapter: "physique",
    prompt: "Which intensity techniques do you use?",
    kind: "control",
    control: { kind: "multi", options: [...opts([["drop_sets", "Drop sets"], ["rest_pause", "Rest-pause"], ["myo_reps", "Myo-reps"], ["partials", "Lengthened partials"], ["supersets", "Supersets"]]), { value: "none", label: "None", exclusive: true }] },
    required: false,
    status: "C",
    visibleIf: (c) => has(c, "physique"),
    summaryLabel: "Intensity techniques",
  },
  {
    id: "p_rotation",
    chapter: "physique",
    prompt: "How often do you rotate exercises?",
    kind: "control",
    control: { kind: "single", options: opts([["every_block", "Every training block"], ["when_stale", "Only when progress stalls"], ["rarely", "Rarely — I keep staples"]]) },
    required: false,
    status: "C",
    visibleIf: (c) => has(c, "physique"),
    summaryLabel: "Exercise rotation",
  },
  {
    id: "p_exercise_selection",
    chapter: "physique",
    prompt: "What do you emphasize when choosing exercises?",
    kind: "control",
    control: { kind: "multi", options: opts([["stable_machines", "Machines and cables for stability"], ["free_weights", "Free weights"], ["lengthened_bias", "Lengthened-position bias"], ["joint_friendly", "Joint-friendly variations"], ["unilateral", "Unilateral work"]]) },
    required: false,
    status: "C",
    visibleIf: (c) => has(c, "physique"),
    summaryLabel: "Exercise selection",
  },
  {
    id: "p_contest_prep",
    chapter: "physique",
    prompt: "Do you coach contest prep?",
    kind: "control",
    control: { kind: "boolean" },
    required: false,
    status: "C",
    visibleIf: (c) => has(c, "physique") && !arr(ans(c, "practice_excluded")).includes("contest_prep"),
    summaryLabel: "Contest prep",
  },
  {
    id: "p_prep_length",
    chapter: "physique",
    prompt: "How long is a typical prep?",
    kind: "control",
    control: { kind: "range", spec: num(8, 40, 1, "weeks", { hardMin: 1 }) },
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "physique") && ans(c, "p_contest_prep") === true,
    summaryLabel: "Prep length",
  },
];

// ---------------------------------------------------------------------------
// Sport performance (SP)
// ---------------------------------------------------------------------------

const SPORT_PERFORMANCE: Q[] = [
  {
    id: "sp_season_approach",
    chapter: "sport_performance",
    prompt: "How does your training change across the season?",
    kind: "control",
    control: { kind: "single", options: opts([["same_all_year", "Roughly the same all year"], ["reduce_in_season", "Build off-season, maintain in-season"], ["phase_periodized", "Fully periodized by season phase"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "sport_performance"),
    summaryLabel: "Season approach",
  },
  {
    id: "sp_competition",
    chapter: "sport_performance",
    prompt: "How do you train around games and team practice?",
    kind: "group",
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "sport_performance"),
    summaryLabel: "Training around competition",
    parts: [
      { id: "sp_day_before", chapter: "sport_performance", prompt: "The day before a game", kind: "control", control: { kind: "single", options: opts([["none", "No training"], ["light", "Light activation only"], ["normal", "Normal training"]]) }, required: true, status: "C", summaryLabel: "Day before a game" },
      { id: "sp_day_after", chapter: "sport_performance", prompt: "The day after a game", kind: "control", control: { kind: "single", options: opts([["none", "No training"], ["light", "Recovery / light only"], ["normal", "Normal training"]]) }, required: true, status: "C", summaryLabel: "Day after a game" },
      { id: "sp_team_practice_load", chapter: "sport_performance", prompt: "Do you count team practice in the weekly load?", kind: "control", control: { kind: "boolean" }, required: true, status: "C", summaryLabel: "Counts team practice" },
    ],
  },
  {
    id: "sp_speed_power",
    chapter: "sport_performance",
    prompt: "Which speed, power and agility work do you program?",
    kind: "control",
    control: { kind: "multi", options: [...opts([["acceleration", "Acceleration"], ["top_speed", "Top speed"], ["change_of_direction", "Change of direction"], ["reactive_agility", "Reactive agility"], ["jumps_plyometrics", "Jumps / plyometrics"], ["med_ball", "Med-ball throws"]]), { value: "none", label: "None — the team covers it", exclusive: true }] },
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "sport_performance"),
    summaryLabel: "Speed, power and agility",
  },
  {
    id: "sp_conditioning",
    chapter: "sport_performance",
    prompt: "How do you condition athletes?",
    kind: "control",
    control: { kind: "multi", options: [...opts([["sport_intervals", "Sport-specific intervals"], ["small_sided_games", "Small-sided games"], ["tempo_runs", "Tempo runs"], ["aerobic_base", "Aerobic base work"]]), { value: "team", label: "The team handles conditioning", exclusive: true }] },
    required: true,
    status: "C",
    visibleIf: (c) => has(c, "sport_performance"),
    summaryLabel: "Conditioning",
  },
];

// ---------------------------------------------------------------------------
// Endurance (E)
// ---------------------------------------------------------------------------

const volumeUnit = (c: CalibrationContext) => String(ans(c, "e_volume_unit") ?? "hours");
const VOLUME_SPECS: Record<string, NumberSpec> = {
  hours: num(2, 20, 0.5, "hours/week", { hardMin: 0 }),
  km: num(10, 150, 5, "km/week", { hardMin: 0 }),
  mi: num(5, 100, 5, "mi/week", { hardMin: 0 }),
  load: num(100, 1000, 25, "load points/week", { hardMin: 0 }),
};
export function enduranceVolumeSpec(unit: string): NumberSpec {
  return VOLUME_SPECS[unit] ?? VOLUME_SPECS.hours;
}
const multiSport = (c: CalibrationContext) => c.enduranceSports.length > 1 || c.enduranceSports.includes("triathlon");

const ENDURANCE: Q[] = [
  {
    id: "e_volume_unit",
    chapter: "endurance",
    prompt: "How do you measure training volume and load?",
    kind: "control",
    control: { kind: "single", options: opts([["hours", "Time"], ["km", "Distance (km)"], ["mi", "Distance (miles)"], ["load", "A training-load score (e.g. TSS)"]]) },
    required: true,
    status: "C",
    visibleIf: endurance,
    summaryLabel: "Volume unit",
  },
  {
    id: "e_days",
    chapter: "endurance",
    prompt: "How many days a week do your athletes train?",
    kind: "layered",
    control: { kind: "range", spec: num(2, 7, 1, "days/week", { hardMin: 1, hardMax: 7 }) },
    variesBy: () => [byExperience()],
    required: true,
    status: "C",
    visibleIf: endurance,
    summaryLabel: "Training days",
  },
  {
    id: "e_weekly_volume",
    chapter: "endurance",
    prompt: "What weekly volume does a typical athlete do?",
    kind: "layered",
    control: { kind: "range", spec: VOLUME_SPECS.hours },
    dynamicControl: (c) => ({ kind: "range", spec: enduranceVolumeSpec(volumeUnit(c)) }),
    variesBy: () => [byExperience()],
    required: true,
    status: "C",
    visibleIf: endurance,
    summaryLabel: "Weekly volume",
  },
  {
    id: "e_quality_sessions",
    chapter: "endurance",
    prompt: "How many hard sessions a week?",
    kind: "layered",
    control: { kind: "range", spec: num(0, 4, 1, "sessions/week", { hardMin: 0 }) },
    variesBy: () => [byExperience()],
    required: true,
    status: "C",
    visibleIf: endurance,
    summaryLabel: "Hard sessions per week",
  },
  {
    id: "e_intensity_mix",
    chapter: "endurance",
    prompt: "How do you distribute intensity?",
    kind: "control",
    control: { kind: "single", options: opts([["polarized", "Polarized (mostly easy, some very hard)"], ["pyramidal", "Pyramidal (mostly easy, some moderate, a little hard)"], ["threshold", "Threshold-focused"], ["not_prescribed", "I don't prescribe a distribution"]]) },
    required: true,
    status: "C",
    visibleIf: endurance,
    summaryLabel: "Intensity distribution",
  },
  {
    id: "e_intensity_method",
    chapter: "endurance",
    prompt: "How do you set intensity?",
    kind: "control",
    control: { kind: "multi", options: opts([["pace", "Pace"], ["heart_rate", "Heart rate"], ["power", "Power"], ["rpe", "Perceived effort"]]) },
    required: true,
    status: "C",
    visibleIf: endurance,
    summaryLabel: "How intensity is set",
  },
  {
    id: "e_zone_source",
    chapter: "endurance",
    prompt: "How do you set training zones?",
    kind: "control",
    control: { kind: "single", options: opts([["race_result", "From a recent race result"], ["field_test", "Field test (threshold / FTP)"], ["lab_test", "Lab test"], ["formula", "Age or max-HR formula"], ["by_feel", "By feel"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => endurance(c) && arr(ans(c, "e_intensity_method")).some((m) => m === "pace" || m === "heart_rate" || m === "power"),
    summaryLabel: "Zone source",
  },
  {
    id: "e_long_session",
    chapter: "endurance",
    prompt: "How do you cap the long session?",
    kind: "group",
    required: true,
    status: "C",
    visibleIf: endurance,
    summaryLabel: "Long session",
    parts: [
      { id: "e_long_basis", chapter: "endurance", prompt: "Cap it by", kind: "control", control: { kind: "single", options: opts([["percent_of_week", "Share of weekly volume"], ["max_duration", "Maximum duration"], ["not_capped", "I don't cap it"]]) }, required: true, status: "C", summaryLabel: "Long-session cap basis" },
      { id: "e_long_percent", chapter: "endurance", prompt: "Share of weekly volume", kind: "control", control: { kind: "range", spec: num(15, 50, 5, "% of week", { hardMin: 0, hardMax: 100 }) }, required: true, status: "C", visibleIf: (c) => ans(c, "e_long_basis") === "percent_of_week", summaryLabel: "Long session share" },
      { id: "e_long_minutes", chapter: "endurance", prompt: "Maximum duration", kind: "control", control: { kind: "range", spec: num(60, 240, 15, "min", { hardMin: 1 }) }, required: true, status: "C", visibleIf: (c) => ans(c, "e_long_basis") === "max_duration", summaryLabel: "Long session duration" },
    ],
  },
  {
    id: "e_weekly_increase",
    chapter: "endurance",
    prompt: "How much do you let weekly volume grow, at most?",
    kind: "control",
    control: { kind: "range", spec: num(0, 20, 1, "% per week", { hardMin: 0 }) },
    required: true,
    status: "C",
    visibleIf: endurance,
    summaryLabel: "Weekly increase cap",
  },
  {
    id: "e_down_weeks",
    chapter: "endurance",
    prompt: "How do you handle down weeks?",
    kind: "control",
    control: { kind: "single", options: opts([["every_n", "On a schedule"], ["as_needed", "When fatigue calls for it"], ["none", "I don't program down weeks"]]) },
    required: true,
    status: "C",
    visibleIf: endurance,
    summaryLabel: "Down weeks",
  },
  {
    id: "e_down_every",
    chapter: "endurance",
    prompt: "How often is a down week?",
    kind: "control",
    control: { kind: "range", spec: num(2, 6, 1, "weeks", { hardMin: 1 }) },
    required: true,
    status: "C",
    visibleIf: (c) => endurance(c) && ans(c, "e_down_weeks") === "every_n",
    summaryLabel: "Down week every",
  },
  {
    id: "e_taper",
    chapter: "endurance",
    prompt: "Do you taper athletes before events?",
    kind: "control",
    control: { kind: "boolean" },
    required: true,
    status: "C",
    visibleIf: endurance,
    summaryLabel: "Tapering",
  },
  {
    id: "e_taper_length",
    chapter: "endurance",
    prompt: "How long is a typical taper?",
    kind: "layered",
    control: { kind: "range", spec: num(3, 21, 1, "days", { hardMin: 0 }) },
    variesBy: () => [dim("event", "By event", EVENT_KEYS)],
    required: true,
    status: "C",
    visibleIf: (c) => endurance(c) && ans(c, "e_taper") === true,
    summaryLabel: "Taper length",
  },
  {
    id: "e_discipline",
    chapter: "endurance",
    prompt: "How do you split time across disciplines?",
    kind: "group",
    required: true,
    status: "C",
    visibleIf: (c) => endurance(c) && multiSport(c),
    summaryLabel: "Discipline split",
    parts: [
      { id: "e_discipline_basis", chapter: "endurance", prompt: "Split by", kind: "control", control: { kind: "single", options: opts([["fixed_shares", "Fairly fixed shares"], ["by_limiter", "By the athlete's weakest discipline"], ["by_phase", "By training phase"]]) }, required: true, status: "C", summaryLabel: "Discipline split basis" },
      { id: "e_bricks", chapter: "endurance", prompt: "Brick sessions per week", kind: "control", control: { kind: "range", spec: num(0, 3, 1, "per week", { hardMin: 0 }) }, required: false, status: "C", visibleIf: (c) => c.enduranceSports.includes("triathlon"), summaryLabel: "Bricks per week" },
    ],
  },
  {
    id: "e_strength_rule",
    chapter: "endurance",
    prompt: "Strength work for your endurance athletes",
    kind: "group",
    required: true,
    status: "C",
    visibleIf: (c) => endurance(c) && !c.training,
    summaryLabel: "Strength work",
    parts: [
      { id: "e_strength_sessions", chapter: "endurance", prompt: "Strength sessions per week", kind: "control", control: { kind: "range", spec: num(0, 4, 1, "per week", { hardMin: 0 }) }, required: true, status: "C", summaryLabel: "Strength sessions" },
      { id: "e_strength_sets", chapter: "endurance", prompt: "Working sets per exercise", kind: "control", control: { kind: "range", spec: num(1, 5, 1, "sets", { hardMin: 1 }) }, required: true, status: "C", visibleIf: (c) => ((ans(c, "e_strength_sessions") as { max?: number } | undefined)?.max ?? 0) > 0, summaryLabel: "Strength sets" },
      { id: "e_strength_reps", chapter: "endurance", prompt: "Rep range", kind: "control", control: { kind: "range", spec: num(3, 15, 1, "reps", { hardMin: 1 }) }, required: true, status: "C", visibleIf: (c) => ((ans(c, "e_strength_sessions") as { max?: number } | undefined)?.max ?? 0) > 0, summaryLabel: "Strength reps" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Integration (X) — strength + endurance in one week
// ---------------------------------------------------------------------------

const INTEGRATION: Q[] = [
  {
    id: "x_priority",
    chapter: "integration",
    prompt: "When strength and endurance compete, which comes first?",
    kind: "control",
    control: { kind: "single", options: opts([["strength", "Strength"], ["endurance", "Endurance"], ["equal", "Equal priority"], ["by_phase", "It changes by training phase"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => c.training && endurance(c),
    summaryLabel: "Priority",
  },
  {
    id: "x_same_day",
    chapter: "integration",
    prompt: "Can strength and endurance happen on the same day?",
    kind: "group",
    required: true,
    status: "C",
    visibleIf: (c) => c.training && endurance(c),
    summaryLabel: "Same-day sessions",
    parts: [
      { id: "x_same_day_rule", chapter: "integration", prompt: "Same-day rule", kind: "control", control: { kind: "single", options: opts([["not_allowed", "Not on the same day"], ["strength_first", "Yes — strength first"], ["endurance_first", "Yes — endurance first"], ["either_order", "Yes — either order"]]) }, required: true, status: "C", summaryLabel: "Same-day rule" },
      { id: "x_hours_apart", chapter: "integration", prompt: "Minimum hours apart", kind: "control", control: { kind: "number", spec: num(0, 12, 1, "hours", { hardMin: 0, hardMax: 24 }) }, required: false, status: "C", visibleIf: (c) => !!ans(c, "x_same_day_rule") && ans(c, "x_same_day_rule") !== "not_allowed", summaryLabel: "Hours apart" },
    ],
  },
  {
    id: "x_hard_days",
    chapter: "integration",
    prompt: "How do you arrange hard days?",
    kind: "control",
    control: { kind: "single", options: opts([["stack", "Stack hard strength and endurance on the same days"], ["alternate", "Alternate hard and easy days"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => c.training && endurance(c),
    summaryLabel: "Hard days",
  },
];

// ---------------------------------------------------------------------------
// General fitness (G) and Weight management (W)
// ---------------------------------------------------------------------------

const gf = (c: CalibrationContext) => has(c, "general_fitness");
const wm = (c: CalibrationContext) => c.weightManagement;
const leverIncludesSteps = (c: CalibrationContext) => arr(ans(c, "w_levers")).includes("steps");

const GENERAL_FITNESS: Q[] = [
  {
    id: "g_intensity_guide",
    chapter: "general_fitness",
    prompt: "How do you guide workout intensity?",
    kind: "control",
    control: { kind: "multi", options: opts([["talk_test", "Talk test"], ["rpe", "RPE"], ["heart_rate", "Heart rate"], ["simple_words", "Simple effort words"]]) },
    required: true,
    status: "C",
    visibleIf: gf,
    summaryLabel: "Intensity guide",
  },
  {
    id: "g_activity_emphasis",
    chapter: "general_fitness",
    prompt: "What do you emphasize more?",
    kind: "control",
    control: { kind: "single", options: opts([["exercise_first", "Structured exercise"], ["daily_activity_first", "Daily activity and movement"], ["balanced", "Both equally"]]) },
    required: true,
    status: "C",
    visibleIf: gf,
    summaryLabel: "Activity emphasis",
  },
  {
    id: "g_steps_target",
    answerKey: "steps_target",
    chapter: "general_fitness",
    prompt: "What daily step target do you usually set?",
    kind: "control",
    control: { kind: "range", spec: num(3000, 15000, 500, "steps/day", { hardMin: 0 }) },
    required: false,
    allowNotApplicable: true,
    status: "C",
    visibleIf: gf,
    summaryLabel: "Daily steps",
  },
  {
    id: "g_habit_pacing",
    chapter: "general_fitness",
    prompt: "How quickly do you add new habits or training complexity?",
    kind: "control",
    control: { kind: "single", options: opts([["one_at_a_time", "One change at a time"], ["a_few", "A few changes at once"], ["client_led", "Led by the client"]]) },
    required: false,
    status: "C",
    visibleIf: gf,
    summaryLabel: "Habit pacing",
  },
  {
    id: "g_lifestyle_pillars",
    chapter: "general_fitness",
    prompt: "Which lifestyle areas do you coach?",
    kind: "control",
    control: { kind: "multi", options: [...opts([["sleep", "Sleep"], ["stress", "Stress"], ["steps", "Steps / daily activity"], ["hydration", "Hydration"], ["alcohol", "Alcohol"]]), { value: "none", label: "None — training only", exclusive: true }] },
    required: false,
    status: "C",
    visibleIf: gf,
    summaryLabel: "Lifestyle areas",
  },
];

const WEIGHT_MANAGEMENT: Q[] = [
  {
    id: "w_rate_of_loss",
    chapter: "weight_management",
    prompt: "What weekly rate of loss do you aim for?",
    kind: "layered",
    control: { kind: "range", spec: num(0.25, 1.25, 0.05, "% bodyweight/week", { hardMin: 0 }) },
    variesBy: () => [dim("starting_point", "By starting point", opts([["larger", "Clients with more to lose"], ["leaner", "Leaner clients"]]))],
    required: true,
    status: "B",
    visibleIf: wm,
    summaryLabel: "Rate of loss",
  },
  {
    id: "w_levers",
    chapter: "weight_management",
    prompt: "When progress slows, which levers do you pull — in what order?",
    kind: "control",
    control: { kind: "ranked", options: opts([["steps", "Daily steps"], ["cardio", "Cardio"], ["calories", "Calories"], ["training_volume", "Training volume"]]) },
    required: true,
    status: "C",
    visibleIf: wm,
    summaryLabel: "Levers, in order",
  },
  {
    id: "w_steps_target",
    answerKey: "steps_target",
    chapter: "weight_management",
    prompt: "What daily step target do you usually set?",
    kind: "control",
    control: { kind: "range", spec: num(3000, 15000, 500, "steps/day", { hardMin: 0 }) },
    required: false,
    status: "C",
    visibleIf: (c) => wm(c) && leverIncludesSteps(c) && !gf(c),
    summaryLabel: "Daily steps",
  },
  {
    id: "w_data_threshold",
    answerKey: "data_threshold_weeks",
    chapter: "weight_management",
    prompt: "How many weeks of data do you want before changing targets or calling a stall?",
    kind: "control",
    control: { kind: "range", spec: num(1, 6, 1, "weeks", { hardMin: 1, allowOpenMax: true }) },
    required: true,
    status: "C",
    visibleIf: (c) => wm(c) && !nutritionFull(c),
    summaryLabel: "Data before a change",
  },
  {
    id: "w_breaks",
    chapter: "weight_management",
    prompt: "Do you plan breaks from dieting?",
    kind: "control",
    control: { kind: "single", options: opts([["diet_breaks", "Yes — planned diet breaks"], ["maintenance_phases", "Yes — longer maintenance phases"], ["none", "No planned breaks"]]) },
    required: true,
    status: "C",
    visibleIf: wm,
    summaryLabel: "Breaks from dieting",
  },
  {
    id: "w_break_every",
    chapter: "weight_management",
    prompt: "How often?",
    kind: "control",
    control: { kind: "range", spec: num(4, 20, 1, "weeks", { hardMin: 1 }) },
    required: true,
    status: "C",
    visibleIf: (c) => wm(c) && !!ans(c, "w_breaks") && ans(c, "w_breaks") !== "none",
    summaryLabel: "Break every",
  },
  {
    id: "w_after_goal",
    chapter: "weight_management",
    prompt: "When a client reaches their fat-loss goal, how do you move them to maintenance?",
    kind: "scenario",
    scenario: { actions: opts([["straight_to_maintenance", "Straight to maintenance calories"], ["gradual_increase", "Gradual increase (reverse diet)"]]), factors: [F.phaseWeeks, F.hunger, F.preference], allowDepends: true },
    required: false,
    status: "C",
    visibleIf: wm,
    summaryLabel: "Moving to maintenance",
  },
];

// ---------------------------------------------------------------------------
// Client-group packs (apply only to clients in that group)
// ---------------------------------------------------------------------------

const CLIENT_GROUPS: Q[] = [
  {
    id: "pk_older_build_in",
    chapter: "client_groups",
    prompt: "For older clients (50+), what do you deliberately build in?",
    explanation: "These rules apply only to clients in this group.",
    kind: "control",
    control: { kind: "multi", options: [...opts([["balance", "Balance"], ["mobility", "Mobility"], ["power_speed", "Power / speed"], ["impact_loading", "Impact or bone loading"], ["everyday_tasks", "Everyday tasks (floor to standing, carrying)"]]), { value: "none", label: "Nothing different", exclusive: true }] },
    required: true,
    status: "C",
    visibleIf: (c) => hasMod(c, "older_adults"),
    summaryLabel: "Older adults: what you build in",
  },
  {
    id: "pk_older_impact",
    chapter: "client_groups",
    prompt: "How do you handle impact for older clients?",
    kind: "control",
    control: { kind: "single", options: opts([["avoid", "Avoid high-impact work"], ["gradual", "Introduce impact gradually"], ["individual", "Decide client by client"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => hasMod(c, "older_adults"),
    summaryLabel: "Older adults: impact",
  },
  {
    id: "pk_older_progression",
    chapter: "client_groups",
    prompt: "How do you pace progression for older clients?",
    kind: "control",
    control: { kind: "single", options: opts([["slower", "Slower than for younger clients"], ["same", "The same as everyone else"], ["individual", "Client by client"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => hasMod(c, "older_adults"),
    summaryLabel: "Older adults: progression pace",
  },
  {
    id: "pk_home_equipment",
    chapter: "client_groups",
    prompt: "For home or limited-equipment clients, what equipment do you assume?",
    explanation: "Each client's actual equipment still comes from their own intake.",
    kind: "control",
    control: { kind: "multi", options: [...opts([["dumbbells", "Dumbbells"], ["bands", "Resistance bands"], ["kettlebell", "Kettlebell"], ["pull_up_bar", "Pull-up bar"], ["bench", "Bench"]]), { value: "bodyweight_only", label: "Bodyweight only", exclusive: true }] },
    required: true,
    status: "C",
    visibleIf: (c) => hasMod(c, "home_limited"),
    summaryLabel: "Home: assumed equipment",
  },
  {
    id: "pk_home_progression",
    chapter: "client_groups",
    prompt: "How do you progress them without adding load?",
    kind: "control",
    control: { kind: "multi", options: opts([["tempo", "Slower tempo"], ["more_reps", "More reps"], ["unilateral", "Single-limb work"], ["range_of_motion", "More range of motion"], ["density", "More work in less time"], ["harder_variations", "Harder variations"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => hasMod(c, "home_limited"),
    summaryLabel: "Home: progression without load",
  },
  {
    id: "pk_postpartum_progression",
    chapter: "client_groups",
    prompt: "How do you approach return to training after pregnancy?",
    kind: "control",
    control: { kind: "single", options: opts([["staged_return", "A staged return, foundations first"], ["individual", "Client by client, with their care team's guidance"], ["same_as_return", "Like any return from a break"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => hasMod(c, "postpartum"),
    summaryLabel: "Postpartum: return approach",
  },
  {
    id: "pk_time_formats",
    chapter: "client_groups",
    prompt: "For very time-limited clients, which session formats do you use?",
    kind: "control",
    control: { kind: "multi", options: opts([["supersets", "Supersets"], ["circuits", "Circuits"], ["density", "EMOM / density blocks"], ["minimal_full_body", "Minimal full-body sessions"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => hasMod(c, "time_limited"),
    summaryLabel: "Time-limited: formats",
  },
];

// ---------------------------------------------------------------------------
// Nutrition (N)
// ---------------------------------------------------------------------------

const proteinBasis = (c: CalibrationContext) => String(ans(c, "n_protein_basis") ?? "");
export function proteinSpec(basis: string): NumberSpec {
  if (basis === "per_kg_bodyweight" || basis === "per_kg_goal_weight") return num(1.2, 2.6, 0.1, "g/kg", { hardMin: 0 });
  if (basis === "fixed_grams") return num(80, 250, 5, "g/day", { hardMin: 0 });
  return num(0.6, 1.2, 0.05, "g/lb", { hardMin: 0 });
}

export const NUTRITION_APPROACH_OPTIONS = opts([["meal_plan", "Meal plans"], ["calories_protein", "Calories + protein"], ["full_macros", "Full macro targets"], ["portion_guides", "Portion guides"], ["habit_based", "Habit-based (no numbers)"]]);

const NUTRITION: Q[] = [
  {
    id: "n_approach",
    chapter: "nutrition",
    prompt: "How do you express nutrition targets?",
    kind: "control",
    control: { kind: "multi", options: NUTRITION_APPROACH_OPTIONS },
    required: true,
    status: "B",
    visibleIf: nutritionFull,
    summaryLabel: "Nutrition approach",
  },
  {
    id: "n_approach_decides",
    chapter: "nutrition",
    prompt: "When you use more than one approach, what decides which one a client gets?",
    kind: "scenario",
    scenario: { actions: [], factors: [F.experience, F.tracking, F.preference], allowDepends: true },
    dynamicActions: (c) => {
      const chosen = arr(ans(c, "n_approach"));
      const all = NUTRITION_APPROACH_OPTIONS;
      return all.filter((o) => chosen.includes(o.value));
    },
    required: false,
    status: "C",
    visibleIf: (c) => nutritionFull(c) && arr(ans(c, "n_approach")).length > 1,
    summaryLabel: "Which approach when",
  },
  {
    id: "n_calorie_method",
    chapter: "nutrition",
    prompt: "How do you set calorie targets?",
    kind: "control",
    control: { kind: "single", options: opts([["formula", "Estimate from a formula"], ["current_intake", "Adjust from current intake"], ["adaptive_trend", "Adjust from the weight trend over time"], ["no_calorie_targets", "I don't set calorie targets"]]) },
    required: true,
    status: "B",
    visibleIf: nutritionFull,
    summaryLabel: "Calorie targets",
  },
  {
    id: "n_protein_basis",
    chapter: "nutrition",
    prompt: "How do you set protein?",
    kind: "control",
    control: { kind: "single", options: opts([["per_lb_bodyweight", "Per lb of bodyweight"], ["per_kg_bodyweight", "Per kg of bodyweight"], ["per_lb_goal_weight", "Per lb of goal weight"], ["per_kg_goal_weight", "Per kg of goal weight"], ["fixed_grams", "A fixed amount in grams"], ["no_target", "I don't set a protein target"]]) },
    required: true,
    status: "B",
    visibleIf: nutritionOn,
    summaryLabel: "Protein basis",
  },
  {
    id: "n_protein_amount",
    chapter: "nutrition",
    prompt: "What protein target do you use?",
    kind: "layered",
    control: { kind: "range", spec: proteinSpec("per_lb_bodyweight") },
    dynamicControl: (c) => ({ kind: "range", spec: proteinSpec(proteinBasis(c)) }),
    variesBy: (c) => (nutritionFull(c) ? [dim("goal", "By client goal", GOAL_KEYS)] : []),
    required: true,
    status: "B",
    visibleIf: (c) => nutritionOn(c) && !!proteinBasis(c) && proteinBasis(c) !== "no_target",
    summaryLabel: "Protein target",
  },
  {
    id: "n_food_principles",
    chapter: "nutrition",
    prompt: "Which food principles do you coach?",
    kind: "control",
    control: { kind: "multi", options: [...opts([["whole_foods_majority", "Whole foods, most of the time"], ["protein_each_meal", "Protein at every meal"], ["fiber_and_micronutrients", "Fiber and micronutrient variety"], ["hydration", "Hydration"]]), { value: "no_strict_rules", label: "No strict rules — flexibility first", exclusive: true }] },
    required: true,
    status: "B",
    visibleIf: nutritionOn,
    summaryLabel: "Food principles",
  },
  {
    id: "n_training_rest",
    chapter: "nutrition",
    prompt: "Do training-day and rest-day targets differ?",
    kind: "control",
    control: { kind: "single", options: opts([["same_calories_shift_carbs", "Same calories, carbs shifted around training"], ["higher_on_training_days", "Higher calories on training days"], ["fuel_for_session", "Fuel for each session's demand"], ["identical_every_day", "Identical every day"]]) },
    required: true,
    status: "C",
    visibleIf: nutritionFull,
    summaryLabel: "Training vs rest days",
  },
  {
    id: "n_measurements",
    chapter: "nutrition",
    prompt: "Which measures do you use to judge progress?",
    kind: "control",
    control: { kind: "multi", options: opts([["weekly_average_weight", "Weekly average bodyweight"], ["daily_weight", "Daily weigh-ins"], ["waist", "Waist measurement"], ["photos", "Progress photos"], ["performance", "Training performance"], ["hunger_energy", "Hunger and energy"], ["how_clothes_fit", "How clothes fit"]]) },
    required: true,
    status: "C",
    visibleIf: nutritionFull,
    summaryLabel: "Progress measures",
  },
  {
    id: "n_data_threshold",
    answerKey: "data_threshold_weeks",
    chapter: "nutrition",
    prompt: "How many weeks of data do you want before changing targets or calling a stall?",
    kind: "control",
    control: { kind: "range", spec: num(1, 6, 1, "weeks", { hardMin: 1, allowOpenMax: true }) },
    required: true,
    status: "C",
    visibleIf: nutritionFull,
    summaryLabel: "Data before a change",
  },
  {
    id: "n_rate_of_gain",
    chapter: "nutrition",
    prompt: "What weekly rate of gain do you aim for when building muscle?",
    kind: "control",
    control: { kind: "range", spec: num(0, 0.5, 0.05, "% bodyweight/week", { hardMin: 0 }) },
    required: true,
    status: "B",
    visibleIf: (c) => nutritionFull(c) && c.goals.includes("build_muscle"),
    summaryLabel: "Rate of gain",
  },
  {
    id: "n_recomposition",
    chapter: "nutrition",
    prompt: "How do you approach recomposition?",
    kind: "control",
    control: { kind: "single", options: opts([["small_deficit_high_protein", "Small deficit, high protein"], ["maintenance_high_protein", "Maintenance calories, high protein"], ["alternating_blocks", "Alternate deficit and maintenance blocks"]]) },
    required: true,
    status: "C",
    visibleIf: (c) => nutritionFull(c) && c.goals.includes("recomposition"),
    summaryLabel: "Recomposition",
  },
  {
    id: "n_adherence_standard",
    chapter: "nutrition",
    prompt: "What counts as “on plan” for you?",
    kind: "control",
    control: { kind: "single", options: opts([["within_range_most_days", "Within range most days"], ["weekly_average", "On target as a weekly average"], ["close_every_day", "Close to target every day"]]) },
    required: false,
    status: "B",
    visibleIf: nutritionFull,
    summaryLabel: "On plan means",
  },
  {
    id: "n_meal_structure",
    chapter: "nutrition",
    prompt: "How many meals a day do you usually recommend?",
    kind: "control",
    control: { kind: "range", spec: num(2, 6, 1, "meals/day", { hardMin: 1, allowOpenMax: true }) },
    required: false,
    allowNotApplicable: true,
    status: "C",
    visibleIf: nutritionFull,
    summaryLabel: "Meals per day",
  },
  {
    id: "n_supplements",
    chapter: "nutrition",
    prompt: "What's your stance on supplements?",
    kind: "control",
    control: { kind: "single", options: opts([["food_first_basics", "Food first — basics only (protein, creatine)"], ["evidence_based_stack", "Open to a broader evidence-based stack"], ["outside_scope", "Outside my scope"]]) },
    required: false,
    status: "B",
    visibleIf: nutritionOn,
    summaryLabel: "Supplements",
  },
  {
    id: "n_wont_advise",
    chapter: "nutrition",
    prompt: "Any nutrition topics you won't advise on?",
    kind: "control",
    control: { kind: "tags", placeholder: "e.g. specific diets, supplements" },
    required: false,
    status: "B",
    visibleIf: (c) => c.nutritionScope === "guidance",
    summaryLabel: "Topics you won't advise on",
  },
  {
    id: "n_fueling",
    chapter: "nutrition",
    prompt: "How much carbohydrate do you have athletes take in per hour during long sessions?",
    kind: "control",
    control: { kind: "range", spec: num(0, 100, 10, "g carbs/hour", { hardMin: 0 }) },
    required: true,
    status: "C",
    visibleIf: (c) => nutritionOn(c) && endurance(c),
    summaryLabel: "In-session fueling",
  },
  {
    id: "n_carb_periodization",
    chapter: "nutrition",
    prompt: "Do you periodize carbohydrates around training?",
    kind: "control",
    control: { kind: "boolean" },
    required: false,
    status: "C",
    visibleIf: (c) => nutritionOn(c) && endurance(c),
    summaryLabel: "Carb periodization",
  },
];

// ---------------------------------------------------------------------------
// Situations (optional)
// ---------------------------------------------------------------------------

const approachTracks = (c: CalibrationContext) => arr(ans(c, "n_approach")).some((a) => a === "calories_protein" || a === "full_macros");

const SITUATIONS: Q[] = [
  situation("sit_missed_one", "A client misses one session this week. What should happen first?", [["reschedule", "Reschedule it"], ["continue_next", "Carry on with the next session"], ["condense_week", "Condense the rest of the week"], ["ask_client", "Ask the client first"]], [F.sessionType, F.daysLeft, F.reason]),
  situation("sit_missed_multiple", "A client misses two or more sessions. What should happen first?", [["reduce_week", "Reduce the rest of the week"], ["continue_next", "Carry on with the next session"], ["condense_week", "Condense the rest of the week"], ["check_in", "Check in before changing anything"]], [F.missedCount, F.reason, F.daysLeft]),
  situation("sit_schedule_change", "A client can't train on a planned day. What should happen?", [["shift_days", "Shift the remaining days"], ["drop_lowest_priority", "Drop the lowest-priority session"], ["ask_client", "Ask the client which day works"]], [F.sessionType, F.daysLeft]),
  situation("sit_low_sleep", "A client reports poor sleep this week. What should happen?", [["reduce_intensity", "Ease intensity slightly"], ["hold_plan", "Keep the plan as written"], ["ask_client", "Ask how they feel first"]], [F.nights, F.sessionType, F.phase]),
  situation("sit_travel", "A client is travelling. What should happen?", [["travel_friendly", "Swap to travel-friendly sessions"], ["maintenance", "A simple maintenance routine"], ["pause", "Pause and resume after the trip"]], [F.reason]),
  situation("sit_rapid_progress", "A client is progressing faster than expected. What should happen?", [["accelerate", "Speed up the progression"], ["hold_and_monitor", "Hold and keep confirming"], ["flag_for_coach", "Flag it for me"]], [F.weeksTrend, F.experience]),
  situation("sit_dislike", "A client dislikes an exercise or session. What should happen?", [["swap_using_rule", "Swap it using my swap rule"], ["keep_and_note", "Keep it, and note the feedback for me"], ["ask_coach", "Ask me first"]], [F.sessionType]),
  situation("sit_soreness", "A client reports unusually high soreness (not pain). What should happen?", [["reduce_affected", "Reduce work for the affected area"], ["hold_plan", "Keep the plan — normal soreness"], ["flag_for_coach", "Flag it for me"]], [F.weeksTrend, F.phase]),
  situation("sit_effort_high", "Effort has been higher than planned for several sessions. What should happen first?", [["reduce_load_or_volume", "Reduce load or volume slightly"], ["hold_and_monitor", "Hold and keep monitoring"], ["earlier_deload", "Bring the deload forward"], ["flag_for_coach", "Flag it for me"]], [F.weeksTrend, F.recovery, F.phase], (c) => c.training),
  situation("sit_effort_low", "Effort has been lower than planned — they have more in the tank. What should happen?", [["increase_load", "Increase the load"], ["add_set", "Add a working set"], ["hold_and_monitor", "Hold one more week to confirm"]], [F.weeksTrend, F.experience], (c) => c.training),
  situation("sit_reps_missed", "A client keeps missing target reps. What should happen first?", [["reduce_load", "Reduce the load"], ["reduce_sets", "Reduce working sets"], ["hold_and_monitor", "Hold one more session"], ["flag_for_coach", "Flag it for me"]], [F.weeksTrend, F.recovery], (c) => c.training),
  situation("sit_plateau_strength", "Performance has plateaued for several weeks. What should happen first?", [["vary_stimulus", "Vary the stimulus"], ["deload_first", "Deload before pushing on"], ["increase_volume", "Increase volume"], ["flag_for_coach", "Flag it for me"]], [F.stallWeeks, F.recovery, F.adherence], (c) => c.training),
  situation("sit_cant_feel", "A client can't feel the target muscle working. What should happen?", [["technique_cue", "Suggest a technique cue"], ["isolation_variant", "Swap to a more isolated variant"], ["flag_for_coach", "Flag it for me"]], [F.experience], (c) => has(c, "physique")),
  situation("sit_hr_high_at_pace", "Heart rate or effort is high at the usual pace. What should happen?", [["slow_down", "Slow the pace to hold the effort"], ["reduce_volume", "Reduce volume this week"], ["flag_for_coach", "Flag it for me"]], [F.weeksTrend, F.recovery, F.eventSoon], endurance),
  situation("sit_missed_long", "An athlete misses the long session. What should happen?", [["move_later", "Move it later in the week"], ["skip", "Skip it and carry on"], ["shorten_and_move", "Shorter version on another day"]], [F.eventSoon, F.daysLeft], endurance),
  situation("sit_easy_too_fast", "Easy sessions are being done too fast. What should happen?", [["remind_and_cap", "Remind them and cap the pace"], ["switch_to_hr", "Switch easy days to heart rate"], ["flag_for_coach", "Flag it for me"]], [F.weeksTrend], endurance),
  situation("sit_return_illness", "An athlete returns after a few days of illness. What should happen?", [["easy_return", "A few easy days before structure"], ["resume_plan", "Resume the plan"], ["flag_for_coach", "Flag it for me"]], [F.missedCount, F.eventSoon], endurance),
  situation("sit_stall_high_adherence", "Bodyweight has stalled and adherence is high. What should happen?", [["reduce_calories", "Reduce calories slightly"], ["increase_activity", "Increase activity first"], ["hold_and_reassess", "Hold and reassess"], ["address_adherence", "Address adherence first"]], [F.stallWeeks, F.adherence, F.performance, F.recovery, F.hunger, F.activityTrend, F.rateSoFar, F.phaseWeeks, F.preference], wm),
  situation("sit_stall_uncertain", "Bodyweight has stalled and adherence is uncertain. What should happen first?", [["review_logging", "Review logging first"], ["ask_client", "Ask the client directly"], ["flag_for_coach", "Flag it for me"]], [F.stallWeeks, F.tracking], wm),
  situation("sit_loss_too_fast", "Weight is dropping faster than intended. What should happen?", [["add_calories", "Bring calories up toward the target rate"], ["hold_and_monitor", "Hold and monitor"], ["flag_for_coach", "Flag it for me"]], [F.aboveTarget, F.weeksTrend, F.performance], wm),
  situation("sit_hunger", "A client reports excessive hunger. What should happen first?", [["more_volume_foods", "More protein, fiber and food volume, same calories"], ["small_refeed", "Add a small planned refeed"], ["flag_for_coach", "Flag it for me"]], [F.phaseWeeks, F.rateSoFar], nutritionFull),
  situation("sit_social_meal", "A client has a planned social meal. What should happen?", [["adjust_around", "Help adjust the meals around it"], ["guilt_free", "Treat it as a guilt-free exception"], ["no_change", "No change needed"]], [F.rateSoFar], nutritionFull),
  situation("sit_travel_nutrition", "A client is travelling and can't follow their usual structure. What should happen?", [["simplify", "Simplify to protein and a calorie ballpark"], ["pause_tracking", "Pause tracking for the trip"], ["best_effort", "Keep the usual targets, best effort"]], [F.reason], nutritionFull),
  situation("sit_macro_misses", "A client keeps missing macro targets. What should happen first?", [["simplify_targets", "Simplify the targets"], ["fewer_tracked_meals", "Track fewer meals"], ["flag_for_coach", "Flag it for me"]], [F.tracking, F.weeksTrend], (c) => nutritionFull(c) && approachTracks(c)),
  situation("sit_digestion", "A client reports digestive problems. What should OPTIM suggest first?", [["review_triggers", "Review common trigger foods"], ["flag_for_coach", "Flag it for me"]], [F.weeksTrend], nutritionFull, "Digestive problems (first step)"),
  situation("sit_gain_stall", "In a gaining phase, bodyweight isn't moving. What should happen?", [["add_calories", "Add calories"], ["hold_and_reassess", "Hold and reassess"], ["flag_for_coach", "Flag it for me"]], [F.stallWeeks, F.adherence, F.performance], (c) => nutritionFull(c) && c.goals.includes("build_muscle")),
];

// ---------------------------------------------------------------------------
// The bank
// ---------------------------------------------------------------------------

export const CALIBRATION_QUESTIONS: CalibrationQuestion[] = [
  ...YOUR_COACHING,
  ...PHILOSOPHY,
  ...TRAINING,
  ...STRENGTH,
  ...PHYSIQUE,
  ...SPORT_PERFORMANCE,
  ...ENDURANCE,
  ...INTEGRATION,
  ...GENERAL_FITNESS,
  ...WEIGHT_MANAGEMENT,
  ...CLIENT_GROUPS,
  ...NUTRITION,
  ...VOICE,
  ...MESSAGES,
  ...SAFETY,
  ...SITUATIONS,
];

/** Every question and group part, flattened. */
export const ALL_CALIBRATION_ITEMS: CalibrationQuestion[] = CALIBRATION_QUESTIONS.flatMap((q) => (q.kind === "group" && q.parts ? [q, ...q.parts] : [q]));

export function findCalibrationQuestion(id: string): CalibrationQuestion | undefined {
  return ALL_CALIBRATION_ITEMS.find((q) => q.id === id);
}

export function answerKeyOf(q: CalibrationQuestion): string {
  return q.answerKey ?? q.id;
}

export function chapterMeta(id: string): CalibrationChapterMeta | undefined {
  return CALIBRATION_CHAPTERS.find((c) => c.id === id);
}

export { volumeUnit, proteinBasis };
