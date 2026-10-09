# Cardio Reasoner V1.2 — checkpoint status

**Status: LIMITED-LIVE VERIFIED development checkpoint. Not production-ready.**
Branch `cardio-reasoner-v1` (not merged, not deployed). Prompt `reasoner-cardio-v1.2.0`, reasoner
`cardio-reasoner-v1.2.0`, knowledge `cardio-0.1.0`, model `claude-opus-5` at medium effort. Builds on V1.1
(`eda724b`, `../cardio-reasoner-v1.1/STATUS.md`) and V1 (`../cardio-reasoner-v1/STATUS.md`).

## What V1.2 changed — the three V1.1 integration blockers, resolved in contract + validation

| Blocker | Contract | Deterministic validation |
|---|---|---|
| **C13** optional cardio inherited fat-loss volume | Coach decision topic `optional_dose`; week `gate` (`none` / `recovery_improved` / `coach_confirmed`) | Optional cardio the coach never sized (no minutes in the Coach Brain — verified; no new calibration field) stays flat unless the week is gated `coach_confirmed` **and** an `optional_dose` decision exists; its `dose` decision may not cite weekly-minute guidance; every session optional and easy in every week (V1.1) |
| **C04** progression measured from the deload week | Week `deload: true` | Growth measured from the most recent non-deload week (week 1 is the first baseline); a deload must be lighter than that baseline; growth above it keeps the existing cap (coach's weekly increase, else OPTIM's 20 % default); the coach's down-week cadence requires a *marked* deload. Unknown pre-plan baseline → stated as an uncertainty (prompt) |
| **C03** limited recovery only warned | `recoveryStrategy`: `no_additional_cardio` / `existing_training_days` / `reduced_dose` / `coach_decision`; coach decision topic `added_training_day` | Required when recovery is limited; sessions must match the strategy; no day without existing training unless an `added_training_day` decision is prepared (unknown program → every cardio day may be new); any week above week 1 must be gated on `recovery_improved` (or the coach) |

No arbitrary universal limits were added (all rules are structural, coach-authority, or the client's own capacity).
The approved resistance program is never changed; every program question is a prepared coach decision.

## Evaluation

- Offline: `verify:cardio-reasoner` 84/84 (14 new V1.2 adversarial rails); `eval:cardio-reasoner` 19/19.
- Live run 1 (C03, C04, C13; one attempt each; 3 calls, ≈ $0.50): **C13 PLANNED** — 3 × 20 min optional easy,
  flat for 5 weeks, the coach's step target, an `optional_dose` decision (4 options incl. steps-only; recommends
  holding at 60 min), dose explicitly not sized from fat-loss guidance. **C03 REJECTED** — correct recovery structure
  (existing training days, Wednesday rest kept, gated growth) but weeks 3–5 grew finishers to 18 min against 15 min of
  same-visit room. **C04 REJECTED** — running-specific, marked deloads, post-deload return accepted against the
  baseline, but one citation used a non-retrieved reference (`concept.cardio.intensity#intervals.distribution`).
  Both rejections were correct; neither indicated a knowledge, input or validator defect.
- Live run 2 (C03, C04; one repair allowed; 2 calls, ≈ $0.37): **both PLANNED on the first attempt** — C03 2 × 15 →
  3 × 15 min after existing lifts, largest same-visit session exactly 15 min in every week, growth gated on recovery,
  no added day; C04 cites `concept.cardio.interval_training#intervals.distribution` correctly, week-4 deload, week 5
  measured +9 % against the 165-min baseline (+44 % against the deload). Review packs: `live-review-pack.md`,
  `live-repair-review-pack.md`; ledgers alongside.
- Regressions: resistance `verify:reasoner` 30/30, `eval:reasoner` passing; nutrition 22/22 and 20/20; client-state
  24/24; resynthesis-lifecycle 24/24; 100 of 101 verify suites pass; typecheck clean; lint 0 errors; build compiles.
  Unrelated, pre-existing: `verify:nutrition-authoring` can't load a `.tsx` import.
- Spend: V1.2 ≈ $0.87; cardio live total ≈ $3.22 (V1 $1.33, V1.1 $1.02, V1.2 $0.87).

## Remaining limitations (open)

1. **Live repair behavior unverified.** In the bounded repair run both scenarios passed on the first attempt, so the
   validator-guided repair was not exercised live (it is covered offline, rail 42). Single-attempt rejections remain
   possible (two of three in live run 1).
2. **No qualified expert review** of the effort/heart-rate bands, the OPTIM defaults (≤ 2 hard sessions, 20 %/week
   above baseline, 2 easy-start weeks, no hard work when recovery-limited), the interference spacing rule or the
   modality catalog — all internal curation.
3. **No production integration.** No persistence or job record, no coach review surface, no converter to
   `UniversalTrainingProgramContent` (`RpeValue` is 6–10 only, so easy cardio effort can't be represented), cardio
   energy cost not fed to nutrition. Unified program integration is the next gate.
4. Optional-cardio week-1 size remains model judgment (flat, optional and coach-visible, but unsized by the coach).
5. Evidence claim ids don't share their topic's name (`intervals.*` under `interval_training`) — a source of the
   C04 citation slip; renaming is a knowledge-version change.
6. Carried from V1: no clearance pathway after safety escalation; keyword-based race/hybrid routing; conservative
   side-specific restrictions; intake lacks cardio history, resting heart rate and preferred modalities; the client's
   pre-plan cardio baseline is unknown.

Raw live run dumps (`live-results.json`, `live-repair-results.json`) are kept locally, not committed.
