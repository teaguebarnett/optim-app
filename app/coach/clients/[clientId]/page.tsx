"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ActivationWorkspace } from "@/components/coach/activation-workspace";
import { ClientWorkspace } from "@/components/coach/client-workspace";
import { ActivateConfirmationSheet } from "@/components/coach/activate-confirmation-sheet";
import { LifecycleBadge } from "@/components/coach/lifecycle-badge";
import { useProgramComposer } from "@/hooks/use-program-composer";
import { resolveProgramTiming, describeProgramTimingForCoach } from "@/lib/scheduling/program-timing";

/**
 * Phase 5.4B completion pass — this page is now a thin lifecycle switch,
 * never a single overloaded screen: a pre-activation client gets the
 * focused Activation Workspace (components/coach/activation-workspace.tsx);
 * an activated client gets the approved, ongoing Client Workspace
 * (components/coach/client-workspace.tsx). Neither experience is forced
 * onto the other's screen. See each component's own doc for its section
 * hierarchy.
 *
 * Phase 5.6A — this is also the ONE place a not-yet-active client's OPTIM
 * draft starts preparing itself: the moment onboarding is complete (and no
 * health-review concern is blocking it), the effect below calls the same
 * auto-pilot pipeline the autonomous "Generate my recommended plan" button
 * uses (see useProgramComposer's runAutoGeneration) so a coach opening — or
 * returning to — this page never has to discover a separate "Generate"
 * screen themselves. Idempotent by construction (see runAutoGeneration's own
 * doc), so re-running this effect on every render/focus/cross-tab resync is
 * always safe.
 */
export default function CoachClientWorkspacePage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const view = useProgramComposer(params.clientId);
  const [confirmingActivation, setConfirmingActivation] = useState(false);
  const [, forceRerender] = useState(0);
  const onChanged = () => forceRerender((n) => n + 1);

  const { onboarding, healthReviewResolved, latest, activeModel, coachId, lifecycle: currentLifecycle, runAutoGeneration } = view;
  // Guards against a real duplicate-generation bug, not just a cosmetic
  // re-run: React (in development, under StrictMode) intentionally invokes
  // an effect's setup function TWICE in immediate succession on mount,
  // sharing the same closure/render — so `latest` is still stale (pre-
  // dispatch) on the second call, and without this ref BOTH calls pass
  // every guard above and each independently calls runDirections/
  // buildFullProgram, producing two distinct activation-generation records
  // instead of one. A plain ref (not React state) is required here
  // specifically because it's read/written synchronously within the same
  // tick, before either dispatch has had a chance to re-render this
  // component with the real, updated `latest`. Keyed by clientId (not a
  // plain boolean) because Next.js reuses this same page instance — and its
  // refs — when the coach navigates from one client's page straight to
  // another's; a plain boolean would wrongly suppress the very first real
  // attempt for the second client.
  const autoGenerationAttemptedForClientRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentLifecycle === "active" || !coachId || !activeModel) return;
    if (!onboarding?.completedAtIso) return;
    if (healthReviewResolved === false) return;
    // Never auto-retries a failed/blocked attempt — that's a real problem
    // the coach must consciously retry (see ActivationWorkspace's "Retry
    // generation" action), never something silently re-attempted forever.
    if (latest?.state === "generation_failed" || latest?.state === "blocked") return;
    // Already has a real, complete draft (or further along) — nothing to do.
    if (latest?.trainingOptions.length) return;
    if (autoGenerationAttemptedForClientRef.current === params.clientId) return;
    autoGenerationAttemptedForClientRef.current = params.clientId;
    runAutoGeneration();
  }, [currentLifecycle, coachId, activeModel, onboarding?.completedAtIso, healthReviewResolved, latest, runAutoGeneration, params.clientId]);

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
