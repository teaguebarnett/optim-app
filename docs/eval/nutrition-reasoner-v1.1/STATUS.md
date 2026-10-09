# Nutrition Reasoner V1.1 — checkpoint status

**Status: OFFLINE / LIMITED-LIVE VERIFIED development checkpoint. Not production-ready.**
Branch `nutrition-reasoner-v1-offline` (not merged, not deployed). Prompt `reasoner-nutrition-v1.1.1`,
reasoner `nutrition-reasoner-v1.1.1`, knowledge `nutrition-0.2.0`, model `claude-opus-5` at medium effort.

## What V1.1 changed (from the V1.0 live evaluation)

| Weakness found live in V1.0 | Fixed at |
|---|---|
| Calorie reductions filed under `add_calories` | Contract: adjustments carry `direction` (energy intake) + `kcal`; a lever-meaning table; coach-facing summary rendered from the structure, not the wording |
| Macro ranges far wider than the energy range | Validator: macro minimum/maximum totals must fit inside the energy range (± max(100 kcal, 5%)) and the midpoints must agree |
| Training and rest days barely differed | Knowledge: Compendium MET ranges (verified at pacompendium.com) → per-session cost; the energy range is a weekly average; the training/rest difference is sized to the session; schedule/program contradictions detected deterministically |
| Model-written weekly rates didn't match the energy | `energy.rate` must match OPTIM's calculation; OPTIM shows its own estimate with uncertainty ("not a guarantee"); prose rates are flagged, not trusted |
| A minor's reduction worded "trimming" escaped a word-based rule | Safety is structural and numeric: worst-case checks across full ranges (never clipped); under 18, any decrease, fat-loss focus or energy below the client's own central maintenance is a restriction — repair feedback first, otherwise **NEEDS_COACH_REVIEW** (never a prescription). Predicted resting expenditure is a minimum OPTIM never crosses, never evidence of safety |

## Verification at this checkpoint

- `npm run verify:nutrition-reasoner` — 22/22, including the adversarial minor set (nine wordings of the same reduction) and adult worst-case cases.
- Offline eval (`npm run eval:nutrition-reasoner`) — 20/20 scenarios meet every hard check.
- Resistance Reasoner suites and offline eval unchanged and passing (shared core).
- Live (capped, metered): V1.0 — 11 scenarios, ≈$2.05. V1.1.0 — 6 scenarios, 4 planned / 2 rejected by the new numeric rules, ≈$1.21. V1.1.1 — N01 and N20 both PLANNED on the first attempt, ≈$0.42. V1.1 gate total ≈$1.63.

## Remaining limitations (open)

1. **Tiny calorie adjustments near the energy floor.** The worst-case rule is met by shrinking the step: live N01 proposed a 40–50 kcal/day decrease landing exactly on the predicted-resting-expenditure floor — close to measurement noise. No minimum meaningful step, and no rule preferring a non-intake lever when there is no room.
2. **Macro-range tolerance.** Containment uses ± max(100 kcal, 5% of energy). With narrow energy ranges this still allows wide macro spans (live N20: macros ≈2,485–2,865 kcal against 2,600–2,750).
3. **Final prompt evaluated live on only N01 and N20.** N02, N05, N06 and N09 last ran on prompt v1.1.0; N03, N04, N07, N08 and N10 not since V1.0. One capped run of the remaining nine model scenarios is owed.
4. **Missing intake information.** The live onboarding doesn't collect: pregnancy/breastfeeding or disordered-eating screening (every proposal carries coach confirmations instead), meals per day, cooking capacity, budget, food preferences, or lean mass (so no energy-availability calculation). Unrecognized restriction wording becomes a coach question.
5. **No production-integration contracts.** No persistence (draft `nutrition_plan_versions` + a job record), no coach review surface, and the existing `AssignedNutritionPlan` contract can't represent habit-based, portion-based or baseline-first strategies. NEEDS_COACH_REVIEW has no production destination yet. No verified food-composition data (USDA FoodData Central) — foods carry no nutrient values.
6. **Independent qualified coaching review still required.** No qualified coach or registered dietitian has scored the generated strategies. Review packs from the live runs exist (scratch artifacts, not committed); the AI does not score itself.
7. **Other known gaps.** Daily-activity multipliers are an internal heuristic; MET values are averages; the plausible rate range is wide (≈ ±0.5%/week). Free-text habits can't be checked structurally — coach review is the safeguard.

## Not done here

No production integration, UI, deployment, client publication or Cardio Reasoner work.
