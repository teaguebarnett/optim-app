"use client";

import { NutritionScreen } from "@/components/nutrition/nutrition-screen";

// Phase 13B (Gate 2A) — /nutrition is preserved as a functional deep link
// (Today's fuel-section shortcut and any bookmarked/shared URL) rendering
// the exact same NutritionScreen the /plan destination's Nutrition
// subsection uses — see components/nutrition/nutrition-screen.tsx and
// app/(client)/plan/page.tsx. No business logic lives in either page file.
export default function NutritionPage() {
  return <NutritionScreen />;
}
