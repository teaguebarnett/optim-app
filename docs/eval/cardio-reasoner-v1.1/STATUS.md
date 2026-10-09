# Cardio Reasoner V1.1 — checkpoint status

**Status: LIMITED-LIVE VERIFIED development checkpoint. Not production-ready.**
Branch `cardio-reasoner-v1` (not merged, not deployed). Prompt `reasoner-cardio-v1.1.0`, reasoner
`cardio-reasoner-v1.1.0`, knowledge `cardio-0.1.0`, model `claude-opus-5` at medium effort. Builds on V1
(`6dab3a9`, see `../cardio-reasoner-v1/STATUS.md` for architecture, capabilities and knowledge coverage).

## What V1.1 changed (root causes from the V1 live evaluation)

| V1 weakness (live) | Root cause | Fixed at |
|---|---|---|
| Coach ranges used as a mandatory week-1 floor (C02 120 min for a deconditioned beginner; C03 90→130 min with < 6 h sleep) | Prompt said "inside the coach's range" | Contract: `dose.vsCoachRange` (within / below / no_coach_range / none) + reason, checked against week-1 arithmetic; only the range TOP is enforced; required `dose` decision; required `recovery` decision when recovery-limited; "no additional cardio" (optionally with the coach's step target) is a valid plan |
| Optional cardio became a 150–210 min program (C13) | Input exposed every role's minutes; "optional" mapped to a generic role | Input exposes only the coach's allowed roles, each with meaning, source and its own minutes; `optional_low_intensity` role: every session `optional:true` and easy in every week; derived `aerobic_base` labelled as OPTIM's reading of the coach's conditioning role |
| Endurance coach's sport not used (C04) | V1 read `e_discipline` (a multi-sport split) and assumed plain ranges | Reader uses `endurance_sports` (one sport → the client's discipline; several → unknown, never assumed), layered `e_days`/`e_weekly_volume`/`e_quality_sessions` (`.base`), `e_long_*` cap, `e_down_every` cadence |
| Full-body days read as upper-body (C02) | Share-based classification | Day focus lower/upper/full_body; any major lower lift (squat/hinge/single-leg/jump) or ≥ 2 lower exercises loads the legs |
| Progression infeasible (C06 150 min from 4 × 30 min) or silently shortened approved lifting (C01 week 4) | Only week 1 was structured/validated | Every week's sessions are structured; OPTIM totals each week and checks availability, per-day capacity (approved lifting minutes fixed), session cap, interference, hard sessions, range top, weekly increase, long-session cap and down weeks |
| Schedule conflicts left as prose | — | Conflicts carry ids; each needs a prepared coach decision (2–4 options + recommendation); invented conflicts rejected; nothing applied to the program |

No new blanket limits: capacity comes from the client's availability and session cap; long-session cap and down
weeks from the coach. V1 heuristics (≤ 2 hard sessions, ≤ 20 %/week, 2 easy-start weeks, no hard work when
recovery-limited) are unchanged and labelled as OPTIM heuristics.

## Live evaluation (V1.1 vs V1, same six scenarios)

6/6 executed calls, no repairs, 39,585 in / 32,754 out tokens, 363 s model time, **≈ $1.02** (cap $1.50).
Cardio live total: V1 $1.33 + V1.1 $1.02 = $2.35. Review pack: `live-review-pack.md`; ledger: `live-ledger.json`.

| Scenario | V1 | V1.1 | Score V1 → V1.1 |
|---|---|---|---|
| C01 strength athlete | 70→110 min; week 4 shortened approved lifting | 75→90 min; lifting untouched; same-visit cardio held to the 15 min that fits; one bike interval session; down week | 8 → 9 |
| C02 deconditioned fat loss | 120 min moderate start; full-body days read as upper | 85 min all easy (stated below range), range by week 3, intervals week 5; full-body days protected | 6 → 8.5 |
| C03 hypertrophy, < 6 h sleep | 90→130 min, 4 sessions | 60 min easy, recovery decision, hold weeks, "hold at 60 if sleep stays < 6 h" | 5 → 7 |
| C04 endurance base | avoided the coach's sport | running-specific, polarized, down weeks at 3 and 6, long run ≤ 34 % (cap 40 %) | 8 → 9 |
| C06 beginner, limited equipment | infeasible progression | 3 × 20 min easy walks → 4 × 30 (exactly fits) | 6 → 8.5 |
| C13 optional low-intensity coach | 150–210 min required sessions | **REJECTED**: all sessions optional/easy, but a 100→135 min program aimed at the fat-loss evidence band; rebound after its down week +29 % (validator correct under the current rule) | 5 → 5 |

Average 6.3 → 7.8/10. Safety and confirmed restrictions: no violations. No approved resistance program was changed.

## Verification at this checkpoint

`verify:cardio-reasoner` 70/70 (20 new V1.1 rails, incl. the V1 live failures); `eval:cardio-reasoner` 19/19;
resistance `verify:reasoner` 30/30 and `eval:reasoner` passing; nutrition `verify:nutrition-reasoner` 22/22 and
`eval:nutrition-reasoner` 20/20; all other verify suites pass; typecheck clean; lint 0 errors; production build
compiles. Unrelated, pre-existing: `verify:nutrition-authoring` can't load a `.tsx` import;
`verify:activation-lifecycle` is intermittently flaky (`Date.now()` ids).

## BLOCKERS for unified program integration

1. **C13 — optional cardio has no coach-authorized dose.** The coach's "optional, low-intensity extra" has no minutes
   in the Coach Brain (`t_cardio_*_minutes` are only asked for fat_loss / health / conditioning), so the model filled
   the gap with the fat-loss evidence band. OPTIM must not invent a number: without coach authority the proposal must
   either stay a bounded small offer presented as options, or ask the coach to confirm a dose — never inherit
   another role's volume or the fat-loss evidence range.
2. **C04 (and C01, C13) — progression after a planned deload.** The weekly-increase rule compares each week with the
   one before, so returning from a down week to the established load is mis-scored as a jump (rejected C13; forced
   C01/C04 to rebuild slowly). Progression after a deload must be measured against the established baseline (the
   pre-deload peak), while genuinely excessive increases above that baseline stay rejected.
3. **C03 — limited recovery must meaningfully constrain added training.** V1.1 lowered the dose but still added a
   training day and built toward the coach's range while sleep is < 6 h, gated only by an adjustment rule. Limited
   recovery plus high existing lifting frequency must constrain the structure itself: short sessions on existing
   training days, a reduced dose, no additional cardio, or a coach decision — not an automatic extra training day.

The approved resistance program is never modified; any change to it is a prepared coach decision.

## Other limitations (carried from V1)

No qualified review of bands/defaults; no clearance pathway after safety escalation; keyword-based race/hybrid routing;
conservative side-specific restrictions; no production integration or `UniversalTrainingProgramContent` converter
(`RpeValue` is 6–10 only); cardio energy cost not fed to nutrition; intake lacks cardio history / resting HR /
preferred modalities. Raw live run dumps (`live-results.json`) are kept locally, not committed.
