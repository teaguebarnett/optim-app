# Cardio Reasoner V1.2 — review pack

Generated 2026-10-09 · live model (production model, medium effort).

## C03 — Hypertrophy client with limited recovery (short sleep, stress)

**Status:** REJECTED

**Validator errors:**
- week 3 Tuesday: lifting (~60 min, approved — not changed) + 18 min cardio exceeds the client's 75-min cap (room for 15 min) — shorten the cardio or make it a separate session.
- week 3 Friday: lifting (~60 min, approved — not changed) + 18 min cardio exceeds the client's 75-min cap (room for 15 min) — shorten the cardio or make it a separate session.
- week 4 Tuesday: lifting (~60 min, approved — not changed) + 18 min cardio exceeds the client's 75-min cap (room for 15 min) — shorten the cardio or make it a separate session.
- week 5 Tuesday: lifting (~60 min, approved — not changed) + 18 min cardio exceeds the client's 75-min cap (room for 15 min) — shorten the cardio or make it a separate session.
- week 5 Friday: lifting (~60 min, approved — not changed) + 18 min cardio exceeds the client's 75-min cap (room for 15 min) — shorten the cardio or make it a separate session.

## C04 — Endurance-focused client, no event (endurance coach, aerobic base)

**Status:** REJECTED

**Validator errors:**
- Cites knowledge "concept.cardio.intensity#intervals.distribution", which wasn't retrieved for this plan.

## C13 — Optional-low-intensity coach, fat-loss client: optional easy cardio only, steps from the coach

**Status:** PLANNED

**Context:** goal fat_loss · purpose fat_loss_support · coach roles optional_low_intensity · minutes {} · max hard 0 · easy-start weeks 0 · recovery-limited false · resistance none · capacity ≤450 min/wk

**Warranted:** true · **Role:** optional_low_intensity · **Dose vs coach range:** no_coach_range — _The coach's only cardio role is an optional, low-intensity extra with no minute range set. Client is experienced, consistent and lifting 4x/week with no recovery flags, so a small optional easy block is appropriate; it is kept flat rather than sized from fat-loss minute guidance, which belongs to a role this coach does not use._

**Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; all sessions are easy steady work, where full-conversation pace is a valid and practical control._

**Objective:** Small optional easy aerobic work (3 x 20 min) plus a 7,000-10,000 step/day habit to add activity without taxing training. — _Supports the fat-loss goal through added daily activity while staying inside the coach's optional, low-intensity-only method._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Optional | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Tuesday | steady | Walking | 20 | easy | 2–3 | full_conversation | — | — | separate_day | yes | Easy aerobic activity, low recovery cost |
| Thursday | steady | Stationary cycling | 20 | easy | 2–3 | full_conversation | — | — | separate_day | yes | Easy aerobic activity, zero impact (Standard commercial-gym upright/recumbent bike assumed.) |
| Saturday | steady | Walking | 20 | easy | 2–3 | full_conversation | — | — | separate_day | yes | Easy aerobic activity, supports step target |

**Steps:** 7000–10000 — _Coach's step target (g_steps_target); daily activity is the main lever for this optional role._

