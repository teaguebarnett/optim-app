import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StatTile } from "@/components/admin/stat-tile";
import { LifecycleChip } from "@/components/admin/lifecycle-chip";
import { getPlatformOperationsRepository } from "@/lib/production/platform-operations";

export default async function AdminClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const detail = await getPlatformOperationsRepository().getClientDetail(clientId);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/clients" className="inline-flex w-fit items-center gap-1.5 text-action text-neutral hover:text-off-white">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to clients
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-heading text-off-white">{detail.displayName}</h1>
          <p className="text-meta text-neutral">
            {detail.workspaceName} · {detail.coachDisplayName}
          </p>
        </div>
        <LifecycleChip lifecycle={detail.lifecycle} />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Onboarding" value={detail.onboardingCompletedAtIso ? "Completed" : "Not completed"} />
        <StatTile label="Program" value={detail.hasActiveProgram ? `Assigned (v${detail.activeProgramVersionNumber})` : "Not assigned"} />
        <StatTile label="Nutrition" value={detail.hasActiveNutrition ? `Assigned (v${detail.activeNutritionVersionNumber})` : "Not assigned"} />
        <StatTile label="Open escalations" value={detail.openEscalationCount} />
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StatTile label="Signed in" value={detail.hasSignedIn ? "Yes" : "Invited, not yet signed in"} hint={detail.invitedEmail ?? undefined} />
        <StatTile label="Program start date" value={detail.startDateIso ? new Date(`${detail.startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not set"} hint={detail.timezone} />
      </section>

      {detail.goal ? (
        <section>
          <h2 className="mb-2 text-subheading text-off-white">Goal</h2>
          <p className="text-body text-neutral">{detail.goal}</p>
        </section>
      ) : null}

      <p className="text-meta text-neutral">
        Client added {new Date(detail.createdAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
      </p>
    </div>
  );
}
