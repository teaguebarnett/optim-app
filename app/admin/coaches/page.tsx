import { CoachRosterTable } from "@/components/admin/coach-roster-table";
import { getPlatformOperationsRepository } from "@/lib/production/platform-operations";

export default async function AdminCoachesPage() {
  const rows = await getPlatformOperationsRepository().listCoaches();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-heading text-off-white">Coach Operations</h1>
        <p className="text-meta text-neutral">Every coach workspace on the platform, its assigned-client roster, and open escalations.</p>
      </div>
      <CoachRosterTable rows={rows} />
    </div>
  );
}
