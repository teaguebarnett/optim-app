// Gate 4.0C-1B — resistance-training concepts the future planner reasons
// with. Each concept has a definition (internal curation — vocabulary, not
// science) and claims. A sourced claim paraphrases the cited abstract,
// keeps its qualifiers, and is general guidance: the coach's method
// decides within valid bounds (coachMethodDimension). Claims with no
// verified source are `source_needed` and say so.

import type { ConceptEntry, Evidence, KnowledgeClaim } from "../types.ts";
import { SOURCES } from "../sources.ts";

const curated: Evidence = { status: "internal_curation", sources: [{ sourceId: SOURCES.internalTaxonomy.id }], reviewedByQualifiedExpert: false };
const acsm: Evidence = { status: "sourced", level: "consensus_guideline", sources: [{ sourceId: SOURCES.acsm2009.id, locator: "abstract" }] };
const meta = (sourceId: string): Evidence => ({ status: "sourced", level: "meta_analysis", sources: [{ sourceId, locator: "abstract" }] });
const review = (sourceId: string): Evidence => ({ status: "sourced", level: "systematic_review", sources: [{ sourceId, locator: "abstract" }] });
const needed = (notes: string): Evidence => ({ status: "source_needed", notes });

const def = (id: string, statement: string): KnowledgeClaim => ({ id, kind: "definition", statement, evidence: curated });

function concept(topic: string, name: string, dimension: ConceptEntry["coachMethodDimension"], claims: KnowledgeClaim[]): ConceptEntry {
  return { id: `concept.resistance.${topic}`, kind: "concept", domain: "resistance_training", version: 1, scope: "coaching", evidence: curated, topic, name, coachMethodDimension: dimension, claims };
}

