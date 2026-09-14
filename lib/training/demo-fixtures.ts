// Phase 4 — hand-authored universal Session fixtures proving the grammar is
// modality-agnostic end to end. These are NOT a generation engine (that
// remains Phase 5's scope, per the Phase 4 brief's explicit "no generation
// engine change") — they're the smallest safe, repository-supported path to
// a valid continuous/mixed live session, mirroring lib/mock-data.ts's own
// PUSH_WORKOUT (a real, hand-authored fixture, not a generator's output).
// Reachable today via lib/state.ts's LOAD_PRESET action (already the
// established pattern for "prove this architecture," used by
// buildCompletedDayPreset/buildAwaitingReviewPreset — neither of which has a
// dev-UI trigger either; see lib/state.ts's own module for why that's a
// consistent, not incomplete, tradeoff). A real coach-facing authoring
// surface for continuous items is deferred to the coach program editor's own
// planned UX phase.

import type { Block, Session } from "./types";

const SQUAT_BLOCK: Block = {
  id: "block-goblet-squat",
  kind: "straight",
  order: 1,
  items: [
    {
      id: "goblet-squat",
      order: 1,
      name: "Goblet Squat",
      category: "resistance",
      coachCue: "Sit between your heels, chest tall.",
      prescription: {
        family: "resistance",
        sets: 3,
        warmupSets: 1,
        reps: { low: 8, high: 10 },
        rpe: 7,
        restSeconds: 90,
        tempo: "2-0-1",
        load: { value: 35, unit: "lb" },
      },
    },
  ],
};

const BIKE_BLOCK: Block = {
  id: "block-bike",
  kind: "straight",
  order: 2,
  items: [
    {
      id: "zone2-bike",
      order: 2,
      name: "Stationary Bike",
      category: "continuous",
      coachCue: "Keep a conversational pace the whole time.",
      prescription: {
        family: "continuous",
        duration: { seconds: 20 * 60 },
        heartRate: { low: 135, high: 150, zoneLabel: "Zone 2" },
      },
    },
  ],
};

/** Acceptance case (Phase 4 spec section 13): one Session containing a
 * resistance block followed by a continuous block, proving Session does not
 * equal modality. */
export const MIXED_SESSION_DEMO: Session = {
  id: "mixed-session-demo",
  name: "Full Body + Zone 2",
  focus: "Strength and easy aerobic work",
  estimatedDurationMin: 45,
  coachNote: "Squats first, then an easy spin to finish.",
  blocks: [SQUAT_BLOCK, BIKE_BLOCK],
};

/** A pure continuous session (Phase 4 spec test A) — duration + heart-rate
 * target only, no distance/pace. */
export const CONTINUOUS_BIKE_SESSION_DEMO: Session = {
  id: "continuous-bike-session-demo",
  name: "Zone 2 Bike",
  focus: "Easy aerobic work",
  estimatedDurationMin: 30,
  blocks: [
    {
      id: "block-bike-solo",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "zone2-bike-solo",
          order: 1,
          name: "Stationary Bike",
          category: "continuous",
          coachCue: "Keep a conversational pace the whole time.",
          prescription: {
            family: "continuous",
            duration: { seconds: 30 * 60 },
            heartRate: { low: 135, high: 150, zoneLabel: "Zone 2" },
          },
        },
      ],
    },
  ],
};

/** A distance-based continuous session (Phase 4 spec test B) — distance +
 * pace target, no heart rate. */
