import { ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePrototypeState } from "@/hooks/use-prototype-state";

/**
 * Phase 6.0D-B — Supabase mode only: shown on Today/Training/Nutrition/
 * Progress instead of the normal actionable experience whenever this
 * client has no real program/nutrition assignment + start date configured
 * yet at all (usePrototypeState().supabaseProgramNotAssigned — see that
 * hook's own doc). Distinct from PreStartToday/PreStartTraining/etc (a real
 * future start date exists there, it just hasn't arrived) — this is the
 * honest "nothing has been configured yet" state, never a fabricated
 * "Day 1, started today" screen for a client whose coach hasn't finished
 * setting them up.
 */
export function AwaitingProgramSetup() {
  const { activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const firstName = activeContext.clientProfile?.name?.split(" ")[0] ?? "there";

  return (
    <div className="px-4 pb-6 pt-5">
      <p className="text-label text-brass-strong">Setup in progress</p>
      <h1 className="mt-1 text-display text-off-white">Welcome, {firstName}.</h1>

      <Card className="mt-5 border-l-2 border-l-brass">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
            <ClipboardList size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-heading text-off-white">{coachName} is still building your program.</p>
            <p className="mt-1 text-body text-neutral">
              Your training, nutrition, and start date will appear here the moment {coachName} publishes them — nothing to do on your end
              right now.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