export const RESISTANCE_CONCEPTS: ConceptEntry[] = [
  concept("training_frequency", "Training frequency", "training_days", [
    def("frequency.definition", "How many resistance sessions are performed per week, and separately how many times per week each muscle group is trained."),
    {
      id: "frequency.acsm_by_status",
      kind: "general_guidance",
      statement: "General recommendation of 2–3 days/week for novice, 3–4 for intermediate and 4–5 for advanced training; similar frequency recommended for hypertrophy. To be applied in context of the individual's goals, capacity and training status.",
      appliesTo: { qualities: ["strength", "hypertrophy"] },
      parameters: { novice: { min: 2, max: 3, unit: "days_per_week" }, intermediate: { min: 3, max: 4, unit: "days_per_week" }, advanced: { min: 4, max: 5, unit: "days_per_week" } },
      evidence: acsm,
    },
    {
      id: "frequency.per_muscle_hypertrophy",
      kind: "relationship",
      statement: "On a volume-equated basis, training a muscle group twice per week produced greater hypertrophy than once per week; whether three times per week beats twice was not determined.",
      appliesTo: { qualities: ["hypertrophy"] },
      parameters: { timesPerMusclePerWeek: { min: 2, unit: "sessions_per_muscle_per_week" } },
      evidence: meta(SOURCES.schoenfeld2016Frequency.id),
    },
  ]),
  concept("volume", "Training volume", "weekly_volume", [
    def("volume.definition", "The amount of work performed, commonly counted as hard sets per muscle group per week."),
    {
      id: "volume.dose_response_hypertrophy",
      kind: "relationship",
      statement: "A graded dose-response relationship: higher weekly set volume was associated with greater hypertrophy within the studied range. (The three-category analysis — <5, 5–9, 10+ sets per muscle — showed only a trend.)",
      appliesTo: { qualities: ["hypertrophy"] },
      evidence: meta(SOURCES.schoenfeld2017Volume.id),
    },
    { id: "volume.acsm_multiple_sets", kind: "general_guidance", statement: "Higher-volume, multiple-set programs are recommended for maximizing hypertrophy.", appliesTo: { qualities: ["hypertrophy"] }, evidence: acsm },
    { id: "volume.upper_bound", kind: "relationship", statement: "Where additional weekly volume stops adding benefit, or begins to impair recovery, for a given trainee.", evidence: needed("No verified source reviewed for an upper bound; do not encode a ceiling.") },
  ]),
  concept("load", "Intensity / load", "load", [
    def("load.definition", "The resistance used, expressed relative to maximum (e.g. %1RM) or as a repetition maximum (RM)."),
    {
      id: "load.strength_vs_hypertrophy",
      kind: "relationship",
      statement: "With sets taken to momentary failure, 1RM strength gains were greater with high loads (>60% 1RM), while hypertrophy was similar across low and high loads.",
      appliesTo: { qualities: ["strength", "hypertrophy"] },
      evidence: meta(SOURCES.schoenfeld2017Load.id),
    },
    {
      id: "load.acsm_power",
      kind: "general_guidance",
      statement: "Power training combines strength training with light loads (0–60% 1RM lower body, 30–60% 1RM upper body) moved at fast velocity, 3–5 sets with 3–5 min rest, emphasizing multi-joint exercises.",
      appliesTo: { qualities: ["power"] },
      parameters: { lowerBodyLoad: { min: 0, max: 60, unit: "percent_1rm" }, upperBodyLoad: { min: 30, max: 60, unit: "percent_1rm" }, sets: { min: 3, max: 5, unit: "sets_per_exercise" } },
      evidence: acsm,
    },
  ]),
  concept("repetition_range", "Repetition ranges", "rep_ranges", [
    def("reps.definition", "The number of repetitions per set, usually paired with a load that makes that number challenging (an RM zone)."),
    {
      id: "reps.acsm_strength",
      kind: "general_guidance",
      statement: "Novices: loads corresponding to 8–12 RM. Intermediate to advanced: a wider 1–12 RM range used in a periodized fashion, with eventual emphasis on heavy loading (1–6 RM).",
      appliesTo: { qualities: ["strength"] },
      parameters: { novice: { min: 8, max: 12, unit: "rm" }, trainedRange: { min: 1, max: 12, unit: "rm" }, heavyEmphasis: { min: 1, max: 6, unit: "rm" } },
      evidence: acsm,
    },
    { id: "reps.acsm_hypertrophy", kind: "general_guidance", statement: "Hypertrophy: loads corresponding to 1–12 RM in a periodized fashion, with emphasis on the 6–12 RM zone.", appliesTo: { qualities: ["hypertrophy"] }, parameters: { range: { min: 1, max: 12, unit: "rm" }, emphasis: { min: 6, max: 12, unit: "rm" } }, evidence: acsm },
    { id: "reps.acsm_muscular_endurance", kind: "general_guidance", statement: "Local muscular endurance: light-to-moderate loads (40–60% 1RM) for high repetitions (>15) with short rest (<90 s).", parameters: { load: { min: 40, max: 60, unit: "percent_1rm" }, reps: { min: 15, unit: "reps" } }, evidence: acsm },
  ]),
  concept("effort", "Effort / proximity to failure (RIR, RPE)", "effort", [
    def("effort.definition", "How close a set ends to momentary muscular failure, commonly expressed as repetitions in reserve (RIR) or rating of perceived exertion (RPE)."),
    {
      id: "effort.failure_not_required_hypertrophy",
      kind: "relationship",
      statement: "No evidence that training to momentary failure is superior to non-failure training for hypertrophy; the relationship between proximity to failure and hypertrophy may be non-linear.",
      appliesTo: { qualities: ["hypertrophy"] },
      evidence: meta(SOURCES.refalo2023Failure.id),
    },
  ]),
  concept("rest_intervals", "Rest intervals", "rest", [
    def("rest.definition", "The time between sets."),
    { id: "rest.acsm", kind: "general_guidance", statement: "Heavy strength loading with 3–5 min rest; hypertrophy loading with 1–2 min rest; power with 3–5 min rest.", appliesTo: { qualities: ["strength", "hypertrophy", "power"] }, parameters: { strengthHeavy: { min: 3, max: 5, unit: "minutes" }, hypertrophy: { min: 1, max: 2, unit: "minutes" } }, evidence: acsm },
    {
      id: "rest.strength_by_status",
      kind: "relationship",
      statement: "Robust strength gains are achievable with short rest (<60 s), but longer rest (>2 min) appears needed to maximize strength in resistance-trained individuals; for untrained individuals, 60–120 s appears sufficient.",
      appliesTo: { qualities: ["strength"], trainingStatus: ["trained", "untrained"] },
      evidence: review(SOURCES.grgic2018RestStrength.id),
    },
    {
      id: "rest.hypertrophy",
      kind: "relationship",
      statement: "Both short and long inter-set rest may be useful for hypertrophy; findings in trained participants suggest a possible advantage for longer rest, with more research needed.",
      appliesTo: { qualities: ["hypertrophy"] },
      evidence: review(SOURCES.grgic2017RestHypertrophy.id),
    },
  ]),
  concept("exercise_order", "Exercise order", "exercise_order", [
    def("order.definition", "The sequence of exercises within a session."),
    { id: "order.acsm_strength", kind: "general_guidance", statement: "For strength programs, sequence exercises to preserve intensity: large before small muscle groups, multiple-joint before single-joint, higher-intensity before lower-intensity.", appliesTo: { qualities: ["strength"] }, evidence: acsm },
  ]),
  concept("progression", "Progression", "progression", [
    def("progression.definition", "Systematically increasing the training demand over time (load, repetitions, sets, or exercise difficulty) to keep driving adaptation."),
    { id: "progression.acsm_necessary", kind: "general_guidance", statement: "Progressive resistance training is necessary to stimulate further adaptation toward specific goals.", evidence: acsm },
    { id: "progression.acsm_load_increment", kind: "general_guidance", statement: "When training at a specific RM load, a 2–10% load increase when the trainee can perform the current workload for one to two repetitions over the target.", parameters: { increment: { min: 2, max: 10, unit: "percent_load" } }, evidence: acsm },
  ]),
  concept("deload", "Deload / recovery", "deload", [
    def("deload.definition", "A planned period of reduced training demand (volume, load or effort) to manage accumulated fatigue."),
    { id: "deload.timing", kind: "general_guidance", statement: "How often deloads are useful and how much to reduce demand.", evidence: needed("No verified source reviewed. Deload timing stays a coach-method decision.") },
  ]),
  concept("weekly_distribution", "Weekly distribution", "split", [
    def("distribution.definition", "How a week's training volume is spread across sessions and days (the split)."),
    { id: "distribution.split_equivalence", kind: "relationship", statement: "Whether different splits produce different outcomes when weekly volume and per-muscle frequency are equal.", evidence: needed("No verified source reviewed; the frequency meta-analysis could not analyze session frequency when per-muscle frequency was matched.") },
  ]),
  concept("stimulus_fatigue", "Stimulus vs. fatigue", "exercise_selection", [
    def("stimulus_fatigue.definition", "Exercises and sets differ in how much training stimulus they give relative to the local and systemic fatigue they cost; exercise metadata records systemic-fatigue demand to make this queryable."),
    { id: "stimulus_fatigue.ratio", kind: "relationship", statement: "Choosing lower-fatigue exercises for the same stimulus improves weekly training capacity.", evidence: needed("Widely used coaching heuristic; no verified source reviewed.") },
  ]),
  concept("specificity", "Specificity", "exercise_selection", [
    def("specificity.definition", "Adaptations are specific to how one trains (load, velocity, movement)."),
    { id: "specificity.heavy_load_strength", kind: "relationship", statement: "Maximal strength benefits are obtained from heavy loads, while hypertrophy can be achieved across a spectrum of loads.", appliesTo: { qualities: ["strength", "hypertrophy"] }, evidence: meta(SOURCES.schoenfeld2017Load.id) },
  ]),
  concept("exercise_variation", "Exercise variation", "exercise_selection", [
    def("variation.definition", "Using different exercises, muscle actions and lateralities across a program."),
    { id: "variation.acsm_strength", kind: "general_guidance", statement: "Strength programs include concentric, eccentric and isometric actions, and bilateral and unilateral single- and multiple-joint exercises.", appliesTo: { qualities: ["strength"] }, evidence: acsm },
  ]),
  concept("session_duration", "Session duration constraints", "session_length", [
    def("duration.definition", "The time available per session, which bounds how many exercises and sets fit (with rest intervals)."),
    { id: "duration.fit", kind: "relationship", statement: "How to trade exercises, sets and rest when time is limited.", evidence: needed("No verified source reviewed; time fitting is deterministic arithmetic plus the coach's method.") },
  ]),
];
