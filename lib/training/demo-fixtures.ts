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

// ---------------------------------------------------------------------------
// Phase 11B — circuit/grouped-training fixtures. Mirror the interval
// fixtures above exactly (hand-authored universal Session, never a
// generation-engine output), proving the circuit grammar/execution engine
// end to end. BASIC_CIRCUIT_SESSION_DEMO matches the Phase 11B spec's own
// required acceptance case verbatim (spec section 39): "3 rounds: Goblet
// Squat 12, Push-Up 15, Bike 30 sec, 90 sec round rest."
// ---------------------------------------------------------------------------

export const BASIC_CIRCUIT_SESSION_DEMO: Session = {
  id: "basic-circuit-session-demo",
  name: "Full Body Conditioning",
  focus: "Conditioning circuit",
  estimatedDurationMin: 20,
  coachNote: "Move with control through each round — quality over speed.",
  blocks: [
    {
      id: "block-full-body-circuit",
      kind: "circuit",
      order: 1,
      rounds: 3,
      restBetweenItemsSeconds: 15,
      restBetweenRoundsSeconds: 90,
      items: [
        {
          id: "circuit-goblet-squat",
          order: 1,
          name: "Goblet Squat",
          category: "resistance",
          coachCue: "Sit between your heels, chest tall.",
          prescription: { family: "resistance", reps: { low: 12, high: 12 }, load: { value: 35, unit: "lb" } },
        },
        {
          id: "circuit-push-up",
          order: 2,
          name: "Push-Up",
          category: "resistance",
          coachCue: "Full range of motion — knees down is fine.",
          prescription: { family: "resistance", reps: { low: 15, high: 15 } },
        },
        {
          id: "circuit-bike",
          order: 3,
          name: "Assault Bike",
          category: "continuous",
          coachCue: "All-out effort for the full 30 seconds.",
          prescription: { family: "continuous", duration: { seconds: 30 } },
        },
      ],
    },
  ],
};

/** Acceptance test D/44 — one real Session mixing warm-up, resistance,
 * circuit, an interval finisher, AND a cooldown, proving Session does not
 * equal modality even with BOTH circuit and interval in the same session
 * (spec section 22's "critical acceptance case"). Never a separate
 * "circuit workout engine" — the SAME universal Session/Block/
 * TrainingItemInstance every other fixture above already uses. */
