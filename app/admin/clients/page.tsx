import { ClientPlatformTable } from "@/components/admin/client-platform-table";
import { getPlatformOperationsRepository } from "@/lib/production/platform-operations";

export default async function AdminClientsPage() {
  const rows = await getPlatformOperationsRepository().listClients();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-heading text-off-white">Platform Client Operations</h1>
        <p className="text-meta text-neutral">Every client across every workspace, their lifecycle stage, and program/nutrition readiness.</p>
      </div>
      <ClientPlatformTable rows={rows} />
    </div>
  );
}
