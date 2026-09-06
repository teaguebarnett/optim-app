"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ActivationWorkspace } from "@/components/coach/activation-workspace";
import { ClientWorkspace } from "@/components/coach/client-workspace";
import { ActivateConfirmationSheet } from "@/components/coach/activate-confirmation-sheet";
import { LifecycleBadge } from "@/components/coach/lifecycle-badge";
import { useCoachClientView } from "@/hooks/use-coach-data";
import { resolveProgramTiming, describeProgramTimingForCoach } from "@/lib/scheduling/program-timing";

/**
 * Phase 5.4B completion pass — this page is now a thin lifecycle switch,
 * never a single overloaded screen: a pre-activation client gets the
 * focused Activation Workspace (components/coach/activation-workspace.tsx);
 * an activated client gets the approved, ongoing Client Workspace
 * (components/coach/client-workspace.tsx). Neither experience is forced
 * onto the other's screen. See each component's own doc for its section
 * hierarchy.
 */
export default function CoachClientWorkspacePage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const view = useCoachClientView(params.clientId);
  const [confirmingActivation, setConfirmingActivation] = useState(false);
  const [, forceRerender] = useState(0);
  const onChanged = () => forceRerender((n) => n + 1);

  if (!view.client) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push("/coach/clients")} className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
          <ChevronLeft size={16} /> Back to clients
        </button>
        <Card>
          <p className="text-sm text-neutral">No client found for this id.</p>
        </Card>
      </div>
    );
  }

  const { client, lifecycle, clientAppState, dispatchPlatform, workspaceId } = view;

  function handleActivate() {
    dispatchPlatform({ type: "SET_CLIENT_LIFECYCLE", clientId: client!.id, workspaceId, status: "active", nowIso: new Date().toISOString() });
    setConfirmingActivation(false);
  }

  const programTiming = clientAppState ? resolveProgramTiming(clientAppState.programEnrollment, clientAppState.dateIso) : null;
  const isFutureStart = programTiming?.phase === "pre_program";
  const startDateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const programWeekLabel =
    clientAppState && programTiming ? describeProgramTimingForCoach(programTiming, clientAppState.programEnrollment.durationWeeks, startDateLabel(clientAppState.programEnrollment.startDateIso)) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => router.push("/coach/clients")} className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
          <ChevronLeft size={16} /> Back to clients
        </button>
        <LifecycleBadge lifecycle={lifecycle} programPhase={programTiming?.phase} className="md:hidden" />
      </div>

      {isFutureStart ? (
        <Card className="border-l-2 border-l-brass">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-soft text-brass-strong">
              <CalendarClock size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-subheading text-off-white">{programWeekLabel}</p>
              <p className="mt-0.5 text-meta text-neutral">
                {client.name} is active and sees a pre-start screen until {startDateLabel(clientAppState!.programEnrollment.startDateIso)}, then their daily plan opens automatically at Week 1.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {lifecycle === "active" ? (
        <ClientWorkspace view={view} onChanged={onChanged} />
      ) : (
        <ActivationWorkspace view={view} onActivateClick={() => setConfirmingActivation(true)} />
      )}

      <ActivateConfirmationSheet open={confirmingActivation} onClose={() => setConfirmingActivation(false)} onConfirm={handleActivate} clientName={client.name} clientAppState={clientAppState} />
    </div>
  );
}