export const MIXED_SESSION_WITH_CIRCUIT_DEMO: Session = {
  id: "mixed-session-with-circuit-demo",
  name: "Full Body + Conditioning Finisher",
  focus: "Strength and conditioning",
  estimatedDurationMin: 55,
  coachNote: "Bench first, then the circuit, then a short interval finisher, then cool down.",
  blocks: [
    {
      id: "block-warmup-circuit-mixed",
      kind: "warmup",
      order: 1,
      items: [
        {
          id: "warmup-row",
          order: 1,
          name: "Easy Row",
          category: "continuous",
          coachCue: "Light effort — just raise your heart rate a little.",
          prescription: { family: "continuous", duration: { seconds: 5 * 60 }, completionTarget: "Easy, conversational effort" },
        },
      ],
    },
    {
      id: "block-bench-circuit-mixed",
      kind: "straight",
      order: 2,
      items: [
        {
          id: "bench-press-circuit-mixed",
          order: 1,
          name: "Barbell Bench Press",
          category: "resistance",
          coachCue: "Full range of motion, controlled descent.",
          prescription: { family: "resistance", sets: 3, warmupSets: 1, reps: { low: 6, high: 8 }, rpe: 8, restSeconds: 120, load: { value: 135, unit: "lb" } },
        },
      ],
    },
    {
      id: "block-circuit-mixed",
      kind: "circuit",
      order: 3,
      rounds: 2,
      restBetweenItemsSeconds: 15,
      restBetweenRoundsSeconds: 60,
      items: [
        {
          id: "circuit-mixed-squat",
          order: 1,
          name: "Goblet Squat",
          category: "resistance",
          coachCue: "Sit between your heels, chest tall.",
          prescription: { family: "resistance", reps: { low: 12, high: 12 }, load: { value: 35, unit: "lb" } },
        },
        {
          id: "circuit-mixed-pushup",
          order: 2,
          name: "Push-Up",
          category: "resistance",
          coachCue: "Full range of motion — knees down is fine.",
          prescription: { family: "resistance", reps: { low: 15, high: 15 } },
        },
      ],
    },
    {
      id: "block-interval-finisher-mixed",
      kind: "interval",
      order: 4,
      items: [
        {
          id: "interval-finisher-mixed",
          order: 1,
          name: "Assault Bike Finisher",
          category: "interval",
          coachCue: "Max effort for the full work interval, every round.",
          prescription: { family: "interval", rounds: 4, workInterval: { seconds: 20 }, recoveryInterval: { seconds: 40 }, rpe: 9 },
        },
      ],
    },
    {
      id: "block-cooldown-circuit-mixed",
      kind: "cooldown",
      order: 5,
      items: [
        {
          id: "cooldown-walk-circuit-mixed",
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

// ---------------------------------------------------------------------------
// Phase 11C — power/plyometric and mobility/flexibility fixtures. Mirror the
// interval/circuit fixtures above exactly (hand-authored universal Session,
// never a generation-engine output), matching the Phase 11C spec's own
// required acceptance cases verbatim (sections 33-38).
// ---------------------------------------------------------------------------

/** Spec section 33's exact acceptance case: "Box Jump, 4 sets x 3 reps,
 * 2:00 rest." */
export const BOX_JUMP_POWER_SESSION_DEMO: Session = {
  id: "box-jump-power-session-demo",
  name: "Power Development",
  focus: "Lower-body power",
  estimatedDurationMin: 20,
  coachNote: "Full recovery between sets — quality over fatigue.",
  blocks: [
    {
      id: "block-box-jump",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "power-box-jump",
          order: 1,
          name: "Box Jump",
          category: "power",
          coachCue: "Maximum intent on the jump — stick each landing before resetting.",
          prescription: { family: "power", sets: 4, reps: { low: 3, high: 3 }, restSeconds: 120 },
        },
      ],
    },
  ],
};

/** Spec section 34's exact acceptance case: "Pogo Jump, 3 x 20 contacts" —
 * proves contacts remain contacts, never dishonestly converted to reps. */
export const POGO_JUMP_CONTACTS_SESSION_DEMO: Session = {
  id: "pogo-jump-contacts-session-demo",
  name: "Reactive Power",
  focus: "Ground contact time",
  estimatedDurationMin: 15,
  coachNote: "Stay tall, minimize ground contact time.",
  blocks: [
    {
      id: "block-pogo-jump",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "power-pogo-jump",
          order: 1,
          name: "Pogo Jump",
          category: "power",
          coachCue: "Quick, springy contacts — stay off your heels.",
          prescription: { family: "power", sets: 3, contacts: 20, restSeconds: 60 },
        },
      ],
    },
  ],
};

/** Spec section 35's exact acceptance case: "Bounds, 3 x 20 m" — distance
 * prescription and actuals via the real distance primitive, never reps. */
export const BOUNDS_DISTANCE_POWER_SESSION_DEMO: Session = {
  id: "bounds-distance-power-session-demo",
  name: "Horizontal Power",
  focus: "Bounding",
  estimatedDurationMin: 15,
  coachNote: "Reset fully between each bounding effort.",
  blocks: [
    {
      id: "block-bounds",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "power-bounds",
          order: 1,
          name: "Bounds",
          category: "power",
          coachCue: "Drive forward and up — maximum distance per contact.",
          prescription: { family: "power", sets: 3, distance: { value: 20, unit: "m" }, restSeconds: 90 },
        },
      ],
    },
  ],
};

/** Spec section 36's exact acceptance case: "Couch Stretch, 2 sets, 45 sec
 * / side" — a hold-duration mobility item requiring both sides resolved
 * separately per set. */
