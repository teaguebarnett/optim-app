// Gate 4.0C-1B — the source registry. Every external source below was
// checked against its PubMed record (NCBI E-utilities) on 2026-10-02, and
// each claim citing it paraphrases that record's abstract — nothing is
// cited from memory. Internal curation is labelled as exactly that.

import type { KnowledgeSource } from "./types.ts";

const VERIFIED = "PubMed record + abstract (NCBI E-utilities), 2026-10-02";

export const SOURCES = {
  internalLibrary: {
    id: "src.optim_exercise_library_v1",
    type: "internal_curation",
    title: "OPTIM exercise library (lib/coach/exercise-library.ts)",
  },
  internalTaxonomy: {
    id: "src.optim_resistance_taxonomy_v1",
    type: "internal_curation",
    title: "OPTIM resistance taxonomy and exercise ratings v1 — internal curation, pending qualified review",
  },
  acsm2009: {
    id: "src.acsm_2009_progression_models",
    type: "position_stand",
    title: "American College of Sports Medicine position stand. Progression models in resistance training for healthy adults.",
    citation: "American College of Sports Medicine. Med Sci Sports Exerc. 2009;41(3):687-708.",
    doi: "10.1249/MSS.0b013e3181915670",
    pmid: "19204579",
    publishedOn: "2009-03",
    verifiedVia: VERIFIED,
  },
  schoenfeld2017Volume: {
    id: "src.schoenfeld_2017_volume_dose_response",
    type: "meta_analysis",
    title: "Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis.",
    citation: "Schoenfeld BJ, Ogborn D, Krieger JW. J Sports Sci. 2017;35(11):1073-1082.",
    doi: "10.1080/02640414.2016.1210197",
    pmid: "27433992",
    publishedOn: "2017-06",
    verifiedVia: VERIFIED,
  },
  schoenfeld2016Frequency: {
    id: "src.schoenfeld_2016_frequency_hypertrophy",
    type: "meta_analysis",
    title: "Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis.",
    citation: "Schoenfeld BJ, Ogborn D, Krieger JW. Sports Med. 2016;46(11):1689-1697.",
    doi: "10.1007/s40279-016-0543-8",
    pmid: "27102172",
    publishedOn: "2016-11",
    verifiedVia: VERIFIED,
  },
  schoenfeld2017Load: {
    id: "src.schoenfeld_2017_low_vs_high_load",
    type: "meta_analysis",
    title: "Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training: A Systematic Review and Meta-analysis.",
    citation: "Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW. J Strength Cond Res. 2017;31(12):3508-3523.",
    doi: "10.1519/JSC.0000000000002200",
    pmid: "28834797",
    publishedOn: "2017-12",
    verifiedVia: VERIFIED,
  },
  refalo2023Failure: {
    id: "src.refalo_2023_proximity_to_failure",
    type: "meta_analysis",
    title: "Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis.",
    citation: "Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ. Sports Med. 2023;53(3):649-665.",
    doi: "10.1007/s40279-022-01784-y",
    pmid: "36334240",
    publishedOn: "2023-03",
    verifiedVia: VERIFIED,
  },
  grgic2018RestStrength: {
    id: "src.grgic_2018_rest_strength",
    type: "systematic_review",
    title: "Effects of Rest Interval Duration in Resistance Training on Measures of Muscular Strength: A Systematic Review.",
    citation: "Grgic J, Schoenfeld BJ, Skrepnik M, Davies TB, Mikulic P. Sports Med. 2018;48(1):137-151.",
    doi: "10.1007/s40279-017-0788-x",
    pmid: "28933024",
    publishedOn: "2018-01",
    verifiedVia: VERIFIED,
  },
  grgic2017RestHypertrophy: {
    id: "src.grgic_2017_rest_hypertrophy",
    type: "systematic_review",
    title: "The effects of short versus long inter-set rest intervals in resistance training on measures of muscle hypertrophy: A systematic review.",
    citation: "Grgic J, Lazinica B, Mikulic P, Krieger JW, Schoenfeld BJ. Eur J Sport Sci. 2017;17(8):983-993.",
    doi: "10.1080/17461391.2017.1340524",
    pmid: "28641044",
    publishedOn: "2017-09",
    verifiedVia: VERIFIED,
  },
} as const satisfies Record<string, KnowledgeSource>;

export const ALL_SOURCES: KnowledgeSource[] = Object.values(SOURCES);
