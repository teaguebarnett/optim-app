# Gate 4.0C-3B — targeted resistance pass (reasoner v1.2, prompt v2.2)

This pass addresses four weaknesses found by human review, by fixing the subsystem that owns each one. No domain was added, nothing was wired into Generate Proposal, and no plan was published. All live calls used medium effort.
Real-client specifics stay out of the repository; only aggregates appear here.

## Root causes and the subsystem changed

| Issue | Root cause (taxonomy) | Change |
|---|---|---|
| 1. Temporarily blocked primary goal | **SCHEMA_LIMITATION**: the plan had no way to say "goal stands, direct work paused". **RETRIEVAL_FAILURE**: the model saw only eligible exercises, not what was blocked or by which constraint. | `blocked` map in the input (exercises excluded *only* by a constraint alias or the coach's avoided list). Structured goal targets are resolved from strength `priorityLifts`, never from free text. A new `goalAccess` output records direct/blocked status, `blockedBy` and the interim intent. **The validator checks this is truthful:** a lift claimed blocked must really be blocked, by that key; a lift claimed direct must be trained. Structured priority lifts must be addressed. A deterministic coach-review unresolved item and a `goal_direct_work_blocked` warning are added. |
| 2. RPE 9 almost everywhere | **REASONING_FAILURE**, amplified by **SCHEMA**/expansion: an omitted `rir` defaulted to the coach's whole range, rendered at its hard end. A 1–2 range displayed as a single "RPE 9". | `rir` is required whenever the coach uses RIR/RPE, so a coach range is never applied as an instruction. New `effort` decision topic. A prompt principle says ranges are boundaries, with effort set by role, purpose, fatigue cost, frequency and recovery. Review warnings: `effort_uniform`, `effort_hard_end`, `effort_unexplained`. The review pack renders each exercise's own RPE/RIR range. |
| 3. Static bracing demand | **KNOWLEDGE_GAP**/**SCHEMA_LIMITATION**: one static bracing level per exercise, while real bracing depends on load and effort. **VALIDATOR_GAP**: nothing tied prescription to demand. | New `ExerciseEntry.loadedDemands` (demands when heavy or near failure) and `LOADED_DEMAND_CONDITION` (fewer than 6 reps or RIR below 2). **One curated rule over metadata:** a compound lift with moderate-or-higher loading and no chest support has at least moderate bracing when heavy. Eligibility gains `loadConditions`: an exercise is eligible only if kept submaximal. The input marks those rows `S`, and the validator rejects heavy or near-failure prescriptions on them. No exercise-specific exceptions. Confirmed constraints stay authoritative. Knowledge version 0.3.0. |
| 4. Unanchored days/weeks; generic progression | **REASONING_FAILURE** + **SCHEMA_LIMITATION**. **COACH_BRAIN_GAP**: no preferred program length is set. | Deterministic `anchors`: days = the client's current frequency within the coach's range and availability; weeks = the coach's preferred length, else the shortest allowed. **A departure needs a `deviations` entry citing a client fact or coach rule; population guidance alone is rejected.** `progression.phases` (contiguous, weeks 1..N, each with focus and intent) is required and carried into week notes. Info flag when the coach has no preferred length. |

## Offline regression evidence (no model calls)
- `verify:reasoner` passes 19/19 with new tests 16–19, one per issue. They cover the knowledge rule asserted across the whole registry, submaximal caps, blocked-goal truthfulness, required and flagged effort, anchors and deviations, and phase coverage.
- The offline eval passes 25/25 scenarios.
- `verify:synthesis`, `verify:knowledge` and `verify:limitations` pass. 92 of 93 `verify:*` suites pass; the exception, `verify:nutrition-authoring`, imports a `.tsx` file and also fails at HEAD.
- `tsc`, `eslint` and `next build` are clean.
- **Saved-run replay:** the 4 Gate 4.0C-3A real-client outputs, re-validated against v1.2 (with a placeholder phase added so validation can proceed), are all rejected for exactly the reviewed problems:
  - 8 load-sensitive compounds prescribed heavy or near failure;
  - 16/14 weeks (and once 5 days) departing from the anchors with no stated reason;
  - no phases.

## Live results — real internal client, identical input, medium effort
- **Calls:** 2 executed (cap 3). The third was not needed, because both runs agreed on every major decision.

| | v1.1 high (3 runs) | v1.1 medium (1) | **v1.2 medium (2)** |
|---|---|---|---|
| Days / split / weeks | 6/6/5 · PPL/PPL/UL · 16 | 6 · PPL · 14 | **6/6 · PPL · 12/12**, no deviations |
| Blocked goal handled | implicit (an assumption) | implicit | **`goalAccess` blocked by C1, interim stated, coach review added**, in both runs |
| Exercises at RIR ≤1 | 94–100% | 100% | **59–70%** (low-fatigue isolation) |
| Main lifts at RIR ≤1 | 100% | 100% | **5/12** (only non-capped machine isolation and the chest-supported row) |
| Load-sensitive compounds | heavy/near failure | heavy/near failure | **all at ≥6 reps, RIR 2–3** |
| Progression | one repeated rule | one repeated rule | **3 phases** (accumulate → intensify → express/peak) |
| Main-lift overlap / session-shape agreement | 0.52 / 0.33 | — | **0.80 / 0.50** |
| Volume CV (major muscles) | 0.13 | — | **0.03** |
| Attempts | 2, 1, 2 (truncation) | 1 | **1, 1** |
| Input / output tokens | 7.4–7.5k / 8.5–13.2k per attempt | 7.4k / 8.1k | **8.7k / 8.1–8.4k** |
| Model time | 89–142 s per attempt (267–290 s with retries) | 85 s | **83–88 s** |

Run 2 also surfaced two coach-method tensions without being prompted for them. One is that the submaximal cap stops the heavy end of the coach's rep range being used for the strength goal.

## Remaining weaknesses
1. **Phases are prose.** Phase intents ("mains in the 8–12 zone") don't drive the weekly prescription; the repZones wave is phase-agnostic. Week 1 mains can contradict phase 1's text. This is the next SCHEMA_LIMITATION.
2. Low-fatigue isolation still sits at RIR 0–2 in most of the week. That is defensible, but it's for human review to judge, not something the warnings settle.
3. Some exercise repeats are still unexplained (hip abduction/extension), and the `exercise_repeated` warning persists.
4. Goal targets from free text depend on the model. Deterministic detection exists only for structured `priorityLifts`, which the intake doesn't collect yet (CLIENT_DATA_GAP).
5. The load-sensitive bracing rule is internal curation, not yet expert-reviewed. The thresholds (6 reps, RIR 2) are OPTIM's.
6. The deterministic legacy planner doesn't apply load conditions; it is review-only and unchanged.
7. Stability rests on n = 2 runs. The coach has no preferred program length (the anchor uses the shortest allowed).
8. No human has scored v1.2 yet.

## Recommendation
**Another targeted resistance pass**, smaller than this one, before production integration architecture:
- make phases machine-applied, so phase intent drives each week's reps, effort and sets;
- capture structured priority lifts at intake or coach confirmation;
- have the coach score the v1.2 pack.

Medium effort now looks viable as the production setting. It was clean on the first attempt, about 85 s per plan and about 8k output tokens, with more stable major decisions than v1.1 high. That makes integration the step after the next pass.
