# Cardio Reasoner V1 — review pack

Generated 2026-10-09 · live model (production model, medium effort).

## C01 — Strength athlete who needs cardiovascular fitness (upper/lower split)

**Status:** PLANNED

**Context:** goal strength · purpose resistance_support · coach roles health/conditioning · minutes {"fat_loss":[120,250],"health":[90,150],"aerobic_base":[60,120],"conditioning":[60,120]} · max hard 2 · easy-start weeks 0 · recovery-limited false · resistance Mon(L) 60m, Tue(U) 60m, Thu(L) 60m, Fri(U) 60m

**Warranted:** true · **Role:** conditioning · **Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; talk test anchors the steady work, with RPE used for intervals where talk test isn't practical._

**Objective:** 70–110 min/week of low-interference cardio to build work capacity so everyday efforts (stairs) feel easy, without blunting squat progress. — _Client is experienced, consistent, recovery is not limited, and his own success definition pairs a 180 kg squat with not getting gassed on stairs — conditioning is the role that serves that._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|
| Tuesday | steady | Stationary cycling | 15 | easy | 2–3 | full_conversation | — | — | after_resistance | Easy flush/volume on an upper-body lifting day with a non-impact, low-interference modality. (60 min lifting + 15 min bike = 75 min, exactly at the session cap.) |
| Wednesday | steady | Incline treadmill walking | 30 | moderate | 4–5 | short_sentences | — | — | separate_day | Main aerobic block — incline walking transfers directly to the stairs complaint. (Moderate, not hard, so it doesn't compromise Thursday's lower-body session.) |
| Saturday | intervals | Stationary cycling | 25 | vigorous | 7–8 | — | — | 8×60s/90s @7–8/2–3 | separate_day | The one hard session: raises work capacity with the modality least likely to interfere with strength. (20 min of intervals inside 25 min total; use the remaining time as easy spinning before/after.) |

**Progression:** W1 70 min/1 hard (Establish three sessions; one hard.) → W2 80 min/1 hard (Wednesday steady 30→40 min.) → W3 90 min/1 hard (Saturday 25→30 min (10 interval rounds).) → W4 100 min/2 hard (Tuesday becomes 25 min: 6×45s hard / 75s easy on the bike after lifting (cap allows 50 min lifting + 25 min); review week.) → W5 110 min/2 hard (Wednesday steady 40→50 min.) → W6 110 min/2 hard (Hold and consolidate; reassess stair/step tolerance and squat performance.)

**Placement:** Goal is strength, so hard leg-dominant cardio is kept off Monday and Thursday (lower-body days) and off Wednesday (day before Thursday). The only hard session sits on Saturday, two days after the last lower-body session and with a rest day following. Tuesday cardio is same-visit after upper-body lifting and fits the 75 min cap; everything else is a separate day. All days come from the available list.

**Monitoring:** talk_test, rpe, session_completion, lifting_performance, recovery_rating; review after 4 wk

**Adjustments:**
- Squat top sets feel heavier or bar speed drops for 2+ sessions (2 wk) → decrease intensity: Drop Saturday intervals to steady moderate for a week, keep total minutes.
- Stairs/daily efforts still feel hard but lifting is unaffected (4 wk) → increase minutes: Add 10 min/week to the Wednesday steady block, up to 120 min/week total.
- Recovery rating drops or sleep slips below 7 h (2 wk) → decrease frequency: Cut the Tuesday same-visit cardio until recovery normalises.
- Incline treadmill unavailable or knees complain on incline (1 wk) → hold modality: Swap Wednesday to elliptical or flat walking at the same effort.

**Assumptions:** Stationary bike and incline treadmill are standard commercial-gym equipment and available at his evening training times. · Wednesday and Saturday are free of resistance training and can be used for cardio-only sessions.

**Uncertainties:**
- Current aerobic baseline is unknown (no step count or activity history reported): Week 1 at 70 min may be conservative or slightly ambitious; adjust after the first two weeks on session completion and talk test.
- Whether the client will attend the gym on non-lifting days (Wednesday, Saturday): If not, Wednesday/Saturday work must move to outdoor walking or be folded into lifting days, lowering weekly minutes.

**Coach questions:**
- Confirm bike and incline treadmill access at evening peak times — any queueing for cardio machines? — _Both modalities are assumed rather than confirmed; queues would break the session structure._
- Is the client willing to come in (or train at home/outdoors) on Wednesday and Saturday? — _The plan relies on two non-lifting days; otherwise cardio must be compressed into the 75 min lifting-day cap._
- Should conditioning sit nearer the top of the 60–120 min range sooner, given he's experienced and recovery isn't limited? — _The build to 110 min by week 5 is deliberately gradual; the coach may prefer a faster ramp._

