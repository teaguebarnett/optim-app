// Cardio Knowledge V1 — what is generally true or supported about cardiovascular training for coaching clients.
// Claims paraphrase the cited abstracts (sources.ts); numeric parameters only on sourced claims (validateKnowledge).
// OPTIM's own operating heuristics — RPE/intensity bands, progression and interference rules — are stated as
// source_needed (honest, and never retrieved as evidence). Where coaches legitimately differ (cardio role, weekly
// minutes, intensity method, endurance structure), the coach's confirmed method decides inside safety boundaries.

import type { ConceptEntry, Evidence, KnowledgeClaim, PopulationModifierEntry } from "../types.ts";
import { CARDIO_SOURCES as S } from "./sources.ts";

const curated: Evidence = { status: "internal_curation", sources: [{ sourceId: S.internalCardio.id }], reviewedByQualifiedExpert: false };
const at = (level: Extract<Evidence, { status: "sourced" }>["level"], ...ids: string[]): Evidence => ({ status: "sourced", level, sources: ids.map((sourceId) => ({ sourceId, locator: "abstract" })) });
const needed = (notes: string): Evidence => ({ status: "source_needed", notes });
const def = (id: string, statement: string): KnowledgeClaim => ({ id, kind: "definition", statement, evidence: curated });
function concept(topic: string, name: string, dimension: ConceptEntry["coachMethodDimension"], claims: KnowledgeClaim[], scope: ConceptEntry["scope"] = "coaching"): ConceptEntry {
  return { id: `concept.cardio.${topic}`, kind: "concept", domain: "endurance", version: 1, scope, evidence: curated, topic, name, coachMethodDimension: dimension, claims };
}

