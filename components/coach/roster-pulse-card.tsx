"use client";

import { useRouter } from "next/navigation";
import { SegmentedMetricBar } from "@/components/ui/segmented-metric-bar";
import type { RosterPulseCounts } from "@/lib/coach/command-center";

/** Real, derived-from-lifecycle roster counts rendered as an actual
 * proportional distribution bar — never a fabricated "wellness score."
 * Each segment click-filters into the matching clients list view. */
export function RosterPulseCard({ pulse }: { pulse: RosterPulseCounts }) {
  const router = useRouter();
  const total = pulse.onTrack + pulse.watch + pulse.needsCoach;

  return (
    <div>
      <p className="text-metric leading-none text-off-white">{total}</p>
      <p className="mt-1 text-meta text-neutral">clients across your roster</p>

      <div className="mt-5">
        <SegmentedMetricBar
          label="Roster status distribution"
          total={total}
          segments={[
            { id: "on-track", label: "On track", value: pulse.onTrack, colorClassName: "bg-success", onClick: () => router.push("/coach/clients?filter=on_track") },
            { id: "watch", label: "Watch", value: pulse.watch, colorClassName: "bg-warning", onClick: () => router.push("/coach/clients?filter=watch") },
            { id: "needs-you", label: "Needs you", value: pulse.needsCoach, colorClassName: "bg-error", onClick: () => router.push("/coach/clients?filter=needs_coach") },
          ]}
        />
      </div>
    </div>
  );
}