**Decisions:**
- [warranted] Cardio is warranted now, in a conditioning role, at 70–110 min/week. — Client is experienced, very consistent, sleeps 7–8 h, has no recovery limiters, and his stated success includes not getting gassed on stairs. (coach: t_cardio_roles, t_conditioning_minutes; client: onboarding.what_you_want.successDefinition, onboarding.starting_point.recentConsistency, onboarding.fuel_recovery.typicalSleep; evidence: concept.cardio.dose#dose.individualize)
- [role] Conditioning over health; weekly minutes held inside 60–120. — Coach's allowed roles are health and conditioning; the client's complaint is work capacity, not general health-activity volume. (coach: t_cardio_roles, t_conditioning_minutes; client: onboarding.what_you_want.primaryGoal, onboarding.what_you_want.successDefinition; evidence: concept.cardio.dose#dose.acsm)
- [intensity] Talk test governs steady sessions; RPE 7–8 governs the bike intervals. — Coach guides intensity by talk test or RPE, and the talk test is not practical for interval work. (coach: g_intensity_guide; client: —; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [modality] Stationary cycling for all hard work; incline walking for the steady block. — Cycling does not show the strength/hypertrophy interference that running does, and incline walking matches the stair-specific complaint at low interference. (coach: —; client: onboarding.what_you_want.successDefinition, onboarding.your_week.trainingEnvironment; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [interference] No hard or leg-dominant cardio on Monday, Thursday, or Wednesday; Tuesday cardio is easy only. — Primary goal is strength with lower-body lifting on Monday and Thursday; hard cardio is kept away from those days and the day before. (coach: —; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.concurrent_training#concurrent.modality_dose, concept.cardio.concurrent_training#concurrent.compatibility)
- [schedule] Tue after_resistance (15 min, 75 min total visit), Wed separate day 30 min, Sat separate day 25 min. — All days are available; the same-visit total exactly meets the 75 min session cap, and the two cardio-only days keep hard work away from lower-body lifting. (coach: —; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.your_week.schedulePredictability; evidence: concept.cardio.concurrent_training#concurrent.compatibility)
- [progression] 70 → 110 min over six weeks, each step ≤20%, with the second hard session only from week 4. — Gradual progression; duration is tolerated first, then intensity is added, and hard sessions never exceed two per week. (coach: t_conditioning_minutes; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.progression#progression.gradual, concept.cardio.interval_training#intervals.distribution)
- [monitoring] Track talk test, RPE, session completion, lifting performance and recovery rating; review at week 4. — Lifting performance is the guardrail for a strength client; the other measures confirm the prescribed intensity is being hit. (coach: g_intensity_guide; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.progression#progression.gradual)
- [other] One hard session in week 1, well under the cap of two. — Intervals drive the largest capacity gains but more high-intensity work does not scale linearly; keep the ratio low-intensity dominant. (coach: —; client: onboarding.starting_point.weeklyFrequency; evidence: concept.cardio.interval_training#intervals.vo2max, concept.cardio.interval_training#intervals.distribution)

**OPTIM review:** Week 1: 70 min of cardio (15 easy, 30 moderate, 25 vigorous; ≈95 moderate-equivalent min), 1 hard session, 6 training days counting resistance (approved program).

## C02 — Fat-loss client with low endurance capacity (new to training, not training recently)

**Status:** PLANNED

**Context:** goal fat_loss · purpose fat_loss_support · coach roles fat_loss/health/conditioning · minutes {"fat_loss":[120,250],"health":[90,150],"aerobic_base":[60,120],"conditioning":[60,120]} · max hard 2 · easy-start weeks 2 · recovery-limited false · resistance Mon(U) 40m, Thu(U) 40m

**Warranted:** true · **Role:** fat_loss · **Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; the talk test is valid for walking, cycling and elliptical and needs no HR data (no zones provided). RPE is used as a backup for intervals later._

**Objective:** 3 cardio sessions/week on non-lifting days, 120 min in week 1, building toward ~200 min/week of mostly easy–moderate work. — _Fat-loss goal with a new, currently inactive trainee; 150–250 min/week of moderate activity supports weight loss alongside diet, and the coach's fat-loss range is 120–250 min._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|
| Wednesday | steady | Incline treadmill walking | 40 | moderate | 4–6 | short_sentences | — | — | separate_day | Main moderate aerobic volume on a non-lifting day. (Set incline so speech stays at short sentences, not full conversation.) |
| Saturday | steady | Stationary cycling | 45 | moderate | 4–6 | short_sentences | — | — | separate_day | Longest session of the week; non-impact and lowest interference with lifting. |
| Sunday | steady | Walking | 35 | easy | 2–3 | full_conversation | — | — | separate_day | Easy recovery volume, low barrier, builds the habit. |

**Progression:** W1 120 min/0 hard (Baseline: 40/45/35 min, all easy–moderate.) → W2 140 min/0 hard (+20 min spread across the three sessions; still no hard work (beginner easy start).) → W3 155 min/1 hard (Wednesday becomes intervals on incline walking or the bike: 6 rounds, 60 s work at effort 7–8, 120 s easy recovery at 2–3, inside a 40 min session with warm-up/cool-down.) → W4 170 min/1 hard (+15 min on the steady sessions; interval rounds stay at 6.) → W5 185 min/1 hard (+15 min steady; intervals to 8 rounds if week 4 felt controlled.) → W6 200 min/1 hard (Hold intensity, finish the volume build; review before going further.)

**Placement:** Resistance is Monday and Thursday, 40 min each, and the session cap is 45 min, so no meaningful cardio fits in those visits and the client trains evenings only (a ≥3 h separate session is unrealistic). Cardio therefore sits on Wednesday, Saturday and Sunday as separate days, giving 5 training days total.

**Monitoring:** talk_test, rpe, session_completion, bodyweight, recovery_rating; review after 4 wk

**Adjustments:**
- Fewer than 2 of 3 cardio sessions completed per week (2 wk) → decrease minutes: Cut to 2 sessions of 35–40 min (~75 min) and rebuild once completion is consistent.
- Sessions completed easily, recovery rating good, bodyweight flat (4 wk) → increase minutes: Add 10–15 min/week toward 250 min, keeping increases under 20%.
- Lifting performance on Monday/Thursday drops or legs feel heavy (2 wk) → decrease intensity: Move intervals to the stationary bike and drop Sunday to easy walking only.
- Joint or shin soreness from incline walking (1 wk) → hold modality: Swap incline walking for stationary cycling or elliptical at the same minutes.

**Assumptions:** Treadmill, stationary bike and elliptical are standard equipment in the client's commercial gym. · Cardio happens in the evening like the resistance sessions, on days without lifting.

**Uncertainties:**
- Diet is not described, and cardio alone at 120–200 min/week gives only modest weight loss: Fat-loss rate may be slower than expected without a nutrition plan.
- True starting fitness in a currently inactive 230 lb beginner: Week 1 may land easier or harder than moderate; the talk test corrects this session to session.

**Coach questions:**
- Confirm the gym has an incline treadmill and stationary bike (listed as assumed). — _Both week-1 modalities depend on it; otherwise outdoor walking covers the volume._
- Is nutrition being handled alongside this? — _150–250 min/week improves weight loss mainly alongside moderate diet restriction._
- Should Monday or Thursday carry a short 10–15 min easy finisher if the 45 min session cap can flex? — _That would add ~30 min/week without a new training day, but currently breaks the cap._

**Decisions:**
- [warranted] Cardio is warranted now, in the fat_loss role at 120 min in week 1. — Primary goal is fat loss, client is not recovery-limited, and the coach's fat-loss range is 120–250 min/week. (coach: t_cardio_roles, t_cardio_fat_loss_minutes; client: onboarding.what_you_want.primaryGoal, onboarding.fuel_recovery.typicalSleep; evidence: concept.cardio.weight_management#fatloss.dose, concept.cardio.dose#dose.who)
- [intensity] Talk test is the primary anchor: moderate = short sentences (effort 4–6), easy = full conversation (effort 2–3); RPE anchors intervals from week 3. — Coach guides intensity by talk test or RPE, no HR zones were provided, and the talk test is not practical for intervals. (coach: g_intensity_guide; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Cardio on Wednesday, Saturday and Sunday as separate days; none stacked onto the Monday/Thursday lifting visits. — 40 min of lifting already fills the 45 min session cap, and the client trains evenings only so a ≥3 h separation is impractical. (coach: t_cardio_fat_loss_minutes; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.your_week.preferredTrainingTime; evidence: concept.cardio.dose#dose.individualize)
- [interference] Low-interference modalities (incline walking, stationary cycling, walking); running and rowing avoided, and cardio never shares a day with lifting. — Running interferes with strength/hypertrophy outcomes where cycling does not, and separating modes reduces interference; no lower-body resistance days are scheduled, so the constraint is mainly about total load. (coach: t_cardio_roles; client: onboarding.what_you_want.primaryGoal, onboarding.starting_point.recentConsistency; evidence: concept.cardio.concurrent_training#concurrent.modality_dose, concept.cardio.concurrent_training#concurrent.compatibility)
- [progression] 6-week build from 120 to 200 min/week, increases ≤20%, with zero hard sessions in weeks 1–2 and one interval session from week 3. — Beginner with no recent training needs duration tolerated before intensity; gradual progression reduces exercise risk and hard sessions are capped at 2/week. (coach: t_cardio_fat_loss_minutes; client: onboarding.starting_point.trainingExperience, onboarding.starting_point.recentConsistency; evidence: concept.cardio.progression#progression.gradual, concept.cardio.interval_training#intervals.distribution)
- [monitoring] Track talk test/RPE, session completion, bodyweight and recovery rating; review at 4 weeks. — Completion is the main risk in a new trainee, and bodyweight checks whether the fat-loss dose plus diet is working. (coach: t_cardio_fat_loss_minutes; client: onboarding.fuel_recovery.cardioPreference, onboarding.your_week.schedulePredictability; evidence: concept.cardio.dose#dose.individualize)

**OPTIM review:** Week 1: 120 min of cardio (35 easy, 85 moderate, 0 vigorous; ≈120 moderate-equivalent min), 0 hard sessions, 5 training days counting resistance (approved program).

## C03 — Hypertrophy client with limited recovery (short sleep, stress)

**Status:** PLANNED

**Context:** goal hypertrophy · purpose resistance_support · coach roles health/conditioning · minutes {"fat_loss":[120,250],"health":[90,150],"aerobic_base":[60,120],"conditioning":[60,120]} · max hard 0 · easy-start weeks 0 · recovery-limited true · resistance Mon(L) 60m, Tue(U) 60m, Thu(L) 60m, Fri(U) 60m, Sat(U) 60m

**Warranted:** true · **Role:** health · **Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; talk test is valid for walking, cycling and elliptical steady work and needs no HR data (no zones provided). RPE given alongside as a cross-check._

**Objective:** 90 min/wk of easy-to-moderate steady cardio, built around a 5-day hypertrophy program, progressing toward ~130 min/wk. — _Hypertrophy is the goal and recovery is limited (sleep under 6 h, stress), so cardio serves general health and work capacity only — low dose, no hard sessions, low-interference modalities._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|
| Tuesday | steady | Stationary cycling | 15 | easy | 2–3 | full_conversation | — | — | after_resistance | Easy aerobic flush on an upper-body lifting day (60 min lifting + 15 min cardio = 75 min, at the session cap.) |
| Wednesday | steady | Walking | 45 | moderate | 4–5 | short_sentences | — | — | separate_day | Main aerobic dose on the only non-lifting day (Walking kept moderate and low-impact the day before Thursday's lower-body session.) |
| Friday | steady | Stationary cycling | 15 | easy | 2–3 | full_conversation | — | — | after_resistance | Easy aerobic volume on an upper-body day |
| Saturday | steady | Elliptical | 15 | easy | 2–3 | full_conversation | — | — | after_resistance | Easy aerobic volume, no impact, on an upper-body day |

**Progression:** W1 90 min/0 hard (Start at the bottom of the health range: 45 + 15 + 15 + 15.) → W2 100 min/0 hard (Wednesday walk 45 → 55 min.) → W3 110 min/0 hard (Wednesday 55 → 60 min; Tuesday 15 → 20 min only if lifting session finishes inside 75 min total.) → W4 120 min/0 hard (Add 10 min across the post-lift sessions (keep each visit ≤75 min).) → W5 130 min/0 hard (Wednesday to 70 min easy-moderate.) → W6 130 min/0 hard (Hold and review; all increases ≤20%/wk, duration only — no intensity added.)

**Placement:** Wednesday is the only free day, so it carries the main dose as a separate day. The other three sessions sit after upper-body lifts (Tue/Fri/Sat) where lower-body interference is irrelevant and the 60+15 min visit fits the 75-min cap. Nothing is scheduled on Monday or Thursday (lower-body days), and Wednesday's work is easy-moderate walking so it doesn't pre-fatigue Thursday's legs.

**Monitoring:** talk_test, rpe, session_completion, lifting_performance, recovery_rating; review after 4 wk

**Adjustments:**
- Lifting performance (loads/reps) drops on lower-body days or recovery rating falls (2 wk) → decrease minutes: Cut back to 90 min/wk, dropping the Saturday session first.
- Sleep stays under 6 h and session completion drops (2 wk) → decrease frequency: Keep only Wednesday + one post-lift session; prioritise sleep over added cardio minutes.
- All sessions completed, recovery rating steady, lifts progressing at 130 min/wk (4 wk) → increase minutes: Progress toward 150 min/wk (top of the coach's health range), duration only.
- Walking at short-sentence talk level feels too easy at same pace (4 wk) → hold intensity: Hold intensity; raise incline/pace only enough to keep short-sentence speech — no vigorous work while recovery is limited.

**Assumptions:** Stationary bike and elliptical are standard commercial-gym machines (assumed) and available at the client's evening training times. · The approved resistance program's five 60-min days are fixed; cardio is fitted around them. · No contraindication to moderate cardio — safety flags are clear.

**Uncertainties:**
- Whether 75-min total gym visits are realistic in the evening with stress and schedule obstacles: If visits run long, post-lift cardio gets dropped and weekly minutes fall below 90.
- True recovery capacity on under-6 h sleep: Even easy added volume may blunt hypertrophy progress; may need to cut to Wednesday only.

**Coach questions:**
- Sleep is under 6 h with stress and schedule obstacles — do you want any cardio at all right now, or should sleep/steps be the only non-lifting target for 4 weeks? — _Recovery is flagged as the limiter and the goal is hypertrophy; I followed your method's health role at its minimum, but the dose is coach-level call._
- Confirm the stationary bike and elliptical are available at this gym in the evening. — _Both are listed as assumed equipment; if crowded, substitute treadmill walking._
- You set no steps target — should we add one instead of some session minutes? — _Daily steps may suit a stressed, time-limited client better than extra gym minutes._
- Is a 75-min total visit acceptable on Tue/Fri/Sat, or should cardio move to a separate session ≥3 h apart? — _Session cap is 75 min and separation by ≥3 h reduces concurrent interference._

**Decisions:**
- [warranted] Cardio is warranted, but only as a minimal health dose (90 min/wk to start). — Health benefits are real at sub-guideline doses, and limited sleep/stress means more volume would tax recovery that hypertrophy depends on. (coach: t_cardio_roles, t_cardio_health_minutes; client: onboarding.fuel_recovery.typicalSleep, onboarding.fuel_recovery.consistencyObstacles, onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.acsm, concept.cardio.dose#dose.individualize)
- [role] Role = health, not conditioning. — Purpose is resistance support for a hypertrophy client; conditioning would demand harder sessions that the 0 hard-session bound forbids. (coach: t_cardio_roles, t_cardio_health_minutes; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.individualize)
- [intensity] All sessions steady, easy to moderate, anchored by talk test (full conversation / short sentences) with RPE 2–5; no intervals, no vigorous work. — Coach guides intensity by talk test or RPE and the plan allows zero hard sessions per week. (coach: g_intensity_guide; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Wed 45 min walk (separate day) + 15 min after lifting on Tue, Fri and Sat; six training days total, five of them lifting. — Wednesday is the only non-lifting available day; post-lift slots keep total visits at the 75-min cap and preserve the evening-only availability. (coach: t_cardio_health_minutes; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.your_week.preferredTrainingTime; evidence: concept.cardio.dose#dose.individualize)
- [interference] No cardio on Monday or Thursday (lower-body days); cardio restricted to cycling, elliptical and walking — no running or rowing. — Running and other high/moderate lower-body-interference modalities blunt hypertrophy; cycling does not, and same-session work is kept short and easy. (coach: t_cardio_roles; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.concurrent_training#concurrent.modality_dose, concept.cardio.concurrent_training#concurrent.compatibility)
- [progression] 90 → 100 → 110 → 120 → 130 min/wk over 6 weeks, duration only, 0 hard sessions throughout. — Each step is ≤20% and intensity is never added; gradual progression limits risk and protects lifting recovery. (coach: t_cardio_health_minutes; client: onboarding.starting_point.recentConsistency; evidence: concept.cardio.progression#progression.gradual)
- [monitoring] Track talk test, RPE, session completion, lifting performance and recovery rating; review at week 4. — Lifting performance and recovery rating are the early warnings that cardio is competing with the hypertrophy goal. (coach: g_intensity_guide; client: onboarding.fuel_recovery.typicalSleep; evidence: concept.cardio.dose#dose.individualize)
- [modality] Stationary bike and elliptical post-lift, outdoor-free walking midweek. — Zero/low impact, low lower-body interference, no skill demand; equipment is standard gym kit (confirm availability). (coach: t_cardio_roles; client: onboarding.your_week.trainingEnvironment; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)

**OPTIM review:** Week 1: 90 min of cardio (45 easy, 45 moderate, 0 vigorous; ≈90 moderate-equivalent min), 0 hard sessions, 6 training days counting resistance (approved program).

## C04 — Endurance-focused client, no event (endurance coach, aerobic base)

**Status:** PLANNED

**Context:** goal endurance · purpose aerobic_base · coach roles aerobic_base/conditioning/recovery · minutes {"aerobic_base":[120,240],"conditioning":[120,240],"recovery":[120,240]} · max hard 2 · easy-start weeks 0 · recovery-limited false · resistance none

**Warranted:** true · **Role:** aerobic_base · **Intensity method:** heart_rate — _Coach uses heart rate and RPE; zones are provided (HRmax est. 179). RPE is given alongside for intervals where HR lags._

**Objective:** Build aerobic base with ~3 h/week over 4 days, polarized: mostly easy steady work plus one weekly interval session. — _Goal is endurance; client is experienced, very consistent, trains 4x/week, sleeps 7-8 h, no restrictions or recovery limits, so a full aerobic base block is appropriate now._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|
| Monday | steady | Elliptical | 30 | easy | 2–3 | full_conversation | 58–68 | — | separate_day | Low-impact easy aerobic volume to start the week. |
| Tuesday | steady | Stationary cycling | 45 | easy | 3–3 | full_conversation | 60–70 | — | separate_day | Mid-length easy ride, aerobic base. |
| Thursday | intervals | Stationary cycling | 45 | vigorous | 7–8 | — | 80–90 | 6×180s/180s @7–8/2–3 | separate_day | The ~20% hard portion of a polarized week; drives VO2max. (36 min of work/recovery plus ~9 min warm-up and cool-down inside the 45 min.) |
| Saturday | steady | Incline treadmill walking | 60 | easy | 3–3 | full_conversation | 60–70 | — | separate_day | Weekly long easy session; gentle incline adds load without impact. |

**Progression:** W1 180 min/1 hard (Baseline 4 days, 3 h, one interval session.) → W2 195 min/1 hard (+15 min on the long session (+8%).) → W3 210 min/2 hard (+15 min; add a second hard session (short intervals on Monday) now duration is tolerated.) → W4 170 min/1 hard (Down week: volume cut ~20%, one hard session.) → W5 185 min/2 hard (Rebuild (+9%), two hard sessions.) → W6 200 min/2 hard (+8%; reassess before the next block.)

**Placement:** No resistance program to fit around, so every session is its own day. Hard interval day sits mid-week with easy days either side; the long easy session is Saturday. Wednesday, Friday and Sunday stay free. Longest session is 60 min, inside the 75 min cap, and all days are in availability (evening training).

**Monitoring:** rpe, resting_hr, session_completion, recovery_rating; review after 4 wk

**Adjustments:**
- Easy sessions feel easy and all sessions completed (2 wk) → increase minutes: Add 10-15 min/week to the long easy session, max +10%/week.
- Resting HR up >5 bpm for several days or recovery rating dropping (1 wk) → decrease intensity: Drop the interval session to steady easy that week; hold volume.
- Easy HR drifts above 70% HRmax at the same effort (2 wk) → hold intensity: Slow the pace to keep easy truly easy rather than letting it creep to moderate.
- Joint soreness from incline walking or elliptical (2 wk) → hold modality: Swap to stationary cycling or rowing for the affected session.

**Assumptions:** Elliptical, stationary cycle and treadmill are standard commercial-gym equipment and available in the evening. · Client can monitor heart rate (watch or machine grips); if not, run the same plan on RPE alone.

**Uncertainties:**
- HRmax is age-predicted (179), not measured: Zone edges may be off by several bpm; use RPE/talk test as the tie-breaker.
- No stated endurance event or distance target: Modality bias is generic (low-impact); would shift toward running if an event exists.

**Coach questions:**
- Is there a target event, distance or modality for 'endurance' (e.g. running, cycling)? — _Base work should be mostly specific to the target modality; currently it is low-impact generic._
- Does the client have a heart-rate monitor, or should the plan run on RPE only? — _Your method allows both; HR targets are useless without a device._
- Confirm down-week cadence — plan uses every 4th week. — _Your method specifies down weeks 'every_n' without a value._
- Is an outdoor option (cycling/running) wanted in good weather? — _Outdoor cycling equipment status is unknown and evening/outdoor logistics need confirming._

**Decisions:**
- [warranted] Cardio is warranted now at full volume; no ramp-in weeks. — Experienced, very consistent, 4 sessions/week already, 7-8 h sleep, no restrictions, recoveryLimited false and easyStartWeeks 0. (coach: coaching_areas; client: onboarding.starting_point.trainingExperience, onboarding.starting_point.recentConsistency, onboarding.fuel_recovery.typicalSleep; evidence: concept.cardio.dose#dose.individualize)
- [role] Role = aerobic_base at 180 min (3 h) in week 1. — Goal is endurance; 3 h sits mid-range of the coach's 2-4 h and of the 120-240 min role band, and exceeds general health guidance. (coach: e_weekly_volume; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.who, concept.cardio.dose#dose.acsm)
- [intensity] Heart-rate zones primary (easy 55-70%, vigorous 80-92% of 179), RPE secondary; ~80% of weekly minutes easy. — Coach uses heart_rate and rpe with a polarized distribution; zones were supplied and safety allows HR targets. (coach: e_intensity_method, e_intensity_mix; client: onboarding.about_you.age; evidence: concept.cardio.intensity#intensity.hrmax, concept.cardio.interval_training#intervals.distribution)
- [schedule] 4 days: Mon 30, Tue 45, Thu 45 (intervals), Sat 60. — Within the coach's 3-5 days, all days are available, every session under the 75 min cap, Wed/Fri/Sun free for recovery. (coach: e_days; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.starting_point.weeklyFrequency; evidence: —)
- [modality] Cycling, elliptical and incline walking; no running in weeks 1-6. — Low-impact, no-skill, assumed standard gym equipment; keeps joint load low while volume rises. Running can be added if a run-specific goal is confirmed. (coach: coaching_areas; client: onboarding.your_week.trainingEnvironment; evidence: concept.cardio.dose#dose.individualize)
- [interference] No interference constraint applied; all cardio on its own days. — No resistance program was supplied and the goal does not include muscle or strength, so modality interference ratings do not bind. If lifting is added, keep the interval day off lower-body days or ≥3 h apart. (coach: —; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.concurrent_training#concurrent.compatibility, concept.cardio.concurrent_training#concurrent.modality_dose)
- [progression] 180 → 195 → 210 → 170 (down) → 185 → 200 min over 6 weeks, ≤10%/week; second hard session only from week 3. — Coach caps weekly increase at 5-10% and uses down weeks; intensity is added only after duration is tolerated. (coach: e_weekly_increase, e_down_weeks, e_quality_sessions; client: —; evidence: concept.cardio.progression#progression.gradual)
- [monitoring] Track RPE, resting HR, session completion and recovery rating; review after 4 weeks. — These detect intensity creep and accumulating fatigue before the second hard session is added or volume rises further. (coach: e_intensity_method; client: —; evidence: concept.cardio.screening#screening.factors)
- [other] Hard sessions capped at 2/week, one in weeks 1-2. — bounds.maxHardSessions = 2 and the coach's method allows 1-2 quality sessions; polarized training does not benefit from more. (coach: e_quality_sessions, e_intensity_mix; client: —; evidence: concept.cardio.interval_training#intervals.distribution, concept.cardio.interval_training#intervals.vo2max)

**OPTIM review:** Week 1: 180 min of cardio (135 easy, 0 moderate, 45 vigorous; ≈225 moderate-equivalent min), 1 hard session, 4 training days counting resistance (no resistance program supplied).

## C05 — Hybrid athlete (strength primary, wants a better running engine)

**Status:** PLANNED

**Context:** goal strength (hybrid) · purpose aerobic_base · coach roles health/conditioning/aerobic_base · minutes {"fat_loss":[120,250],"health":[90,150],"aerobic_base":[60,120],"conditioning":[60,120]} · max hard 2 · easy-start weeks 0 · recovery-limited false · resistance Mon(L) 60m, Tue(U) 60m, Thu(L) 60m, Fri(U) 60m

**Warranted:** true · **Role:** aerobic_base · **Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; all planned work is continuous steady running/cycling where the talk test is valid, with RPE as a backup number._

**Objective:** Build an easy-running aerobic base (90→120 min/wk) that supports, not blunts, the 220 kg deadlift. — _Success is defined as both a 220 kg deadlift and comfortably running an hour; the client is experienced, consistent, sleeps 7–8 h and has 6 available days, so low-intensity aerobic volume is affordable alongside 4 lifting days._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|
| Wednesday | steady | Running | 30 | easy | 2–3 | full_conversation | — | — | separate_day | Mid-week easy aerobic run on a non-lifting day (Keep fully conversational — this sits the day before a lower-body day, so it must not feel hard.) |
| Friday | steady | Stationary cycling | 15 | easy | 2–3 | full_conversation | — | — | after_resistance | Low-interference aerobic top-up after upper-body lifting (60 min lift + 15 min bike = 75 min, exactly the session cap.) |
| Saturday | steady | Running | 45 | easy | 2–3 | full_conversation | — | — | separate_day | Longest run of the week, builds toward the one-hour goal (Furthest point from a lower-body session; this is the run that grows over the block.) |

**Progression:** W1 90 min/0 hard (Baseline: 30 + 15 + 45, all easy.) → W2 100 min/0 hard (Saturday run 45→55.) → W3 110 min/0 hard (Saturday 55→60 (one-hour run reached); Wednesday 30→35.) → W4 100 min/0 hard (Easy week: Saturday back to 50, Wednesday 35 — check deadlift performance.) → W5 115 min/0 hard (Saturday 60, Wednesday 40, bike 15; still all easy.) → W6 120 min/1 hard (Only if lifting is holding: last 10 min of Wednesday run at moderate (short sentences, RPE 4–5). No intervals this block.)

**Placement:** Lower-body lifting is Monday and Thursday, so running is kept off Monday/Thursday and off Tuesday (keeps a clear day after Monday squat/pull work); Wednesday and Saturday runs stay easy, and the only same-visit cardio is low-interference stationary cycling after an upper-body day, within the 75 min cap. No cardio is scheduled ≥3 h separate because the client trains only in the evening.

**Monitoring:** talk_test, rpe, session_completion, lifting_performance, recovery_rating; review after 4 wk

**Adjustments:**
- Deadlift/squat loads or bar speed decline two sessions running (2 wk) → decrease minutes: Cut the Saturday run by 15 min and hold total at ~90 min until lifting recovers.
- Easy runs still require short sentences at the same pace (4 wk) → hold intensity: Hold minutes and slow the pace until full conversation is possible before adding volume.
- All sessions completed, recovery rating good, lifting progressing (4 wk) → increase minutes: Add up to 20%/week toward the 120 min ceiling, growing the Saturday run first.
- Shin/knee soreness from running volume (1 wk) → hold modality: Swap the Wednesday run for incline treadmill walking or the elliptical at equal minutes.

**Assumptions:** Stationary cycling is a standard commercial-gym machine and available. · Wednesday and Saturday are free of resistance training, so they count as extra training days (6 total).

**Uncertainties:**
- Current running habit and longest comfortable run: Week-1 45 min may be too much or too little; the Saturday run is the first thing to re-scale.
- Evening-only availability: Rules out ≥3 h separated same-day cardio, so cardio must live on non-lifting days or after the lift.

**Coach questions:**
- Can we add a short easy Sunday walk/run, or must training stay within Mon–Sat? — _A 7th easy day would let us reach 120 min/wk with shorter individual runs and less interference._
- The coach method lists cardio roles as health/conditioning/fat loss; I've used aerobic_base at 60–120 min/wk. Confirm that fits the method. — _The client's stated success includes running an hour, which is an endurance outcome rather than general health._
- Confirm stationary bike access on Friday evenings. — _Equipment state is 'assumed'; if unavailable, the elliptical substitutes 1:1._

**Decisions:**
- [warranted] Cardio is warranted now at aerobic_base, 90 min/wk in week 1. — Half the client's success definition is running an hour; recovery is not a limiter (7–8 h sleep, very consistent, no obstacles). (coach: t_cardio_roles; client: onboarding.what_you_want.successDefinition, onboarding.fuel_recovery.typicalSleep, onboarding.starting_point.recentConsistency; evidence: concept.cardio.dose#dose.individualize)
- [role] Role = aerobic_base, capped at 120 min/wk, not conditioning. — The goal is comfortable continuous running plus a heavy deadlift; low-intensity volume builds the former with least cost to the latter. (coach: t_conditioning_minutes; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.interval_training#intervals.distribution)
- [intensity] All sessions easy, controlled by full-conversation talk test (RPE 2–3); no intervals in this block. — Coach guides intensity by talk test/RPE, and keeping ~100% easy protects strength while still building aerobic base. (coach: g_intensity_guide; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [interference] No running on or the day before Monday/Thursday lower-body days; Friday same-visit cardio is stationary cycling, not running. — Running interferes with strength/hypertrophy where cycling does not, and same-session concurrent work costs more than separated work. (coach: —; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.concurrent_training#concurrent.modality_dose, concept.cardio.concurrent_training#concurrent.compatibility)
- [schedule] Wednesday 30 min run, Friday 15 min bike after lifting, Saturday 45 min run — 6 training days, all within the 75 min cap. — Client trains evenings only, so 3 h separation isn't possible; cardio goes on free days plus one low-cost post-lift add-on. (coach: —; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.your_week.preferredTrainingTime; evidence: concept.cardio.concurrent_training#concurrent.compatibility)
- [progression] 90→100→110→100 (easy week)→115→120 min, ≤20%/week, with an easy week in week 4 and intensity only in week 6. — Gradual volume-first progression, with duration tolerated before any moderate work is added. (coach: —; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.progression#progression.gradual, concept.cardio.progression#progression.ten_percent)
- [monitoring] Track talk test, RPE, session completion, lifting performance and recovery rating; review at week 4. — Lifting performance is the tripwire for too much running volume given the strength-first goal. (coach: —; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.individualize)
- [modality] Running for the two standalone sessions; stationary cycling for the post-lift session. — Specificity for the one-hour-run goal, with the lowest-interference modality on a lifting day. (coach: —; client: onboarding.your_week.trainingEnvironment; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)

**OPTIM review:** Week 1: 90 min of cardio (90 easy, 0 moderate, 0 vigorous; ≈90 moderate-equivalent min), 0 hard sessions, 6 training days counting resistance (approved program).
Quality flags: high_interference_modality: Wednesday: Running interferes with lower-body strength more than cycling (Wilson 2012) and a lower-interference option is available. | high_interference_modality: Saturday: Running interferes with lower-body strength more than cycling (Wilson 2012) and a lower-interference option is available.

## C06 — Beginner with limited equipment (home, no machines confirmed)

**Status:** PLANNED

**Context:** goal general_fitness · purpose health · coach roles health/conditioning · minutes {"fat_loss":[120,250],"health":[90,150],"aerobic_base":[60,120],"conditioning":[60,120]} · max hard 2 · easy-start weeks 2 · recovery-limited false · resistance none

**Warranted:** true · **Role:** health · **Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; talk test is valid for walking and needs no device, with RPE as a cross-check._

**Objective:** Build a consistent 4-day walking-based cardio habit, 105 min/week in week 1 progressing toward ~150 min/week of mostly moderate work. — _New trainee, not recently consistent, goal is health and consistency; coach's health role allows 90-150 min/week and general guidance supports 150 min/week moderate._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|
| Monday | steady | Walking | 25 | moderate | 4–5 | short_sentences | — | — | separate_day | Moderate aerobic base; brisk pace where speech is short sentences. |
| Wednesday | steady | Walking | 25 | moderate | 4–5 | short_sentences | — | — | separate_day | Repeat moderate dose to build weekly volume. |
| Friday | steady | Walking | 25 | easy | 3–3 | full_conversation | — | — | separate_day | Easy session to keep total load tolerable in the first weeks. |
| Saturday | steady | Walking | 30 | moderate | 4–6 | short_sentences | — | — | separate_day | Longest session of the week; weekend allows the full 30-minute cap. |

**Progression:** W1 105 min/0 hard (Start: 3x25 + 1x30 min, all steady, no hard work.) → W2 125 min/0 hard (Lengthen Mon/Wed/Fri to 30 min and Saturday stays 35 only if time allows; else 30/30/30/35 capped at 30 per visit - use 30/30/30/35 split across two short walks on Saturday.) → W3 140 min/0 hard (4x30 min plus one extra 20 min easy walk on any available day.) → W4 150 min/0 hard (Hold 4x30 plus 30 min of added easy walking; confirm all sessions completed before adding intensity.) → W5 150 min/1 hard (Same volume; convert Wednesday to intervals (8 rounds, 60 s fast walk/uphill at effort 7-8, 90 s easy at 3) only if weeks 1-4 were completed comfortably.) → W6 150 min/1 hard (Hold volume and one hard session; review.)

**Placement:** No resistance program is on file, so every session is its own session on an available day (Mon/Wed/Fri/Sat), each within the 30-minute cap and in the client's preferred evening slot.

**Monitoring:** talk_test, rpe, session_completion, steps, recovery_rating; review after 4 wk

**Adjustments:**
- All sessions completed for 2 weeks with effort at or below 5 (2 wk) → increase minutes: Add up to 20% weekly minutes, to a ceiling of 150 min/week.
- Sessions missed or effort consistently above 6 at a moderate pace (2 wk) → decrease minutes: Drop back to the previous week's total and hold.
- Weeks 1-4 tolerated; client wants more challenge (4 wk) → increase intensity: Add one interval session per week (max 2 hard sessions per coach bounds).
- Walking feels boring or joints ache (3 wk) → hold modality: Swap to stationary cycling or elliptical if the coach confirms equipment access.

**Assumptions:** Client can walk outdoors or on a treadmill in the evening; walking is listed as available equipment. · 'Limited equipment' means machine-based options (treadmill, bike, elliptical) may not be reliably available, so the plan uses walking only.

**Uncertainties:**
- Access to a treadmill, bike, elliptical or rower (all listed equipment-unknown): Would allow lower-impact or incline-based intervals from week 5 instead of fast walking.
- Terrain available for brisk/uphill walking: If flat and unvaried, reaching vigorous effort by walking may be hard; another modality would be needed for intervals.

**Coach questions:**
- Can the client access a treadmill, stationary bike or elliptical, or is this strictly outdoor walking? — _Those modalities are flagged equipment-unknown and determine the week-5 interval option._
- Is there a resistance program being written alongside this? None was provided. — _Session placement and interference rules would change if lifting days exist._
- Do you want a daily step target added for this client? — _No steps rule is set in the method, so none was planned._

**Decisions:**
- [warranted] Cardio is warranted now: 4 steady walking sessions per week, 105 min in week 1. — Untrained, not recently consistent, goal is general health and consistency; recovery is not a limiter and health guidance supports regular moderate activity. (coach: t_cardio_roles; client: onboarding.what_you_want.primaryGoal, onboarding.starting_point.recentConsistency, onboarding.starting_point.trainingExperience; evidence: concept.cardio.dose#dose.who, concept.cardio.dose#dose.acsm)
- [role] Role = health, 105 min week 1 rising to 150 min/week. — Coach allows health or conditioning; health matches the stated goal and its 90-150 min/week range covers the whole progression. (coach: t_cardio_health_minutes, t_cardio_roles; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.who)
- [modality] Walking for all sessions. — Only modality with confirmed equipment; zero skill demand, low impact, suits a beginner with limited equipment. (coach: —; client: onboarding.your_week.trainingEnvironment, onboarding.starting_point.trainingExperience; evidence: concept.cardio.dose#dose.individualize)
- [intensity] Talk test as the primary anchor (short sentences = moderate, full conversation = easy), with RPE 3-6 as a cross-check. — Coach guides intensity by talk test or RPE; talk test is validated for walking and requires no equipment. (coach: g_intensity_guide; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Mon/Wed/Fri 25 min, Sat 30 min, each a separate evening session within the 30-minute cap. — These are the only available days; the client's cap is 30 min per session and evenings are preferred. (coach: —; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.your_week.preferredTrainingTime; evidence: concept.cardio.dose#dose.individualize)
- [interference] No concurrent-training constraints applied; all sessions stand alone. — No resistance program was supplied, and walking is low lower-body interference in any case. (coach: —; client: —; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [progression] Weeks 1-4 all easy/moderate steady, volume rising 105->150 min at no more than 20% per week; first hard session only in week 5. — Beginner start requires 2 easy weeks, and duration should be tolerated before intensity is added; max 2 hard sessions/week. (coach: t_cardio_health_minutes; client: onboarding.starting_point.trainingExperience, onboarding.starting_point.recentConsistency; evidence: concept.cardio.progression#progression.gradual, concept.cardio.interval_training#intervals.distribution)
- [monitoring] Track talk test, RPE, session completion, steps and recovery rating; review at 4 weeks. — Completion is the key metric for a consistency goal, and talk test/RPE verify the intensity anchor is being applied. (coach: g_intensity_guide; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.individualize)

**OPTIM review:** Week 1: 105 min of cardio (25 easy, 80 moderate, 0 vigorous; ≈105 moderate-equivalent min), 0 hard sessions, 4 training days counting resistance (no resistance program supplied).

## C07A — Coach-confirmed restriction: no high-impact work (running excluded)

**Status:** PLANNED

**Context:** goal fat_loss · purpose fat_loss_support · coach roles fat_loss/health/conditioning · minutes {"fat_loss":[120,250],"health":[90,150],"aerobic_base":[60,120],"conditioning":[60,120]} · max hard 2 · easy-start weeks 0 · recovery-limited false · resistance none

**Warranted:** true · **Role:** fat_loss · **Intensity method:** rpe — _Coach guides intensity by talk test or RPE; RPE covers both steady and intervals, with talk test added on steady work as a cross-check._

**Objective:** 4 cardio sessions/week, 150 min in week 1 building to ~230 min, mostly easy-moderate steady with one short interval session, to add energy expenditure for fat loss without compromising lifting. — _Goal is fat loss; client is experienced, very consistent, sleeps 7-8h, has 6 available days and no recovery limiters, so he tolerates meaningful cardio volume now._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|
| Monday | steady | Incline treadmill walking | 40 | moderate | 4–6 | short_sentences | — | — | separate_day | Main moderate aerobic block; low joint stress, easy to repeat. (Treadmill assumed standard; set incline so effort stays 4-6 without holding handrails.) |
| Wednesday | steady | Stationary cycling | 35 | moderate | 4–6 | short_sentences | — | — | separate_day | Second moderate block on a low-interference modality. (Bike assumed available in a commercial gym.) |
| Friday | intervals | Stationary cycling | 25 | vigorous | 7–9 | — | — | 8×60s/90s @8–9/2–3 | separate_day | Time-efficient vigorous stimulus for fitness; cycling minimizes leg interference. (20 min of rounds plus ~5 min warm-up/cool-down inside the 25 min.) |
| Saturday | steady | Walking | 50 | easy | 2–3 | full_conversation | — | — | separate_day | Long easy session for extra expenditure with minimal recovery cost. |

**Progression:** W1 150 min/1 hard (Baseline: 3 steady + 1 interval session.) → W2 170 min/1 hard (+10 min Monday, +10 min Saturday.) → W3 185 min/1 hard (+15 min Saturday.) → W4 200 min/2 hard (+15 min; Wednesday becomes a second interval session only if weeks 1-3 completed in full.) → W5 215 min/2 hard (+15 min spread across steady sessions.) → W6 230 min/2 hard (+15 min; hold here and review.)

**Placement:** No resistance program was supplied, so all cardio is scheduled on separate days in the evening slots the client prefers; if lifting days are confirmed, hard cycling stays off the day of and day before lower-body lifting and walking is used instead. Each session is well under the 75 min cap.

**Monitoring:** rpe, talk_test, session_completion, bodyweight, lifting_performance, recovery_rating; review after 4 wk

**Adjustments:**
- Bodyweight flat for 3 weeks with full session completion (3 wk) → increase minutes: Add 15-20 min/week up to the 250 min ceiling, mostly easy walking.
- Lifting performance or recovery rating dropping (2 wk) → decrease intensity: Drop back to one hard session and keep steady work at effort 4-5.
- Sessions missed or schedule disrupted (2 wk) → hold frequency: Hold at 3 sessions/week and keep weekly minutes at the current level until completion is back to 100%.
- Knee or shin soreness from incline walking (1 wk) → hold modality: Swap incline walking for stationary cycling or elliptical at the same minutes.

**Assumptions:** Treadmill, stationary bike and elliptical are standard commercial-gym equipment and available. · Client trains resistance 4x/week but days are unknown; cardio was placed to be reschedulable.

**Uncertainties:**
- Resistance training days and whether they are lower-body dominant: Interval placement may need to move to avoid hard legs before a squat/deadlift day.
- Current nutrition/energy intake: Cardio alone gives modest fat loss; results depend on a moderate diet deficit.

**Coach questions:**
- Which days are his 4 resistance sessions, and which are lower-body focused? — _To keep the interval session off lower-body lifting days and the day before them._
- Is a moderate dietary deficit in place alongside this cardio? — _150-250 min/week improves weight loss mainly alongside moderate diet restriction._
- Do you want a daily step target added as a non-session lever? — _Your method sets no steps target; steps would be the cheapest way to add expenditure._

**Decisions:**
- [warranted] Cardio is warranted now at 150 min/week in week 1. — Fat-loss goal, experienced and consistent trainee, 6 available days, no recovery limiters; 150-250 min/week supports fat loss alongside moderate diet restriction. (coach: t_cardio_roles, t_cardio_fat_loss_minutes; client: onboarding.what_you_want.primaryGoal, onboarding.starting_point.recentConsistency, onboarding.your_week.availableDays; evidence: concept.cardio.weight_management#fatloss.dose, concept.cardio.dose#dose.who)
- [role] Role is fat_loss, dosed 150-230 min/week. — Primary goal is fat loss and the coach's fat-loss range is 120-250 min/week. (coach: t_cardio_fat_loss_minutes; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.weight_management#fatloss.dose)
- [intensity] RPE is the primary anchor, with talk test on steady sessions; steady at effort 2-6, intervals at 8-9. — Coach guides intensity by talk test or RPE; the talk test is not practical for intervals. (coach: g_intensity_guide; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Four evening sessions on Mon/Wed/Fri/Sat, all separate days, each ≤50 min. — Available days include all four; evening is preferred and the 75 min cap is respected with room for lifting. (coach: t_cardio_fat_loss_minutes; client: onboarding.your_week.availableDays, onboarding.your_week.preferredTrainingTime, onboarding.your_week.maxSessionLength; evidence: concept.cardio.dose#dose.individualize)
- [modality] Incline walking, stationary cycling and walking only; intervals on the bike. — All are low-interference, low-skill and gym-available; cycling interferes less with resistance outcomes than running. (coach: —; client: onboarding.your_week.trainingEnvironment; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [interference] No resistance program was provided; low-interference modalities chosen and cardio kept on separate days pending confirmation of lifting days. — Client reports 4 training sessions/week; separating modes by ≥3h or days protects strength outcomes. (coach: —; client: onboarding.starting_point.weeklyFrequency; evidence: concept.cardio.concurrent_training#concurrent.compatibility, concept.cardio.concurrent_training#concurrent.modality_dose)
- [progression] 150 → 230 min over 6 weeks, increases ≤20%/week, second hard session only from week 4. — Gradual volume-first progression with intensity added after duration is tolerated; hard sessions capped at 2. (coach: t_cardio_fat_loss_minutes; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.progression#progression.gradual, concept.cardio.interval_training#intervals.distribution)
- [monitoring] Track RPE, talk test, completion, bodyweight, lifting performance and recovery rating; review at week 4. — Fat-loss progress and interference with lifting are the two things that would change this plan. (coach: g_intensity_guide; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.individualize)

**OPTIM review:** Week 1: 150 min of cardio (50 easy, 75 moderate, 25 vigorous; ≈175 moderate-equivalent min), 1 hard session, 4 training days counting resistance (no resistance program supplied). Withheld: Running (impact at high — restricted at moderate or above).

## C07E — Medication or condition reported (no other flags): easy/moderate only, no heart-rate targets

**Status:** PLANNED

**Context:** goal general_fitness · purpose health · coach roles health/conditioning · minutes {"fat_loss":[120,250],"health":[90,150],"aerobic_base":[60,120],"conditioning":[60,120]} · max hard 0 · easy-start weeks 0 · recovery-limited false · resistance none

**Warranted:** true · **Role:** health · **Intensity method:** rpe — _Coach guides intensity by heart rate or RPE; the safety flag forbids heart-rate targets, so RPE is used, cross-checked with the talk test._

**Objective:** Build 120–150 min/week of easy-to-moderate steady cardio across 4 short sessions for general health and consistency. — _Client is experienced, consistent, trains 4 days/week and wants general health; a safety flag keeps all work easy-to-moderate with no heart-rate targets, so steady aerobic volume is the right lever._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|
| Monday | steady | Incline treadmill walking | 30 | moderate | 4–5 | short_sentences | — | — | separate_day | Low-impact aerobic volume (Set incline/speed so effort stays 4–5; no running.) |
| Wednesday | steady | Stationary cycling | 30 | moderate | 4–5 | short_sentences | — | — | separate_day | Non-impact aerobic volume, lowest lower-body interference |
| Friday | steady | Elliptical | 30 | moderate | 4–5 | short_sentences | — | — | separate_day | Aerobic volume with modality variety |
| Saturday | steady | Walking | 30 | easy | 2–3 | full_conversation | — | — | separate_day | Easy recovery-paced volume, easy to adhere to |

**Progression:** W1 120 min/0 hard (4 x 30 min, all easy-to-moderate) → W2 130 min/0 hard (Add ~10 min across the week (one session to 40 min)) → W3 140 min/0 hard (Add ~10 min; effort unchanged) → W4 150 min/0 hard (Top of the coach's health range; hold effort at 4–5) → W5 150 min/0 hard (Hold volume, confirm completion and recovery) → W6 150 min/0 hard (Hold; review with coach before any intensity change)

**Placement:** No resistance program was provided, so all cardio is scheduled on separate days within the client's available days, in the evening, each well under the 75 min session cap. If a resistance plan is added, Wednesday cycling and Saturday walking are the lowest-interference options to pair with lifting days.

**Monitoring:** rpe, talk_test, session_completion, resting_hr, bodyweight, recovery_rating; review after 4 wk

**Adjustments:**
- All sessions completed at effort 4–5 with easy recovery (4 wk) → increase minutes: Hold at the 150 min ceiling for the health role; discuss a conditioning role with the coach instead of adding volume
- Missed sessions or persistent fatigue/poor recovery ratings (2 wk) → decrease minutes: Drop back one week of progression (about 10–20 min/week) and keep effort at 3–4
- Coach clears the medical flag and removes the vigorous restriction (4 wk) → increase intensity: Only after duration is tolerated, convert one session to intervals — not before coach sign-off

**Assumptions:** Incline treadmill, stationary bike and elliptical are standard commercial-gym machines available to the client. · Evening training, 4 cardio days alongside existing training, fits the client's mostly predictable schedule.

**Uncertainties:**
- The reported medication/condition behind the safety flag: Caps all work at easy-to-moderate and blocks heart-rate targets and intervals; dose may need to be lower if symptoms appear
- No resistance program was supplied: Interference and same-day placement cannot be finalised; days may need to move once lifting days are known

**Coach questions:**
- Can you confirm the reported medication/condition and whether vigorous work and heart-rate targets can be re-enabled? — _Safety currently forbids vigorous intensity and HR zones, which removes your heart-rate intensity method and interval options._
- What are the client's 4 weekly resistance sessions and which are lower-body? — _Cardio days and modality choice should avoid leg-dominant work adjacent to lower-body lifting if training goals change._
- Confirm access to incline treadmill, stationary bike and elliptical at the commercial gym. — _These modalities are assumed, not verified._

**Decisions:**
- [warranted] Cardio is warranted now at 120–150 min/week — Client is experienced, consistent, not recovery-limited, and the goal is general health/consistency, which health guidance ties to ~150 min/week of moderate activity. (coach: t_cardio_roles, t_cardio_health_minutes; client: onboarding.what_you_want.primaryGoal, onboarding.starting_point.recentConsistency, onboarding.starting_point.trainingExperience; evidence: concept.cardio.dose#dose.acsm, concept.cardio.dose#dose.who)
- [role] Role = health, not conditioning — Primary goal is health and consistency; the health role's 90–150 min/week range fits the guideline dose. (coach: t_cardio_roles, t_cardio_health_minutes, t_conditioning_minutes; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.who)
- [intensity] RPE 4–5 (short sentences) for three sessions, RPE 2–3 for one; no heart-rate targets, no vigorous work or intervals — Coach guides by heart rate or RPE, but the safety flag forbids heart-rate targets and vigorous intensity; RPE with the talk test is a valid substitute. (coach: g_intensity_guide; client: onboarding.about_you.age; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation, concept.cardio.screening#screening.factors)
- [schedule] Four 30-minute sessions Mon/Wed/Fri/Sat, evenings, separate days — All days are in the client's availability, each session is far under the 75 min cap, and spacing supports adherence. (coach: t_cardio_health_minutes; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.your_week.preferredTrainingTime, onboarding.your_week.schedulePredictability; evidence: concept.cardio.dose#dose.individualize)
- [modality] Incline walking, stationary cycling, elliptical and walking; no running — All are low/no impact with low lower-body interference and need no skill; running is high impact and highest interference. (coach: —; client: onboarding.your_week.trainingEnvironment; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [interference] Default to low-interference modalities and separate days until the resistance plan is known — No resistance program was provided; cycling and walking minimise any concurrent-training cost and ≥3 h separation preserves strength outcomes. (coach: —; client: onboarding.starting_point.weeklyFrequency; evidence: concept.cardio.concurrent_training#concurrent.compatibility, concept.cardio.concurrent_training#concurrent.modality_dose)
- [progression] 120 → 150 min over 4 weeks (≤20%/week), zero hard sessions throughout — Gradual volume-only progression respects the max weekly increase and the zero hard-session cap; intensity is added only after duration is tolerated and the medical flag is cleared. (coach: t_cardio_health_minutes; client: onboarding.starting_point.recentConsistency; evidence: concept.cardio.progression#progression.gradual, concept.cardio.progression#progression.ten_percent)
- [monitoring] Track RPE, talk test, session completion, resting HR, bodyweight and recovery rating; review at 4 weeks — Resting HR and completion track aerobic adaptation and adherence without heart-rate targets, and symptoms must be watched given the safety flag. (coach: g_intensity_guide; client: —; evidence: concept.cardio.screening#screening.factors, concept.cardio.dose#dose.individualize)

**OPTIM review:** Week 1: 120 min of cardio (30 easy, 90 moderate, 0 vigorous; ≈120 moderate-equivalent min), 0 hard sessions, 4 training days counting resistance (no resistance program supplied).

## C08 — Approved schedule conflicts: program trains Saturday (client unavailable) and runs past the 60-min cap

**Status:** PLANNED

**Context:** goal hypertrophy · purpose resistance_support · coach roles health/conditioning · minutes {"fat_loss":[120,250],"health":[90,150],"aerobic_base":[60,120],"conditioning":[60,120]} · max hard 2 · easy-start weeks 0 · recovery-limited false · resistance Mon(L) 70m, Wed(U) 55m, Sat(L) 60m

**Warranted:** true · **Role:** health · **Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; no zones provided, and all sessions are steady-state where the talk test is valid._

**Objective:** 90–150 min/week of mostly moderate, low-interference cardio to support general health and work capacity without compromising the hypertrophy program. — _Client is experienced, consistent, recovering well (7–8h sleep, no obstacles) and has spare non-lifting days; cardio can meet health guidance while kept non-leg-dominant and away from lower-body lifting days._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|
| Tuesday | steady | Stationary cycling | 35 | moderate | 4–6 | short_sentences | — | — | separate_day | Main aerobic session; cycling minimizes interference with Monday lower-body work. (Day after lower-body lifting — keep strictly moderate, no sprints.) |
| Wednesday | steady | Elliptical | 20 | easy | 2–3 | full_conversation | — | — | separate_session | Easy aerobic volume on an upper-body lifting day. (Resistance is 55 min and the cap is 60, so this must be a separate session ≥3 h from lifting (e.g. morning cardio, evening lift).) |
| Thursday | steady | Stationary cycling | 30 | moderate | 4–6 | short_sentences | — | — | separate_day | Second aerobic session on a non-lifting day. |
| Friday | steady | Walking | 15 | easy | 2–3 | full_conversation | — | — | separate_day | Low-cost easy volume; kept easy and short because Saturday is a lower-body day. |

**Progression:** W1 100 min/0 hard (Establish 4 cardio touchpoints, all easy/moderate.) → W2 115 min/0 hard (+5 min Tuesday, +10 min Thursday; intensity unchanged.) → W3 130 min/0 hard (+10 min Thursday, +5 min Friday; intensity unchanged.) → W4 140 min/0 hard (+10 min across Tuesday/Wednesday; hold at top of health range and review.)

**Placement:** Monday and Saturday are lower-body resistance days, so no hard or leg-dominant cardio sits on them or the day before; Tuesday/Thursday are non-lifting days, Wednesday cardio is split from the upper-body lift by ≥3 h because 55+20 min exceeds the 60-min visit cap, and Friday is kept short and easy ahead of Saturday squats.

**Monitoring:** talk_test, rpe, session_completion, lifting_performance, recovery_rating, bodyweight; review after 4 wk

**Adjustments:**
- Lower-body lifting performance drops or legs feel heavy on Monday/Saturday (2 wk) → decrease minutes: Cut Tuesday to 20 min and drop Friday walk until lifting recovers.
- All sessions completed, recovery rating good, lifts progressing (4 wk) → increase minutes: Hold 140 min or add up to 10 min/week toward the 150-min ceiling.
- Sessions missed due to schedule (3 wk) → decrease frequency: Consolidate to three sessions of 35–45 min on Tue/Wed/Thu.
- Cycling feels monotonous or hips/knees complain (2 wk) → hold modality: Swap stationary cycling for elliptical or incline walking at matched talk-test intensity.

**Assumptions:** Stationary bike and elliptical are standard commercial-gym machines and available. · The Saturday resistance session happens despite Saturday not being listed as available; no cardio was placed there. · Hypertrophy is the priority, so no vigorous or interval cardio is scheduled even though the coach allows up to 2 hard sessions.

**Uncertainties:**
- Whether the client can split Wednesday cardio and lifting by ≥3 h given an evening-only preference: If not, Wednesday cardio should move to Thursday or be dropped (week-1 total falls to 80 min, below the health range).
- Actual weekly resistance frequency (client reports 4 sessions, program lists 3): A fourth lifting day could displace a cardio slot.

**Coach questions:**
- The approved program trains Saturday but the client listed only Mon–Fri as available — is Saturday confirmed, or should that lower-body day move? — _It determines whether Friday cardio must stay easy and whether another cardio slot opens up._
- Monday's resistance session is 70 min against a 60-min cap — should it be trimmed, and is same-visit cardio off the table there? — _No cardio was added Monday because the visit is already over cap._
- Can the client train Wednesday cardio in the morning and lift in the evening, given the stated evening preference? — _The 55+20 min combination exceeds the session cap, so they must be ≥3 h apart._
- Client reports 4 lifting sessions/week but the program lists 3 — which is current? — _Affects available cardio days and total weekly load._

**Decisions:**
- [warranted] Cardio is warranted at health dose (90–150 min/week). — Experienced, consistent client with good sleep, no recovery limiter, and free non-lifting days; health benefit available without threatening hypertrophy. (coach: t_cardio_roles, t_cardio_health_minutes; client: onboarding.starting_point.trainingExperience, onboarding.fuel_recovery.typicalSleep, onboarding.your_week.availableDays; evidence: concept.cardio.dose#dose.who, concept.cardio.dose#dose.individualize)
- [role] Role = health, not conditioning or fat loss. — Primary goal is muscle gain with no fat-loss or performance target; health is the supporting role the coach allows. (coach: t_cardio_roles, t_cardio_health_minutes; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.acsm)
- [modality] Stationary cycling and elliptical as main modalities; walking for easy volume; no running. — Cycling-type work has low lower-body interference and no impact, whereas running reduces hypertrophy and strength gains alongside lifting. (coach: —; client: onboarding.what_you_want.primaryGoal, onboarding.your_week.trainingEnvironment; evidence: concept.cardio.concurrent_training#concurrent.modality_dose)
- [intensity] Talk test as primary anchor: moderate = short sentences (RPE 4–6), easy = full conversation (RPE 2–3). No intervals or vigorous work. — Coach guides intensity by talk test/RPE and no heart-rate zones were supplied; steady modalities suit the talk test. (coach: g_intensity_guide; client: —; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Four sessions: Tue 35, Wed 20 (separate session), Thu 30, Fri 15 = 100 min in week 1. — Fits the 90–150 min health range, uses only available days, and keeps every visit under the 60-min cap. (coach: t_cardio_health_minutes; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength; evidence: concept.cardio.dose#dose.who)
- [interference] No hard or leg-dominant cardio on Monday/Saturday or the day before; Wednesday cardio separated from lifting by ≥3 h. — Hypertrophy goal with lower-body lifting on Mon/Sat; same-session concurrent work attenuates explosive strength more than 3-h separation. (coach: —; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.concurrent_training#concurrent.compatibility, concept.cardio.concurrent_training#concurrent.modality_dose)
- [progression] 100 → 115 → 130 → 140 min over 4 weeks, all increases ≤20%, intensity held constant. — Gradual volume progression before any intensity addition; duration must be tolerated first. (coach: t_cardio_health_minutes; client: onboarding.starting_point.recentConsistency; evidence: concept.cardio.progression#progression.gradual)
- [monitoring] Track talk test/RPE, session completion, lifting performance, recovery rating and bodyweight; review at week 4. — Lifting performance and recovery are the guardrails that tell the coach whether cardio volume is interfering. (coach: —; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.individualize)

**OPTIM review:** Week 1: 100 min of cardio (35 easy, 65 moderate, 0 vigorous; ≈100 moderate-equivalent min), 0 hard sessions, 6 training days counting resistance (approved program).
OPTIM questions: The approved resistance program trains on Saturday, which the client didn't list as available. | Resistance sessions on Monday already run past the client's 60-min cap — there's no room to add cardio to them.

## C13 — Optional-low-intensity coach, fat-loss client: recovery-only cardio, steps from the coach

**Status:** PLANNED

**Context:** goal fat_loss · purpose fat_loss_support · coach roles recovery · minutes {"fat_loss":[120,250],"health":[90,150],"aerobic_base":[60,120],"conditioning":[60,120]} · max hard 0 · easy-start weeks 0 · recovery-limited false · resistance none

**Warranted:** true · **Role:** recovery · **Intensity method:** talk_test — _Coach guides intensity by talk test or RPE; talk test is valid for walking, cycling and elliptical and keeps every session below threshold, which suits all-easy recovery work._

**Objective:** Easy low-intensity aerobic work 4x/week plus a daily step target to add energy expenditure and aid recovery without interfering with lifting. — _Client's goal is fat loss and he trains 4x/week consistently with no recovery limiters; the coach's method only permits optional low-intensity cardio, so all volume is easy recovery-style work._

| Day | Type | Modality | Min | Intensity | Effort | Talk | HR % | Intervals | Placement | Purpose |
|---|---|---|---|---|---|---|---|---|---|---|
| Monday | steady | Walking | 40 | easy | 2–3 | full_conversation | — | — | separate_day | Easy aerobic volume and daily energy expenditure |
| Wednesday | steady | Stationary cycling | 35 | easy | 2–3 | full_conversation | — | — | separate_day | Non-impact easy volume (Standard gym bike assumed; coach confirms availability.) |
| Friday | steady | Incline treadmill walking | 40 | easy | 3–3 | full_conversation | — | — | separate_day | Easy volume with slightly higher expenditure at the same effort (Keep incline low enough to hold full conversation; treadmill assumed.) |
| Saturday | steady | Walking | 35 | easy | 2–3 | full_conversation | — | — | separate_day | Weekend easy volume, outdoors if preferred |

**Steps:** 7000–10000 — _Coach's method sets a 7,000–10,000 steps/day target; daily steps carry most of the non-training expenditure for fat loss._

**Progression:** W1 150 min/0 hard (Start 4 easy sessions (40/35/40/35)) → W2 165 min/0 hard (+15 min spread across sessions) → W3 180 min/0 hard (+15 min; all sessions still easy) → W4 180 min/0 hard (Hold; confirm steps target is being met) → W5 200 min/0 hard (+20 min once duration is comfortable) → W6 210 min/0 hard (+10 min; review with coach)

**Placement:** No resistance program was provided, so every session is scheduled as a separate_day on available days; sessions are kept well under the 75-minute cap and spread Mon/Wed/Fri/Sat so no two easy sessions stack back-to-back around unknown lifting days.

**Monitoring:** talk_test, rpe, steps, bodyweight, session_completion, lifting_performance; review after 4 wk

**Adjustments:**
- Bodyweight flat over 3 weeks with steps and sessions completed (3 wk) → increase minutes: Add 15–20 min/week, still easy, up to the coach's ceiling before touching intensity
- Lifting performance drops or sessions get skipped (2 wk) → decrease frequency: Cut to 3 sessions/week and hold minutes
- Walking feels monotonous or adherence slips (2 wk) → hold modality: Swap walking for elliptical or bike at the same easy effort
- Steps consistently under 7,000 on non-training days (2 wk) → hold minutes: Shift volume toward daily walking rather than adding sessions

**Assumptions:** No resistance program was supplied, so cardio is placed on standalone days; days may need to move once lifting days are known. · Treadmill and stationary bike are standard commercial-gym equipment and available. · Weekly total of 150 min sits inside the coach's fat-loss (120–250) and health (90–150) budgets since no explicit minutes range exists for the recovery role.

**Uncertainties:**
- Which weekly minute budget applies to the coach's 'recovery' role: Weekly totals in weeks 5–6 may need to be capped lower
- Actual lifting days and whether any are lower-body dominant: Cardio days and modality choice may need to shift to avoid interference

**Coach questions:**
- Your method allows only an optional low-intensity recovery role, but this client's goal is fat loss — should I keep all cardio easy, or does fat loss unlock the 120–250 min/week fat-loss budget and higher intensities? — _Role and minute ceiling are coach-level decisions; I followed the method as written and kept everything easy._
- What are the client's 4 lifting days, and are any lower-body dominant? — _No resistance program was provided; placement and modality (walking vs bike) depend on it._
- Confirm treadmill and stationary bike availability at his gym. — _Both are assumed rather than confirmed equipment._

**Decisions:**
- [warranted] Cardio is warranted now, 4 easy sessions/week plus a step target — Client is experienced, very consistent, sleeps 7–8h with no recovery limiters and wants fat loss; added activity raises expenditure with low recovery cost. (coach: t_cardio_roles, g_steps_target; client: onboarding.what_you_want.primaryGoal, onboarding.fuel_recovery.typicalSleep, onboarding.starting_point.recentConsistency; evidence: concept.cardio.weight_management#fatloss.dose, concept.cardio.dose#dose.individualize)
- [role] Role is recovery (optional low-intensity), not a fat-loss conditioning block — Coach's method permits only the recovery role and low-intensity cardio, which overrides the client's goal-driven preference. (coach: t_cardio_roles; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.dose#dose.individualize)
- [intensity] All sessions easy, effort 2–3, held at full-conversation pace — Coach guides intensity by talk test/RPE and allows zero hard sessions; full conversation keeps work below threshold. (coach: g_intensity_guide, t_cardio_roles; client: —; evidence: concept.cardio.intensity#intensity.talk_test, concept.cardio.intensity#intensity.talk_test_regulation)
- [schedule] Mon/Wed/Fri/Sat standalone sessions of 35–40 min, 150 min week 1 — All four days are available, sessions are far under the 75-min cap, and spacing keeps easy work off consecutive days. (coach: t_cardio_fat_loss_minutes; client: onboarding.your_week.availableDays, onboarding.your_week.maxSessionLength, onboarding.your_week.schedulePredictability; evidence: concept.cardio.dose#dose.acsm, concept.cardio.dose#dose.who)
- [interference] Low-interference modalities only (walking, incline walking, cycling); no running or intervals — Lifting days are unknown and cycling/walking show less interference with strength and hypertrophy than running. (coach: t_cardio_roles; client: onboarding.starting_point.weeklyFrequency; evidence: concept.cardio.concurrent_training#concurrent.modality_dose, concept.cardio.concurrent_training#concurrent.compatibility)
- [progression] 150 → 210 min over 6 weeks, max +20 min in any week, zero hard sessions throughout — Weekly increases stay under the 20% cap and only duration rises, since the method permits no intensity progression. (coach: t_cardio_fat_loss_minutes, t_cardio_roles; client: onboarding.starting_point.trainingExperience; evidence: concept.cardio.progression#progression.gradual)
- [monitoring] Track talk test/RPE, steps, bodyweight, completion and lifting performance; review at week 4 — These are the measures that show whether easy volume is adding expenditure without eroding lifting quality. (coach: g_steps_target, g_intensity_guide; client: onboarding.what_you_want.primaryGoal; evidence: concept.cardio.weight_management#fatloss.dose)

**OPTIM review:** Week 1: 150 min of cardio (150 easy, 0 moderate, 0 vigorous; ≈150 moderate-equivalent min), 0 hard sessions, 4 training days counting resistance (no resistance program supplied).