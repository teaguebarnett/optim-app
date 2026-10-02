// Gate 3.1 — how a numeric calibration unit reads on screen. The stored unit
// string (NumberSpec.unit, saved with every answer) never changes; this is
// display only, so a coach never has to guess what a number means.

const UNIT_LABELS: Record<string, string> = {
  min: "minutes",
  "min/week": "minutes/week",
  hours: "hours",
  "hours/week": "hours/week",
  days: "days",
  "days/week": "days/week",
  weeks: "weeks",
  sets: "sets",
  "sets/muscle/week": "sets/muscle/week",
  reps: "reps",
  "reps in reserve": "reps in reserve",
  "% of 1RM": "% of 1RM",
  "times/week": "times/week",
  "sessions/week": "sessions/week",
  "per week": "sessions/week",
  "% bodyweight": "% of bodyweight",
  "% bodyweight/week": "% of bodyweight/week",
  "% of week": "% of weekly volume",
  "% per week": "% per week",
  "km/week": "km/week",
  "mi/week": "miles/week",
  "load points/week": "load points/week",
  "steps/day": "steps/day",
  "g/lb": "g/lb",
  "g/kg": "g/kg",
  "g/day": "grams/day",
  "meals/day": "meals/day",
  "g carbs/hour": "g carbs/hour",
};

/** Every unit the question bank uses has a readable label (checked by the
 * verify suite). Unknown units fall back to themselves. */
export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

export function hasUnitLabel(unit: string): boolean {
  return unit in UNIT_LABELS;
}

/** Short enough to sit beside the number inside the wheel itself. */
export function unitFitsInWheel(unit: string): boolean {
  return unit.length <= 5;
}
