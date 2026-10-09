# Cardio Reasoner V1.2 — review pack

Generated 2026-10-09 · live model (production model, medium effort).

## C03 — Hypertrophy client with limited recovery (short sleep, stress)

**Status:** PLANNED

**Context:** goal hypertrophy · purpose resistance_support · coach roles health/conditioning · minutes {"health":[90,150],"conditioning":[60,120]} · max hard 0 · easy-start weeks 0 · recovery-limited true · resistance Mon lower+legs 60m, Tue upper 60m, Thu lower+legs 60m, Fri upper 60m, Sat full_body+legs 60m · capacity ≤450 min/wk

**Warranted:** true · **Role:** conditioning · **Dose vs coach range:** below — _Coach prescribes conditioning for everyone (60-120 min/wk), but this client sleeps under 6 h, lists stress and schedule as obstacles, and already lifts 5 days/wk with a hypertrophy goal. Week 1 starts at 30 min (2x15 after upper-body lifting) and climbs toward the range top only as recovery allows._

**Intensity method:** talk_test — _Coach uses talk test / RPE; no hard sessions are allowed, so comfortable-speech control is simple and accurate for steady cycling._

**Objective:** Small amount of low-interference conditioning attached to existing lifting days, protecting hypertrophy and sleep-limited recovery. — _Meets the coach's conditioning role without adding training days or fatigue that would blunt lifting._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Optional | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Tuesday | steady | Stationary cycling | 15 | moderate | 4–5 | short_sentences | — | — | after_resistance | no | Conditioning after upper-body lifting (Keep within the 15 min same-visit allowance; stop if legs feel heavy before Thursday's lower day.) |
| Friday | steady | Stationary cycling | 15 | moderate | 4–5 | short_sentences | — | — | after_resistance | no | Second conditioning exposure on a non-lower lifting day |

