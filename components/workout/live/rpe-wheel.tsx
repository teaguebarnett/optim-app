"use client";

import { useState } from "react";
import { WheelColumn, WheelFrame } from "@/components/workout/live/wheel-column";
import type { RpeValue } from "@/lib/types";

const RPE_VALUES: RpeValue[] = [6, 7, 8, 9, 10];
const NEUTRAL_START_INDEX = 2; // RPE 8 — a visual starting center only; never a submitted value until the client actually interacts.

/**
 * Phase 4.4B-2 §F — replaces the old static row of five small RPE buttons
 * with a smooth wheel in the same family as the approved training-time
 * picker (see wheel-column.tsx). Requires an intentional interaction before
 * counting as a real selection: mounts dimmed with no value chosen, and
 * only reports a value (enabling submission upstream) once the client has
 * actually scrolled or tapped a row — satisfies "require an intentional RPE
 * selection" without silently defaulting to whatever the wheel happens to
 * rest on. The parent must remount this with a fresh `key` (exerciseId +
 * setNumber) for every new working set so it never carries a prior set's
 * selection forward — see set-logging-panel.tsx.
 */
export function RpeWheel({ onChange, id }: { onChange: (value: RpeValue) => void; id: string }) {
  const [touched, setTouched] = useState(false);

  function handleChange(index: number) {
    setTouched(true);
    onChange(RPE_VALUES[index]);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-label text-neutral">Actual RPE</span>
        {!touched ? <span className="text-meta text-neutral">Scroll to select</span> : null}
      </div>
      <div className={touched ? undefined : "opacity-55"}>
        <WheelFrame>
          <WheelColumn
            id={id}
            ariaLabel="Actual RPE"
            values={RPE_VALUES.map(String)}
            index={NEUTRAL_START_INDEX}
            onChange={handleChange}
          />
        </WheelFrame>
      </div>
    </div>
  );
}
