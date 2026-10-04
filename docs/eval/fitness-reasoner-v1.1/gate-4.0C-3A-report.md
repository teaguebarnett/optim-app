# Gate 4.0C-3A — Fitness Reasoner v1.1: final evidence report

Model `claude-opus-5`, prompt `reasoner-resistance-v2.1`, reasoner `fitness-reasoner-v1.1.0`. No client plan was published or activated.
Real-client details (plans, method, constraints) are kept out of the repository; only aggregates appear here.

## Live-call budget

| | Calls (executed, token-consuming) | Input tokens | Output tokens |
|---|---|---|---|
| Earlier in gate (synthetic scenarios) | 24 | 194,992 | 213,874 |
| This continuation (real client) | 6 | 44,656 | 72,937 |
| **Gate total** | **30 / 30** | **239,648** | **286,811** |

Requests refused before execution (billing) are not counted. The cap is now exhausted.

## Evidence classes

### Directly verified (deterministic, re-run after the last edits)
- `verify-reasoner`: 15/15, including the new test 15 (a truncated attempt is repaired and its tokens are recorded).
- Offline eval, scripted model: 25/25 scenarios pass the hard assertions.
- 92 of 93 `verify:*` suites pass. `verify:nutrition-authoring` also fails at HEAD without these edits: Node can't load the `.tsx` file it imports. It isn't related to this gate.
- `eslint` (lib/ai, lib/synthesis) is clean, `tsc --noEmit` is clean, and `next build` passes.

### Offline / replay evidence
- `replayRun` works on all 24 saved ReasonerRun artifacts (20 synthetic, 4 real). The hashes stay stable across serialization, and the review view renders with no model call.
- The 4 real-client raw outputs pass the **current** parser and validator, with an identical input hash.
- **Stale replay:** the 20 synthetic outputs saved before the retrieval change now fail re-validation (57 citations of open-question claims that are no longer retrieved). The validator is right to reject them. That replay set no longer works as a regression baseline, and outputs need regenerating.

### Live-model evidence (real internal client, identical input)

| Run | Effort | Attempts | Input | Output (incl. truncated) | Model time | Result |
|---|---|---|---|---|---|---|
| high-1 | high | 2 (1st hit max_tokens) | 14,907 | 24,456 | 267 s | 6d PPL |
| high-2 | high | 1 | 7,421 | 13,201 | 142 s | 6d PPL |
| high-3 | high | 2 (1st hit max_tokens) | 14,907 | 27,142 | 290 s | 5d upper/lower (3U/2L) |
| medium-1 | medium | 1 | 7,421 | 8,138 | 85 s | 6d PPL |

- All four plans passed every hard rail on the first validated attempt. Both truncation repairs succeeded live, which is real-world evidence for the repair path.
- **Truncation:** 2 of 3 high-effort calls hit the 16,000-token output cap while still reasoning. Each plan then cost two calls and about 270–290 s.
  - Before this gate's fix, those consumed tokens were missing from ReasonerRun totals.
  - The fix records them and marks the attempt `:max_tokens`.

**Variance (3 high runs):**
- Same input hash; core agreement **yes**: same domain, same emphasis (hypertrophy + strength), duration 16 weeks, frequency 6/6/5 (range 1), no unexplained variation.
- Split differs: 2× PPL and 1× upper/lower.
- Exercise overlap: Jaccard 0.93.
- Main-lift overlap is low (0.52), and session-shape agreement is 0.33.
- Major-muscle volume CV is 0.13. Total direct sets/week were 130 / 157 / 138.
- Rep-zone waves differ in order.
- The core coaching truth is stable; the way it's expressed varies a lot.

**Medium vs high (n = 1 vs n = 3, same input):**
- **Quality:** medium produced a coherent 6-day PPL that passed every rail. It had no warnings and balanced push and pull exactly (42 vs 42 sets).
- **What medium missed:** it reported **no method tensions**. All three high runs flagged the cap of 3 sets on main lifts, and two flagged the coach's RPE vs the schema's RIR. Medium also listed more open items (9 vs 6–7). The high runs leaned push-heavy in 2 of 3 (48/39 and 60/52 sets).
- **Latency:** 85 s at medium vs 142 s for the one clean high call, and 267–290 s for the truncated high plans.
- **Tokens:** medium used 8.1k output per plan. High used 8.5–13.2k per clean attempt, and about 21.6k per plan on average once truncation waste is included.
- **Cost:** output dominates input by about 4×.
  - Per plan, medium is about 0.62× the output tokens of the cleanest high call and about 0.38× high's real average.
  - The cost ratio follows the output-token ratio, whatever the per-token price.

