# Unified Program — Gate U3A checkpoint status: Nutrition Plan Contract

**Status: DEVELOPMENT CHECKPOINT — locally verified (real Postgres + browser QA on local Supabase), not deployed.**
Branch `unified-program-v1` (not merged). No migration. No paid model calls. Production untouched.

## Contract

- Existing four-number plans (`AssignedNutritionPlan` without `method`) are unchanged: validated, stored, displayed and
  snapshotted exactly as before.
- New plans carry `method` (`NutritionPlanMethod`): approach (full_macros / calories_protein / meal_plan /
  portion_guides / habit_based), energy mode (target / baseline_first / none), only the PRESCRIBED targets (null = not
  prescribed, never 0), training/rest-day targets, proposal ranges (provenance), baseline instruction, habits, meals with
  intent, coach-approved substitutions, monitoring, adjustments. `targets` is the full four-number set only when all
  four are prescribed (then it must equal the prescription), else null.
- Validation (`validateAssignedNutritionPlanContent`): non-numeric approaches carry no numbers and need guidance;
  calories+protein never carries carbs/fat; full macros needs all four; target mode needs calories; baseline first needs
  calories null plus the instruction; 0 is rejected as "not set".
- Nutrition Reasoner proposals convert for every approach (midpoints of approved ranges; nothing filled in); unified
  drafts validate nutrition before insert — calories+protein, habit and baseline-first now persist as nutrition drafts.

## Consumers (display without fake targets)

Today Fuel and entrance, pre-start screens, Nutrition (fuel overview, macro tiles/detail: "No target" vs "not
assigned"), plan guidance card (method summary, coach measure labels), review-today sheet, daily-completion task, status
line, snack planner, daily records (`prescribedSnapshot`, additive) and history target-met, historical day, coach
workspace/roster, OPTIM Assistant context. Database: `nutrition_plan_versions.content` is unconstrained jsonb — pgTAP
proves method plans store, publish (immutable), assign and read back with RLS unchanged.

## Verification

`verify:nutrition-plan-contract` 10/10; pgTAP 148/148; `e2e:unified-drafts` 39/39; nutrition, history, planner, chat,
progress, briefing suites green; Nutrition Reasoner 20/20, unified 17/17; typecheck, lint (0 errors), build. Browser QA
(local, mobile frame) for calories+protein, legacy, habit and baseline-first clients plus coach views;
`scripts/qa-seed-nutrition-methods.mts` reproduces the fixtures (local only).

## Open

Training/rest-day calorie splits aren't shown day by day for method plans; the composer's quick macro revision is
disabled for them; hydration/fiber still use 0 = not set; habit clients still see the (honest, "No target") macro panel —
a UI decision. Cross-client data-integrity defect found in this QA: fixed separately (`fix(security)` commit).