**Progression (OPTIM's totals):**
- Week 1: 60 min over 3 sessions (60 easy / 0 moderate / 0 vigorous), 0 hard, 60 min optional.
- Week 2: 60 min over 3 sessions (60 easy / 0 moderate / 0 vigorous), 0 hard, 60 min optional.
- Week 3: 60 min over 3 sessions (60 easy / 0 moderate / 0 vigorous), 0 hard, 60 min optional.
- Week 4: 60 min over 3 sessions (60 easy / 0 moderate / 0 vigorous), 0 hard, 60 min optional.
- Week 5: 60 min over 3 sessions (60 easy / 0 moderate / 0 vigorous), 0 hard, 60 min optional.

- W2: Tue Walking 20′ easy (optional), Thu Stationary cycling 20′ easy (optional), Sat Walking 20′ easy (optional) — _Hold - optional extra stays flat_
- W3: Tue Walking 20′ easy (optional), Thu Stationary cycling 20′ easy (optional), Sat Walking 20′ easy (optional) — _Hold_
- W4: Tue Walking 20′ easy (optional), Thu Stationary cycling 20′ easy (optional), Sat Walking 20′ easy (optional) — _Hold; review with coach_
- W5: Tue Walking 20′ easy (optional), Thu Stationary cycling 20′ easy (optional), Sat Walking 20′ easy (optional) — _Hold unless coach approves a larger optional dose_

**Prepared coach decisions:**
- [optional_dose] The coach hasn't set an amount for optional cardio. → Keep the optional cardio small and flat, or grow it to support the fat-loss goal? Options: (1) Hold at 3 x 20 min easy/week (60 min) for all weeks (2) Grow to 3 x 30 min easy/week (90 min) from week 3 (3) Grow to 4 x 30 min easy/week (120 min) from week 3 (4) Drop scheduled sessions; steps target only (7,000-10,000/day) · Recommended: Hold at 3 x 20 min easy/week (60 min) for all weeks — _Your method defines cardio as an optional, low-intensity extra with no minute range, so I keep it flat by default. Options 2-3 would need your confirmation; evidence suggests larger moderate volumes help fat loss, but that is a dose decision for you, not me._

**Placement:** No resistance program was provided to this reasoner, so all sessions are placed on their own as separate days (Tue/Thu/Sat) inside the client's available days, each far under the 75 min day cap.

**Monitoring:** talk_test, steps, session_completion, bodyweight, recovery_rating; review after 4 wk

**Adjustments:**
- Sessions consistently skipped or feel like a burden (2 wk) → decrease frequency: Drop to 2 optional sessions/week and lean on the step target instead
- Steps consistently below 7,000/day (2 wk) → hold minutes: Keep sessions flat; add walking volume through daily life rather than new sessions
- Lifting quality or recovery rating drops (1 wk) → decrease frequency: Remove optional sessions until lifting recovers
- All easy work completed comfortably and coach approves more (4 wk) → increase minutes: Raise per-session minutes only on coach confirmation (see optional_dose decision)

**Assumptions:** Stationary bike is a standard commercial-gym machine. · No approved resistance program was supplied to this reasoner; capacity shows 0 resistance minutes on every day, so cardio is scheduled as standalone easy sessions.

**Uncertainties:**
- Client's current habitual cardio/step baseline is unknown: Week 1 size is set conservatively; if the client already walks a lot, this adds little, and if sedentary, the step target is the bigger lever.
- Actual lifting day placement (resistance program not provided): If lifting falls on Tue/Thu/Sat, sessions may need to shift days or be placed after lifting.

**Coach questions:**
- Which days does the client's approved lifting fall on, and is lower-body work included? — _Cardio days may need to shift to avoid stacking on heavy lower-body days._
- Goal is fat loss but your method only uses cardio as an optional low-intensity extra — should nutrition and steps carry the deficit here? — _Confirms that no required cardio volume is expected for this client._

**Decisions:**
- [warranted] Add a small optional easy cardio block plus the step target. — Client has spare days and capacity, no recovery limiters, and a fat-loss goal; the coach's method allows an optional low-intensity extra. (coach: t_cardio_roles, g_steps_target; client: onboarding.what_you_want.primaryGoal, onboarding.your_week.availableDays, onboarding.starting_point.recentConsistency; evidence: concept.cardio.dose#dose.individualize)
- [dose] 3 x 20 min easy per week, held flat; no sizing from fat-loss minute guidance. — The coach set no minute range for this role, so the extra stays small and optional; any growth needs coach confirmation. (coach: t_cardio_roles; client: onboarding.starting_point.weeklyFrequency, onboarding.your_week.maxSessionLength; evidence: concept.cardio.dose#dose.individualize)
- [role] Role is optional_low_intensity; every session optional and easy. — It is the only role in the coach's allowed set. (coach: t_cardio_roles; client: onboarding.what_you_want.primaryGoal; evidence: —)
- [intensity] Talk test at full-conversation pace, RPE 2-3; no intervals or vigorous work. — Coach guides by talk test/RPE and the role is low-intensity only; max hard sessions is 0. (coach: g_intensity_guide, t_cardio_roles; client: —; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Tuesday, Thursday, Saturday as standalone 20 min sessions. — All six days are available with 75 min capacity each and no resistance minutes recorded; spacing keeps each session trivial to fit in evenings. (coach: —; client: onboarding.your_week.availableDays, onboarding.your_week.preferredTrainingTime; evidence: —)
- [interference] Use low-interference modalities (walking, stationary cycling) only. — No resistance program was supplied; low-impact, low-interference choices protect lifting whatever the split turns out to be. (coach: —; client: onboarding.your_week.trainingEnvironment; evidence: concept.cardio.concurrent_training#concurrent.modality_dose, concept.cardio.concurrent_training#concurrent.compatibility)
- [progression] Weeks 2-5 hold flat at 60 min/week. — An optional extra without a coach dose should not grow on its own; growth is routed to the coach via the optional_dose decision. (coach: t_cardio_roles; client: —; evidence: concept.cardio.progression#progression.gradual)
- [monitoring] Track steps, session completion, talk test, bodyweight and recovery rating; review at week 4. — Steps are the coach's target metric and completion shows whether the optional work is actually adherent. (coach: g_steps_target; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.individualize)

**OPTIM review:** Week 1: 60 min of cardio (60 easy, 0 moderate, 0 vigorous; ≈60 moderate-equivalent min), 0 hard sessions, 3 training days counting resistance (no resistance program supplied).