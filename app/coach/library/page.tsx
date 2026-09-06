"use client";

import Link from "next/link";
import { ClipboardList, UtensilsCrossed, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/coach/page-header";
import { useCoachWorkspace } from "@/hooks/use-coach-data";

/**
 * Phase 5.5A — the coach's reusable-resource library. Training templates
 * and meal recommendations are real, fully functional, and untouched by
 * this phase (see app/coach/programs and app/coach/meals) — they moved
 * here, out of the primary top navigation, because a client's own OPTIM
 * Plan is where training and nutrition actually get built now (spec Part
 * 1: "move global reusable resources/templates into a subordinate Coach
 * Library"). This page is a landing point, never a rebuild of either
 * existing screen.
 */
export default function CoachLibraryPage() {
  const workspace = useCoachWorkspace();
  const coachId = workspace.coachId;
  const templateCount = coachId ? workspace.platform.programTemplates.filter((t) => t.coachId === coachId).length : 0;
  const mealRecCount = coachId ? workspace.platform.mealRecommendations.filter((r) => r.coachId === coachId && r.status === "active").length : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Coach Library" description="Reusable resources OPTIM and you can both draw from — not the primary way to build a client's plan." />

      <Link href="/coach/programs" className="block">
        <Card className="flex items-center gap-3.5 transition-colors hover:border-accent/40">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
            <ClipboardList size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-subheading text-off-white">Training templates</span>
            <span className="block text-meta text-neutral">{templateCount} saved template{templateCount === 1 ? "" : "s"} — assign one from a client&apos;s own setup page, or fine-tune manually after OPTIM generates a plan.</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-neutral" aria-hidden="true" />
        </Card>
      </Link>

      <Link href="/coach/meals" className="block">
        <Card className="flex items-center gap-3.5 transition-colors hover:border-accent/40">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-neutral">
            <UtensilsCrossed size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-subheading text-off-white">Meal recommendations</span>
            <span className="block text-meta text-neutral">{mealRecCount} active recommendation{mealRecCount === 1 ? "" : "s"} — real food sources OPTIM surfaces inside a client&apos;s nutrition plan once you assign them.</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-neutral" aria-hidden="true" />
        </Card>
      </Link>
    </div>
  );
}
