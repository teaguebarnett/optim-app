# Unified Program Intelligence — Gate U1 checkpoint status

**Status: OFFLINE-VERIFIED development checkpoint. Not production-ready. No live-model evaluation.**
Branch `unified-program-v1` (from `8d9f701`, Cardio Reasoner V1.2; not merged, not deployed). Contract
`optim.unified-program-proposal.v1`, version `unified-program-u1.0.0`. No paid model calls were made in this gate.

## Architecture

`lib/synthesis/unified/` — an orchestration layer over the three EXISTING domain reasoners (no new model, no new brain,
no reasoner rebuilt):

```
program readiness (coach method, goal, ≥ 1 available day)
→ domain scope from the coach's calibration (resistance = training areas / programs_resistance; cardio = t_cardio_roles
  or endurance; nutrition = nutrition_scope) — an uncovered domain is NOT_COACHED, never forced
→ cross-domain safety gate (cardio + nutrition screens) → ESCALATE, no model call
→ deterministic PREFLIGHT: each coached reasoner run with model = null reaches all its pre-model gates; any
  NEEDS_INPUT / ESCALATE / unsupported resistance stops the program with every open input listed, 0 model calls
→ RESISTANCE: coach-approved program = fixed input (hash-checked); else Fitness Reasoner proposal
→ CARDIO around exactly that lifting week → NUTRITION for exactly that training (lifting as the energy context)
→ assemble ONE proposal → cross-domain validation → prepared coach decisions
```

A coached domain that can't be produced is reported with its reasons; its dependents are HELD (no call) unless the coach
has decided to proceed without it. Nothing is persisted, approved or published.

**Reused unchanged:** Fitness/Cardio/Nutrition reasoners, shared core (`runModelAttempts`), run artifacts, Coach Brain,
ClientState, GoalContract, ConstraintSet, cardio placement/capacity rails, nutrition energy/safety.
**Additive changes:** `TrainingContext.source` gains `proposed_program` (nutrition labels a not-yet-approved week
honestly; behavior for existing sources unchanged); `resistanceWeekFromSpec` (lifting week from a resistance proposal);
`programContent` test fixture. **New:** `contract.ts`, `orchestrate.ts`, `assemble.ts`, `validate.ts`, eval + rails.

## Unified proposal

Status (READY_FOR_REVIEW / NEEDS_COACH_DECISION / INCOMPLETE / INCOHERENT / ESCALATE / NEEDS_INPUT); objective and each
domain's part; per-domain outcome (PROPOSED, APPROVED_EXISTING, NO_ADDITIONAL, NOT_COACHED, NEEDS_COACH_REVIEW,
NEEDS_INPUT, UNSUPPORTED, ESCALATE, REJECTED, PROVIDER_FAILED, HELD) with reasons and run reference; coordinated week
(lifting focus/minutes/source, cardio session, visits, longest visit); combined workload; recovery signals and
considerations; progression per domain + deload alignment; monitoring; assumptions; uncertainties; cross-domain errors
and findings; prepared decisions; questions; escalations; provenance (client/goal/coach-method hashes, approved
program version + hash, domain runs, model calls).

## Cross-domain validation (deterministic)

Errors (→ INCOHERENT): domain runs over a different client state, goal or coach-method version; cardio planned around a
different lifting week; nutrition prepared for different training; an approved program changed; proposed training on
an unavailable day; a same-visit total over the client's cap; cardio for fat loss next to a nutrition surplus, or
nutrition for muscle gain next to fat-loss cardio. Prepared decisions: a second visit in a day for a client with one
training time; no rest day with limited recovery; which days count as training days for nutrition when it varies by
day and there are cardio-only days; plus every domain decision (cardio conflicts, optional dose, added training day)
and a program decision when resistance can't be produced. Findings: no rest day (not recovery-limited), two visits,
lifting over cap / on an unavailable day (approved program), cardio rising during a lifting deload, cardio energy not
included in nutrition (stated, never blended into a falsely precise figure). No new numeric limits.

## Accepted tests (this checkpoint)

- `npm run verify:unified-program` — 21/21 (end-to-end coordination; approved program immutability; 0 calls when
  blocked; runtime REJECTED / PROVIDER_FAILED reported, never filled in; NOT_COACHED never forced; NO_ADDITIONAL valid;
  proceed-without-resistance only on the coach's decision; every cross-domain check fires on a tampered program;
  determinism; shared provenance).
- `npm run eval:unified-program` — 17/17 programs meet their whole-program invariants: fat loss (approved / none /
  proceed), muscle gain with limited recovery, strength, recomposition, hybrid, coach without cardio, three nutrition
  methodologies, schedule conflicts, missing information (×2), safety (×2), resistance-only coach. Scripted domain
  models — rails and coordination, not coaching quality.
- Regressions: cardio 84/84 + 19/19; resistance 30/30 + eval passing; resistance-planner 16/16; nutrition 22/22 +
  20/20; client-state 24/24; resynthesis-lifecycle 24/24; synthesis 14/14; 101/102 verify suites; typecheck clean; lint
  0 errors (6 pre-existing warnings in unrelated files); production build compiles.
- Unrelated, pre-existing: `verify:nutrition-authoring` fails to load (`ERR_UNKNOWN_FILE_EXTENSION` importing
  `components/coach/nutrition-review-detail-sheet.tsx`); neither file changed since `8d9f701`.

## Remaining blockers and limitations

1. **Resistance routing:** the Fitness Reasoner returns DOMAIN_NOT_YET_SUPPORTED for fat_loss / weight_gain / maintenance
   (→ weight_management) and recomposition (→ hybrid) and sport_performance (`domains.ts` `SUPPORTED_DOMAINS` =
   resistance, general_fitness). U1 handles it with an approved program or a coach decision only.
2. **Nutrition training context** holds one `kind` (`resistance | endurance | mixed`) with one session length — it
   can't represent lifting + cardio; cardio energy is stated as excluded.
3. **Cardio has no executable form:** no converter to `UniversalTrainingProgramContent`; `RpeValue` is 6–10
   (`lib/types.ts`), so easy/moderate cardio effort (1–6) can't be represented.
4. **No persistence or review surface** for a unified proposal (`reasoner_generation_jobs` is resistance-only, keyed to
   one `program_version_id`).
5. **Publication is per domain and not atomic:** `publishProgramVersion` + `assign_active_program_version` RPC and
   `publishNutritionVersion` + `assignNutritionVersionToClient` are separate operations.
6. Nutrition → existing contract: `to-plan.ts` can only map numeric strategies with all four macros; habit, portion and
   baseline-first strategies can't be published as `AssignedNutritionPlan` today.
7. Resistance frequency doesn't use recovery signals (flagged for the coach); no unified live evaluation; domain-level
   limits carried (cardio live repair unverified, no qualified expert review, nutrition V1.1 items).
