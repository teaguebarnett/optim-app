// Gate 4.0C-2A — INTERNAL QA: the legacy generator and the new resistance
// planner, side by side, for one client. Both run in memory; nothing is
// saved or published. Not linked from navigation — reached from the
// planner preview's "Compare" link. Supabase mode only.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { resolveAppMode } from "@/lib/production/mode";
import { getClientDetailAction } from "@/app/actions/coach-roster";
import { previewLegacyProposalForComparisonAction } from "@/app/actions/production-programs";
import { previewResistancePlanAction } from "@/app/actions/structured-limitations";
import { ResistancePlannerPreview } from "@/components/coach/resistance-planner-preview";
import { ReasonerPreviewPanel } from "@/components/coach/reasoner-preview-panel";

// The Fitness Reasoner preview is a long model call (internal QA only).
export const maxDuration = 300;

export default async function PlannerReviewPage({ params }: { params: Promise<{ clientId: string }> }) {
  if (resolveAppMode() !== "supabase") notFound();
  const { clientId } = await params;
  let detail;
  try {
    detail = await getClientDetailAction(clientId);
  } catch {
    notFound();
  }
  const newView = await previewResistancePlanAction({ workspaceId: detail.workspaceId, clientProfileId: clientId });
  const weeks = newView.plan?.weeks ?? 12;
  const legacy = await previewLegacyProposalForComparisonAction({ workspaceId: detail.workspaceId, clientProfileId: clientId, durationWeeks: weeks });

  return (
    <div className="space-y-5">
      <Link href={`/coach/clients/${clientId}`} className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
        <ChevronLeft size={16} /> Back to {detail.displayName}
      </Link>
      <div>
        <h1 className="text-display text-off-white">Planner comparison</h1>
        <p className="mt-1 text-body text-neutral">Internal QA for {detail.displayName}. Every proposal here is generated in memory for comparison — nothing is saved or sent.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-3 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-subheading text-off-white">Current generator (legacy)</h2>
          <Card className="space-y-3">
            {!legacy.ok ? (
              <p className="text-sm text-neutral">{legacy.message}</p>
            ) : (
              <>
                <dl className="grid grid-cols-3 gap-3">
                  <div><dt className="text-label text-neutral">Days / week</dt><dd className="text-sm text-off-white">{legacy.summary.trainingDaysPerWeek}</dd></div>
                  <div><dt className="text-label text-neutral">Weeks</dt><dd className="text-sm text-off-white">{legacy.summary.weeks}</dd></div>
                  <div><dt className="text-label text-neutral">Direction</dt><dd className="text-sm text-off-white">{legacy.summary.directionLabel}</dd></div>
                </dl>
                <p className="text-meta text-neutral">
                  {legacy.summary.weeksShareLayout ? "Every week repeats week 1's exercise layout." : "Exercise layout varies across weeks."}
                  {legacy.summary.repeatedInWeek1.length ? ` Repeated in week 1: ${legacy.summary.repeatedInWeek1.map((r) => `${r.name} ×${r.sessions}`).join(", ")}.` : ""}
                </p>
                {legacy.summary.week1.map((d) => (
                  <div key={d.day} className="rounded-[var(--radius-sm)] border border-border px-3 py-2.5">
                    {d.sessions.map((s) => (
                      <div key={s.name}>
                        <p className="text-sm font-medium text-off-white">{d.day} — {s.name}</p>
                        <p className="text-meta text-neutral">{s.exercises.join(" · ")}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </Card>
        </section>
        <section className="space-y-3">
          <h2 className="text-subheading text-off-white">Deterministic planner</h2>
          <ResistancePlannerPreview view={newView} />
        </section>
        <section className="space-y-3">
          <h2 className="text-subheading text-off-white">Fitness Reasoner v1</h2>
          <ReasonerPreviewPanel workspaceId={detail.workspaceId} clientProfileId={clientId} />
        </section>
      </div>
    </div>
  );
}
