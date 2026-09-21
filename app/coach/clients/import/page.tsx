// Gate 6A — the real landing target for the "Add client" entry's "Import
// existing client(s)" choice (see components/coach/add-client-entry-sheet.tsx).
//
// Gate 6B — now a real, workspace-bound staging flow in Supabase mode
// (components/coach/import-staging-screen.tsx, backed by
// lib/production/imports.ts): upload a CSV, review/correct each extracted
// field, mark a row ready or reject it. Demo mode keeps the same honest
// placeholder Gate 6A shipped — this feature is workspace-bound by design
// (RLS's is_workspace_staff predicate, matching Escalations/Campaigns'
// existing precedent), and demo mode has no real workspace to stage
// against, so it explicitly says so rather than faking a local staging
// engine (see this phase's own report for why: no duplicate localStorage
// import engine, matching the same call already made for Notes/Campaigns).
//
// The one thing this page must never do, in either mode: imply that
// landing here, or any upload from here, already created, invited, or
// activated a client. Staging only — see lib/production/imports.ts's own
// doc for exactly what is and isn't implemented yet.

import Link from "next/link";
import { ChevronLeft, Upload } from "lucide-react";
import { PageHeader } from "@/components/coach/page-header";
import { EmptyState } from "@/components/coach/empty-state";
import { ImportStagingScreen } from "@/components/coach/import-staging-screen";
import { resolveAppMode } from "@/lib/production/mode";

export default function ImportClientsPage() {
  const isSupabase = resolveAppMode() === "supabase";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/coach/clients" className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
          <ChevronLeft size={16} aria-hidden="true" /> Back to clients
        </Link>
      </div>

      <PageHeader title="Import clients" description="Bring over clients you're already coaching elsewhere." />

      {isSupabase ? (
        <ImportStagingScreen />
      ) : (
        <EmptyState
          icon={Upload}
          title="Import works against your real workspace"
          description="This feature stages files against your live Supabase workspace, so it isn't available in this demo. Nothing is created, invited, or activated from this page."
        />
      )}
    </div>
  );
}
