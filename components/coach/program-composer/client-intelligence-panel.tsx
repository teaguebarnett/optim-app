"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ClientProgrammingProfile } from "@/lib/coach/programming-profile";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-meta text-neutral">{label}</p>
      <p className="font-medium capitalize text-off-white">{value}</p>
    </div>
  );
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.map((i) => i.replace(/_/g, " ")).join(", ") : "None reported";
}

/**
 * Phase 5.5A Part 6 — a compact first-glance summary with everything else
 * inspectable one level deeper. Reads the real ClientProgrammingProfile
 * stored on the generation record for provenance (Phase 5.5) rather than
 * re-deriving it, so what's shown here is exactly what generation actually
 * used — never a separate, potentially-drifted summary.
 */
export function ClientIntelligencePanel({ profile, coachModelVersion, dataCompleteness }: { profile: ClientProgrammingProfile; coachModelVersion: number; dataCompleteness: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <p className="text-subheading text-off-white">Client intelligence</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
        <Stat label="Goal" value={profile.primaryGoal === "something_else" && profile.primaryGoalOther ? profile.primaryGoalOther : profile.primaryGoal.replace(/_/g, " ")} />
        <Stat label="Availability" value={`${profile.availableDays.length} days/week`} />
        <Stat label="Session length" value={`${profile.maxSessionLengthMinutes} min`} />
        <Stat label="Experience" value={profile.trainingExperience.replace(/_/g, " ")} />
      </div>

      <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-3 flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
        View complete client intelligence
        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>

      {expanded ? (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-3.5 text-sm md:grid-cols-3">
          <Stat label="Age" value={String(profile.age)} />
          <Stat label="Secondary goals" value={formatList(profile.secondaryGoals)} />
          <Stat label="Recent consistency" value={profile.recentConsistency.replace(/_/g, " ")} />
          <Stat label="Recent frequency" value={profile.recentWeeklyFrequency ? `${profile.recentWeeklyFrequency}x/week` : "Not reported"} />
          <Stat label="Schedule pattern" value={profile.schedulePredictability.replace(/_/g, " ")} />
          <Stat label="Preferred training times" value={formatList(profile.preferredTrainingTimes)} />
          <Stat label="Equipment access" value={formatList(profile.trainingEnvironment)} />
          <Stat label="Daily activity" value={`${profile.dailyActivityLevel.replace(/_/g, " ")}${profile.dailyActivityLevelIsAssumed ? " (assumed)" : ""}`} />
          <Stat label="Typical sleep" value={profile.typicalSleep.replace(/_/g, " ")} />
          <Stat label="Cardio preference" value={`${profile.cardioPreference.replace(/_/g, " ")}${profile.cardioPreferenceIsAssumed ? " (assumed)" : ""}`} />
          <Stat label="Consistency obstacles" value={formatList(profile.consistencyObstacles)} />
          <Stat label="Coach support style" value={formatList(profile.coachSupportStyle)} />
          <Stat label="Training notes" value={profile.trainingNotes ?? "None"} />
          <Stat label="Pain / movement limitations" value={profile.hasCurrentInjury ? `${formatList(profile.injuryBodyAreas)}${profile.injuryRestrictions ? ` — ${profile.injuryRestrictions}` : ""}` : "None reported"} />
          <Stat label="Health review" value={profile.healthReviewResolved === "no_review_needed" ? "None needed" : profile.healthReviewResolved ? "Resolved" : "Unresolved"} />
          <Stat label="Dietary restrictions" value={profile.hasDietaryRestrictions ? profile.dietaryRestrictionsDetail || "Reported, no detail" : "None reported"} />
          <Stat label="Nutrition approach" value={profile.nutritionApproach.replace(/_/g, " ")} />
          <Stat label="Coach model version" value={`v${coachModelVersion}`} />
          <Stat label="Data completeness" value={dataCompleteness} />
        </div>
      ) : null}
    </Card>
  );
}