export const CARDIO_CONCEPTS: ConceptEntry[] = [
  concept("dose", "Weekly aerobic dose", "weekly_volume", [
    def("dose.definition", "Aerobic dose: how much cardiovascular exercise a week — frequency × duration at a given intensity."),
    { id: "dose.acsm", kind: "general_guidance", statement: "Most adults: moderate-intensity cardiorespiratory exercise ≥30 min on ≥5 days (≥150 min/week), or vigorous ≥20 min on ≥3 days (≥75 min/week), or a combination; less than this still benefits those unable or unwilling to meet it.", parameters: { moderateWeekly: { min: 150, unit: "min/week" }, vigorousWeekly: { min: 75, unit: "min/week" } }, evidence: at("consensus_guideline", S.garber2011.id) },
    { id: "dose.who", kind: "general_guidance", statement: "All adults should undertake 150–300 min of moderate-intensity or 75–150 min of vigorous-intensity aerobic activity a week (or an equivalent combination); some activity is better than none and more is better for health.", parameters: { moderateWeekly: { min: 150, max: 300, unit: "min/week" }, vigorousWeekly: { min: 75, max: 150, unit: "min/week" } }, evidence: at("consensus_guideline", S.who2020.id) },
    { id: "dose.individualize", kind: "general_guidance", statement: "The program should be modified to the individual's habitual activity, physical function, health status, exercise responses and goals; enjoyable exercise and behavior-change strategies improve adherence.", evidence: at("consensus_guideline", S.garber2011.id) },
  ]),
  concept("intensity", "Prescribing intensity", "effort", [
    def("intensity.definition", "Intensity: how hard aerobic work is — anchored to perceived exertion, the talk test or heart rate."),
    { id: "intensity.talk_test", kind: "relationship", statement: "Comfortable speech is likely possible below the ventilatory/lactate threshold and not likely above it; the talk test is valid and reliable across walking, jogging, cycling, elliptical and stair stepping, but may not be practical for high-intensity interval training.", evidence: at("narrative_review", S.reed2014Talk.id) },
    { id: "intensity.talk_test_regulation", kind: "relationship", statement: "The talk test can be used as the primary control of training intensity: its 'last positive' stage produced intensities suited to healthy adults and to recovery or long sessions; its equivocal and negative stages produced higher-intensity training.", evidence: at("primary_study", S.woltmann2015Talk.id) },
    { id: "intensity.hrmax", kind: "general_guidance", statement: "Maximal heart rate is predicted by 208 − 0.7 × age in healthy adults, independent of sex and habitual activity; 220 − age underestimates it in older adults.", parameters: { intercept: { min: 208, max: 208, unit: "beats/min" }, slope: { min: 0.7, max: 0.7, unit: "beats/min per year" } }, evidence: at("meta_analysis", S.tanaka2001.id) },
    { id: "intensity.rpe_scale", kind: "general_guidance", statement: "Perceived-exertion category scales (the Borg scales) are useful when comparing individuals.", evidence: needed("Borg 1982 (PMID 7154893) describes the scales but its abstract gives no numeric anchors; OPTIM's 0–10 effort bands (easy ≈ 2–3, moderate ≈ 4–6, vigorous ≈ 7–8) are internal curation.") },
    { id: "intensity.hr_estimate", kind: "general_guidance", statement: "Heart-rate zones from an age-predicted maximum are estimates; individual maximal heart rate varies.", evidence: needed("Individual variation around the regression isn't quantified in the verified abstract; OPTIM labels age-predicted zones as estimates and prefers talk test/RPE unless the coach uses heart rate.") },
  ]),
  concept("interval_training", "Interval vs continuous training", "effort", [
    def("intervals.definition", "Interval training: repeated hard work bouts with recovery; continuous training: steady effort throughout."),
    { id: "intervals.vo2max", kind: "relationship", statement: "In healthy young to middle-aged adults, both endurance (continuous) training and high-intensity interval training produce large VO2max improvements, with greater gains after interval training.", evidence: at("meta_analysis", S.milanovic2015Hiit.id) },
    { id: "intervals.distribution", kind: "relationship", statement: "Elite endurance athletes converge on about 80% of sessions at low intensity and about 20% dominated by high-intensity work; training-intensification studies in well-trained athletes don't show long-term gains from more high-intensity training.", evidence: at("narrative_review", S.seiler2010Distribution.id) },
  ]),
  concept("concurrent_training", "Cardio alongside resistance training", "training_days", [
    def("concurrent.definition", "Concurrent training: aerobic and resistance training in the same program."),
    { id: "concurrent.modality_dose", kind: "relationship", statement: "Interference with resistance-training outcomes depends on the endurance modality, frequency and duration: running, but not cycling, concurrently with resistance training reduced hypertrophy and strength gains, and longer and more frequent endurance training related to smaller gains.", evidence: at("meta_analysis", S.wilson2012Concurrent.id) },
    { id: "concurrent.compatibility", kind: "relationship", statement: "Supervised concurrent aerobic and strength training didn't compromise muscle hypertrophy or maximal strength, but explosive strength gains were attenuated — more when both were done in the same session than when separated by at least 3 hours.", evidence: at("meta_analysis", S.schumann2022Concurrent.id) },
    { id: "concurrent.placement", kind: "general_guidance", statement: "OPTIM keeps hard, leg-dominant cardio off the day before and the same session as a lower-body strength day, and prefers low-impact modalities when hypertrophy or strength is the priority.", evidence: needed("Operating heuristic derived from the two meta-analyses above; the exact spacing rule is internal.") },
  ]),
  concept("progression", "Progressing cardio", "progression", [
    def("progression.definition", "Progression: increasing frequency, duration or intensity over weeks."),
    { id: "progression.gradual", kind: "general_guidance", statement: "Gradual progression of exercise intensity and volume may reduce the risks of exercise.", evidence: at("consensus_guideline", S.garber2011.id) },
    { id: "progression.ten_percent", kind: "relationship", statement: "In novice runners, a graded 13-week program based on the 10% rule didn't reduce running-related injuries compared with a standard 8-week program (≈20% incidence in both).", evidence: at("primary_study", S.buist2008Progression.id) },
    { id: "progression.cap", kind: "general_guidance", statement: "Absent a coach rule, OPTIM caps weekly cardio-minute increases and adds intensity only after duration is tolerated.", evidence: needed("Internal heuristic — the 10% rule itself didn't prevent injuries in the verified trial, so the cap is a pacing default, never presented as protective.") },
  ]),
  concept("weight_management", "Cardio for fat loss", "weekly_volume", [
    def("fatloss.definition", "Cardio for fat loss: aerobic activity used alongside an energy deficit."),
    { id: "fatloss.dose", kind: "general_guidance", statement: "150–250 min/week of moderate-intensity activity prevents weight gain but gives only modest weight loss; more than 250 min/week is associated with clinically significant weight loss, and 150–250 min/week improves weight loss alongside moderate (not severe) diet restriction.", parameters: { modestLoss: { min: 150, max: 250, unit: "min/week" }, clinicalLoss: { min: 250, unit: "min/week" } }, evidence: at("consensus_guideline", S.donnelly2009WeightLoss.id) },
  ]),
  concept("screening", "Pre-participation screening", null, [
    def("screening.definition", "Screening: deciding whether someone needs medical clearance before (more intense) exercise."),
    { id: "screening.factors", kind: "general_guidance", statement: "Pre-participation screening rests on three factors: current physical activity, signs or symptoms and/or known cardiovascular, metabolic or renal disease, and the desired exercise intensity; exercise-related cardiac events are often preceded by warning signs.", evidence: at("consensus_guideline", S.riebe2015Screening.id) },
  ], "requires_clinical_judgment"),
];

/** Populations whose cardio needs professional judgment — acted on by the safety gate before any model call. */
export const CARDIO_POPULATIONS: PopulationModifierEntry[] = [
  {
    id: "population.cardio.cardiovascular_symptoms",
    kind: "population_modifier",
    domain: "population_modifiers",
    version: 1,
    scope: "requires_clinical_judgment",
    evidence: at("consensus_guideline", S.riebe2015Screening.id),
    population: "Signs/symptoms or known cardiovascular, metabolic or renal disease",
    coachingConsiderations: ["Exercise is safe for most people, but symptoms or known disease change what intensity is appropriate without clearance."],
    referralTriggers: ["Chest pain, dizziness or fainting", "Known cardiovascular condition or blood-pressure concern", "Advised by a clinician to limit exercise"],
  },
];
