import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { MealRecommendation } from "@/lib/coach/types";
import type { ClientProfileId } from "@/lib/tenancy/types";

/**
 * Assign/unassign this coach's own active meal recommendations for exactly
 * one client — meal recommendations stay optional for activation (see
 * lib/coach/activation.ts, which never reads this), so this lives on the
 * client's own detail page rather than the setup flow.
 *
 * Phase 5.3C — the two groups render as visually distinct sections with
 * their own headings ("Assigned to {client}" / "Available in your
 * library"), not just a color difference on an otherwise-identical list —
 * this is the direct fix for the reported ambiguity where a coach-owned
 * recommendation could look assigned to a client it was never actually
 * assigned to. A library recommendation only ever appears "Assigned" once
 * this coach has explicitly pressed it here.
 */
export function MealRecommendationAssignmentCard({
  clientId,
  clientFirstName,
  recommendations,
  onToggle,
}: {
  clientId: ClientProfileId;
  clientFirstName: string;
  recommendations: MealRecommendation[];
  onToggle: (recommendationId: string, assigned: boolean) => void;
}) {
  const assigned = recommendations.filter((r) => r.assignedClientIds.includes(clientId));
  const available = recommendations.filter((r) => !r.assignedClientIds.includes(clientId));

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-subheading text-off-white">Meal recommendations</p>
        <Link href="/coach/meals" className="text-sm text-accent-strong hover:underline">
          Manage
        </Link>
      </div>

      {recommendations.length === 0 ? (
        <p className="mt-2 text-sm text-neutral">
          No saved recommendations yet.{" "}
          <Link href="/coach/meals" className="text-accent-strong hover:underline">
            Create one
          </Link>
          .
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-label text-success">Assigned to {clientFirstName}</p>
            {assigned.length === 0 ? (
              <p className="mt-1.5 text-sm text-neutral">Nothing assigned yet — add one from your library below.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {assigned.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onToggle(r.id, false)}
                    aria-pressed={true}
                    className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border-2 border-success bg-success-soft px-3 py-2.5 text-left transition-colors"
                  >
                    <span className="block truncate text-sm font-medium text-success">{r.name || "Untitled recommendation"}</span>
                    <Check size={16} className="shrink-0 text-success" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {available.length > 0 ? (
            <div className="border-t border-border pt-4">
              <p className="text-label text-neutral">Available in your library</p>
              <div className="mt-2 space-y-2">
                {available.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onToggle(r.id, true)}
                    aria-pressed={false}
                    className={cn("flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border-2 border-border-strong bg-charcoal px-3 py-2.5 text-left transition-colors hover:border-accent/40")}
                  >
                    <span className="block truncate text-sm font-medium text-off-white">{r.name || "Untitled recommendation"}</span>
                    <Plus size={16} className="shrink-0 text-neutral" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
