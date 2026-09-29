import { Compass, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/coach/page-header";
import { AppearanceSettingsCard } from "@/components/app-shell/appearance-settings-card";
import { LiveAiAuthorityPanel } from "@/components/coach/live-ai-authority-panel";
import { LiveCoachPlaybookSummary } from "@/components/coach/live-coach-playbook-summary";
import { resolveOwnStaffWorkspace } from "@/lib/production/auth";
import { getOrBootstrapApprovedPlaybook } from "@/lib/production/playbooks";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Gate 6C — /coach/settings's real Supabase-mode surface. Mirrors every
 * other coach route's own demo/Supabase split (app/coach/page.tsx,
 * app/coach/clients/page.tsx): a Server Component resolves the real
 * authenticated coach's workspace (resolveOwnStaffWorkspace — the same
 * production identity resolver app/coach/layout.tsx already uses, never
 * the demo-only usePrototypeState()/useCoachWorkspace() chain the old
 * single-file page called unconditionally) and loads real, workspace-
 * scoped data through lib/production/playbooks.ts — the same repository
 * every generation/authority decision in this workspace already reads
 * from.
 *
 * Only two of the demo page's five sections have a real production data
 * source today: Coaching Playbook (read-only summary — see
 * live-coach-playbook-summary.tsx's own doc for why it can't yet be the
 * full editable demo card) and OPTIM authority (fully real, editable —
 * see live-ai-authority-panel.tsx). "Workspace baseline" (legacy
 * WorkspaceAiPolicy booleans) and "Daily Briefings" automation have no
 * production table at all yet, so they're honestly omitted here rather
 * than fabricated from demo data or hidden behind mock values. Appearance
 * and the section order/headings otherwise match the demo page exactly —
 * this is a real-data swap, not a redesign. Dev tools never render here:
 * DevPerspectiveSwitcher is demo-only (see its own doc) and would be
 * meaningless — there is no "perspective" to switch in a real,
 * authenticated Supabase session.
 */
export async function LiveCoachSettingsPage() {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  const supabase = await getSupabaseServerClient();
  const { data: workspaceRow, error } = await supabase.from("workspaces").select("business_name").eq("id", workspaceId).single();
  if (error) throw new Error(`LiveCoachSettingsPage (workspace lookup) failed: ${error.message}`);

  const playbook = await getOrBootstrapApprovedPlaybook({ workspaceId, businessName: workspaceRow.business_name as string });

  return (
    <div className="space-y-10">
      <PageHeader title="Settings" description="Configure how OPTIM works with you and your clients." />

      <section id="coaching-method" className="scroll-mt-24 space-y-3">
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-accent-fg" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">Coaching Playbook</h2>
        </div>
        <p className="text-meta text-neutral">How you coach — your methodology, interpretation rules, and communication style.</p>
        <LiveCoachPlaybookSummary playbook={playbook} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent-fg" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">OPTIM authority</h2>
        </div>
        <p className="text-meta text-neutral">What OPTIM may do with your Playbook on its own, workspace-wide.</p>
        <LiveAiAuthorityPanel initialSettings={playbook.content.aiAuthority} />
      </section>

      <section className="space-y-3">
        <h2 className="text-subheading text-off-white">Appearance</h2>
        <AppearanceSettingsCard />
      </section>
    </div>
  );
}
