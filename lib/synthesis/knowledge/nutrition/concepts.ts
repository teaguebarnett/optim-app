// Nutrition Knowledge V1 — what is generally true or supported about nutrition for training clients, independent of
// any coach or client. Claims paraphrase the cited abstracts (see sources.ts); numeric parameters appear only on
// sourced claims (enforced by validateKnowledge). OPTIM's computational heuristics (activity multipliers, energy per
// kilogram, portion guides) are stated as source_needed — honest, and never retrieved as evidence for the model.
//
// It never decides a coach's method: where coaches legitimately differ (how targets are expressed, calorie method,
// protein basis, meal structure, training/rest days, measures, rates), the concept names that dimension and the
// coach's confirmed method decides inside safety boundaries.

import type { ConceptEntry, Evidence, KnowledgeClaim, PopulationModifierEntry } from "../types.ts";
import { NUTRITION_SOURCES as S } from "./sources.ts";

const curated: Evidence = { status: "internal_curation", sources: [{ sourceId: S.internalNutrition.id }], reviewedByQualifiedExpert: false };
const at = (level: Extract<Evidence, { status: "sourced" }>["level"], ...ids: string[]): Evidence => ({ status: "sourced", level, sources: ids.map((sourceId) => ({ sourceId, locator: "abstract" })) });
const position = (...ids: string[]) => at("consensus_guideline", ...ids);
const meta = (...ids: string[]) => at("meta_analysis", ...ids);
const narrative = (...ids: string[]) => at("narrative_review", ...ids);
const study = (...ids: string[]) => at("primary_study", ...ids);
const needed = (notes: string): Evidence => ({ status: "source_needed", notes });
const def = (id: string, statement: string): KnowledgeClaim => ({ id, kind: "definition", statement, evidence: curated });

function concept(topic: string, name: string, domain: ConceptEntry["domain"], dimension: ConceptEntry["coachMethodDimension"], claims: KnowledgeClaim[], scope: ConceptEntry["scope"] = "coaching"): ConceptEntry {
  return { id: `concept.nutrition.${topic}`, kind: "concept", domain, version: 1, scope, evidence: curated, topic, name, coachMethodDimension: dimension, claims };
}

const WEIGHT_LOSS: KnowledgeClaim["appliesTo"] = { goalClasses: ["fat_loss", "recomposition"] };
const GAINING: KnowledgeClaim["appliesTo"] = { goalClasses: ["hypertrophy", "weight_gain", "strength"] };

