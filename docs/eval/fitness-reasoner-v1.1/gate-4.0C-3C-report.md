# Gate 4.0C-3C — final targeted resistance pass (reasoner v1.3, prompt v2.3, knowledge 0.4.0)

This pass fixes four remaining issues and reopens nothing else. No production integration, no new domain, nothing published, medium effort only. Real-client specifics stay out of the repository.

## Root causes, subsystems and implementation

| Issue | Root cause | Subsystem | Implementation |
|---|---|---|---|
| 1. Phases didn't drive the prescription | SCHEMA_LIMITATION: phases were prose beside an unrelated weekly repZones/setsDeltas cycle, and expansion silently clamped sets | Reasoner output schema + deterministic week expansion + validator | Each phase carries per-role `zones` (cycled inside the phase), `rir` and `sets` deltas (−1/0/+1), and `progress` (a coach method or "hold"). The old weekly cycle is removed. `prescribedWeek()` is the single source of every week's sets, reps and RIR, used by both expansion and validation, and it doesn't clamp. Week notes are rendered only from the structure. **Rejected:** any computed week outside the coach's set/RIR ranges or an exercise's constraint-fit minimums; numbers in phase focus/intent; rep/RIR/sets numbers in the progression text; progress methods that aren't the coach's. |
| 2. Bracing implied false certainty | KNOWLEDGE_GAP: "≥6 reps & RIR ≥2" was treated as sufficient for compatibility | Knowledge + eligibility + validator | New `ExerciseEntry.trunkSupport` (external / partial / none, derived from positions and equipment). `DemandCompatibility` has four states: compatible, conditional, uncertain, incompatible. Load-sensitive work with partial support is **conditional** (conditions listed). With no support it is **uncertain**: the submaximal minimums are necessary, not proof. Rows are marked `K` or `U`. A `U` exercise needs a rationale note and adds a coach-review unresolved item plus a warning. `K` exposes its conditions. No medical or "safe" claims, and no exercise-specific rules. |
| 3. Performance target depended on free text | SCHEMA_LIMITATION / CLIENT_DATA_GAP: the GoalContract had no structured target | GoalContract + ClientState + reasoner input | `PerformanceTarget` (exercise, metric, value, unit, atReps, timeframe, basis, source) is added to the canonical `GoalContract.performanceTargets`. It is read strictly from an optional intake answer (`what_you_want.performanceTargets`) or from coach confirmation (`withCoachConfirmedGoal(…, targets)`). It defaults to `[]`, so existing clients are unchanged. The reasoner prefers it (de-duplicating priority lifts); free text is the fallback. A trainable structured target must be trained and recorded as direct; a blocked one must be recorded as blocked. |
| 4. Repetition false positives | VALIDATOR_GAP: any repeat without a note was a REASONING_FAILURE | Validator + taxonomy | A repeat is flagged (`exercise_repeated_unjustified`) only when it has an identical prescription, no stated reason, *and* an eligible alternative for the same pattern and muscles. Differentiated or necessary repeats are not flagged. |

## Offline evidence (no model calls)
- `verify:reasoner` passes 23/23, with new tests 20–23 (one per issue) and tests 16/19 updated to the new shapes.
- The offline eval passes 25/25 scenarios. `verify:synthesis`, `verify:knowledge` and `verify:limitations` pass.
- 92 of 93 `verify:*` suites pass. The unrelated, pre-existing failure is `verify:nutrition-authoring`: Node can't load an imported `.tsx` file, and it also fails at HEAD.
- `tsc`, `eslint` and `next build` are clean.
- **Replay of both saved v1.2 real-client runs:**
  - Both are rejected for numeric phase prose such as "mains in the 8–12 zone", which no longer reaches a plan.
  - Both are rejected for 3 U pulls without a rationale.
  - The differentiated Leg Extension repeat is no longer flagged; the identical Hip Abduction repeat still is.

## Live calls
**2 executed, medium effort, cap 2.**

**Call 1:** PLANNED on the first attempt (9,151 in / 11,008 out, 121 s). Its output was **lost**: the reporting script crashed before saving. The runner now saves before printing and was dry-run offline before call 2.

**Call 2** (9,151 in / 10,532 out, 114 s):
- The first attempt was rejected by the parser only because `constraintsApplied.how` exceeded 300 characters (SCHEMA_LIMITATION; the cap is now 600).
- The repair was blocked by the budget.
- Replayed unmodified under the new cap, the output is **REJECTED** for a real contradiction. Phases 2–3 declare "accessory sets +1", but three accessories were listed at the coach's maximum of 4, so those weeks would prescribe 5. This is exactly what the new rail exists to catch; the old expansion would have silently clamped it.
- **Result: no live v1.3 plan passed validation in this pass.**

**Offline-edited replay** of call 2: listed sets of those three exercises changed from 4 to 3. This is labelled, not live evidence of a passing plan. Everything else passes:
- the structured target `Barbell Bench Press 405 lb × 1` is consumed and recorded as blocked by C1, with interim work and a coach-review item;
- only 1 U exercise is used (Lat Pulldown, sent to coach review), while 4 K exercises carry explicit conditions;
- effort: 9/30 exercises at RIR ≤1, and 0/12 main lifts;
- 6 days and 12 weeks with no deviations;
- 3 phases whose week notes and prescriptions are computed from the structure;
- two coach-method tensions surfaced, and no other hard-rule violations.

The structured target was an **eval-only, in-memory** client-reported reading of the free text. Nothing was stored.

## Remaining weaknesses
1. **The role-wide phase deltas are coarse.** A "+1 set" phase can't be applied when some exercises are already at the coach's maximum; the model made exactly this mistake live. Production would get one repair attempt with the exact error, but that is unverified live.
2. **No live v1.3 plan has passed end to end.** Call 1's output was lost and call 2 needed a repair that the budget blocked.
3. **Trunk-support and bracing rules are internal curation, not expert-reviewed.** The derived support levels are coarse; for example, cable rows and pulldowns are "none".
4. **The intake UI doesn't collect performance targets yet.** The data path exists, but real clients still fall back to free text.
5. **Prose caps can still reject otherwise-valid plans** for other fields.
6. The deterministic legacy planner doesn't use load conditions (unchanged, review-only).

## Readiness for production-integration architecture
**Not yet.** The architecture is sound, but the evidence doesn't support it:
- the rails demonstrably catch contradictions offline and live;
- however, no v1.3 plan has passed end to end;
- the most likely live failure (a role-wide phase delta colliding with the coach's caps) currently costs a repair call.

**Recommended:** a very small follow-up first:
- make phase set/RIR deltas exercise-aware (for example, allow a delta to target "exercises below the coach's max", declared in the structure), or give clearer repair feedback;
- then do 1–2 live medium runs to confirm end-to-end passes.

After that, integration architecture is justified.
