# Cardio Reasoner V1 — checkpoint status

**Status: OFFLINE-VERIFIED development checkpoint. Not production-ready. No live-model evaluation yet.**
Branch `cardio-reasoner-v1` (from `2f3b13c`; not merged, not deployed). Prompt `reasoner-cardio-v1.0.0`,
reasoner `cardio-reasoner-v1.0.0`, knowledge `cardio-0.1.0`. No paid model calls were made in this gate.

## Architecture (reuse, not a new brain)

The cardio domain runs on the same Reasoner infrastructure as resistance and nutrition:

- shared model loop `reasoner/core.ts` `runModelAttempts` — strict JSON, exactly one validator-guided repair;
- `createKnowledgeRegistry` / `validateKnowledge` — a separate versioned registry, so cardio knowledge releases
  never change resistance planning state or nutrition knowledge;
- shared evidence retrieval (`conceptClaims`) and namespaced citation checks (`citationErrors`);
- the structured constraint tags (`avoid_demand`, `avoid_position`, `avoid_limb_loading`, `avoid_movement_pattern`)
  and readiness requirements (`SHARED_REQUIREMENTS`);
- the canonical Coach Brain calibration answers (`t_cardio_roles`, `t_*_minutes`, `g_intensity_guide`,
  `g_steps_target`/`w_steps_target`, and the endurance `e_*` chapter);
- the universal training grammar for reading the resistance week (`resistanceWeekFromContent`);
- the run-artifact conventions (versions, hashes, snapshots, attempts) and the eval fixtures (`scenarioInput`,
  `coachMethod`, `fakeModel`).

Only existing-file changes: `ClientState.training.cardioPreference` (from `fuel_recovery.cardioPreference`; verified
not to affect the resistance planning-state fingerprint) and two npm scripts.

```
readiness → routing (race/event & sport conditioning UNSUPPORTED) → coach scope/method → SAFETY GATE
→ restrictions OPTIM can match (uninterpreted wording → NEEDS_INPUT) → modality eligibility + equipment
→ resistance week + schedule conflicts → OPTIM-computed bounds → model (shared core) → deterministic validation
→ PLANNED | NEEDS_INPUT | ESCALATE | NOT_COACHED | UNSUPPORTED | REJECTED | PROVIDER_FAILED
```

Nothing persists, approves or publishes. A proposal is never the client's plan.

## Supported capabilities

- Whether cardio is warranted (a reviewable "no cardio now" is valid), its role, sessions (modality, minutes,
  steady/intervals, intensity anchored by talk test / effort 0–10 / heart rate), placement relative to lifting,
  a 4–8-week progression, monitoring, adjustments, uncertainties, coach questions and cited decisions.
- Purposes: fat-loss support, health/general fitness, support for hypertrophy/strength without unnecessary
  interference, aerobic base development (no event), hybrid clients.
