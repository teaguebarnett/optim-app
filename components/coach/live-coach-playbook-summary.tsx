import { Compass } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { CoachPlaybook } from "@/lib/coach/playbook";

/**
 * Gate 6C — the real Supabase-mode "Your Coaching Method" summary. Demo
 * mode's YourCoachingMethodCard shows calibration-survey progress
 * (not_started/in_progress/inferred_unconfirmed/calibrated), which depends
 * on a CoachOnboardingProgress record that has no production table yet —
 * fabricating one here would misrepresent a real coach's actual state, and
 * the calibration wizard itself (app/coach-onboarding) isn't
 * Supabase-mode-wired either, so this never links to it. Instead this
 * shows exactly what production actually has: the real, currently-approved
 * coach_playbooks row every generation/authority decision in this
 * workspace already reads from (see lib/production/playbooks.ts). Read-only
 * until calibration editing is itself productionized — a distinct, larger
 * gate, not this one.
 */
export function LiveCoachPlaybookSummary({ playbook }: { playbook: CoachPlaybook }) {
  const lastUpdatedIso = playbook.approvedAtIso ?? playbook.createdAtIso;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
          <Compass size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-subheading text-off-white">Your Coaching Method</p>
          <p className="mt-1 text-meta text-neutral">The Coach Playbook OPTIM uses to build and adjust every client&apos;s plan in your own style.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm">
        <div>
          <p className="text-meta text-neutral">Status</p>
          <p className="font-medium capitalize text-success">{playbook.status}</p>
        </div>
        <div>
          <p className="text-meta text-neutral">Version</p>
          <p className="font-medium text-off-white">v{playbook.version}</p>
        </div>
        <div>
          <p className="text-meta text-neutral">Last updated</p>
          <p className="font-medium text-off-white">{new Date(lastUpdatedIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
        </div>
      </div>

      <p className="rounded-[var(--radius-sm)] border border-border bg-surface-raised px-3.5 py-2.5 text-meta text-neutral">
        Guided calibration editing isn&apos;t available in this workspace yet — this reflects the real Playbook OPTIM is currently using for every
        client here.
      </p>
    </Card>
  );
}
