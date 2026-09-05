"use client";

import { NumberWheel } from "@/components/ui/number-wheel";

const FEET_VALUES = [3, 4, 5, 6, 7, 8];

/**
 * Two side-by-side wheels (feet, inches 0–11) rather than one "total
 * inches" wheel — see lib/coach/height.ts's module doc for why the two
 * answer keys this writes (heightFeet, heightInchesRemainder) can never
 * collide with a pre-Phase-5.1 record's single total-inches value. Never
 * asks a client to understand or select "67 inches."
 */
export function HeightInput({
  feet,
  inches,
  onChangeFeet,
  onChangeInches,
}: {
  feet: number | undefined;
  inches: number | undefined;
  onChangeFeet: (value: number) => void;
  onChangeInches: (value: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-off-white">Height</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberWheel
          id="heightFeet"
          fieldLabel="Feet"
          value={feet ?? 5}
          onChange={onChangeFeet}
          values={FEET_VALUES}
          unit="ft"
        />
        <NumberWheel
          id="heightInchesRemainder"
          fieldLabel="Inches"
          value={inches ?? 6}
          onChange={onChangeInches}
          min={0}
          max={11}
          step={1}
          unit="in"
        />
      </div>
    </div>
  );
}