export const COUCH_STRETCH_MOBILITY_SESSION_DEMO: Session = {
  id: "couch-stretch-mobility-session-demo",
  name: "Hip Flexor Mobility",
  focus: "Mobility",
  estimatedDurationMin: 10,
  coachNote: "Keep your ribs down — this should feel like a stretch, not strain.",
  blocks: [
    {
      id: "block-couch-stretch",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "mobility-couch-stretch",
          order: 1,
          name: "Couch Stretch",
          category: "mobility",
          coachCue: "Squeeze the glute on the stretched side.",
          prescription: { family: "mobility", sets: 2, duration: { seconds: 45 }, side: "bilateral" },
        },
      ],
    },
  ],
};

/** Spec section 37's exact acceptance case: "90/90 Hip Rotation, 2 x 10 /
 * side" — rep-based mobility with side semantics, never cardio/continuous
 * misclassification. */
export const HIP_ROTATION_MOBILITY_SESSION_DEMO: Session = {
  id: "hip-rotation-mobility-session-demo",
  name: "Hip Mobility",
  focus: "Mobility",
  estimatedDurationMin: 10,
  coachNote: "Control through the full range — no momentum.",
  blocks: [
    {
      id: "block-hip-rotation",
      kind: "straight",
      order: 1,
      items: [
        {
          id: "mobility-hip-rotation",
          order: 1,
          name: "90/90 Hip Rotation",
          category: "mobility",
          coachCue: "Keep both sit bones on the floor.",
          prescription: { family: "mobility", sets: 2, reps: { low: 10, high: 10 }, side: "alternating" },
        },
      ],
    },
  ],
};

/** Spec section 39's exact acceptance case: a circuit containing a power
 * item (Pogo Jump — contacts) alongside resistance and continuous items —
 * proves Phase 11B's repeated-exposure architecture supports power without
 * circuit-specific hacks. */
export const CIRCUIT_WITH_POWER_ITEM_DEMO: Session = {
  id: "circuit-with-power-item-demo",
  name: "Athletic Circuit",
  focus: "Power and conditioning circuit",
  estimatedDurationMin: 20,
  coachNote: "Move with intent through each round.",
  blocks: [
    {
      id: "block-athletic-circuit",
      kind: "circuit",
      order: 1,
      rounds: 3,
      restBetweenItemsSeconds: 15,
      restBetweenRoundsSeconds: 90,
      items: [
        {
          id: "circuit-power-pogo-jump",
          order: 1,
          name: "Pogo Jump",
          category: "power",
          coachCue: "Quick, springy contacts.",
          prescription: { family: "power", contacts: 15 },
        },
        {
          id: "circuit-power-push-up",
          order: 2,
          name: "Push-Up",
          category: "resistance",
          coachCue: "Full range of motion — knees down is fine.",
          prescription: { family: "resistance", reps: { low: 12, high: 12 } },
        },
        {
          id: "circuit-power-bike",
          order: 3,
          name: "Assault Bike",
          category: "continuous",
          coachCue: "All-out effort for the full 30 seconds.",
          prescription: { family: "continuous", duration: { seconds: 30 } },
        },
      ],
    },
  ],
};

/** Phase 12B's own worked example: a circuit containing a bilateral/
 * alternating mobility item (Couch Stretch, / side) alongside a power item
 * and a resistance item — proves a sided mobility item's left/right
 * exposures resolve distinctly inside a real circuit round, exactly the
 * fidelity standalone mobility execution already had (see
 * COUCH_STRETCH_MOBILITY_SESSION_DEMO's own doc), never collapsed into one
 * generic per-round record. */
