import { Card } from "@/components/ui/card";

/** The one small KPI tile every Command Center surface uses — a precise
 * label (never an ambiguous one, per this phase's own labeling
 * requirement), a real number, and an optional one-line definition/hint so
 * "what does this actually count" never has to be guessed. */
export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-label text-neutral">{label}</p>
      <p className="text-metric text-off-white">{value}</p>
      {hint ? <p className="text-meta text-neutral">{hint}</p> : null}
    </Card>
  );
}
