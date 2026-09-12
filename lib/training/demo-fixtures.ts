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
