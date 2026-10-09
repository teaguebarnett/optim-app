# Cardio Reasoner V1.1 — review pack

Generated 2026-10-09 · live model (production model, medium effort).

## C01 — Strength athlete who needs cardiovascular fitness (upper/lower split)

**Status:** PLANNED

**Context:** goal strength · purpose resistance_support · coach roles health/conditioning · minutes {"health":[90,150],"conditioning":[60,120]} · max hard 2 · easy-start weeks 0 · recovery-limited false · resistance Mon lower+legs 60m, Tue upper 60m, Thu lower+legs 60m, Fri upper 60m · capacity ≤450 min/wk

**Warranted:** true · **Role:** conditioning · **Dose vs coach range:** within — _Coach prescribes conditioning for everyone (60–120 min/wk). Client is experienced, very consistent, 4 lifting days, 7–8 h sleep, no recovery flags and two fully free days, so week 1 starts at 75 min — inside the range but near its floor so strength work stays the priority._

**Intensity method:** rpe — _Coach guides by talk test or RPE; RPE covers both steady and interval work, where the talk test isn't practical. Talk test used as a cross-check on steady sessions._

**Objective:** 75 min/wk of low-interference aerobic work building toward ~90–95 min, so stairs and daily effort feel easy without taxing squat/deadlift recovery. — _Success is defined as a 180 kg squat plus not getting gassed on stairs; conditioning volume is kept modest and off lower-body lifting days to protect strength._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Optional | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Tuesday | steady | Stationary cycling | 15 | easy | 2–3 | full_conversation | — | — | after_resistance | no | Easy aerobic flush after upper-body lifting; fits the 15 min same-visit cap. (Bike assumed standard commercial-gym equipment.) |
| Wednesday | steady | Stationary cycling | 30 | moderate | 4–5 | short_sentences | — | — | separate_day | no | Main aerobic base session on a non-lifting day; cycling has low lower-body interference the day before Thursday's lower session. |
| Saturday | steady | Incline treadmill walking | 30 | moderate | 4–5 | short_sentences | — | — | separate_day | no | Stair-specific aerobic work (incline) with no lifting the next day. (Incline treadmill assumed available; coach to confirm.) |