**v1 (Gate 4.0C-3) vs v1.1 on the same real client:**

| | v1 | v1.1 (high, 3 runs) | v1.1 (medium) |
|---|---|---|---|
| Input tokens | 18,025 | 7,421 | 7,421 |
| Output tokens per clean attempt | 13,895 | 8,456–13,201 | 8,138 |
| Model time per clean attempt | 152 s | 89–142 s | 85 s |
| Structure | 6d PPL | 6d PPL ×2, 5d U/L ×1 | 6d PPL |
| Direct sets/week | 127 | 130–157 | 126 |

v1 changed the coach's confirmed decisions because of raw free text:
- it removed triceps pushdowns ("replacing the restricted pushdown");
- it capped lat pulldowns at RIR 2–3 ("coach flagged high-effort pulldowns");
- its monitoring named the medical condition.

v1.1 followed the confirmed structure instead:
- pushdowns and pulldowns are used at normal coach effort;
- no raw wording or condition name appears in the input or the output.

v1.1 also surfaces more honest open items (6–9 vs 3), including apparatus availability.

### Confirmed-constraint authority — result
For the real client:
- The model receives a single aliased constraint holding the 10 confirmed rules.
- The raw coach and client wording is absent from all 4 inputs (keyword check, plus the same input hash across runs).
- Plans respect the confirmed boundary and no longer over-restrict from free text. **Pass, with live evidence.**

### Scenario coverage
- **Live:** scenarios 01–17, 21, 22 and 23, plus the real client ×4.
- **Decided before any model call:** 18–20 (NEEDS_INPUT) and 25 (routed to endurance).
- **Scenario 24 still has no live evidence.** The budget ran out, and the real-client runs took priority. It passes offline.
- **Scenario 22:** a new live call wasn't needed. The repair path is covered by deterministic tests 8 and 15, and was exercised live twice in the real-client truncations.

### Failure taxonomy (all live outputs)
- **KNOWLEDGE_GAP:** removed muscle coverage (glutes and abdominals untrainable under the constraints), and a bench-strength goal approached without a barbell bench.
- **CLIENT_DATA_GAP:** apparatus availability (5 unknown items) and the current 1RM.
- **COACH_BRAIN_GAP:** RPE vs RIR metric mismatch, and the main-lift set cap vs a strength goal.
- **REASONING_FAILURE:** push-heavy volume in 2 of 3 high runs (the v2.1 balance rule is only partly followed), and machines repeated without a stated reason (2 of 3 high runs).
- **PROVIDER (new):** max_tokens truncation at high effort, 2 of 3 calls.

## Unverified claims
- Variance at n = 3 doesn't establish stability bounds.
- Medium quality at n = 1 doesn't establish a quality judgment.
- Scenario 24 live has not run.
- Whether v2.1 fixes push/pull imbalance across the synthetic set is unknown (it was not re-run).
- No human has scored any plan yet.
- Production adapter behaviour under real load is unverified: about 1.5–5 min per plan against a 300 s timeout.

## Remaining weaknesses
1. **High effort with a 16k output cap is unreliable:** 67% truncation on the real client. Either raise the cap (with the timeout implications) or use medium effort. This needs a deliberate decision.
2. Unexplained exercise repeats, and push-heavy weeks, persist at high effort.
3. Main-lift and session-shape variance is high across identical runs.
4. Medium may hide coach-method tensions.
5. The synthetic replay baseline is stale after the retrieval change.
6. Apparatus and preference data come from intake gaps.
7. Exercise knowledge is small and its ratings are unreviewed.

## Recommendation
**More resistance intelligence/evaluation, not production integration architecture yet.** The deciding evidence is from this gate:
- the output-cap/effort configuration fails 2 of 3 real high-effort calls;
- medium looks viable but is n = 1 and missed tensions;
- expression variance is high;
- no human review exists.

Integration would freeze an unreliable configuration.

Next steps, in order:
1. Teague scores the real-client and synthetic review packs.
2. Decide on effort and output cap. Suggested: medium, or high with a larger cap, about 3 real runs each.
3. Regenerate the synthetic replay baseline on current retrieval.
4. Run scenario 24 live.

This needs about 8–10 more calls, which requires a new budget approval.