export const CIRCUIT_WITH_SIDED_MOBILITY_ITEM_DEMO: Session = {
  id: "circuit-with-sided-mobility-item-demo",
  name: "Mobility-Athletic Circuit",
  focus: "Power, mobility, and conditioning circuit",
  estimatedDurationMin: 18,
  coachNote: "Both sides, every round — don't rush the stretch.",
  blocks: [
    {
      id: "block-sided-mobility-circuit",
      kind: "circuit",
      order: 1,
      rounds: 3,
      restBetweenItemsSeconds: 15,
      restBetweenRoundsSeconds: 90,
      items: [
        {
          id: "circuit-sided-pogo-jump",
          order: 1,
          name: "Pogo Jump",
          category: "power",
          coachCue: "Quick, springy contacts.",
          prescription: { family: "power", contacts: 15 },
        },
        {
          id: "circuit-sided-couch-stretch",
          order: 2,
          name: "Couch Stretch",
          category: "mobility",
          coachCue: "Squeeze the glute on the stretched side.",
          prescription: { family: "mobility", duration: { seconds: 30 }, side: "bilateral" },
        },
        {
          id: "circuit-sided-push-up",
          order: 3,
          name: "Push-Up",
          category: "resistance",
          coachCue: "Full range of motion — knees down is fine.",
          prescription: { family: "resistance", reps: { low: 10, high: 10 } },
        },
      ],
    },
  ],
};

/** Spec section 38's own "critical acceptance session": mobility warm-up
 * -> Box Jump power -> Squat resistance -> conditioning circuit -> bike
 * intervals -> mobility cooldown, ALL through the one universal Session
 * engine — never a modality-specific workout shell. */
