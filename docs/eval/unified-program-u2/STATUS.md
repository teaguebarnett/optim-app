# Unified Program Intelligence — Gate U2 checkpoint status

**Status: DEVELOPMENT CHECKPOINT — locally verified (real Postgres + RLS), not deployed. No real persisted draft
exists in production.** Branch `unified-program-v1` (not merged). Migration 034 is applied to the LOCAL database only.
No paid model calls were made in this gate; production was only read (SELECT).

## What U2 delivers

1. **Executable cardio.** `Prescription.effort` / `recoveryEffort` — CR10 cardio effort (0–10, label, talk-test
   anchor), continuous/interval families only; resistance `rpe` (6–10) unchanged; `Session.optional`. Workout displays
   show effort. `unified/cardio-content.ts` converts validated cardio output into executable `continuous` / `interval`
   sessions (week 1 exact effort/talk/HR; later weeks the label's band; heart rate only with zones; placement notes;
   optional status) and merges it into the lifting program without touching lifting sessions; nothing past the cardio
   horizon. Cardio contract v1.3 (`reasoner-cardio-v1.3.0`): every week's interval session carries its structure.
2. **Persistence.** Migration `20261010000034_unified_program_proposals.sql`: one parent row per proposal (staff-only
   RLS, single-flight, idempotency key, `approval_state` pinned to `proposed`, no delete, link trigger: linked versions
   must be DRAFTS in the same workspace and — for training — for the same client; ownership/key immutable).
   `lib/production/draft-versions.ts` (the inserts `createDraftProgramVersion` / `createDraftNutritionVersion` now share),
   `lib/production/unified-drafts.ts` (begin → complete; proposal + domain runs stored first; drafts reused on resume),
   `lib/production/unified-proposals.ts` (server-only entry point with freshness checks; no UI calls it).
3. **Domain drafts.** Training draft = lifting (proposed / the coach's pending draft used unchanged / a copy of the
   approved program — never the approved row) + executable cardio; always `status: draft`. Nutrition draft only when the
   strategy has all four targets (empty `approvedAtIso` until approval); otherwise the strategy and the reason are kept
   on the row. No drafts for blocked, incomplete or incoherent programs.
4. **Safety aligned with the canonical coach health-review policy** (`unified/safety.ts`): an unresolved review stops
   everything (unchanged); under a resolved review cardio's screen escalations block only cardio (prepared clearance
   decision); domains are checked only if they apply (cardio roles vs goal — checked before cardio safety in the Cardio
   Reasoner too); text-flag / minor / nutrition-population escalations still stop the whole program; a structured
   confirmation contradicting its documented limitations stops planning with a coach decision; a pending lifting draft is
   used only if every exercise fits the current confirmed restrictions; an approved program conflict is a decision.
   **Documented-limitation exercise review:** exercises the documented limitations name but the confirmed restrictions
   allow (e.g. lat pulldowns, triceps pushdowns, single-leg calf raises) become an explicit coach decision with no
   recommendation — never declared safe; restrictions never modified.

## Verification

- `npm run e2e:unified-drafts` (local stack only) — 36/36: real linked drafts under coach RLS; persisted cardio executes in
  the workout engine (steady + interval); nothing approved/assigned/enrolled; idempotent retry; workspace and client
  isolation (incl. cross-workspace link refused); approved program byte-identical and its assignment unchanged; resume
  after partial failure with exactly one version; needs-input with 0 calls; calories-and-protein kept as a strategy;
  non-applicable cardio not forced; single-flight; review contradiction blocked; reviewed limitations with cardio held.
- pgTAP 140/140 (117 existing + 23 for migration 034), incl. `rls_isolation`.
- `verify:unified-program` 31/31, `eval:unified-program` 17/17, `verify:unified-drafts` 8/8, `verify:cardio-reasoner`
  86/86 + 19/19, resistance 30/30 + eval, nutrition 22/22 + 20/20, execution suites (workout 67, interval 34, continuous
  25, …), limitations 17, synthesis 14; 102/103 verify suites; typecheck clean; lint 0 errors; build compiles.
  Unrelated, pre-existing: `verify:nutrition-authoring` can't load a `.tsx` import.

## The real iCloud test client (read-only)

Goal hypertrophy (resistance supported). The Oct 2 review is "proceed with limitations"; the structured restrictions were
re-confirmed by the coach on Oct 9, 10:03 PM (lower-body compounds, direct ab/trunk work, moderate+ bracing) — the
earlier "no exercise restrictions" contradiction is resolved. Read-only U2 readiness: 0 model calls; cardio not
applicable (coach's cardio is fat-loss only); the pending lifting draft v4 fits the current restrictions (24/24) and is
used unchanged; decision raised: v4's Cable Triceps Pushdown and Single-Leg Calf Raise are named by the documented
limitations — coach review required. Unified status INCOMPLETE only because nutrition needs a model call.
**No real persisted draft exists.**

## Remaining dependencies

1. **Nutrition generation** — one paid Nutrition Reasoner call for the client (not authorized in U2).
2. **Nutrition format compatibility** — `AssignedNutritionPlan` requires carbs and fat: calories-and-protein (this coach),
   habit-based and baseline-first strategies can't become client plans; they are kept on the proposal row. Extend the
   format or define coach-authored handling.
3. **Production deployment** — commit review, apply migration 034 to production (approval required), deploy.
4. **Coach approval** — review surface reusing the existing proposal review/edit actions; recorded answers to prepared
   decisions (incl. the documented-limitation exercise review); domain-scoped reruns; cross-domain revalidation after
   edits; widen `approval_state`; stamp nutrition `approvedAtIso`.
5. **Atomic publication** — one database function publishing and assigning the linked training and nutrition versions
   together after rechecking client, workspace, coach and proposal hashes; supersession rule for legacy pending drafts.
6. Also open: logging CR10 actual effort (logging stores 6–10 RPE only); cardio v1.3 prompt and unified live
   verification (paid); the review-integrity check exists only in the unified layer, not the existing resistance workflow.