export const NUTRITION_CONCEPTS: ConceptEntry[] = [
  concept("energy_requirements", "Estimating energy requirements", "nutrition", "calorie_target", [
    def("energy.definition", "Energy requirement: the intake that keeps bodyweight stable at the client's current activity. It is estimated, never measured, in coaching."),
    { id: "energy.ree_equation", kind: "relationship", statement: "Resting energy expenditure can be predicted from weight, height, age and sex with the Mifflin–St Jeor equation (derived against indirect calorimetry in normal-weight and obese adults aged 19–78).", evidence: study(S.mifflin1990Ree.id) },
    { id: "energy.equation_accuracy", kind: "general_guidance", statement: "Among commonly used equations, Mifflin–St Jeor predicted resting metabolic rate within 10% of measured in the most non-obese and obese adults and had the narrowest error range — yet some individuals still fall outside 10%, so any estimate is a starting range, not a fact.", parameters: { individualError: { min: 10, unit: "% of measured, for some individuals" } }, evidence: at("systematic_review", S.frankenfield2005Equations.id) },
    { id: "energy.dynamic_response", kind: "relationship", statement: "Bodyweight responds slowly and dynamically to a sustained change in intake (half-times of about a year); accurate prediction must account for adaptation, so targets are revisited against the observed trend rather than trusted from a static calculation.", evidence: study(S.hall2011Dynamics.id) },
    { id: "energy.activity_multipliers", kind: "general_guidance", statement: "OPTIM converts predicted resting expenditure into a maintenance range with activity multipliers for daily activity and training load.", evidence: needed("Internal heuristic ranges (lib/synthesis/nutrition/energy.ts); no source verified in Nutrition Knowledge V1. Always presented as a range and corrected by the bodyweight trend.") },
    { id: "energy.energy_per_kg", kind: "general_guidance", statement: "OPTIM sizes an initial deficit or surplus with a static energy-per-kilogram approximation of bodyweight change.", evidence: needed("~7,700 kcal per kg is a static approximation; the dynamic model above shows it overstates long-term change. Used only to size a starting target, never to promise an outcome.") },
  ]),
  concept("rate_of_loss", "Rate of weight loss", "weight_management", "rate_of_change", [
    def("loss.definition", "Rate of loss: planned weekly change in bodyweight during a fat-loss phase, as a percentage of bodyweight."),
    { id: "loss.deficit_drives", kind: "relationship", appliesTo: WEIGHT_LOSS, statement: "Fat-loss diets are driven by a sustained energy deficit; the higher the baseline body fat, the more aggressively the deficit may be imposed, and slower loss better preserves lean mass in leaner people.", evidence: position(S.aragon2017Diets.id) },
    { id: "loss.muscle_retention_rate", kind: "general_guidance", appliesTo: WEIGHT_LOSS, statement: "Losses of about 0.5–1% of bodyweight per week are recommended to maximize muscle retention in resistance-trained people dieting.", parameters: { weeklyLoss: { min: 0.5, max: 1, unit: "% bodyweight/week" } }, evidence: narrative(S.helms2014Prep.id) },
    { id: "loss.slow_vs_fast", kind: "relationship", appliesTo: WEIGHT_LOSS, statement: "In resistance-training athletes, a ~0.7%/week loss increased lean mass while a ~1.4%/week loss did not, at similar fat loss.", parameters: { slowerRate: { min: 0.7, max: 0.7, unit: "% bodyweight/week" } }, evidence: study(S.garthe2011Rate.id) },
    { id: "loss.deficit_costs_lean_gain", kind: "relationship", statement: "During resistance training, an energy deficit impairs lean-mass gains but not strength gains; in meta-regression a deficit of ~500 kcal/day prevented lean-mass gains.", parameters: { deficitPreventingLeanGain: { min: 500, unit: "kcal/day" } }, evidence: meta(S.murphy2022Deficit.id) },
  ]),
  concept("rate_of_gain", "Rate of weight gain", "weight_management", "rate_of_change", [
    def("gain.definition", "Rate of gain: planned weekly bodyweight increase during a muscle-gain phase, as a percentage of bodyweight."),
    { id: "gain.surplus_drives", kind: "relationship", appliesTo: GAINING, statement: "Diets focused on gaining lean mass are driven by a sustained energy surplus; its composition and size and the person's training status shape the gains.", evidence: position(S.aragon2017Diets.id) },
    { id: "gain.offseason_rate", kind: "general_guidance", appliesTo: GAINING, statement: "A surplus of about 10–20% with a target gain of about 0.25–0.5% of bodyweight per week is recommended for novice/intermediate lifters; advanced lifters should be more conservative.", parameters: { surplus: { min: 10, max: 20, unit: "% above maintenance" }, weeklyGain: { min: 0.25, max: 0.5, unit: "% bodyweight/week" } }, evidence: narrative(S.iraki2019OffSeason.id) },
  ]),
  concept("protein", "Daily protein", "nutrition", "protein_target", [
    def("protein.definition", "Daily protein target: total protein per day, usually scaled to bodyweight."),
    { id: "protein.exercising_range", kind: "general_guidance", statement: "An overall daily protein intake of 1.4–2.0 g/kg/day is sufficient for most exercising individuals to build and maintain muscle.", parameters: { daily: { min: 1.4, max: 2, unit: "g/kg/day" } }, evidence: position(S.jager2017Protein.id) },
    { id: "protein.plateau", kind: "relationship", appliesTo: { goalClasses: ["hypertrophy", "strength", "recomposition", "weight_gain"] }, statement: "In resistance training, protein supplementation beyond total intakes of about 1.62 g/kg/day produced no further gains in fat-free mass.", parameters: { plateau: { min: 1.62, max: 1.62, unit: "g/kg/day" } }, evidence: meta(S.morton2018Protein.id) },
    { id: "protein.deficit_higher", kind: "general_guidance", appliesTo: WEIGHT_LOSS, statement: "Higher intakes (2.3–3.1 g/kg of fat-free mass) may be required to maximize muscle retention in lean, resistance-trained people in an energy deficit.", parameters: { daily: { min: 2.3, max: 3.1, unit: "g/kg fat-free mass/day" } }, evidence: position(S.aragon2017Diets.id) },
    { id: "protein.weight_loss_satiety", kind: "relationship", appliesTo: { goalClasses: ["fat_loss", "maintenance", "recomposition"] }, statement: "Higher-protein energy-restricted diets (about 1.2–1.6 g/kg/day) improved weight loss, fat loss and lean-mass preservation in controlled studies, with a modest satiety effect.", parameters: { daily: { min: 1.2, max: 1.6, unit: "g/kg/day" } }, evidence: narrative(S.leidy2015ProteinWeightLoss.id) },
    { id: "protein.offseason", kind: "general_guidance", appliesTo: GAINING, statement: "Sufficient protein for muscle gain is about 1.6–2.2 g/kg/day.", parameters: { daily: { min: 1.6, max: 2.2, unit: "g/kg/day" } }, evidence: narrative(S.iraki2019OffSeason.id) },
  ]),
  concept("protein_distribution", "Protein distribution and meal timing", "nutrition", "meal_structure", [
    def("distribution.definition", "Distribution: how daily protein and energy are spread across meals and around training."),
    { id: "distribution.dose", kind: "general_guidance", statement: "A 20–40 g protein dose (0.25–0.40 g/kg per dose) of a high-quality source every 3–4 hours appears to most favorably affect muscle protein synthesis, with evenly spaced feedings across the day.", parameters: { perDose: { min: 0.25, max: 0.4, unit: "g/kg per meal" }, spacing: { min: 3, max: 4, unit: "hours" } }, evidence: position(S.kerksick2017Timing.id) },
    { id: "distribution.upper_per_meal", kind: "general_guidance", statement: "Spreading 1.6–2.2 g/kg/day over four meals implies up to about 0.55 g/kg per meal for muscle-building.", parameters: { perMeal: { max: 0.55, unit: "g/kg per meal" } }, evidence: narrative(S.schoenfeld2018PerMeal.id) },
    { id: "distribution.meal_frequency", kind: "relationship", statement: "Outside training contexts, meal frequency has limited impact on weight loss and body composition; evidence is stronger that it affects appetite and satiety — so meal count can follow the client's schedule and hunger.", evidence: position(S.kerksick2017Timing.id) },
    { id: "distribution.peri_training", kind: "general_guidance", statement: "High-quality protein from immediately to 2 hours after training stimulates muscle protein synthesis; the size and timing of the pre-training meal affect how much post-training feeding matters.", evidence: position(S.kerksick2017Timing.id) },
  ]),
  concept("carbohydrate", "Carbohydrate and training fuel", "nutrition", "training_rest_days", [
    def("carbohydrate.definition", "Carbohydrate: the main fuel for high-intensity and high-volume training; needs scale with training load."),
    { id: "carbohydrate.resistance_support", kind: "general_guidance", appliesTo: { goalClasses: ["hypertrophy", "strength", "weight_gain"] }, statement: "When gaining, remaining energy after protein and fat comes from carbohydrate, with at least about 3–5 g/kg/day to support resistance-training demands.", parameters: { daily: { min: 3, max: 5, unit: "g/kg/day (lower bound)" } }, evidence: narrative(S.iraki2019OffSeason.id) },
    { id: "carbohydrate.high_volume", kind: "general_guidance", appliesTo: { goalClasses: ["endurance", "event_performance", "sport_performance"] }, statement: "Glycogen stores are maximized by a high-carbohydrate diet (8–12 g/kg/day) and depleted most by high-volume exercise.", parameters: { daily: { min: 8, max: 12, unit: "g/kg/day" } }, evidence: position(S.kerksick2017Timing.id) },
    { id: "carbohydrate.in_session", kind: "general_guidance", appliesTo: { goalClasses: ["endurance", "event_performance", "sport_performance"] }, statement: "During extended (>60 min) high-intensity bouts, about 30–60 g of carbohydrate per hour supports fuel supply.", parameters: { perHour: { min: 30, max: 60, unit: "g/hour" } }, evidence: position(S.kerksick2017Timing.id) },
    { id: "carbohydrate.approach_equivalence", kind: "relationship", statement: "A wide range of dietary approaches, from low-fat to low-carbohydrate/ketogenic and points between, can be similarly effective for improving body composition.", evidence: position(S.aragon2017Diets.id) },
    { id: "carbohydrate.lowfat_lowcarb_trial", kind: "relationship", statement: "In a 12-month trial in overweight adults, a healthy low-fat and a healthy low-carbohydrate diet produced no significant difference in weight change.", evidence: study(S.gardner2018Dietfits.id) },
  ]),
  concept("dietary_fat", "Dietary fat", "nutrition", "macro_distribution", [
    def("fat.definition", "Dietary fat: the macronutrient left after protein and carbohydrate needs; an essential nutrient, never driven toward zero."),
    { id: "fat.gaining", kind: "general_guidance", appliesTo: GAINING, statement: "While gaining, fat in moderate amounts (about 0.5–1.5 g/kg/day).", parameters: { daily: { min: 0.5, max: 1.5, unit: "g/kg/day" } }, evidence: narrative(S.iraki2019OffSeason.id) },
    { id: "fat.dieting", kind: "general_guidance", appliesTo: WEIGHT_LOSS, statement: "While dieting, about 15–30% of calories from fat, with the remainder from carbohydrate.", parameters: { share: { min: 15, max: 30, unit: "% of energy" } }, evidence: narrative(S.helms2014Prep.id) },
  ]),
  concept("recomposition", "Body recomposition", "weight_management", "rate_of_change", [
    def("recomp.definition", "Recomposition: gaining lean mass while losing fat over the same period, with little bodyweight change."),
    { id: "recomp.tension", kind: "relationship", statement: "Lean-mass gain is favored by a surplus while fat loss requires a deficit, and a ~500 kcal/day deficit prevented lean-mass gains in meta-regression — so how a coach balances the two (small deficit, maintenance, alternating blocks) is a method choice.", evidence: meta(S.murphy2022Deficit.id) },
    { id: "recomp.who", kind: "general_guidance", statement: "How far recomposition is achievable at maintenance depends on training status and starting body fat.", evidence: needed("No abstract-verified numeric guidance in V1; the coach's recomposition approach decides.") },
  ]),
  concept("diet_quality", "Diet quality, fiber and micronutrients", "nutrition", null, [
    def("quality.definition", "Diet quality: the overall pattern of foods eaten — variety, whole foods, fiber, fruits and vegetables."),
    { id: "quality.total_diet", kind: "general_guidance", statement: "The total diet, or overall pattern of food eaten, is the most important focus of healthy eating; all foods can fit within a healthy pattern in appropriate amounts.", evidence: position(S.freelandGraves2013TotalDiet.id) },
    { id: "quality.fiber", kind: "general_guidance", statement: "Fiber intake scaled to energy intake (commonly cited as 14 g per 1,000 kcal).", evidence: needed("Dietary Reference Intake figure; not verified against a primary record in V1, so not given to the model as evidence.") },
  ]),
  concept("hydration", "Hydration", "nutrition", null, [
    def("hydration.definition", "Hydration: enough fluid to replace losses, particularly around training."),
    { id: "hydration.exercise_losses", kind: "general_guidance", statement: "The goal of drinking during exercise is to prevent excessive dehydration (more than 2% body-weight loss from water deficit); sweat rates vary considerably between people, so customized fluid replacement is recommended.", parameters: { maxLossDuringExercise: { max: 2, unit: "% body weight" } }, evidence: position(S.sawka2007Fluids.id) },
  ]),
  concept("training_energy_cost", "Training energy cost", "nutrition", "training_rest_days", [
    def("training_cost.definition", "Training energy cost: the energy a session adds above rest, which differs between training and rest days."),
    { id: "training_cost.met_definition", kind: "general_guidance", statement: "One MET is defined as 1 kcal/kg/hour (roughly the cost of sitting quietly), so a session's cost above rest is about (MET − 1) × body mass (kg) × hours.", parameters: { met: { min: 1, max: 1, unit: "kcal/kg/hour" } }, evidence: at("reference_work", S.compendiumTables.id) },
    { id: "training_cost.resistance", kind: "general_guidance", statement: "Resistance (weight) training ranges from about 3.5 MET (multiple exercises, 8–15 reps at varied resistance; code 02054) to 6.0 MET (vigorous free-weight, power lifting or body building; code 02050).", parameters: { met: { min: 3.5, max: 6, unit: "MET" } }, evidence: at("reference_work", S.compendiumTables.id) },
    { id: "training_cost.circuit", kind: "general_guidance", statement: "Circuit training ranges from about 5.0 MET (moderate effort; code 02035) to 7.5 MET (vigorous, minimal rest; code 02040).", parameters: { met: { min: 5, max: 7.5, unit: "MET" } }, evidence: at("reference_work", S.compendiumTables.id) },
    { id: "training_cost.running", kind: "general_guidance", statement: "Running ranges from about 7.5 MET (jogging, self-selected pace; code 12020) to 11.0 MET (7 mph; code 12070).", parameters: { met: { min: 7.5, max: 11, unit: "MET" } }, evidence: at("reference_work", S.compendiumTables.id) },
    { id: "training_cost.compendium", kind: "relationship", statement: "The Compendium's MET values come from a systematic review of measured energy costs (912 of 1114 activities measured with indirect calorimetry in the 2024 Adult Compendium).", evidence: at("systematic_review", S.compendium2024.id) },
    { id: "training_cost.individual_variation", kind: "general_guidance", statement: "MET values are activity averages; an individual's session cost varies with intensity, rest periods and fitness.", evidence: needed("Not stated in the verified Compendium pages; OPTIM always uses MET ranges, never a single value.") },
  ]),
  concept("adherence", "Adherence and sustainability", "nutrition", null, [
    def("adherence.definition", "Adherence: how consistently a client actually follows the plan over time."),
    { id: "adherence.predicts_outcome", kind: "relationship", statement: "In a 1-year trial of four popular diets, weight loss was associated with adherence level but not with diet type, and adherence was low overall — the plan a client can sustain matters more than its label.", evidence: study(S.dansinger2005Adherence.id) },
    { id: "adherence.long_term", kind: "general_guidance", statement: "The long-term success of a diet depends on compliance and on managing mitigating factors such as adaptive thermogenesis.", evidence: position(S.aragon2017Diets.id) },
  ]),
  concept("supplements", "Supplements", "nutrition", "supplements", [
    def("supplements.definition", "Supplements: products added to food; whether to advise on them is a coach-scope decision."),
    { id: "supplements.creatine", kind: "general_guidance", appliesTo: GAINING, statement: "Creatine monohydrate (about 3–5 g/day) may yield ergogenic effects relevant to muscle gain.", parameters: { daily: { min: 3, max: 5, unit: "g/day" } }, evidence: narrative(S.iraki2019OffSeason.id) },
  ]),
  concept("energy_availability", "Low energy availability (REDs)", "nutrition", null, [
    def("lea.definition", "Low energy availability: energy intake inadequate for the energy spent in exercise, leaving too little for normal body functions."),
    { id: "lea.reds", kind: "relationship", statement: "Problematic low energy availability underlies Relative Energy Deficiency in Sport, affecting health and performance in females and males, with an interplay with mental health; low carbohydrate availability has a growing role.", evidence: position(S.mountjoy2023Reds.id) },
  ], "requires_clinical_judgment"),
];