**Progression (OPTIM's totals):**
- Week 1: 30 min over 2 sessions (0 easy / 30 moderate / 0 vigorous), 0 hard.
- Week 2: 30 min over 2 sessions (0 easy / 30 moderate / 0 vigorous), 0 hard.
- Week 3: 36 min over 3 sessions (12 easy / 24 moderate / 0 vigorous), 0 hard — only if recovery has improved.
- Week 4: 36 min over 3 sessions (12 easy / 24 moderate / 0 vigorous), 0 hard — only if recovery has improved.
- Week 5: 42 min over 3 sessions (14 easy / 28 moderate / 0 vigorous), 0 hard — only if recovery has improved.
- Week 6: 45 min over 3 sessions (15 easy / 30 moderate / 0 vigorous), 0 hard — only if recovery has improved.

- W2: Tue Stationary cycling 15′ moderate [after_resistance], Fri Stationary cycling 15′ moderate [after_resistance] — _Hold at 30 min while lifting performance and sleep are observed._
- W3: [gate: recovery_improved] Tue Stationary cycling 12′ moderate [after_resistance], Fri Stationary cycling 12′ moderate [after_resistance], Sat Stationary cycling 12′ easy [after_resistance] — _36 min (+20%) via a third short session after Saturday full-body; only if sleep/recovery ratings improve._
- W4: [gate: recovery_improved] Tue Stationary cycling 12′ moderate [after_resistance], Fri Stationary cycling 12′ moderate [after_resistance], Sat Stationary cycling 12′ easy [after_resistance] — _Hold 36 min._
- W5: [gate: recovery_improved] Tue Stationary cycling 14′ moderate [after_resistance], Fri Stationary cycling 14′ moderate [after_resistance], Sat Stationary cycling 14′ easy [after_resistance] — _42 min (+17%)._
- W6: [gate: recovery_improved] Tue Stationary cycling 15′ moderate [after_resistance], Fri Stationary cycling 15′ moderate [after_resistance], Sat Stationary cycling 15′ easy [after_resistance] — _45 min (+7%), the ceiling of the 15 min same-visit allowance._

**Recovery strategy:** existing_training_days

**Placement:** All cardio sits on days the client already trains, after lifting, within the 15 min same-visit allowance; no new training day and no second visit (evening-only training). Wednesday is left as the sole rest day.

**Monitoring:** rpe, session_completion, lifting_performance, recovery_rating, talk_test; review after 3 wk

**Adjustments:**
- Lower-body lifting performance drops or legs feel heavy on Thursday (2 wk) → decrease minutes: Cut back to one 15 min session (Friday only).
- Recovery rating and sleep stay poor (2 wk) → hold frequency: Stay at 2 sessions; do not add the Saturday session.
- Sessions easy, recovery rating improving, lifting steady (3 wk) → increase minutes: Follow the planned step to 36 then 42-45 min/wk.

**Assumptions:** Stationary bike is available in the commercial gym (listed as assumed standard equipment). · Client has no meaningful pre-plan cardio beyond daily activity.

**Uncertainties:**
- Client's existing habitual cardio/daily activity is unknown: Week 1 at 30 min may be lower than needed if they already do regular cardio; coach can start at the week-3 level if so.
- Equipment state for stationary cycling is 'assumed': If no bike, substitute elliptical (also low lower-body interference).

**Coach questions:**
- Is starting conditioning below your 60-120 min/wk range acceptable for a sleep-limited (<6 h) hypertrophy client, building toward it over 6 weeks? — _Week 1 is 30 min, below your stated range floor._
- Should a Wednesday standalone easy session be added later to reach your range, given it would create a 6th training day? — _The 15 min same-visit cap limits weekly total to 45 min without a new training day._

**Decisions:**
- [warranted] Add a small amount of cardio now. — Coach prescribes conditioning for everyone and short low-interference work is tolerable even with limited recovery. (coach: t_cardio_roles, t_conditioning_minutes; client: onboarding.what_you_want.primaryGoal, onboarding.starting_point.weeklyFrequency; evidence: concept.cardio.dose#dose.individualize)
- [dose] Start 30 min/wk, below the 60-120 conditioning range, progressing to 45 by week 6. — Under 6 h sleep, stress, and 5 approved lifting days limit how much can be absorbed; capacity allows only 15 min per lifting visit. (coach: t_conditioning_minutes; client: onboarding.fuel_recovery.typicalSleep, onboarding.fuel_recovery.consistencyObstacles; evidence: concept.cardio.dose#dose.individualize, concept.cardio.dose#dose.who)
- [recovery] Use existing training days only; growth gated on recovery improving. — bounds.recoveryLimited with <6 h sleep; a new training day is not justified. (coach: —; client: onboarding.fuel_recovery.typicalSleep; evidence: concept.cardio.progression#progression.gradual)
- [role] Conditioning rather than health. — Coach prescribes conditioning for everyone and its 60-120 range is the lighter fit for a hypertrophy, recovery-limited client. (coach: t_cardio_roles, t_conditioning_minutes; client: onboarding.what_you_want.primaryGoal; evidence: —)
- [modality] Stationary cycling. — Zero impact and low lower-body interference; cycling does not blunt hypertrophy the way running can. (coach: —; client: onboarding.your_week.trainingEnvironment; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [intensity] Talk test, easy-to-moderate only (effort 4-5, short sentences; Saturday easy). — Coach uses talk test/RPE and no hard sessions are permitted. (coach: g_intensity_guide; client: —; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Tuesday and Friday after upper-body lifting; Saturday added later. — Keeps Wednesday free, respects the 15 min same-visit cap, and avoids loading before Thursday's lower day. (coach: —; client: onboarding.your_week.availableDays, onboarding.your_week.preferredTrainingTime; evidence: concept.cardio.concurrent_training#concurrent.compatibility)
- [interference] No hard cardio at all; cycling placed on upper days and after Saturday lifting. — Hypertrophy goal with lower-body lifting Mon/Thu/Sat; low-interference modality and easy/moderate work preserve gains. (coach: —; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [progression] 30 -> 36 -> 42 -> 45 min/wk, each step <=20% and gated on recovery. — Gradual progression with recovery gating suits a sleep-limited client. (coach: —; client: onboarding.fuel_recovery.typicalSleep; evidence: concept.cardio.progression#progression.gradual)
- [monitoring] Track RPE, completion, lifting performance and recovery rating; review at 3 weeks. — Lifting performance is the key guardrail for the hypertrophy goal. (coach: g_intensity_guide; client: —; evidence: concept.cardio.intensity#intensity.talk_test)

**OPTIM review:** Week 1: 30 min of cardio (0 easy, 30 moderate, 0 vigorous; ≈30 moderate-equivalent min), 0 hard sessions, 5 training days counting resistance (approved program).
Quality flags: below_coach_range: The plan ends at 45 min/week, below the coach's 60–120 for conditioning — deliberate (see dose), for the coach to confirm.

## C04 — Endurance-focused client, no event (endurance coach, aerobic base)

**Status:** PLANNED

**Context:** goal endurance · purpose aerobic_base · coach roles aerobic_base/conditioning/recovery · minutes {"aerobic_base":[120,240],"conditioning":[120,240],"recovery":[120,240]} · max hard 2 · easy-start weeks 0 · recovery-limited false · resistance none · capacity ≤450 min/wk · discipline running

**Warranted:** true · **Role:** aerobic_base · **Dose vs coach range:** within — _Week 1 = 150 min across 4 days, inside the coach's 120–240 min aerobic-base range. Client is experienced and very consistent at 4 sessions/wk with 6 available days and 7–8 h sleep, so the low end of the range is appropriate while current running volume is unconfirmed._

**Intensity method:** heart_rate — _Coach guides intensity by heart rate and RPE and zones are provided (HRmax est. 179); RPE used as a cross-check and for intervals._

**Objective:** Build a polarized aerobic running base: 3–4 easy sessions plus one weekly quality session from week 2, growing ~10%/wk with a down week. — _Goal is endurance with a running-focused endurance coach; mostly-easy volume with a small high-intensity share is the method's intensity distribution._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Optional | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Monday | steady | Stationary cycling | 30 | easy | 2–3 | full_conversation | 55–70 | — | separate_day | no | Low-impact aerobic volume (Non-impact day to limit weekly running load while base volume is unknown.) |
| Tuesday | steady | Running | 35 | easy | 2–3 | full_conversation | 55–70 | — | separate_day | no | Easy aerobic run in the client's discipline |
| Thursday | steady | Running | 35 | easy | 2–3 | full_conversation | 55–70 | — | separate_day | no | Easy aerobic run |
| Saturday | steady | Running | 50 | easy | 3–3 | full_conversation | 55–70 | — | separate_day | no | Long easy run (33% of week, under the 40% cap) |

**Progression (OPTIM's totals):**
- Week 1: 150 min over 4 sessions (150 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 2: 155 min over 4 sessions (125 easy / 0 moderate / 30 vigorous), 1 hard.
- Week 3: 165 min over 4 sessions (130 easy / 0 moderate / 35 vigorous), 1 hard.
- Week 4 (deload): 125 min over 4 sessions (125 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 5: 180 min over 4 sessions (145 easy / 0 moderate / 35 vigorous), 1 hard.
- Week 6: 195 min over 4 sessions (155 easy / 0 moderate / 40 vigorous), 1 hard.

- W2: Mon Stationary cycling 30′ easy, Tue Running 40′ easy, Thu Running 30′ vigorous intervals, Sat Running 55′ easy — _155 min; add 1 quality run (6 × 60 s at effort 8–9 / 90 s easy jog at effort 2–3, inside the 30 min)._
- W3: Mon Stationary cycling 30′ easy, Tue Running 40′ easy, Thu Running 35′ vigorous intervals, Sat Running 60′ easy — _165 min (+6%); intervals 8 × 60 s at effort 8–9 / 90 s easy; long run 60 min (36% of week)._
- W4: (deload) Mon Stationary cycling 25′ easy, Tue Running 35′ easy, Thu Running 25′ easy, Sat Running 40′ easy — _Down week: 125 min, all easy, no quality session (coach's down week every 3–4 weeks)._
- W5: Mon Stationary cycling 35′ easy, Tue Running 40′ easy, Thu Running 35′ vigorous intervals, Sat Running 70′ easy — _180 min (+9% over week 3); long run 70 min = 39% of the week._
- W6: Mon Stationary cycling 35′ easy, Tue Running 45′ easy, Thu Running 40′ vigorous intervals, Sat Running 75′ easy — _195 min (+8%); long run 75 min (38%, at the 75-min session cap). Next down week due in week 7._

**Placement:** All sessions are standalone on separate days (no resistance program); easy days spaced around the Thursday quality run and Saturday long run, with Monday non-impact to control weekly running impact. Each session is ≤75 min, the per-day cap.

**Monitoring:** rpe, resting_hr, session_completion, recovery_rating, talk_test; review after 4 wk

**Adjustments:**
- Easy-run HR drifts above 70% HRmax or talk test fails at easy pace (2 wk) → decrease intensity: Slow easy runs (walk breaks if needed) to hold 55–70% HRmax.
- Lower-limb soreness/niggles lasting >48 h or missed sessions (1 wk) → decrease minutes: Hold volume or swap one run for cycling/elliptical until symptom-free.
- All sessions completed, recovery rating good, resting HR stable (4 wk) → increase minutes: Continue ≤10%/wk growth toward 240 min; consider a second quality session (max 2).

**Assumptions:** Stationary cycling is a standard commercial-gym machine (assumed equipment). · Client can run outdoors or on a treadmill in the evening; running listed as available.

**Uncertainties:**
- Client's current running volume before this plan is unknown: Week 1's 150 min may be low or high; if he currently runs little, start at 120 min and rebuild the ramp.
- Whether a heart-rate monitor is used in the evening sessions: If not, intensity falls back to RPE/talk test only.

**Coach questions:**
- What is the client's current weekly running volume and longest recent run? — _Week 1 volume and the long-run cap depend on his existing base._
- Is there a target running event or distance? — _Shapes long-run growth and the type of quality session._
- Should the Monday session be cycling (non-impact) or a fourth easy run? — _Trade-off between discipline specificity and impact load._

**Decisions:**
- [warranted] Prescribe cardio: 4 aerobic sessions/wk. — Goal is endurance with an endurance coach, no resistance program competing for recovery, 6 available days and no recovery limits. (coach: coaching_areas, e_days.base; client: onboarding.what_you_want.primaryGoal, onboarding.your_week.availableDays, onboarding.starting_point.recentConsistency; evidence: concept.cardio.dose#dose.individualize)
- [dose] Start at 150 min/wk, within the coach's 120–240 min range, progressing to ~195 min by week 6. — Experienced, very consistent trainee, but pre-plan running volume is unconfirmed, so begin in the lower half and ramp ≤10%/wk. (coach: e_weekly_volume.base, e_weekly_increase; client: onboarding.starting_point.trainingExperience, onboarding.starting_point.weeklyFrequency; evidence: concept.cardio.dose#dose.acsm, concept.cardio.progression#progression.gradual)
- [intensity] Heart-rate zones (easy 55–70%, vigorous 80–92% of est. HRmax 179) with RPE for intervals; ~80% easy, one hard session/wk. — Coach uses HR and RPE with a polarized distribution; zones supplied and no HR restriction. (coach: e_intensity_method, e_intensity_mix, e_quality_sessions.base; client: onboarding.about_you.age; evidence: concept.cardio.intensity#intensity.hrmax, concept.cardio.interval_training#intervals.distribution)
- [schedule] Mon / Tue / Thu / Sat, all standalone evening sessions ≤75 min. — Fits 3–5 endurance days, spaces the quality and long runs, and respects the 75-min session cap on each day. (coach: e_days.base; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.your_week.preferredTrainingTime; evidence: —)
- [modality] Running as primary modality, one weekly easy stationary-cycling session. — Discipline is running; one non-impact session limits cumulative impact while adding aerobic volume. (coach: endurance_sports; client: onboarding.your_week.trainingEnvironment; evidence: concept.cardio.dose#dose.individualize)
- [progression] +5–10%/wk with an all-easy down week in week 4; long run held ≤40% of weekly minutes. — Matches the coach's weekly-increase rule, down week every 3–4 weeks and long-session cap. (coach: e_weekly_increase, e_down_weeks, e_down_every, e_long_percent; client: onboarding.your_week.schedulePredictability; evidence: concept.cardio.progression#progression.gradual, concept.cardio.progression#progression.ten_percent)
- [monitoring] Review after 4 weeks using RPE, talk test, resting HR, session completion and recovery rating. — Gives objective and subjective checks that easy work stays easy and load is absorbed before the next build. (coach: e_intensity_method; client: onboarding.fuel_recovery.typicalSleep; evidence: concept.cardio.intensity#intensity.talk_test_regulation)

**OPTIM review:** Week 1: 150 min of cardio (150 easy, 0 moderate, 0 vigorous; ≈150 moderate-equivalent min), 0 hard sessions, 4 training days counting resistance (no resistance program supplied).