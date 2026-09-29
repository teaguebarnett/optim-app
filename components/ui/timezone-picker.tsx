"use client";

import { useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { allTimeZoneEntries, currentLocalTimeLabel, detectTimeZone, friendlyTimeZoneDisplayLabel, matchTimeZoneEntries } from "@/lib/shared/timezone";

/**
 * Phase 5.4A — the real, reusable timezone picker this phase's brief
 * requires: detects and preselects the device's zone, persists a real IANA
 * identifier (never a fixed UTC offset — see the `value` prop's type),
 * shows a friendly "Chicago · Central Time" label with the live local
 * time, handles DST automatically (Intl does this, not this component),
 * and is searchable by city, IANA id, or UTC offset (see
 * lib/shared/timezone.ts's matchTimeZoneEntries). Used by coach onboarding
 * chapter J (operational context) and anywhere else a coach — not a
 * client, whose onboarding already has its own lighter-weight
 * auto-detect+confirm flow (components/onboarding/timezone-input.tsx) —
 * needs to set a real timezone.
 */
export function TimeZonePicker({ value, onChange, label = "Time zone" }: { value: string; onChange: (timeZone: string) => void; label?: string }) {
  const [query, setQuery] = useState("");
  const [nowTick, setNowTick] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNowTick(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = query.trim() ? matchTimeZoneEntries(query) : allTimeZoneEntries().filter((e) => e.id === value || e.id === detectTimeZone()).concat(matchTimeZoneEntries("").slice(0, 40));
  const options: ComboboxOption[] = dedupeById(filtered).map((e) => ({ value: e.id, label: `${e.cityLabel} · ${e.genericLabel}`, description: e.offsetLabel }));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-sm font-medium text-off-white">{label}</p>
        <button
          type="button"
          onClick={() => onChange(detectTimeZone())}
          className="inline-flex items-center gap-1 text-meta font-medium text-accent-fg hover:underline"
        >
          <LocateFixed size={12} aria-hidden="true" />
          Use device time zone
        </button>
      </div>
      <Combobox
        options={options}
        value={value}
        onChange={onChange}
        onQueryChange={setQuery}
        ariaLabel={label}
        placeholder="Search by city, region, or UTC offset…"
        emptyMessage="No matching time zone."
        renderTrigger={() => (
          value ? (
            <span className="flex items-baseline gap-2">
              <span>{friendlyTimeZoneDisplayLabel(value)}</span>
              <span className="text-meta text-neutral">{currentLocalTimeLabel(value, nowTick)}</span>
            </span>
          ) : (
            // Empty means "not chosen yet" — never an implied zone.
            <span className="text-neutral">Select a time zone</span>
          )
        )}
      />
    </div>
  );
}

function dedupeById<T extends { id: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of entries) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}
