"use client";

import { Compass, Sparkles, ShieldCheck, Newspaper, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/coach/page-header";
import { DevPerspectiveSwitcher } from "@/components/app-shell/dev-perspective-switcher";
import { AiAuthorityPanel } from "@/components/coach/ai-authority-panel";
import { YourCoachingMethodCard } from "@/components/coach/your-coaching-method-card";
import { CoachPlaybookDetail } from "@/components/coach/coach-playbook-detail";
import { AppearanceSettingsCard } from "@/components/app-shell/appearance-settings-card";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { defaultCoachBriefingSettings, type BriefingAutomationSetting } from "@/lib/coach/daily-briefing";
import { cn } from "@/lib/cn";

const DEV_TOOLS_AVAILABLE = process.env.NODE_ENV !== "production";

/**
 * Gate 5B — reorganized so the page reads as "Settings," grouped by real
 * job, with the Coach Playbook as its own clearly-owned first group rather
 * than the page's whole identity (that conflated "how I coach" with
 * "workspace configuration," which are different things — see this
 * phase's brief Part 1/6).
 *
 * Group order and what each one owns:
 *  1. Coaching Playbook — YourCoachingMethodCard + CoachPlaybookDetail
 *     (Gate 5A's real, editable CoachOperatingModel). This IS "how I
 *     coach"; nothing below duplicates an editable copy of it.
 *  2. OPTIM authority — AiAuthorityPanel (real, editable
 *     CoachAiAuthoritySettings — automatic/draft/escalate per the
 *     resolver in lib/coach/ai-authority.ts) and Daily Briefings
 *     (real, editable publish-automation setting) — both answer "what
 *     may OPTIM do on its own."
 *  3. Workspace baseline — the legacy WorkspaceAiPolicy fields (see
 *     lib/tenancy/types.ts). Real and structurally required (every
 *     Workspace has one), but read ONLY by this page — no generation,
 *     review, or authority-resolution code anywhere consults these
 *     booleans (verified this phase). Presented explicitly as a fixed,
 *     non-adjustable-here baseline from account setup, never as a
 *     competing or overriding source for what's in groups 1-2.
 *  4. Appearance — local per-account UI preference, never shared
 *     workspace policy.
 *  5. Developer tools — unchanged, dev-only.
 */
export default function CoachSettingsPage() {
  const { activeContext } = usePrototypeState();
  const workspace = useCoachWorkspace();
  const policy = activeContext.aiPolicy;

  const briefingSettings = workspace.coachId
    ? (workspace.briefingSettings ?? defaultCoachBriefingSettings(workspace.coachId, workspace.workspaceId, "1970-01-01T00:00:00.000Z"))
    : null;

  function setGlobalAutomation(automation: BriefingAutomationSetting) {
    if (!workspace.coachId) return;
    workspace.dispatchPlatform({
      type: "SET_BRIEFING_GLOBAL_AUTOMATION",
      coachId: workspace.coachId,
      workspaceId: workspace.workspaceId,
      automation,
      nowIso: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-10">
      <PageHeader title="Settings" description="Configure how OPTIM works with you and your clients." />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-accent-fg" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">Coaching Playbook</h2>
        </div>
        <p className="text-meta text-neutral">How you coach — your methodology, interpretation rules, and communication style. Edited here, nowhere else.</p>
        <YourCoachingMethodCard />
        <CoachPlaybookDetail />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent-fg" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">OPTIM authority</h2>
        </div>
        <p className="text-meta text-neutral">What OPTIM may do with your Playbook on its own, what it drafts for your approval, and what always reaches you.</p>
        <AiAuthorityPanel confirmChanges />

        <Card>
          <div className="flex items-center gap-2">
            <Newspaper size={15} className="text-brass-strong" aria-hidden="true" />
            <p className="text-sm font-medium text-off-white">Daily Briefings</p>
          </div>
          <p className="mt-1 text-meta text-neutral">
            Review-first holds every day&apos;s briefing for your approval before a client sees it. Auto-publish sends it the
            moment it&apos;s generated — unless the day has a pain flag, an unapproved program change, or a low-confidence
            output, which always holds for your review regardless of this setting. Override per client from their own page.
          </p>
          {briefingSettings ? (
            <div className="mt-3 inline-flex rounded-[var(--radius-md)] border border-border-strong p-1">
              {(["review_first", "auto_publish"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGlobalAutomation(option)}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors",
                    briefingSettings.globalAutomation === option ? "bg-accent text-on-accent" : "text-neutral hover:text-off-white"
                  )}
                  style={{ transitionDuration: "var(--motion-fast)" }}
                >
                  {option === "review_first" ? "Review first" : "Auto-publish"}
                </button>
              ))}
            </div>
          ) : null}
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-neutral" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">Workspace baseline</h2>
        </div>
        <Card className="space-y-3">
          <p className="text-meta text-neutral">
            Set when this workspace was created — not adjustable here. Your Coaching Playbook and OPTIM authority above are what OPTIM actually
            follows day to day.
          </p>
          <div className="space-y-2 border-t border-border pt-3">
            <BaselineRow label="Program changes require your approval" value={policy.requireCoachApprovalForProgramChanges} />
            <BaselineRow label="Same-day substitutions allowed automatically" value={policy.allowImmediateSessionSubstitutions} />
            <BaselineRow label="Pain or injury reports escalate to you" value={policy.requireCoachReviewForPainReports} />
            <BaselineRow label="Unusual RPE patterns escalate to you" value={policy.requireCoachReviewForRpeAnomalies} />
            <BaselineRow label="Skipped work escalates to you" value={policy.requireCoachReviewForSkippedWork} />
          </div>
          <p className="border-t border-border pt-2.5 text-meta text-neutral">
            Pain, injury, and program/exercise decisions always escalate to you regardless of these settings.
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-subheading text-off-white">Appearance</h2>
        <AppearanceSettingsCard />
      </section>

      {DEV_TOOLS_AVAILABLE ? (
        <section className="space-y-3 border-t border-dashed border-border-strong pt-6">
          <div className="flex items-center gap-2">
            <Wrench size={15} className="text-neutral" aria-hidden="true" />
            <h2 className="text-label text-neutral">Development only</h2>
          </div>
          <Card className="border-dashed bg-surface-raised">
            <DevPerspectiveSwitcher />
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function BaselineRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-off-white">{label}</span>
      <span className="text-neutral">{value ? "Yes" : "No"}</span>
    </div>
  );
}
