"use client";

import { ShieldCheck, Sparkles, AlertTriangle, MessageCircle, Wrench, Newspaper } from "lucide-react";
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
 * The coach's Playbook — a clear explanation of how OPTIM supports you.
 * The "You always decide" / "may handle" / "always escalate" sections below
 * read the workspace's real, already-governing WorkspaceAiPolicy (see
 * lib/tenancy/types.ts) — genuinely real, platform-level policy, but not
 * yet coach-editable from anywhere in the product, so shown as read-only
 * fact rather than a toggle that would silently do nothing.
 *
 * Gate 5A — CoachPlaybookDetail (below YourCoachingMethodCard) makes the
 * coach's own structured CoachOperatingModel (methodology, interpretation
 * rules, communication style, safety) inspectable here too, with each
 * section deep-linking into the exact onboarding chapter that produced it
 * — so revising one rule never means redoing the whole calibration survey.
 * AiAuthorityPanel below is already a real, live editor for
 * CoachAiAuthoritySettings, including per-domain overrides; a client's own
 * page carries the equivalent per-client override
 * (AiAuthorityClientOverrideCard).
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
    <div className="space-y-8">
      <PageHeader title="Playbook" description="How OPTIM supports you — and where it always defers to you." />

      <YourCoachingMethodCard />
      <CoachPlaybookDetail />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-accent-fg" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">You always decide</h2>
        </div>
        <Card>
          <p className="text-sm text-off-white">Program and exercise changes</p>
          <p className="mt-1 text-meta text-neutral">
            {policy.requireCoachApprovalForProgramChanges
              ? "OPTIM never modifies a client's program on its own — every change request routes to you first."
              : "Approval requirement is off for this workspace."}
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brass-strong" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">OPTIM may handle within approved boundaries</h2>
        </div>
        <Card>
          <p className="text-sm text-off-white">Safe same-day substitutions</p>
          <p className="mt-1 text-meta text-neutral">
            {policy.allowImmediateSessionSubstitutions
              ? "OPTIM can suggest an equivalent same-day swap (e.g. a meal or cardio alternative) without waiting on you."
              : "Disabled — every substitution routes to you first."}
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-error" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">Always escalate to you</h2>
        </div>
        <Card className="space-y-3">
          <PlaybookRow label="Pain or injury reports" enabled={policy.requireCoachReviewForPainReports} />
          <PlaybookRow label="Unusual RPE patterns" enabled={policy.requireCoachReviewForRpeAnomalies} />
          <PlaybookRow label="Skipped work" enabled={policy.requireCoachReviewForSkippedWork} />
          <p className="border-t border-border pt-2.5 text-meta text-neutral">
            Pain, injury, and program/exercise decisions always escalate to you regardless of these settings.
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-neutral" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">Tone &amp; communication</h2>
        </div>
        <Card>
          <p className="text-sm text-off-white">{activeContext.assistantDisplayName}&apos;s tone</p>
          <p className="mt-1 text-meta text-neutral">{policy.tone}</p>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Newspaper size={16} className="text-brass-strong" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">Daily Briefings</h2>
        </div>
        <Card>
          <p className="text-sm text-off-white">Default publishing behavior</p>
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
          <Sparkles size={16} className="text-accent-fg" aria-hidden="true" />
          <h2 className="text-subheading text-off-white">AI Coaching Authority</h2>
        </div>
        <AiAuthorityPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-subheading text-off-white">Appearance</h2>
        <AppearanceSettingsCard />
      </section>

      {DEV_TOOLS_AVAILABLE ? (
        <section className="space-y-3 border-t border-dashed border-border-strong pt-6">
          <div className="flex items-center gap-2">
            <Wrench size={15} className="text-neutral" aria-hidden="true" />
            <h2 className="text-label text-neutral">Development only — not part of the coaching Playbook</h2>
          </div>
          <Card className="border-dashed bg-surface-raised">
            <DevPerspectiveSwitcher />
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function PlaybookRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-off-white">{label}</span>
      <span className={enabled ? "text-error" : "text-neutral"}>{enabled ? "Escalates" : "Off"}</span>
    </div>
  );
}
