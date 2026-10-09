// Cardio Knowledge V1 — its own versioned registry, built with the SAME factory and validation as Fitness and
// Nutrition Knowledge, so a cardio knowledge release never changes resistance or nutrition planning state.

import { createKnowledgeRegistry } from "../registry.ts";
import type { FitnessKnowledgeRegistry } from "../types.ts";
import { CARDIO_CONCEPTS, CARDIO_POPULATIONS } from "./concepts.ts";
import { ALL_CARDIO_SOURCES } from "./sources.ts";

export const CARDIO_KNOWLEDGE_VERSION = "cardio-0.1.0";

export const CARDIO_KNOWLEDGE: FitnessKnowledgeRegistry = createKnowledgeRegistry({
  version: CARDIO_KNOWLEDGE_VERSION,
  sources: ALL_CARDIO_SOURCES,
  entries: [...CARDIO_CONCEPTS, ...CARDIO_POPULATIONS],
});
