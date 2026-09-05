"use client";

import { useState } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeZonePicker } from "@/components/ui/timezone-picker";
import { friendlyTimeZoneDisplayLabel } from "@/lib/shared/timezone";

/**
 * Shows the already-detected time zone (resolved by the wizard at render
 * time — see onboarding-wizard.tsx's effectiveAnswers, the same
 * never-commit-a-default-via-an-effect pattern every numeric wheel already
 * uses) as a calm, already-decided confirmation with a "Change" action —
 * the Phase 5.2 brief's explicit replacement for a raw text field a client
 * would have to type "EST" into. Phase 5.4A: "Change" now reveals the real
 * searchable TimeZonePicker (components/ui/timezone-picker.tsx) instead of
 * a native `<select>`, and the confirmed label uses the "Chicago · Central
 * Time" format that phase's brief requires, not the raw long timezone name.
 * Purely presentational: never detects or writes anything itself.
 */
export function TimezoneInput({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const [changing, setChanging] = useState(false);

  return (
    <div>
      {changing ? (
        <TimeZonePicker
          value={value}
          onChange={(tz) => {
            onChange(tz);
            setChanging(false);
          }}
        />
      ) : (
        <>
          <p className="mb-1.5 text-sm font-medium text-off-white">Time zone</p>
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border-strong bg-surface-input px-3.5 py-3">
            <span className="flex items-center gap-2 text-sm text-off-white">
              <Clock3 size={15} className="shrink-0 text-neutral" aria-hidden="true" />
              {friendlyTimeZoneDisplayLabel(value)}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(true)}>
              Change
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
