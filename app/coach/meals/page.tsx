"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ChevronLeft, Copy, Pencil, Plus, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/coach/page-header";
import { EmptyState } from "@/components/coach/empty-state";
import { MealRecommendationCard } from "@/components/coach/meal-recommendation-card";
import { MealRecommendationEditorSheet } from "@/components/coach/meal-recommendation-editor-sheet";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { createEmptyMealRecommendation, duplicateMealRecommendation } from "@/lib/coach/meal-recommendations";
import type { MealRecommendation } from "@/lib/coach/types";

/**
 * A coach's own reusable meal-recommendation library — owned and isolated
 * by coach account (see lib/coach/types.ts's MealRecommendation doc).
 * Assigning one to a client happens from that client's own detail page
 * (see components/coach/meal-recommendation-assignment.tsx); this page only
 * manages the reusable source recommendations.
 */
export default function CoachMealsPage() {
  const workspace = useCoachWorkspace();
  const coachId = workspace.coachId;
  const [editing, setEditing] = useState<MealRecommendation | null>(null);

  const all = coachId ? workspace.platform.mealRecommendations.filter((r) => r.coachId === coachId) : [];
  const active = all.filter((r) => r.status === "active");
  const archived = all.filter((r) => r.status === "archived");

  function handleCreate() {
    if (!coachId) return;
    setEditing(createEmptyMealRecommendation({ workspaceId: workspace.workspaceId, coachId, nowIso: new Date().toISOString() }));
  }

  function handleSave(recommendation: MealRecommendation) {
    workspace.dispatchPlatform({ type: "SAVE_MEAL_RECOMMENDATION", recommendation: { ...recommendation, updatedAtIso: new Date().toISOString() } });
    setEditing(null);
  }

  function handleDuplicate(recommendation: MealRecommendation) {
    workspace.dispatchPlatform({ type: "SAVE_MEAL_RECOMMENDATION", recommendation: duplicateMealRecommendation(recommendation, new Date().toISOString()) });
  }

  function handleToggleArchive(recommendation: MealRecommendation) {
    workspace.dispatchPlatform({
      type: "SAVE_MEAL_RECOMMENDATION",
      recommendation: { ...recommendation, status: recommendation.status === "active" ? "archived" : "active", updatedAtIso: new Date().toISOString() },
    });
  }

  function renderRow(recommendation: MealRecommendation) {
    return (
      <div key={recommendation.id} className="relative">
        <MealRecommendationCard recommendation={recommendation} />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(recommendation)}>
            <Pencil size={13} /> Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleDuplicate(recommendation)}>
            <Copy size={13} /> Duplicate
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleToggleArchive(recommendation)}>
            {recommendation.status === "active" ? (
              <>
                <Archive size={13} /> Archive
              </>
            ) : (
              <>
                <ArchiveRestore size={13} /> Restore
              </>
            )}
          </Button>
          {recommendation.assignedClientIds.length > 0 ? (
            <span className="flex items-center px-1 text-xs text-neutral">
              Assigned to {recommendation.assignedClientIds.length} client{recommendation.assignedClientIds.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/coach/library" className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
        <ChevronLeft size={16} /> Back to Library
      </Link>
      <PageHeader
        title="Meals"
        description="Your own meal recommendations — assign them to any client from their profile."
        action={
          <Button onClick={handleCreate} disabled={!coachId}>
            <Plus size={16} /> New recommendation
          </Button>
        }
      />

      <div className="max-w-2xl space-y-6">
        {active.length === 0 && archived.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="No recommendations yet" description="Create a meal once, then assign it to any client whose nutrition it fits." />
        ) : (
          <>
            <div className="space-y-3">{active.map(renderRow)}</div>
            {archived.length > 0 ? (
              <div>
                <p className="mb-2 text-label text-neutral">Archived</p>
                <div className="space-y-3 opacity-70">{archived.map(renderRow)}</div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <MealRecommendationEditorSheet open={!!editing} onClose={() => setEditing(null)} initial={editing} onSave={handleSave} />
    </div>
  );
}
