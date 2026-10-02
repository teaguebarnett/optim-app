import { Compass, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/coach/page-header";
import { AppearanceSettingsCard } from "@/components/app-shell/appearance-settings-card";
import { LiveAiAuthorityPanel } from "@/components/coach/live-ai-authority-panel";
import Link from "next/link";
import { CoachMethodSettings } from "@/components/coach/coach-method-settings";
import { getOwnCoachBrainState } from "@/lib/production/coach-brain";

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
 * Gate 3 — the Coaching method section now reads the coach's own Coach
 * Brain (lib/production/coach-brain.ts) and shows a human-readable summary
 * with "Review or update your method"; the legacy 12-field manual form
 * (live-coach-playbook-summary.tsx) is no longer shown to coaches. OPTIM
 * authority saves to the coach's own Brain as well.
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
  // Gate 3 — the coach's own Coach Brain (never the legacy workspace
  // playbook). The coach layout only lets a calibrated coach reach this
  // page, so an active method is expected; if it's somehow missing, say so
  // and point back to calibration rather than showing defaults.
  const state = await getOwnCoachBrainState();
  const method = state.activeMethod;
  const format = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null);
  const hasOpenReview = !!state.progress && !state.progress.completedAtIso && state.progress.mode === "review";

  return (
    <div className="space-y-10">
      <PageHeader title="Settings" description="How OPTIM works with you and your clients." />

      <section id="coaching-method" className="scroll-mt-24 space-y-3">
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-accent-fg" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">Coaching method</h2>
        </div>
        {method ? (
          <CoachMethodSettings
            model={method.operatingModel}
            versionId={method.versionId}
            authority={method.aiAuthority}
            version={method.version}
            confirmedLabel={format(method.confirmedAtIso) ?? ""}
            calibratedLabel={format(state.calibration.calibratedAtIso)}
            hasOpenReview={hasOpenReview}
          />
        ) : (
          <p className="text-body text-neutral">
            Your coaching method isn’t confirmed yet.{" "}
            <Link href="/coach-onboarding" className="text-action text-accent-fg hover:underline">
              Finish calibrating OPTIM
            </Link>
          </p>
        )}
      </section>

      {/* Gate 3.2 — for an adaptive-calibration method, authority is one of
          the method's categories (inside the editor above). */}
      {method && !method.operatingModel.calibration ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent-fg" aria-hidden="true" />
            <h2 className="text-subheading text-off-white">OPTIM authority</h2>
          </div>
          <p className="text-meta text-neutral">How much you want OPTIM to take on for your clients. Changes apply to your clients only, and are saved as a new version of your method.</p>
          <LiveAiAuthorityPanel initialSettings={method.aiAuthority} />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-subheading text-off-white">Appearance</h2>
        <AppearanceSettingsCard />
      </section>
    </div>
  );
}
