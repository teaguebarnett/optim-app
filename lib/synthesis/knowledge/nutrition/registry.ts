// Nutrition Knowledge V1 — its own versioned registry, built with the SAME factory and validation as Fitness
// Knowledge (createKnowledgeRegistry / validateKnowledge). Kept as a separate instance so a nutrition knowledge
// release never changes the resistance planning state (lifecycle fingerprints include the Fitness Knowledge version).

import { createKnowledgeRegistry } from "../registry.ts";
import type { FitnessKnowledgeRegistry } from "../types.ts";
import { NUTRITION_CONCEPTS, NUTRITION_POPULATIONS } from "./concepts.ts";
import { ALL_NUTRITION_SOURCES } from "./sources.ts";

export const NUTRITION_KNOWLEDGE_VERSION = "nutrition-0.1.0";

export const NUTRITION_KNOWLEDGE: FitnessKnowledgeRegistry = createKnowledgeRegistry({
  version: NUTRITION_KNOWLEDGE_VERSION,
  sources: ALL_NUTRITION_SOURCES,
  entries: [...NUTRITION_CONCEPTS, ...NUTRITION_POPULATIONS],
});