export const CONTINUOUS_RUN_SESSION_DEMO: Session = {
  id: "continuous-run-session-demo",
  name: "Easy 5K",
  focus: "Aerobic base",
  estimatedDurationMin: 35,
  blocks: [
    {
      id: "block-run-solo",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "easy-run-solo",
          order: 1,
          name: "Easy Run",
          category: "continuous",
          coachCue: "Easy effort — you should be able to hold a conversation.",
          prescription: {
            family: "continuous",
            distance: { value: 5, unit: "km" },
            pace: { value: 6.5, unit: "min_per_km" },
          },
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Phase 11A — interval/HIIT fixtures. Mirror the continuous fixtures above
// exactly (a hand-authored universal Session, not a generation-engine
// output), proving the interval grammar/execution engine end to end. The
// time-based fixture matches the Phase 11A spec's own worked example
// verbatim (spec section 3/32A: "6 rounds, 45 sec hard @ RPE 9, 75 sec
// recovery"); the distance-based one matches spec section 32C's running
// example ("8 rounds, 400m work / 200m recovery, target pace on work").
// ---------------------------------------------------------------------------

/** Time-based interval — spec acceptance tests A/B/E/F/I/J/K/L/M/N/O/P/R. */
export const BIKE_INTERVALS_SESSION_DEMO: Session = {
  id: "bike-intervals-session-demo",
  name: "Bike Intervals",
  focus: "Anaerobic conditioning",
  estimatedDurationMin: 20,
  coachNote: "All-out on the work intervals — spin easy through recovery.",
  blocks: [
    {
      id: "block-bike-intervals",
      kind: "interval",
      order: 1,
      items: [
        {
          id: "bike-intervals-solo",
          order: 1,
          name: "Assault Bike Intervals",
          category: "interval",
          coachCue: "Max effort for the full work interval, every round.",
          prescription: {
            family: "interval",
            rounds: 6,
            workInterval: { seconds: 45 },
            recoveryInterval: { seconds: 75 },
            rpe: 9,
          },
        },
      ],
    },
  ],
};

/** Distance-based interval — spec acceptance test C. Recovery is itself
 * distance-based (recoveryDistance), proving that field end to end. */
export const RUN_INTERVALS_SESSION_DEMO: Session = {
  id: "run-intervals-session-demo",
  name: "Track Intervals",
  focus: "Speed / VO2max",
  estimatedDurationMin: 30,
  coachNote: "Hit the target pace on every rep — jog the recovery.",
  blocks: [
    {
      id: "block-run-intervals",
      kind: "interval",
      order: 1,
      items: [
        {
          id: "run-intervals-solo",
          order: 1,
          name: "400m Repeats",
          category: "interval",
          coachCue: "Even pacing across all 8 reps — don't blow up the first one.",
          prescription: {
            family: "interval",
            rounds: 8,
            distance: { value: 400, unit: "m" },
            pace: { value: 1.7, unit: "min_per_km" },
            recoveryDistance: { value: 200, unit: "m" },
          },
        },
      ],
    },
  ],
};

/** Acceptance test D — one real Session mixing warm-up, resistance, interval,
 * and a continuous/mobility-compatible cooldown, proving Session does not
 * equal modality even with interval in the mix (spec section 16/17's
 * "critical acceptance case"). Never a separate "HIIT workout engine" — the
 * SAME universal Session/Block/TrainingItemInstance the resistance-only and
 * pure-continuous fixtures above already use. */
export const MIXED_SESSION_WITH_INTERVALS_DEMO: Session = {
  id: "mixed-session-with-intervals-demo",
  name: "Full Body + Conditioning",
  focus: "Strength and conditioning",
  estimatedDurationMin: 50,
  coachNote: "Bench first, then bike intervals, then an easy cooldown walk.",
  blocks: [
    {
      id: "block-warmup",
      kind: "warmup",
      order: 1,
      items: [
        {
          id: "warmup-bike",
          order: 1,
          name: "Easy Spin Warm-up",
          category: "continuous",
          coachCue: "Light effort — just raise your heart rate a little.",
          prescription: { family: "continuous", duration: { seconds: 5 * 60 }, completionTarget: "Easy, conversational effort" },
        },
      ],
    },
    {
      id: "block-bench",
      kind: "straight",
      order: 2,
      items: [
        {
          id: "bench-press",
          order: 1,
          name: "Barbell Bench Press",
          category: "resistance",
          coachCue: "Full range of motion, controlled descent.",
          prescription: { family: "resistance", sets: 3, warmupSets: 1, reps: { low: 6, high: 8 }, rpe: 8, restSeconds: 120, load: { value: 135, unit: "lb" } },
        },
      ],
    },
    {
      id: "block-bike-intervals-mixed",
      kind: "interval",
      order: 3,
      items: [
        {
          id: "bike-intervals-mixed",
          order: 1,
          name: "Assault Bike Intervals",
          category: "interval",
          coachCue: "Max effort for the full work interval, every round.",
          prescription: { family: "interval", rounds: 4, workInterval: { seconds: 30 }, recoveryInterval: { seconds: 60 }, rpe: 9 },
        },
      ],
    },
    {
      id: "block-cooldown",
      kind: "cooldown",
      order: 4,
      items: [
        {
          id: "cooldown-walk",
          order: 1,
          name: "Cooldown Walk",
          category: "continuous",
          coachCue: "Easy walk to bring your heart rate down.",
          prescription: { family: "continuous", duration: { seconds: 5 * 60 }, completionTarget: "Very easy" },
        },
      ],
    },
  ],
};