export const MIXED_SESSION_WITH_POWER_AND_MOBILITY_DEMO: Session = {
  id: "mixed-session-with-power-and-mobility-demo",
  name: "Full Athletic Session",
  focus: "Power, strength, and conditioning",
  estimatedDurationMin: 65,
  coachNote: "Mobility first, then power while fresh, then strength, then conditioning, then cool down.",
  blocks: [
    {
      id: "block-warmup-mobility-full",
      kind: "warmup",
      order: 1,
      items: [
        {
          id: "warmup-hip-rotation-full",
          order: 1,
          name: "90/90 Hip Rotation",
          category: "mobility",
          coachCue: "Control through the full range.",
          prescription: { family: "mobility", sets: 1, reps: { low: 8, high: 8 }, side: "alternating" },
        },
      ],
    },
    {
      id: "block-power-full",
      kind: "straight",
      order: 2,
      items: [
        {
          id: "power-box-jump-full",
          order: 1,
          name: "Box Jump",
          category: "power",
          coachCue: "Maximum intent — stick each landing.",
          prescription: { family: "power", sets: 4, reps: { low: 3, high: 3 }, restSeconds: 120 },
        },
      ],
    },
    {
      id: "block-squat-full",
      kind: "straight",
      order: 3,
      items: [
        {
          id: "resistance-squat-full",
          order: 1,
          name: "Back Squat",
          category: "resistance",
          coachCue: "Full depth, controlled descent.",
          prescription: { family: "resistance", sets: 4, reps: { low: 5, high: 5 }, rpe: 8, restSeconds: 150, load: { value: 185, unit: "lb" } },
        },
      ],
    },
    {
      id: "block-circuit-full",
      kind: "circuit",
      order: 4,
      rounds: 2,
      restBetweenItemsSeconds: 15,
      restBetweenRoundsSeconds: 60,
      items: [
        {
          id: "circuit-full-squat",
          order: 1,
          name: "Goblet Squat",
          category: "resistance",
          coachCue: "Sit between your heels, chest tall.",
          prescription: { family: "resistance", reps: { low: 12, high: 12 }, load: { value: 35, unit: "lb" } },
        },
        {
          id: "circuit-full-pushup",
          order: 2,
          name: "Push-Up",
          category: "resistance",
          coachCue: "Full range of motion — knees down is fine.",
          prescription: { family: "resistance", reps: { low: 15, high: 15 } },
        },
      ],
    },
    {
      id: "block-intervals-full",
      kind: "interval",
      order: 5,
      items: [
        {
          id: "interval-bike-full",
          order: 1,
          name: "Assault Bike Intervals",
          category: "interval",
          coachCue: "Max effort for the full work interval, every round.",
          prescription: { family: "interval", rounds: 4, workInterval: { seconds: 20 }, recoveryInterval: { seconds: 40 }, rpe: 9 },
        },
      ],
    },
    {
      id: "block-cooldown-mobility-full",
      kind: "cooldown",
      order: 6,
      items: [
        {
          id: "cooldown-couch-stretch-full",
          order: 1,
          name: "Couch Stretch",
          category: "mobility",
          coachCue: "Squeeze the glute on the stretched side.",
          prescription: { family: "mobility", sets: 1, duration: { seconds: 45 }, side: "bilateral" },
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Phase 11D — custom coach methods (AMRAP, EMOM/E2MOM, time-capped
// circuit). Mirror the interval/circuit/power/mobility fixtures above
// exactly (hand-authored universal Session, never a generation-engine
// output), matching the Phase 11D spec's own required acceptance cases
// verbatim (sections 41-46).
// ---------------------------------------------------------------------------

/** Spec section 41's exact acceptance case: "12-Minute Conditioning" —
 * 12-minute AMRAP: 8 Goblet Squats, 10 Push-Ups, 12 cal Bike. */
export const AMRAP_CONDITIONING_SESSION_DEMO: Session = {
  id: "amrap-conditioning-session-demo",
  name: "12-Minute Conditioning",
  focus: "AMRAP conditioning",
  estimatedDurationMin: 15,
  coachNote: "Pace yourself — consistent rounds beat a fast start that fades.",
  blocks: [
    {
      id: "block-amrap-conditioning",
      kind: "circuit",
      order: 1,
      terminationMode: "time_cap",
      timeCapSeconds: 12 * 60,
      items: [
        {
          id: "amrap-goblet-squat",
          order: 1,
          name: "Goblet Squat",
          category: "resistance",
          coachCue: "Full depth, controlled tempo.",
          prescription: { family: "resistance", reps: { low: 8, high: 8 }, load: { value: 35, unit: "lb" } },
        },
        {
          id: "amrap-push-up",
          order: 2,
          name: "Push-Up",
          category: "resistance",
          coachCue: "Full range of motion — knees down is fine.",
          prescription: { family: "resistance", reps: { low: 10, high: 10 } },
        },
        {
          id: "amrap-bike",
          order: 3,
          name: "Assault Bike",
          category: "continuous",
          coachCue: "Steady, sustainable pace.",
          prescription: { family: "continuous", completionTarget: "12 calories" },
        },
      ],
    },
  ],
};

/** Spec section 44's exact acceptance case: a coach-named protocol —
 * "Elon Death Set Finisher From Hell" — underneath which is a genuinely
 * structured 10-minute AMRAP with 3 real items. Proves the name is pure
 * display data: nothing in the runtime ever branches on it (spec section
 * 30). */
export const CUSTOM_NAMED_AMRAP_SESSION_DEMO: Session = {
  id: "custom-named-amrap-session-demo",
  name: "Finisher",
  focus: "AMRAP conditioning finisher",
  estimatedDurationMin: 12,
  coachNote: "All-out effort for the full 10 minutes.",
  blocks: [
    {
      id: "block-elon-death-set",
      kind: "circuit",
      order: 1,
      name: "Elon Death Set Finisher From Hell",
      terminationMode: "time_cap",
      timeCapSeconds: 10 * 60,
      items: [
        {
          id: "death-set-thruster",
          order: 1,
          name: "DB Thruster",
          category: "resistance",
          coachCue: "Full lockout overhead.",
          prescription: { family: "resistance", reps: { low: 10, high: 10 }, load: { value: 25, unit: "lb" } },
        },
        {
          id: "death-set-burpee",
          order: 2,
          name: "Burpee",
          category: "resistance",
          coachCue: "Chest to the floor, full jump at the top.",
          prescription: { family: "resistance", reps: { low: 8, high: 8 } },
        },
        {
          id: "death-set-bike",
          order: 3,
          name: "Bike",
          category: "continuous",
          coachCue: "Max sustainable effort.",
          prescription: { family: "continuous", completionTarget: "12 calories" },
        },
      ],
    },
  ],
};

/** Spec section 42's exact acceptance case: a 10-minute EMOM alternating
 * odd (Bike) and even (Burpees) windows. `items` is the real, distinct
 * cycling pool — never pre-expanded per window (see
 * lib/workout/emom.ts's own emomItemForWindow doc). */
export const EMOM_ALTERNATING_SESSION_DEMO: Session = {
  id: "emom-alternating-session-demo",
  name: "10-Minute EMOM",
  focus: "EMOM conditioning",
  estimatedDurationMin: 10,
  coachNote: "Get your work done early in the window — the rest is real recovery.",
  blocks: [
    {
      id: "block-emom-alternating",
      kind: "emom",
      order: 1,
      cadenceSeconds: 60,
      rounds: 10,
      items: [
        {
          id: "emom-bike",
          order: 1,
          name: "Bike",
          category: "continuous",
          coachCue: "Hard, controlled effort.",
          prescription: { family: "continuous", completionTarget: "10 calories" },
        },
        {
          id: "emom-burpee",
          order: 2,
          name: "Burpee",
          category: "resistance",
          coachCue: "Chest to the floor, full jump at the top.",
          prescription: { family: "resistance", reps: { low: 8, high: 8 } },
        },
      ],
    },
  ],
};

/** Spec section 43's exact acceptance case: "Every 2 minutes x 6: 5 Box
 * Jumps, 8 Push-Ups" — the SAME EMOM engine, generalized cadenceSeconds
 * (120), no special E2MOM code (spec section 11). */
export const E2MOM_SESSION_DEMO: Session = {
  id: "e2mom-session-demo",
  name: "E2MOM x 6",
  focus: "E2MOM power/conditioning",
  estimatedDurationMin: 12,
  coachNote: "Full recovery within the 2-minute window before the next round.",
  blocks: [
    {
      id: "block-e2mom",
      kind: "emom",
      order: 1,
      cadenceSeconds: 120,
      rounds: 6,
      items: [
        {
          id: "e2mom-box-jump",
          order: 1,
          name: "Box Jump",
          category: "power",
          coachCue: "Maximum intent — stick each landing.",
          prescription: { family: "power", reps: { low: 5, high: 5 } },
        },
        {
          id: "e2mom-push-up",
          order: 2,
          name: "Push-Up",
          category: "resistance",
          coachCue: "Full range of motion.",
          prescription: { family: "resistance", reps: { low: 8, high: 8 } },
        },
      ],
    },
  ],
};

/** Spec section 45's exact acceptance case: "4 rounds OR 10-minute cap,
 * whichever comes first." A completely ordinary fixed-round circuit
 * otherwise — same restBetweenItemsSeconds/restBetweenRoundsSeconds
 * semantics, same >=2-item rule, real rounds AND a real time cap. */
export const TIME_CAPPED_CIRCUIT_SESSION_DEMO: Session = {
  id: "time-capped-circuit-session-demo",
  name: "Time-Capped Conditioning Circuit",
  focus: "Time-capped circuit",
  estimatedDurationMin: 15,
  coachNote: "Push the pace — but if the clock runs out, wherever you are is where you finish.",
  blocks: [
    {
      id: "block-time-capped-circuit",
      kind: "circuit",
      order: 1,
      rounds: 4,
      terminationMode: "rounds_or_time_cap",
      timeCapSeconds: 10 * 60,
      restBetweenItemsSeconds: 10,
      restBetweenRoundsSeconds: 60,
      items: [
        {
          id: "time-capped-kb-swing",
          order: 1,
          name: "Kettlebell Swing",
          category: "resistance",
          coachCue: "Drive through the hips.",
          prescription: { family: "resistance", reps: { low: 15, high: 15 }, load: { value: 35, unit: "lb" } },
        },
        {
          id: "time-capped-box-step",
          order: 2,
          name: "Box Step-Up",
          category: "resistance",
          coachCue: "Full extension at the top.",
          prescription: { family: "resistance", reps: { low: 10, high: 10 } },
        },
      ],
    },
  ],
};

/** Spec section 46's exact acceptance case ("critical acceptance session"):
 * mobility -> Box Jump power -> Bench Press resistance -> circuit -> AMRAP
 * -> EMOM finisher -> mobility cooldown, ALL through the one universal
 * Session engine — never a modality-specific workout shell, and never a
 * separate "custom workout" runtime for the AMRAP/EMOM blocks. */
export const MIXED_SESSION_WITH_CUSTOM_METHODS_DEMO: Session = {
  id: "mixed-session-with-custom-methods-demo",
  name: "Full Athletic Session with Finishers",
  focus: "Power, strength, and conditioning",
  estimatedDurationMin: 75,
  coachNote: "Mobility first, then power, then strength, then two real conditioning finishers, then cool down.",
  blocks: [
    {
      id: "block-warmup-mobility-methods",
      kind: "warmup",
      order: 1,
      items: [
        {
          id: "warmup-hip-rotation-methods",
          order: 1,
          name: "90/90 Hip Rotation",
          category: "mobility",
          coachCue: "Control through the full range.",
          prescription: { family: "mobility", sets: 1, reps: { low: 8, high: 8 }, side: "alternating" },
        },
      ],
    },
    {
      id: "block-power-methods",
      kind: "straight",
      order: 2,
      items: [
        {
          id: "power-box-jump-methods",
          order: 1,
          name: "Box Jump",
          category: "power",
          coachCue: "Maximum intent — stick each landing.",
          prescription: { family: "power", sets: 3, reps: { low: 3, high: 3 }, restSeconds: 120 },
        },
      ],
    },
    {
      id: "block-bench-methods",
      kind: "straight",
      order: 3,
      items: [
        {
          id: "resistance-bench-methods",
          order: 1,
          name: "Barbell Bench Press",
          category: "resistance",
          coachCue: "Full range of motion, controlled descent.",
          prescription: { family: "resistance", sets: 3, reps: { low: 6, high: 8 }, rpe: 8, restSeconds: 120, load: { value: 135, unit: "lb" } },
        },
      ],
    },
    {
      id: "block-circuit-methods",
      kind: "circuit",
      order: 4,
      rounds: 2,
      restBetweenItemsSeconds: 15,
      restBetweenRoundsSeconds: 60,
      items: [
        {
          id: "circuit-methods-squat",
          order: 1,
          name: "Goblet Squat",
          category: "resistance",
          coachCue: "Sit between your heels, chest tall.",
          prescription: { family: "resistance", reps: { low: 12, high: 12 }, load: { value: 35, unit: "lb" } },
        },
        {
          id: "circuit-methods-pushup",
          order: 2,
          name: "Push-Up",
          category: "resistance",
          coachCue: "Full range of motion — knees down is fine.",
          prescription: { family: "resistance", reps: { low: 15, high: 15 } },
        },
      ],
    },
    {
      id: "block-amrap-methods",
      kind: "circuit",
      order: 5,
      name: "Conditioning AMRAP",
      terminationMode: "time_cap",
      timeCapSeconds: 6 * 60,
      items: [
        {
          id: "amrap-methods-squat",
          order: 1,
          name: "Air Squat",
          category: "resistance",
          coachCue: "Full depth.",
          prescription: { family: "resistance", reps: { low: 15, high: 15 } },
        },
        {
          id: "amrap-methods-situp",
          order: 2,
          name: "Sit-Up",
          category: "resistance",
          coachCue: "Full range of motion.",
          prescription: { family: "resistance", reps: { low: 10, high: 10 } },
        },
      ],
    },
    {
      id: "block-emom-methods",
      kind: "emom",
      order: 6,
      name: "EMOM Finisher",
      cadenceSeconds: 60,
      rounds: 4,
      items: [
        {
          id: "emom-methods-burpee",
          order: 1,
          name: "Burpee",
          category: "resistance",
          coachCue: "Chest to the floor, full jump at the top.",
          prescription: { family: "resistance", reps: { low: 8, high: 8 } },
        },
      ],
    },
    {
      id: "block-cooldown-mobility-methods",
      kind: "cooldown",
      order: 7,
      items: [
        {
          id: "cooldown-couch-stretch-methods",
          order: 1,
          name: "Couch Stretch",
          category: "mobility",
          coachCue: "Squeeze the glute on the stretched side.",
          prescription: { family: "mobility", sets: 1, duration: { seconds: 45 }, side: "bilateral" },
        },
      ],
    },
  ],
};