- **Unsupported (separately validated capabilities, never routed into resistance planning):** race/event
  programming (event, date, or race wording in the client's answers) and sport-specific conditioning.
- Deterministic rails: available days; offered modalities only; coach roles, weekly minutes, intensity methods and
  step targets; effort/talk-test/HR consistent with the intensity label; no talk test on intervals; intervals fit
  the session; hard sessions ≤ 2/week (or coach's), none in the first 2 weeks for new/returning clients, none with
  limited recovery or a reported medication/condition; HR only when the coach uses it, age is known and nothing
  rules it out (HRmax ≈ 208 − 0.7 × age); no hard leg-dominant cardio on/the day before a lower-body day when
  muscle/strength is a goal; placement and same-visit session cap; weekly increase ≤ 20% (or coach's); provenance.
- Safety gate before any model call: screen answers for cardiovascular disease/symptoms, chest pain/dizziness,
  blood pressure, or advice to limit exercise; pregnancy/heart-condition/diabetes/fainting wording; minors with
  weight-change goals → ESCALATE. Medication/condition → easy-to-moderate only, no HR; HR-altering medication → no HR.
- OPTIM-computed review items: workload across cardio and resistance (minutes by intensity, moderate-equivalent,
  hard sessions, training days), withheld modalities with reasons, schedule conflicts, labelled heuristic basis.

## Knowledge coverage (cardio-0.1.0)

Seven concepts (dose, intensity, interval training, concurrent training, progression, weight management, screening)
from 12 PubMed-verified sources (record + abstract via NCBI E-utilities): Garber 2011 (ACSM), WHO 2020, Tanaka 2001,
Reed 2014, Woltmann 2015, Wilson 2012, Schumann 2022, Milanović 2015, Riebe 2015, Donnelly 2009, Buist 2008,
Seiler 2010. Numbers appear only where they are in the abstract. OPTIM heuristics are `source_needed` and never
retrieved as evidence: effort bands, HR percentage bands, the weekly-increase cap (the 10% rule did not reduce
injuries in Buist 2008 — it is a pacing default, never presented as protective), and the interference spacing rule.
A 10-modality catalog (internal curation) carries equipment, demands, positions, loaded regions, patterns and
lower-body interference — no energy values.

## Verification at this checkpoint

- `npm run verify:cardio-reasoner` — 50/50 (29 single-fault rails, contract, repair, artifact, isolation).
- `npm run eval:cardio-reasoner` — 19/19 scenarios meet their hard invariants (scripted model). All required
  categories: strength athlete, fat-loss low capacity, hypertrophy limited recovery, endurance base, hybrid,
  beginner limited equipment, restrictions, insufficient information, schedule conflict — plus race/sport
  UNSUPPORTED, safety ESCALATE, NOT_COACHED. Gated scenarios make zero model calls.
- Resistance: `verify:reasoner` 30/30, `eval:reasoner` all hard assertions pass, `verify:resistance-planner`,
  `verify:resynthesis-lifecycle`, `verify:synthesis`, `verify:knowledge`, `verify:knowledge-v2` pass.
- Nutrition: `verify:nutrition-reasoner` 22/22, `eval:nutrition-reasoner` 20/20 hard checks.
- `verify:client-state` 24/24. Typecheck clean; lint 0 errors (6 pre-existing warnings in unrelated files);
  production build compiles.

### Unrelated test issues (not caused by this gate)

- `verify:nutrition-authoring` fails to load: it imports `components/coach/nutrition-review-detail-sheet.tsx`, which
  Node's type stripping can't load (`ERR_UNKNOWN_FILE_EXTENSION`). Neither file is touched here.
- `verify:activation-lifecycle` is intermittently flaky: record ids derive from `Date.now()`, so a regeneration in
  the same millisecond can reuse the prior id (failed 1 of 4 runs during this checkpoint; passed otherwise).

## Remaining limitations (open)

1. **No live-model evaluation.** Coaching quality (e.g. mostly-easy endurance weeks, recovery raised for C03,
   conflicts turned into coach questions) is unmeasured; the scripted model only exercises the rails.
2. **No qualified review** of the effort/HR bands, default hard-session and increase caps, the limited-recovery rule,
   the interference spacing rule, or the modality catalog (all internal curation).
3. **No clearance pathway.** Cardiovascular/chest/blood-pressure/advised-limit screen answers escalate even after the
   coach's review or professional guidance is recorded.
4. **Endurance coaches who measure volume in distance or load** → NEEDS_INPUT (no unit conversion invented); down
   weeks and taper are not enforced; race programming is out of scope.
5. **Keyword-based text routing.** Race/hybrid detection and safety wording flags can misfire.
6. **Conservative restriction handling.** Side-specific limb restrictions withhold the modality; uninterpreted
   free-text limitations block with NEEDS_INPUT until the coach structures them.
7. **Lower-body day detection is a heuristic** (≥ 2 lower-body exercises or ≥ 40% of the day).
8. **No production integration.** The caller must supply the resistance week; no persistence, job record, coach
   review surface or converter to `UniversalTrainingProgramContent` (whose `RpeValue` is 6–10 only and can't
   represent easy cardio effort). Unified program integration is a later gate.
9. **Cardio energy cost is not fed into nutrition** (by design in this gate — nutrition prescriptions untouched).
10. **Intake gaps:** no cardio-history/current aerobic baseline, resting heart rate, or preferred modalities.

## Recommended live evaluation (not run)

The 10 model-reaching scenarios (C01–C06, C07A, C07E, C08, C13) on `claude-opus-5` at medium effort; max input
≈ 3.8k tokens. First pass ≤ 10 calls with no repairs, 8k output-token limit, $2.50 hard cap via the shared ledger's
worst-case guard; then at most one repair per rejection, only if authorized.
