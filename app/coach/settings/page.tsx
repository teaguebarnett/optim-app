"use client";

import { ShieldCheck, Sparkles, AlertTriangle, MessageCircle, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/coach/page-header";
import { DevPerspectiveSwitcher } from "@/components/app-shell/dev-perspective-switcher";
import { AiAuthorityPanel } from "@/components/coach/ai-authority-panel";
import { YourCoachingMethodCard } from "@/components/coach/your-coaching-method-card";
import { AppearanceSettingsCard } from "@/components/app-shell/appearance-settings-card";
import { usePrototypeState } from "@/hooks/use-prototype-state";

const DEV_TOOLS_AVAILABLE = process.env.NODE_ENV !== "production";

/**
 * The coach's Playbook — a clear explanation of how OPTIM supports you,
 * grouped into the four categories the Phase 5.0C brief names, rather than
 * one flat list of booleans. Every row here reads the same real, already-
 * governing WorkspaceAiPolicy (see lib/tenancy/types.ts) this always has —
 * nothing here is an editable toggle, because none of these are genuinely
 * user-editable yet; a real playbook editor is a future phase.
 */
export default function CoachSettingsPage() {
  const { activeContext } = usePrototypeState();
  const policy = activeContext.aiPolicy;

  return (
    <div className="space-y-8">
      <PageHeader title="Playbook" description="How OPTIM supports you — and where it always defers to you." />

      <YourCoachingMethodCard />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-accent-strong" aria-hidden="true" />
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
          <Sparkles size={16} className="text-accent-strong" aria-hidden="true" />
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