/** Populations whose nutrition needs individualized professional judgment — coaching considerations and referral
 * triggers, never treatment logic. The Nutrition Reasoner's safety gate (lib/synthesis/nutrition/safety.ts) acts on
 * these BEFORE any model call. */
export const NUTRITION_POPULATIONS: PopulationModifierEntry[] = [
  {
    id: "population.nutrition.minor",
    kind: "population_modifier",
    domain: "population_modifiers",
    version: 1,
    scope: "requires_clinical_judgment",
    evidence: curated,
    population: "Clients under 18",
    coachingConsiderations: ["Growth needs come first: OPTIM never sets an energy deficit for a minor.", "Food-quality and habit guidance only, with the coach deciding."],
    referralTriggers: ["Any weight-loss or weight-gain goal", "Any sign of disordered eating"],
  },
  {
    id: "population.nutrition.pregnancy_lactation",
    kind: "population_modifier",
    domain: "population_modifiers",
    version: 1,
    scope: "requires_clinical_judgment",
    evidence: position(S.procter2014Pregnancy.id),
    population: "Pregnancy or breastfeeding",
    coachingConsiderations: ["Appropriate weight gain, varied foods, appropriate supplementation and safe food handling are part of a healthy pregnancy outcome — individualized by the client's healthcare provider."],
    referralTriggers: ["Pregnancy or breastfeeding reported or suspected — no energy targets from OPTIM"],
  },
  {
    id: "population.nutrition.disordered_eating",
    kind: "population_modifier",
    domain: "population_modifiers",
    version: 1,
    scope: "requires_clinical_judgment",
    evidence: position(S.mountjoy2023Reds.id),
    population: "Possible disordered eating or low energy availability",
    coachingConsiderations: ["Low energy availability interacts with mental health; restriction-focused targets can cause harm."],
    referralTriggers: ["History or signs of an eating disorder, purging, compensatory exercise or extreme restriction", "Underweight with a fat-loss goal"],
  },
  {
    id: "population.nutrition.medical",
    kind: "population_modifier",
    domain: "population_modifiers",
    version: 1,
    scope: "requires_clinical_judgment",
    evidence: curated,
    population: "Medical nutrition needs",
    coachingConsiderations: ["Conditions such as diabetes, kidney disease or bariatric surgery, and some medications, change nutrition needs — medical nutrition therapy is outside coaching scope."],
    referralTriggers: ["A medical condition or medication that affects nutrition", "A clinician's diet prescription"],
  },
];