**Progression (OPTIM's totals):**
- Week 1: 75 min over 3 sessions (15 easy / 60 moderate / 0 vigorous), 0 hard.
- Week 2: 85 min over 3 sessions (15 easy / 70 moderate / 0 vigorous), 0 hard.
- Week 3: 80 min over 3 sessions (15 easy / 35 moderate / 30 vigorous), 1 hard.
- Week 4: 90 min over 3 sessions (15 easy / 40 moderate / 35 vigorous), 1 hard.
- Week 5: 75 min over 3 sessions (45 easy / 30 moderate / 0 vigorous), 0 hard.
- Week 6: 90 min over 3 sessions (15 easy / 40 moderate / 35 vigorous), 1 hard.

- W2: Tue Stationary cycling 15′ easy [after_resistance], Wed Stationary cycling 35′ moderate, Sat Incline treadmill walking 35′ moderate — _85 min total (+13%): +5 min on each steady session._
- W3: Tue Stationary cycling 15′ easy [after_resistance], Wed Stationary cycling 35′ moderate, Sat Stationary cycling 30′ vigorous intervals — _Hold at 80 min; introduce one hard session — bike intervals 6×60 s at RPE 7–8 / 90 s easy at RPE 2–3, on Saturday with no lifting the next day._
- W4: Tue Stationary cycling 15′ easy [after_resistance], Wed Stationary cycling 40′ moderate, Sat Stationary cycling 35′ vigorous intervals — _90 min (+12%): intervals to 8×60 s, steady +5 min._
- W5: Tue Stationary cycling 15′ easy [after_resistance], Wed Stationary cycling 30′ easy, Sat Incline treadmill walking 30′ moderate — _Down week: 75 min, no intervals, to reabsorb before the next lifting block._
- W6: Tue Stationary cycling 15′ easy [after_resistance], Wed Stationary cycling 40′ moderate, Sat Stationary cycling 35′ vigorous intervals — _90 min (+20% from the down week); hold here and review before adding more._

**Placement:** Wednesday and Saturday are free days and carry the real work; Tuesday adds 15 easy minutes after upper-body lifting (its same-visit cap). Nothing is placed on Monday or Thursday (lower-body lifting), and the only hard session sits on Saturday, with no lifting the following day. Cycling and incline walking are low lower-body interference.

**Monitoring:** rpe, session_completion, lifting_performance, recovery_rating; review after 4 wk

**Adjustments:**
- Squat/leg-press loads stall or legs feel heavy on Monday/Thursday (2 wk) → decrease minutes: Cut Wednesday to 20–25 min and drop intervals for a week.
- Stairs/daily effort still feel hard and lifting is progressing (4 wk) → increase minutes: Add 5–10 min to Wednesday or Saturday, staying ≤120 min/wk.
- Sessions consistently completed at RPE below target (2 wk) → increase intensity: Raise steady work to RPE 5–6 (short sentences only) before adding minutes.

**Assumptions:** Stationary bike and incline treadmill are standard commercial-gym equipment (marked assumed).

**Uncertainties:**
- Whether the client prefers bike vs. stair climber for the 'stairs' goal: Stair climber would be more specific but has moderate lower-body interference and unconfirmed availability.

**Coach questions:**
- Is a stair climber available, and would you like one Saturday session on it for stair specificity? — _Client's success statement is about stairs; stair climber equipment state is unknown and its interference is moderate._
- Do you want the Tuesday 15-min post-lifting bike kept required or made optional? — _It is the only same-visit cardio and could be dropped if upper days run long within the 75-min cap._

**Decisions:**
- [warranted] Add cardio now at 75 min/wk. — Coach prescribes conditioning for everyone; client has two free days, strong consistency, no recovery limiters, and wants stair fitness. (coach: t_cardio_roles, t_conditioning_minutes; client: onboarding.starting_point.recentConsistency, onboarding.your_week.availableDays, onboarding.what_you_want.successDefinition; evidence: concept.cardio.dose#dose.individualize)
- [dose] Week 1 = 75 min, inside the 60–120 conditioning range near its floor, building to ~90 min. — Strength is the primary goal and 4 lifting days already fill the week; starting low leaves room to grow without interference. (coach: t_conditioning_minutes; client: onboarding.starting_point.weeklyFrequency, onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.acsm, concept.cardio.progression#progression.gradual)
- [role] Role is conditioning rather than health. — Coach's conditioning role is prescribed for everyone and matches the client's 'not gassed on stairs' success definition. (coach: t_cardio_roles; client: onboarding.what_you_want.successDefinition; evidence: —)
- [modality] Stationary cycling as the main modality, incline walking as the second. — Both are low lower-body interference; cycling specifically does not blunt strength/hypertrophy the way running does. (coach: —; client: onboarding.your_week.trainingEnvironment; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [intensity] RPE primary (talk test cross-check): easy 2–3, moderate 4–5, intervals 7–8. — Coach guides by talk test or RPE; the talk test is not practical for intervals. (coach: g_intensity_guide; client: —; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Wednesday and Saturday as standalone sessions, 15 min after Tuesday's upper-body lifting. — Free days hold full sessions (ownVisitMax 75); Tuesday's same-visit cap is 15 min; separating hard work from lifting protects strength output. (coach: —; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength; evidence: concept.cardio.concurrent_training#concurrent.compatibility)
- [interference] No cardio on Monday or Thursday, and no hard cardio the day before a lower-body day. — Approved lower-body sessions on Monday and Thursday are fixed; Wednesday stays moderate steady on a low-interference modality. (coach: —; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [progression] 75 → 85 → 80 (intervals added) → 90 → 75 down week → 90, all ≤20% weekly increase, max 1 hard session. — Gradual progression with a reabsorption week keeps conditioning additive to the lifting block. (coach: —; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.progression#progression.gradual, concept.cardio.interval_training#intervals.vo2max, concept.cardio.interval_training#intervals.distribution)
- [monitoring] Track RPE, session completion, lifting performance and recovery rating; review at 4 weeks. — Lifting performance is the guardrail that tells us whether cardio volume is costing strength. (coach: —; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.individualize)

**OPTIM review:** Week 1: 75 min of cardio (15 easy, 60 moderate, 0 vigorous; ≈75 moderate-equivalent min), 0 hard sessions, 6 training days counting resistance (approved program).

## C02 — Fat-loss client with low endurance capacity (new to training, not training recently)

**Status:** PLANNED

**Context:** goal fat_loss · purpose fat_loss_support · coach roles fat_loss/health/conditioning · minutes {"fat_loss":[120,250],"health":[90,150],"conditioning":[60,120]} · max hard 2 · easy-start weeks 2 · recovery-limited false · resistance Mon full_body+legs 40m, Thu full_body+legs 40m · capacity ≤225 min/wk

**Warranted:** true · **Role:** fat_loss · **Dose vs coach range:** below — _Coach's fat-loss range is 120-250 min/wk; week 1 starts at 85 min because the client is new to training, has not trained recently, is neutral on cardio, and is simultaneously starting 2 full-body lifting days. Progression reaches the range by week 3 and sits at ~155 min by week 6._

**Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; the talk test is valid for walking, cycling and elliptical and needs no equipment. RPE is used for intervals, where the talk test is impractical._

**Objective:** Build 3 non-lifting-day cardio sessions and grow from 85 to ~155 min/week of mostly easy work to support fat loss. — _Fat-loss cardio benefit scales with accumulated weekly minutes (150-250 min/wk with moderate diet restriction), but a detrained beginner needs a low entry point and gradual build for adherence and safety._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Optional | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Wednesday | steady | Stationary cycling | 30 | easy | 2–3 | full_conversation | — | — | separate_day | no | Low-interference aerobic volume the day before a lower-body lifting day (Bike is assumed standard gym equipment; coach to confirm.) |
| Saturday | steady | Incline treadmill walking | 30 | easy | 2–3 | full_conversation | — | — | separate_day | no | Easy aerobic minutes, low impact for a 230 lb beginner (Treadmill assumed available; coach to confirm incline function.) |
| Sunday | steady | Walking | 25 | easy | 2–3 | full_conversation | — | — | separate_day | no | Easy recovery-friendly volume before Monday lifting |

**Progression (OPTIM's totals):**
- Week 1: 85 min over 3 sessions (85 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 2: 100 min over 3 sessions (100 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 3: 120 min over 3 sessions (80 easy / 40 moderate / 0 vigorous), 0 hard.
- Week 4: 135 min over 3 sessions (45 easy / 90 moderate / 0 vigorous), 0 hard.
- Week 5: 135 min over 3 sessions (45 easy / 45 moderate / 45 vigorous), 1 hard.
- Week 6: 155 min over 4 sessions (65 easy / 45 moderate / 45 vigorous), 1 hard, 20 min optional.

- W2: Wed Stationary cycling 35′ easy, Sat Incline treadmill walking 35′ easy, Sun Walking 30′ easy — _100 min (+18%), still all easy during the 2-week easy-start period._
- W3: Wed Stationary cycling 40′ moderate, Sat Incline treadmill walking 40′ easy, Sun Walking 40′ easy — _120 min (+20%), bottom of the coach's fat-loss range; first moderate session on the bike (low lower-body interference)._
- W4: Wed Stationary cycling 45′ moderate, Sat Incline treadmill walking 45′ moderate, Sun Walking 45′ easy — _135 min (+12.5%); sessions now at the 45 min cap. Review point._
- W5: Wed Stationary cycling 45′ moderate, Sat Incline treadmill walking 45′ vigorous intervals, Sun Walking 45′ easy — _Volume held at 135 min; one hard session added on Saturday (8 x 60 s hard incline walk @ RPE 7-8 / 120 s easy @ RPE 2-3 inside the 45 min, rest easy walking), placed 2 days after and 2 days before lower-body lifting._
- W6: Mon Walking 20′ easy (optional) [separate_session], Wed Stationary cycling 45′ moderate, Sat Incline treadmill walking 45′ vigorous intervals, Sun Walking 45′ easy — _155 min (+15%) via an optional easy 20 min walk on Monday, only if it can be done at least 3 h away from the lifting session; otherwise hold at 135 min._

**Placement:** Monday and Thursday are 40 min lifting days with only 5 min of same-visit room, so cardio goes on the three non-lifting days (Wed, Sat, Sun), each inside the 45 min own-visit cap. Wednesday sits the day before Thursday's lower-body session, so it stays steady on the bike (low lower-body interference); the one hard session is placed on Saturday, furthest from lower-body lifting.

**Monitoring:** talk_test, rpe, session_completion, bodyweight, lifting_performance, recovery_rating; review after 4 wk

**Adjustments:**
- Misses more than one cardio session in a week (2 wk) → decrease minutes: Drop back to the last fully completed weekly total and hold 2 weeks before building again.
- Leg lifts feel heavier or bar speed drops on Monday/Thursday (1 wk) → hold modality: Swap incline walking for stationary cycling and keep Wednesday easy.
- All sessions completed, recovery rating good, bodyweight stalling for 3 weeks (3 wk) → increase minutes: Add minutes toward 180-200 min/week (max +20%/week), staying inside the 45 min session cap.
- Talk test shows he cannot speak in full sentences on easy days (1 wk) → decrease intensity: Slow pace/incline until full conversation is possible.

**Assumptions:** Stationary bike and incline treadmill are standard commercial-gym equipment and available in his gym. · Evening training means cardio days are standalone evening visits of up to 45 min.

**Uncertainties:**
- Whether a second Monday visit at least 3 h from lifting is realistic: If not, week 6 holds at 135 min/week instead of 155.
- Diet is not specified: Fat-loss rate depends mostly on intake; cardio minutes alone give only modest loss.

**Coach questions:**
- Do you want a daily step target alongside these sessions? — _No step target is set in your method; daily steps are a low-cost way to add fat-loss energy expenditure for a beginner capped at 45 min/session._
- Is a short Monday evening walk separate from the lifting session feasible for this client? — _It is the only way to pass ~135 min/week without exceeding the 45 min session cap._

**Decisions:**
- [warranted] Add cardio now, 3 sessions/week on non-lifting days. — Goal is fat loss, only 2 lifting days are used of 5 available, sleep is 7-8 h, no stated obstacles and recovery is not flagged limited, so there is room for aerobic volume. (coach: t_cardio_roles; client: onboarding.what_you_want.primaryGoal, onboarding.your_week.availableDays, onboarding.fuel_recovery.typicalSleep; evidence: concept.cardio.weight_management#fatloss.dose)
- [dose] Start at 85 min/week (below the 120-250 range) and reach the range in week 3. — New trainee with no recent consistency and neutral attitude to cardio; starting inside the range in week 1 risks adherence. Gradual progression is recommended. (coach: t_cardio_fat_loss_minutes; client: onboarding.starting_point.trainingExperience, onboarding.starting_point.recentConsistency, onboarding.fuel_recovery.cardioPreference; evidence: concept.cardio.dose#dose.individualize, concept.cardio.progression#progression.gradual)
- [role] Role is fat_loss rather than health or conditioning. — Primary goal is fat loss and the coach's fat-loss role carries the largest minute range. (coach: t_cardio_roles, t_cardio_fat_loss_minutes; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.weight_management#fatloss.dose)
- [modality] Stationary cycling, incline treadmill walking and outdoor walking; no running. — At 230 lb and new to training, low/no-impact and low lower-body-interference options are preferred; running has high interference and high impact. (coach: —; client: onboarding.about_you.weightLb, onboarding.starting_point.trainingExperience, onboarding.your_week.trainingEnvironment; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [intensity] Talk test as the primary anchor, RPE for intervals from week 5. — Coach guides by talk test or RPE; talk test is validated for walking, cycling and elliptical but impractical for intervals. (coach: g_intensity_guide; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Cardio only on Wednesday, Saturday and Sunday, each a standalone visit ≤45 min. — Monday and Thursday hold 40 min of lifting with only 5 min of same-visit capacity, and the session cap is 45 min. (coach: —; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.your_week.preferredTrainingTime; evidence: —)
- [interference] Keep hard work off the day before lower-body lifting; one interval session on Saturday only, on low-interference incline walking. — Both lifting days are full body with lower-body work; separating modalities and keeping cycling/walking on the adjacent day limits interference. (coach: —; client: onboarding.starting_point.weeklyFrequency; evidence: concept.cardio.concurrent_training#concurrent.compatibility, concept.cardio.concurrent_training#concurrent.modality_dose)
- [progression] Build 85 → 100 → 120 → 135 min, hold at 135 in week 5 while adding one interval session, then 155 in week 6. — Each step is ≤20%/week, respects the 45 min session cap and the 2-week easy start, and never exceeds the 250 min range top. (coach: t_cardio_fat_loss_minutes; client: onboarding.starting_point.recentConsistency; evidence: concept.cardio.progression#progression.gradual, concept.cardio.interval_training#intervals.vo2max)
- [monitoring] Review after 4 weeks using talk test/RPE, session completion, bodyweight, lifting performance and recovery rating. — Completion is the main risk in a new trainee; lifting performance flags interference and bodyweight tracks the fat-loss goal. (coach: —; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.dose#dose.individualize)

**OPTIM review:** Week 1: 85 min of cardio (85 easy, 0 moderate, 0 vigorous; ≈85 moderate-equivalent min), 0 hard sessions, 5 training days counting resistance (approved program).

## C03 — Hypertrophy client with limited recovery (short sleep, stress)

**Status:** PLANNED

**Context:** goal hypertrophy · purpose resistance_support · coach roles health/conditioning · minutes {"health":[90,150],"conditioning":[60,120]} · max hard 0 · easy-start weeks 0 · recovery-limited true · resistance Mon lower+legs 60m, Tue upper 60m, Thu lower+legs 60m, Fri upper 60m, Sat full_body+legs 60m · capacity ≤450 min/wk

**Warranted:** true · **Role:** health · **Dose vs coach range:** below — _Coach health range is 90–150 min/wk, but this client sleeps under 6 h, lists stress as an obstacle and already lifts 5 d/wk (300 min) with a hypertrophy goal. Week 1 starts at 60 min of easy work and builds toward the bottom of the range by week 5._

**Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; all sessions are easy/continuous, where the talk test is valid and simple to self-regulate._

**Objective:** 60 min/wk easy aerobic work (one 30-min Wednesday session plus two 15-min post-lift finishers), building to ~90 min/wk by week 5 without touching the lifting program. — _Delivers the coach's health role and some aerobic activity benefit while protecting recovery, which is the limiter here (under 6 h sleep, stress, 5 lifting days)._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Optional | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Tuesday | steady | Walking | 15 | easy | 2–3 | full_conversation | — | — | after_resistance | no | Easy aerobic minutes after an upper-body day (Fits the 15-min same-visit cap.) |
| Wednesday | steady | Stationary cycling | 30 | easy | 2–3 | full_conversation | — | — | separate_day | no | Main aerobic session on the only non-lifting day (Cycling is the lowest-interference option and sits between two lower-body days.) |
| Friday | steady | Walking | 15 | easy | 2–3 | full_conversation | — | — | after_resistance | no | Easy aerobic minutes after an upper-body day (Fits the 15-min same-visit cap.) |

**Progression (OPTIM's totals):**
- Week 1: 60 min over 3 sessions (60 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 2: 70 min over 3 sessions (70 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 3: 80 min over 3 sessions (80 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 4: 80 min over 3 sessions (80 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 5: 90 min over 3 sessions (90 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 6: 90 min over 3 sessions (90 easy / 0 moderate / 0 vigorous), 0 hard.

- W2: Tue Walking 15′ easy [after_resistance], Wed Stationary cycling 40′ easy, Fri Walking 15′ easy [after_resistance] — _Wednesday 30→40 min (70 min/wk, +17%)._
- W3: Tue Walking 15′ easy [after_resistance], Wed Stationary cycling 50′ easy, Fri Walking 15′ easy [after_resistance] — _Wednesday 40→50 min (80 min/wk, +14%)._
- W4: Tue Walking 15′ easy [after_resistance], Wed Stationary cycling 50′ easy, Fri Walking 15′ easy [after_resistance] — _Hold at 80 min/wk — easier week to check sleep, lifting performance and recovery rating._
- W5: Tue Walking 15′ easy [after_resistance], Wed Stationary cycling 60′ easy, Fri Walking 15′ easy [after_resistance] — _Wednesday 50→60 min (90 min/wk, +13%) — bottom of the coach's health range._
- W6: Tue Walking 15′ easy [after_resistance], Wed Stationary cycling 60′ easy, Fri Walking 15′ easy [after_resistance] — _Hold 90 min/wk and review before adding more._

**Placement:** Wednesday is the only non-lifting day, so it carries the main session (75-min cap, no lifting to protect). The two short finishers go on upper-body days (Tue/Fri) at the 15-min same-visit cap, keeping all cardio off and away from the lower-body days (Mon, Thu, Sat).

**Monitoring:** talk_test, session_completion, lifting_performance, recovery_rating, resting_hr; review after 4 wk

**Adjustments:**
- Lifting performance drops on lower-body days or recovery rating falls (2 wk) → decrease minutes: Cut Wednesday back by 10–15 min and hold until lifting recovers.
- Sessions completed easily, sleep and recovery stable (4 wk) → increase minutes: Continue the planned +10 min/wk on Wednesday toward 90–120 min/wk.
- Sleep stays under 6 h and stress stays high (2 wk) → hold minutes: Hold at 60 min/wk until sleep improves rather than progressing.
- Post-lift walking feels like a chore or is skipped (3 wk) → hold modality: Swap the Tue/Fri walk to easy stationary cycling or elliptical, same minutes.

**Assumptions:** Standard commercial-gym stationary bike and treadmill are available (equipment state 'assumed'). · Evening training means the post-lift finishers happen in the same visit, not as a separate session ≥3 h apart.

**Uncertainties:**
- Whether under-6-h sleep is temporary or chronic: If chronic, even 60 min/wk may need to stay flat rather than progress.
- Client's cardio preference (not reported): Modality choices may need swapping for adherence.

**Coach questions:**
- You prescribe conditioning for everyone — do you want a conditioning block here, or defer it until sleep improves? — _Conditioning implies harder work, but bounds allow 0 hard sessions and recovery is the limiter with a hypertrophy goal, so this plan uses the health role only._
- Confirm the stationary bike and treadmill availability at the client's commercial gym. — _Both modalities are 'assumed' standard equipment, not confirmed._

**Decisions:**
- [warranted] Add a small amount of easy cardio now rather than none. — Client has capacity on one free day and the coach prescribes a health role; some activity gives health benefit and can be delivered without touching lifting. (coach: t_cardio_roles, t_cardio_health_minutes; client: onboarding.your_week.availableDays, onboarding.starting_point.weeklyFrequency; evidence: concept.cardio.dose#dose.who, concept.cardio.dose#dose.individualize)
- [role] Use the health role, not conditioning. — Goal is hypertrophy and bounds permit zero hard sessions; conditioning work would compete with lifting recovery. (coach: t_cardio_roles, t_conditioning_minutes; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [dose] Start at 60 min/wk, below the coach's 90–150 health range, reaching 90 by week 5. — Under-6-h sleep, stress and 300 min/wk of lifting mean week-1 capacity for added work is low; the range is the destination, not the start. (coach: t_cardio_health_minutes; client: onboarding.fuel_recovery.typicalSleep, onboarding.fuel_recovery.consistencyObstacles; evidence: concept.cardio.dose#dose.individualize, concept.cardio.progression#progression.gradual)
- [recovery] All sessions easy, none on lower-body days, main volume on the rest day, with a hold week at week 4. — Recovery is the stated limiter; keeping every session conversational and off lower-body days minimises added recovery cost. (coach: g_intensity_guide; client: onboarding.fuel_recovery.typicalSleep, onboarding.fuel_recovery.consistencyObstacles; evidence: concept.cardio.concurrent_training#concurrent.compatibility)
- [intensity] Anchor every session with the talk test at full conversation, RPE 2–3. — Coach guides intensity by talk test or RPE; the talk test is valid for walking and cycling and needs no devices. (coach: g_intensity_guide; client: —; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [interference] Cycling and walking only, with zero cardio on Mon/Thu/Sat (lower-body) or the day before them where it matters. — Running has high lower-body interference; cycling does not reduce hypertrophy in the concurrent literature and walking is minimal. (coach: —; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [schedule] Wednesday carries the main session; Tue/Fri get 15-min post-lift finishers. — Wednesday is the only non-lifting day (75-min capacity); Tue/Fri same-visit capacity is capped at 15 min and those are upper-body days. (coach: —; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength; evidence: concept.cardio.concurrent_training#concurrent.compatibility)
- [progression] Grow only the Wednesday session, ≤17%/wk, with hold weeks at 4 and 6. — Tue/Fri are capped by same-visit capacity, so Wednesday is the only place to add minutes; gradual progression with holds suits a recovery-limited client. (coach: t_cardio_health_minutes; client: onboarding.starting_point.recentConsistency; evidence: concept.cardio.progression#progression.gradual)
- [monitoring] Review after 4 weeks using lifting performance, recovery rating, session completion, talk test and resting HR. — Lifting output and recovery rating are the earliest signals that added cardio is costing the hypertrophy goal. (coach: g_intensity_guide; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.individualize)

**OPTIM review:** Week 1: 60 min of cardio (60 easy, 0 moderate, 0 vigorous; ≈60 moderate-equivalent min), 0 hard sessions, 6 training days counting resistance (approved program).

## C04 — Endurance-focused client, no event (endurance coach, aerobic base)

**Status:** PLANNED

**Context:** goal endurance · purpose aerobic_base · coach roles aerobic_base/conditioning/recovery · minutes {"aerobic_base":[120,240],"conditioning":[120,240],"recovery":[120,240]} · max hard 2 · easy-start weeks 0 · recovery-limited false · resistance none · capacity ≤450 min/wk · discipline running

**Warranted:** true · **Role:** aerobic_base · **Dose vs coach range:** within — _Week 1 is 150 min across 4 days — inside the coach's 120–240 min / 3–5 day base range and matched to a client already training 4x/week, experienced, very consistent, sleeping 7–8 h with no stated obstacles. No resistance program competes for recovery, so starting mid-low in range and building 10%/week is appropriate._

**Intensity method:** rpe — _Coach uses heart rate and RPE; RPE anchors every session (including intervals, where the talk test is impractical) and age-predicted HR bands are given as a secondary check._

**Objective:** Build running aerobic base: 150 min/week over 4 sessions, polarized (~80% easy, one weekly quality run), progressing to ~155 min with a down week every third week. — _Goal is endurance and the coach's sport is running; polarized distribution with mostly easy volume plus one hard session develops aerobic base while keeping high-impact running load manageable._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Optional | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Monday | steady | Running | 40 | easy | 2–3 | full_conversation | 55–70 | — | separate_day | no | Easy aerobic run — bulk of polarized volume |
| Tuesday | steady | Stationary cycling | 30 | easy | 2–3 | full_conversation | 55–70 | — | separate_day | no | Low-impact aerobic volume, limits weekly running impact |
| Thursday | intervals | Running | 35 | vigorous | 8–9 | — | 80–92 | 6×120s/120s @8–9/2–3 | separate_day | no | Single weekly quality session (~20% hard) (~11 min easy warm-up/cool-down around 24 min of work+recovery) |
| Saturday | steady | Running | 45 | easy | 2–3 | full_conversation | 55–70 | — | separate_day | no | Long easy run (30% of weekly minutes, under the 40% cap) |

**Progression (OPTIM's totals):**
- Week 1: 150 min over 4 sessions (115 easy / 0 moderate / 35 vigorous), 1 hard.
- Week 2: 165 min over 4 sessions (125 easy / 0 moderate / 40 vigorous), 1 hard.
- Week 3: 130 min over 4 sessions (130 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 4: 140 min over 4 sessions (105 easy / 0 moderate / 35 vigorous), 1 hard.
- Week 5: 153 min over 4 sessions (118 easy / 0 moderate / 35 vigorous), 1 hard.
- Week 6: 125 min over 4 sessions (125 easy / 0 moderate / 0 vigorous), 0 hard.

- W2: Mon Running 45′ easy, Tue Stationary cycling 30′ easy, Thu Running 40′ vigorous intervals, Sat Running 50′ easy — _165 min (+10%); intervals 7x2 min; long run 50 min (30% of week)_
- W3: Mon Running 35′ easy, Tue Stationary cycling 25′ easy, Thu Running 25′ easy, Sat Running 45′ easy — _Down week: 130 min, all easy, no hard session_
- W4: Mon Running 35′ easy, Tue Stationary cycling 25′ easy, Thu Running 35′ vigorous intervals, Sat Running 45′ easy — _140 min (+8% on the down week); quality session returns, 6x2 min_
- W5: Mon Running 40′ easy, Tue Stationary cycling 30′ easy, Thu Running 35′ vigorous intervals, Sat Running 48′ easy — _153 min (+9%); long run 48 min (31% of week)_
- W6: Mon Running 35′ easy, Tue Stationary cycling 25′ easy, Thu Running 25′ easy, Sat Running 40′ easy — _Down week: 125 min, all easy, before the next build block_

**Placement:** No resistance program to work around; all sessions are stand-alone days inside the available days, each well under the 75-min day cap. Monday/Tuesday/Thursday/Saturday spaces the hard run at least 48 h from the long run and leaves Wednesday, Friday and Sunday free.

**Monitoring:** rpe, talk_test, resting_hr, session_completion, recovery_rating; review after 6 wk

**Adjustments:**
- Easy runs drift above conversational effort or resting HR rises several mornings (1 wk) → decrease intensity: Hold easy runs at RPE 2–3 / 55–70% HRmax; swap a run for stationary cycling if needed
- All sessions completed and recovery rating good for two weeks (2 wk) → increase minutes: Add up to 10% weekly minutes, mostly to the easy runs, toward 180–200 min
- Shin, calf or knee soreness lingering >48 h (1 wk) → hold modality: Convert one easy run to stationary cycling or incline walking, keep weekly minutes the same
- Interval session quality falling (pace drops across rounds) (2 wk) → hold frequency: Keep one hard session per week; add a second only after a full block at current load

**Assumptions:** Stationary bike is a standard commercial-gym machine (equipment state: assumed) · Client can run outdoors or on a treadmill in the evening as scheduled

**Uncertainties:**
- Current running volume and any event/race target: Week-1 minutes may be conservative or aggressive relative to his actual running base
- Stationary bike availability: Tuesday session would become easy incline walking or a short easy run

**Coach questions:**
- What is his current weekly running volume and is there a race date? — _Week 1 was set at 150 min from general consistency data; a known base or event would reshape volume and long-run growth_
- Do you want the Tuesday session to be a run rather than cycling? — _Cycling caps impact but reduces running-specific volume for an endurance (running) goal_

**Decisions:**
- [warranted] Add cardio: 4 sessions, 150 min in week 1 — Goal is endurance with an endurance (running) coach, no resistance program competing for recovery, 6 available days, 75-min cap and an experienced, very consistent client. (coach: coaching_areas, e_days.base, e_weekly_volume.base; client: onboarding.what_you_want.primaryGoal, onboarding.starting_point.trainingExperience, onboarding.starting_point.recentConsistency, onboarding.your_week.availableDays; evidence: concept.cardio.dose#dose.who, concept.cardio.dose#dose.individualize)
- [dose] 150 min/week in week 1, building to ~155 with down weeks — within the coach's 120–240 min range — Matches his existing 4 sessions/week and leaves headroom to progress at ≤10%/week rather than opening at the top of the range. (coach: e_weekly_volume.base, e_weekly_increase; client: onboarding.starting_point.weeklyFrequency, onboarding.fuel_recovery.typicalSleep; evidence: concept.cardio.dose#dose.acsm, concept.cardio.progression#progression.gradual)
- [role] Aerobic base in the running discipline — Coach's sport is running and the client's discipline is known, so most volume is running with one low-impact cycling session. (coach: endurance_sports, coaching_areas; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.individualize)
- [intensity] RPE primary with HR bands (easy 55–70%, vigorous 80–92% of 179 bpm estimate); one hard session/week, ~80% easy — Coach uses HR and RPE; polarized distribution is the coach's prescribed mix and RPE anchors intervals where the talk test is impractical. (coach: e_intensity_method, e_intensity_mix, e_quality_sessions.base; client: onboarding.about_you.age; evidence: concept.cardio.intensity#intensity.hrmax, concept.cardio.intensity#intensity.talk_test, concept.cardio.interval_training#intervals.distribution)
- [schedule] Mon / Tue / Thu / Sat, all stand-alone days, longest session 45–50 min — 4 days sits inside the coach's 3–5 day range, every session is under the 75-min day cap, and the hard run is separated from the long run by 48 h. (coach: e_days.base, e_long_percent; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.your_week.preferredTrainingTime; evidence: concept.cardio.progression#progression.gradual)
- [progression] 6-week block: +8–10%/week with down weeks at weeks 3 and 6 — Honors the coach's 5–10% weekly increase and down week every 3–4 weeks; the long run stays ≤34% of weekly minutes, under the 40% cap. (coach: e_weekly_increase, e_down_weeks, e_down_every, e_long_percent; client: onboarding.starting_point.recentConsistency; evidence: concept.cardio.progression#progression.gradual, concept.cardio.progression#progression.ten_percent)
- [modality] Running for three sessions, stationary cycling for one easy session — Running is the trained discipline; one non-impact session adds aerobic minutes with less cumulative impact at 41 and 185 lb. (coach: endurance_sports; client: onboarding.about_you.age, onboarding.about_you.weightLb, onboarding.your_week.trainingEnvironment; evidence: concept.cardio.dose#dose.individualize)
- [monitoring] Track RPE, talk test, resting HR, session completion and recovery rating; review after 6 weeks — These confirm the easy sessions stay easy and that the 10% build is being absorbed before the next block. (coach: e_intensity_method; client: onboarding.your_week.schedulePredictability; evidence: concept.cardio.screening#screening.factors)

**OPTIM review:** Week 1: 150 min of cardio (115 easy, 0 moderate, 35 vigorous; ≈185 moderate-equivalent min), 1 hard session, 4 training days counting resistance (no resistance program supplied).

## C06 — Beginner with limited equipment (home, no machines confirmed)

**Status:** PLANNED

**Context:** goal general_fitness · purpose health · coach roles health/conditioning · minutes {"health":[90,150],"conditioning":[60,120]} · max hard 2 · easy-start weeks 2 · recovery-limited false · resistance none · capacity ≤120 min/wk

**Warranted:** true · **Role:** health · **Dose vs coach range:** below — _Week 1 is 60 min vs the coach's 90–150 health range: client is new to training, not recently consistent, and sessions cap at 30 min. Progression reaches 120 min/week by week 6, inside the range._

**Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; talk test is valid for walking and needs no equipment or HR monitor for a beginner._

**Objective:** Build a consistent walking-based aerobic habit, 60 min/week rising to ~120 min/week of mostly easy-to-moderate work over 6 weeks. — _Primary goal is health and consistency; some activity is better than none and gradual build suits a novice with no recent training._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Optional | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Monday | steady | Walking | 20 | easy | 2–3 | full_conversation | — | — | separate_day | no | Easy aerobic base, build the habit |
| Wednesday | steady | Walking | 20 | easy | 2–3 | full_conversation | — | — | separate_day | no | Easy aerobic base |
| Saturday | steady | Walking | 20 | easy | 2–3 | full_conversation | — | — | separate_day | no | Easy aerobic base, weekend anchor |

**Progression (OPTIM's totals):**
- Week 1: 60 min over 3 sessions (60 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 2: 72 min over 3 sessions (72 easy / 0 moderate / 0 vigorous), 0 hard.
- Week 3: 86 min over 4 sessions (42 easy / 44 moderate / 0 vigorous), 0 hard.
- Week 4: 100 min over 4 sessions (50 easy / 50 moderate / 0 vigorous), 0 hard.
- Week 5: 115 min over 4 sessions (55 easy / 60 moderate / 0 vigorous), 0 hard.
- Week 6: 120 min over 4 sessions (60 easy / 60 moderate / 0 vigorous), 0 hard.

- W2: Mon Walking 24′ easy, Wed Walking 24′ easy, Sat Walking 24′ easy — _72 min: +4 min per session, all still easy (easy-start weeks)._
- W3: Mon Walking 22′ moderate, Wed Walking 22′ easy, Fri Walking 20′ easy, Sat Walking 22′ moderate — _86 min: fourth day added; two sessions move to moderate (short sentences, effort 4–5)._
- W4: Mon Walking 25′ moderate, Wed Walking 25′ easy, Fri Walking 25′ easy, Sat Walking 25′ moderate — _100 min: all sessions to 25 min._
- W5: Mon Walking 30′ moderate, Wed Walking 30′ easy, Fri Walking 25′ easy, Sat Walking 30′ moderate — _115 min, inside the coach's health range._
- W6: Mon Walking 30′ moderate, Wed Walking 30′ easy, Fri Walking 30′ easy, Sat Walking 30′ moderate — _120 min at the session cap; hold here and review before adding intensity._

**Placement:** All sessions are standalone on available days (Mon/Wed/Fri/Sat), one per day, each ≤30 min ownVisitMax. No resistance program is approved, so there is no same-visit or interference constraint; Friday is added only from week 3 once three days are consistent.

**Monitoring:** talk_test, rpe, session_completion, resting_hr; review after 4 wk

**Adjustments:**
- All sessions completed and effort feels easy at target minutes (2 wk) → increase minutes: Add ~10–20% weekly minutes, staying ≤30 min/session and ≤150 min/week
- Missed sessions or persistent fatigue/soreness (2 wk) → decrease frequency: Drop back to 3 days at the last comfortable duration and hold
- Walking at brisk pace no longer reaches moderate (talk still full conversation at fastest walk) (4 wk) → increase intensity: Add incline or short brisk pickups; from week 7 consider one interval session (≤2 hard sessions/week)

**Assumptions:** Client can walk outdoors or on a treadmill for 20–30 min in the evening. · No resistance program is currently approved, so cardio is the only structured training load.

**Uncertainties:**
- Equipment access (bike, elliptical, rower, treadmill) is unknown; environment is 'limited equipment': If machines are available, cycling or elliptical could substitute for variety and lower impact; coach must confirm.
- Whether a resistance program will be added soon: Cardio days/minutes would need re-fitting around lifting, likely holding cardio volume.

**Coach questions:**
- You prescribe conditioning for everyone — should we add a conditioning block for this beginner, or keep the first 6 weeks purely health-focused walking? — _Client is new with no recent consistency; adding conditioning now risks adherence, so the plan starts with health role only._
- Which cardio equipment does this client actually have access to? — _Only walking and running are confirmed; machine options would widen the plan._

**Decisions:**
- [warranted] Add cardio now, 3 sessions/week to start. — No resistance program occupies the week, capacity is 4 open 30-min days, and the goal is general health/consistency — a walking base is the highest-yield start. (coach: t_cardio_roles; client: onboarding.what_you_want.primaryGoal, onboarding.your_week.availableDays, onboarding.starting_point.weeklyFrequency; evidence: concept.cardio.dose#dose.who, concept.cardio.dose#dose.individualize)
- [role] Role = health; conditioning deferred. — Coach allows health and conditioning; a novice with no recent training needs an aerobic/consistency base before conditioning work. (coach: t_cardio_roles, t_cardio_health_minutes; client: onboarding.starting_point.trainingExperience, onboarding.starting_point.recentConsistency; evidence: concept.cardio.dose#dose.individualize)
- [dose] Start at 60 min/week (below the 90–150 health range), reaching 115–120 min/week by weeks 5–6. — New to training, not training recently, and a hard 30-min session cap; starting below the range and building gradually protects adherence while heading into the coach's range. (coach: t_cardio_health_minutes; client: onboarding.starting_point.trainingExperience, onboarding.starting_point.recentConsistency, onboarding.your_week.maxSessionLength; evidence: concept.cardio.progression#progression.gradual, concept.cardio.dose#dose.who)
- [intensity] Talk test as primary anchor: easy = full conversation (effort 2–3), moderate = short sentences (effort 4–5). No vigorous work in weeks 1–6. — Coach guides by talk test/RPE; talk test is validated for walking and needs no HR data (no zones provided). (coach: g_intensity_guide; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Mon/Wed/Sat at 20 min in week 1, Friday added from week 3; all standalone evening sessions. — Only these days are available, each holds 30 min, and spacing gives recovery between sessions for a beginner. (coach: —; client: onboarding.your_week.availableDays, onboarding.your_week.preferredTrainingTime, onboarding.your_week.schedulePredictability; evidence: concept.cardio.dose#dose.individualize)
- [modality] Walking (optionally incline treadmill if available) as the sole modality. — Walking is confirmed available and needs no equipment; running is high impact and unsuitable for an untrained starter. (coach: —; client: onboarding.your_week.trainingEnvironment, onboarding.starting_point.trainingExperience; evidence: concept.cardio.dose#dose.individualize)
- [progression] 60 → 72 → 86 → 100 → 115 → 120 min/week, each step ≤20%, holding at 120. — Respects the max weekly increase and the 30-min session cap, ends inside the coach's 90–150 range. (coach: t_cardio_health_minutes; client: onboarding.your_week.maxSessionLength; evidence: concept.cardio.progression#progression.gradual)
- [monitoring] Track talk test, RPE, session completion and resting HR; review at 4 weeks. — Completion is the key metric for a consistency goal; talk test/RPE verify intensity is being hit. (coach: g_intensity_guide; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.intensity#intensity.talk_test)

**OPTIM review:** Week 1: 60 min of cardio (60 easy, 0 moderate, 0 vigorous; ≈60 moderate-equivalent min), 0 hard sessions, 3 training days counting resistance (no resistance program supplied).

## C13 — Optional-low-intensity coach, fat-loss client: optional easy cardio only, steps from the coach

**Status:** REJECTED

**Validator errors:**
- week 5: minutes rise 29% (105 → 135) — the limit is 20% a week.