"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Sparkles, Wand2, Layers, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgramWeekPreviewSheet } from "@/components/coach/program-preview-sheet";
import { HealthReviewGate } from "@/components/coach/program-composer/health-review-gate";
import { DirectionCard } from "@/components/coach/program-composer/direction-card";
import { ClientIntelligencePanel } from "@/components/coach/program-composer/client-intelligence-panel";
import { PlanWorkspaceHeader, PlanActionBar } from "@/components/coach/program-composer/plan-workspace-header";
import { PlanOverviewCard } from "@/components/coach/program-composer/plan-overview-card";
import { PlanAlternatives } from "@/components/coach/program-composer/plan-alternatives";
import { PlanTrainingReview } from "@/components/coach/program-composer/plan-training-review";
import { PlanNutritionReview } from "@/components/coach/program-composer/plan-nutrition-review";
import { ReviseWithOptimSheet, type ReviseScope } from "@/components/coach/program-composer/revise-with-optim-sheet";
import { ActivePlanHeader } from "@/components/coach/program-composer/active-plan-header";
import { ActivePlanOverview } from "@/components/coach/program-composer/active-plan-overview";
import { ActivePlanCurrentWeek } from "@/components/coach/program-composer/active-plan-current-week";
import { AdaptiveStatusArea } from "@/components/coach/program-composer/adaptive-status-area";
import { PlanChangeHistory } from "@/components/coach/program-composer/plan-change-history";
import { useProgramComposer } from "@/hooks/use-program-composer";
import { materialNutritionAssumptions, meaningfulTrainingDirectionName, meaningfulNutritionStrategyName, resolveAdaptiveCheckState } from "@/lib/coach/plan-presentation";
import { resolveProteinTargetGramsPerLb } from "@/lib/coach/activation-generation";
import { AI_AUTHORITY_LEVEL_DESCRIPTIONS, type AiAuthorityLevel } from "@/lib/coach/ai-authority";
import { formatLongDateLabel, isLocalDateBefore, localDateDayOfWeek, resolveBrowserTimeZone, resolveClientLocalDateIso } from "@/lib/shared/local-date";
import type { RevisionChange, RevisionPlan } from "@/lib/coach/program-revision";
import type { ClientOnboardingSnapshot } from "@/lib/coach/activation-generation";
import type { CompleteNutritionPrescription, NutritionRevisionChange, NutritionRevisionPlan } from "@/lib/coach/nutrition-directions";
import type { ActivationGenerationRecord } from "@/lib/coach/activation-lifecycle";
import type { ClientAssignedProgram } from "@/lib/types";

/**
 * Phase 5.5A — the unified OPTIM Plan (spec Parts 2-4, 7-9): one client
 * entry point covering both training and nutrition, always reachable even
 * while a health concern is unresolved (Part 3).
 *
 * Phase 5.6A.1 — the "ready to review" stage is now a real decision
 * workspace (see PlanWorkspaceHeader/PlanOverviewCard/PlanAlternatives/
 * PlanTrainingReview/PlanNutritionReview/ReviseWithOptimSheet) rather than
 * one long, undifferentiated page: a compact overview leads, alternatives
 * stay secondary, the actual program is inspectable without tiny pills, and
 * approval stays available via a persistent action bar as the coach scrolls.
 */
export default function OptimPlanPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const composer = useProgramComposer(params.clientId);

  // Phase 5.6A.1 — opening this page must always land at the top of the
  // workspace, never inherit whatever scroll position the client page (or a
  // previous visit to this same page) left behind.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (!composer.client) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => router.push("/coach/clients")} />
        <Card>
          <p className="text-sm text-neutral">No client found for this id.</p>
        </Card>
      </div>
    );
  }

  const client = composer.client;
  // Phase 5.6A.2 — an active client with a real assigned program gets its
  // own richer ActivePlanHeader (see ActiveClientComposer) instead of this
  // generic one, so the two never stack. An active client with NO assigned
  // program yet (a legacy/manually-activated edge case) still falls back to
  // this generic header for basic back-navigation, since ActiveClientComposer
  // itself renders nothing but a bare warning card in that case.
  const showGenericHeader = composer.isActiveClient
    ? !composer.assignedProgram
    : !composer.latest || (composer.latest.state !== "ready_for_review" && composer.latest.state !== "revision_prepared");

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      {showGenericHeader ? (
        <>
          <BackLink onClick={() => router.push(`/coach/clients/${client.id}`)} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-display text-off-white">OPTIM Plan — {client.name}</h1>
            {!composer.isActiveClient ? (
              <div className="rounded-[var(--radius-sm)] bg-accent-soft px-3.5 py-2 text-sm text-accent-strong">{AI_AUTHORITY_LEVEL_DESCRIPTIONS[composer.effectiveLevel as AiAuthorityLevel]}</div>
            ) : null}
          </div>
        </>
      ) : null}

      {!composer.activeModel ? (
        <BlockedState
          icon={Sparkles}
          title="Calibrate OPTIM before composing a plan"
          body="This workspace hasn't completed coach onboarding yet — there's no active Coaching Method for OPTIM to generate from."
          actionLabel="Go to coach onboarding"
          onAction={() => router.push("/coach-onboarding")}
        />
      ) : composer.isActiveClient ? (
        <ActiveClientComposer composer={composer} clientId={client.id} clientName={client.name} onBack={() => router.push(`/coach/clients/${client.id}`)} />
      ) : !composer.onboarding?.completedAtIso ? (
        <BlockedState icon={AlertTriangle} title="Waiting on client onboarding" body={`${client.name} hasn't completed their intake yet.`} />
      ) : (
        <InitialComposer composer={composer} clientId={client.id} clientName={client.name} onBack={() => router.push(`/coach/clients/${client.id}`)} />
      )}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
      <ArrowLeft size={16} aria-hidden="true" /> Back
    </button>
  );
}

function BlockedState({ icon: Icon, title, body, actionLabel, onAction }: { icon: typeof AlertTriangle; title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <Card className="text-center">
      <Icon size={24} className="mx-auto mb-3 text-warning-strong" aria-hidden="true" />
      <p className="text-body font-semibold text-off-white">{title}</p>
      <p className="mt-1 text-meta text-neutral">{body}</p>
      {actionLabel && onAction ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stage A/B — not-yet-active client
// ---------------------------------------------------------------------------

function InitialComposer({ composer, clientId, clientName, onBack }: { composer: ReturnType<typeof useProgramComposer>; clientId: string; clientName: string; onBack: () => void }) {
  const router = useRouter();
  const [selectedDirectionId, setSelectedDirectionId] = useState<string | null>(null);
  const [combineWithId, setCombineWithId] = useState<string | null>(null);
  const [selectedNutritionId, setSelectedNutritionId] = useState<string | null>(null);
  const [justApproved, setJustApproved] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [previewWeekNumber, setPreviewWeekNumber] = useState<number | null>(null);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [revisionPreview, setRevisionPreview] = useState<{ plan: RevisionPlan; revisedProgram: ClientAssignedProgram; changes: RevisionChange[] } | null>(null);
  const [nutritionRevisionPreview, setNutritionRevisionPreview] = useState<{ plan: NutritionRevisionPlan; revisedPrescription: CompleteNutritionPrescription; changes: NutritionRevisionChange[] } | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseScope, setReviseScope] = useState<ReviseScope>("training");
  const [assumptionsAcknowledged, setAssumptionsAcknowledged] = useState(false);

  const latest = composer.latest;
  const manualFirst = composer.effectiveLevel === "advisor";
  const autonomous = composer.effectiveLevel === "ai_led" || composer.effectiveLevel === "review_only";

  useEffect(() => {
    const t = setTimeout(() => {
      if (latest?.directions?.length && !selectedDirectionId) {
        setSelectedDirectionId(latest.selectedDirectionId ?? latest.directions.find((d) => d.kind === "best_fit")?.id ?? latest.directions[0].id);
      }
      if (latest?.nutritionOptions?.length && !selectedNutritionId) {
        setSelectedNutritionId(latest.selectedNutritionOptionId ?? latest.nutritionOptions.find((o) => o.kind === "best_fit")?.id ?? latest.nutritionOptions[0].id);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  const startDateIso = composer.clientAppState?.programEnrollment.startDateIso ?? composer.intendedProgram?.intendedStartDateIso;
  const startDateLabel = startDateIso ? new Date(`${startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not set";
  const clientReportedDetail = typeof composer.onboarding?.answers.health_finish?.injuryRestrictions === "string" ? composer.onboarding.answers.health_finish.injuryRestrictions : null;

  const healthGate =
    composer.healthReviewResolved === false && composer.healthReview ? (
      <HealthReviewGate
        clientFirstName={clientName.split(" ")[0]}
        healthReview={composer.healthReview}
        clientReportedDetail={clientReportedDetail}
        onChangeStatus={(status, documentedLimitations) =>
          composer.dispatchPlatform({ type: "SET_HEALTH_REVIEW_STATUS", clientId, workspaceId: composer.workspaceId, status, nowIso: new Date().toISOString(), documentedLimitations })
        }
      />
    ) : null;

  if (justApproved || latest?.state === "activated") {
    return (
      <div className="space-y-5">
        {healthGate}
        <Card className="border-l-2 border-l-success">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <Check size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="text-body font-semibold text-off-white">Activated — {clientName}&apos;s real Today, Training, and Nutrition experience is live.</p>
              <p className="mt-1 text-meta text-neutral">
                Program: {latest?.approval?.resultingProgramId} · Approved at {latest?.approval?.approvedAtIso ? new Date(latest.approval.approvedAtIso).toLocaleString() : "—"}
              </p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={onBack}>
                Back to client page
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  function handleAutoGenerate() {
    composer.runAutoGeneration();
  }

  if (!latest || latest.state === "generation_failed" || latest.state === "blocked") {
    const isDataBlocked = latest?.state === "blocked" && !latest.trainingOptions?.length;
    return (
      <div className="space-y-5">
        {healthGate}
        <Card className="text-center">
          <Sparkles size={24} className="mx-auto mb-3 text-accent-strong" aria-hidden="true" />
          <p className="text-body text-off-white">Understand {clientName}, then compare OPTIM&apos;s ranked training and nutrition directions.</p>
          {latest?.failureReason ? <p className="mt-2 text-meta text-error-strong">Last attempt failed: {latest.failureReason}</p> : null}
          {latest?.state === "blocked" && latest.blockedReasons?.length ? <p className="mt-2 text-meta text-warning-strong">Last attempt was blocked: {latest.blockedReasons.join(" ")}</p> : null}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {!manualFirst ? (
              <Button size="lg" onClick={autonomous ? handleAutoGenerate : () => composer.runDirections()} disabled={composer.healthReviewResolved === false}>
                {autonomous ? <Zap size={16} aria-hidden="true" /> : <Wand2 size={16} aria-hidden="true" />}
                {autonomous ? "Generate my recommended plan" : latest ? "Try again" : "Generate program directions"}
              </Button>
            ) : (
              <>
                <Button size="lg" variant="secondary" onClick={() => composer.runDirections()} disabled={composer.healthReviewResolved === false}>
                  <Wand2 size={16} aria-hidden="true" /> See OPTIM&apos;s analysis
                </Button>
                <Button size="lg" onClick={() => router.push(`/coach/clients/${clientId}/setup/training`)}>
                  <Layers size={16} aria-hidden="true" /> Build manually
                </Button>
              </>
            )}
            {isDataBlocked ? (
              <Button size="lg" variant="secondary" onClick={() => router.push(`/coach/clients/${clientId}/setup`)}>
                Complete programming profile
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
    );
  }

  if (latest.state === "directions_ready" && latest.directions) {
    return (
      <div className="space-y-5">
        {healthGate}
        <ClientIntelligenceSection latest={latest} />
        <div>
          <h2 className="text-heading text-off-white">Ranked training directions</h2>
          <p className="mt-1 text-meta text-neutral">Three concise, structurally distinct directions — pick one, or combine two before generating the full program.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {latest.directions.map((dir) => (
              <DirectionCard
                key={dir.id}
                direction={dir}
                selectedPrimary={selectedDirectionId === dir.id}
                selectedSecondary={combineWithId === dir.id}
                onSelectPrimary={() => {
                  setSelectedDirectionId(dir.id);
                  if (combineWithId === dir.id) setCombineWithId(null);
                }}
                onToggleCombine={() => {
                  if (dir.id === selectedDirectionId) return;
                  setCombineWithId((prev) => (prev === dir.id ? null : dir.id));
                }}
              />
            ))}
          </div>
        </div>
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" disabled={!selectedDirectionId} onClick={() => selectedDirectionId && composer.buildFullProgram(latest, selectedDirectionId, combineWithId ?? undefined)}>
              <Wand2 size={16} aria-hidden="true" /> Generate the full program
            </Button>
            <Button variant="outline" size="lg" onClick={() => router.push(`/coach/clients/${clientId}/setup/training`)}>
              <Layers size={16} aria-hidden="true" /> Build manually instead
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ready_for_review / revision_prepared — exactly one full, periodized
  // training program plus (when this coach offers it) a complete nutrition
  // prescription, presented as one decision workspace.
  const option = latest.trainingOptions[0];
  const direction = latest.directions?.find((d) => d.id === latest.selectedDirectionId) ?? null;
  if (!option) return null;

  const activeNutritionId = selectedNutritionId ?? latest.selectedNutritionOptionId ?? null;
  const selectedNutritionStrategy = latest.nutritionOptions.find((o) => o.id === activeNutritionId) ?? null;
  const materialAssumptions = selectedNutritionStrategy ? materialNutritionAssumptions(selectedNutritionStrategy.assumptions) : [];

  // Phase 5.6A.3 — the scheduled start date lapsing before the coach ever
  // approves must never be silently absorbed into "starts today" (that's
  // the exact premature-Day-1 bug this phase repairs). It requires the
  // coach's own explicit resolution here, before Approve is available —
  // see the RESCHEDULE_INTENDED_PROGRAM action this dispatches.
  const timeZone = composer.activeModel?.operationalContext.timeZone || resolveBrowserTimeZone();
  const todayIso = resolveClientLocalDateIso(new Date(), timeZone);
  const scheduledStartIso = composer.intendedProgram?.intendedStartDateIso ?? null;
  const startDateHasPassed = !!scheduledStartIso && isLocalDateBefore(scheduledStartIso, todayIso);

  function handleRescheduleToToday() {
    composer.dispatchPlatform({ type: "RESCHEDULE_INTENDED_PROGRAM", clientId, workspaceId: composer.workspaceId, intendedStartDateIso: todayIso });
  }

  const approveDisabled = (materialAssumptions.length > 0 && !assumptionsAcknowledged) || startDateHasPassed;

  function handleRevisePreview() {
    if (!revisionInstruction.trim() || !latest) return;
    if (reviseScope === "training" || reviseScope === "both") {
      setRevisionPreview(composer.previewDraftRevision(option.program, revisionInstruction));
    } else {
      setRevisionPreview(null);
    }
    if ((reviseScope === "nutrition" || reviseScope === "both") && latest.selectedNutritionPrescription) {
      const weightLb = composer.onboarding?.answers.about_you?.weightLb;
      const primaryGoal = typeof composer.onboarding?.answers.what_you_want?.primaryGoal === "string" ? composer.onboarding.answers.what_you_want.primaryGoal : "";
      const secondaryGoals = Array.isArray(composer.onboarding?.answers.what_you_want?.secondaryGoals) ? (composer.onboarding.answers.what_you_want.secondaryGoals as string[]) : [];
      const baseProteinGPerLb = composer.activeModel
        ? resolveProteinTargetGramsPerLb(composer.activeModel, { primaryGoal, secondaryGoals } as ClientOnboardingSnapshot)
        : 0.8;
      setNutritionRevisionPreview(composer.previewDraftNutritionRevision(latest.selectedNutritionPrescription, revisionInstruction, typeof weightLb === "number" ? weightLb : 180, baseProteinGPerLb));
    } else {
      setNutritionRevisionPreview(null);
    }
  }

  function handleReviseConfirm() {
    if (!latest) return;
    if (revisionPreview && (reviseScope === "training" || reviseScope === "both")) {
      composer.confirmDraftRevision(latest, revisionInstruction, revisionPreview.plan, revisionPreview.revisedProgram, revisionPreview.changes);
    }
    if (nutritionRevisionPreview && (reviseScope === "nutrition" || reviseScope === "both")) {
      composer.confirmDraftNutritionRevision(latest, revisionInstruction, nutritionRevisionPreview.plan, nutritionRevisionPreview.revisedPrescription, nutritionRevisionPreview.changes);
    }
    setRevisionPreview(null);
    setNutritionRevisionPreview(null);
    setRevisionInstruction("");
    setReviseOpen(false);
  }

  function handleReviseDiscard() {
    setRevisionPreview(null);
    setNutritionRevisionPreview(null);
  }

  return (
    <div className="space-y-5">
      <PlanWorkspaceHeader clientName={clientName} startDateLabel={startDateLabel} onBack={onBack} />
      {healthGate}
      {startDateHasPassed && scheduledStartIso ? (
        <Card className="border-l-2 border-l-warning-strong">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-strong">
              <AlertTriangle size={16} aria-hidden="true" />
            </span>
            <div>
              <p className="text-body font-semibold text-off-white">This plan&apos;s scheduled start ({formatLongDateLabel(scheduledStartIso)}) has already passed.</p>
              <p className="mt-1 text-meta text-neutral">It never started on its own — approving is paused until you decide how to proceed.</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={handleRescheduleToToday}>
                Start today instead
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
      <ClientIntelligenceSection latest={latest} />

      <PlanOverviewCard
        direction={direction}
        nutritionStrategy={selectedNutritionStrategy}
        materialAssumptions={materialAssumptions}
        assumptionsAcknowledged={assumptionsAcknowledged}
        onAcknowledgeAssumptions={setAssumptionsAcknowledged}
      />

      <PlanAlternatives
        directions={latest.directions ?? []}
        selectedDirectionId={latest.selectedDirectionId ?? null}
        onSelectDirection={(id) => composer.buildFullProgram(latest, id)}
        nutritionOptions={latest.nutritionOptions}
        selectedNutritionId={activeNutritionId}
        onSelectNutrition={(id) => {
          setSelectedNutritionId(id);
          composer.selectNutrition(latest, id);
        }}
      />

      <PlanTrainingReview program={option.program} onOpenWeek={setPreviewWeekNumber} />

      {selectedNutritionStrategy && latest.selectedNutritionPrescription ? <PlanNutritionReview prescription={latest.selectedNutritionPrescription} /> : null}

      <PlanActionBar
        onApprove={() => {
          const outcome = composer.approveInitial(latest);
          if (outcome.ok) {
            setApproveError(null);
            setJustApproved(true);
          } else {
            setApproveError(outcome.error);
          }
        }}
        onRevise={() => setReviseOpen(true)}
        onFineTune={() => router.push(`/coach/clients/${clientId}/setup/training`)}
        approveDisabled={approveDisabled}
        approveDisabledReason={
          startDateHasPassed
            ? "Resolve the passed start date above before approving."
            : approveDisabled
              ? "Review the flagged assumption above before approving."
              : undefined
        }
        approveError={approveError}
      />

      <ReviseWithOptimSheet
        open={reviseOpen}
        onClose={() => {
          setReviseOpen(false);
          handleReviseDiscard();
        }}
        scope={reviseScope}
        onScopeChange={setReviseScope}
        hasNutrition={latest.nutritionOptions.length > 0}
        instruction={revisionInstruction}
        onInstructionChange={setRevisionInstruction}
        onPreview={handleRevisePreview}
        trainingPreview={revisionPreview}
        nutritionPreview={nutritionRevisionPreview}
        onConfirm={handleReviseConfirm}
        onDiscard={handleReviseDiscard}
      />

      <ProgramWeekPreviewSheet week={option.program.weeks.find((w) => w.weekNumber === previewWeekNumber) ?? null} open={previewWeekNumber !== null} onClose={() => setPreviewWeekNumber(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active client — conversational revision + adaptation proposals
// ---------------------------------------------------------------------------

function ActiveClientComposer({ composer, clientId, clientName, onBack }: { composer: ReturnType<typeof useProgramComposer>; clientId: string; clientName: string; onBack: () => void }) {
  const router = useRouter();
  const [previewWeekNumber, setPreviewWeekNumber] = useState<number | null>(null);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [revisionPreview, setRevisionPreview] = useState<{ plan: RevisionPlan; revisedProgram: ClientAssignedProgram; changes: RevisionChange[] } | null>(null);
  const [nutritionRevisionPreview, setNutritionRevisionPreview] = useState<{ plan: NutritionRevisionPlan; revisedPrescription: CompleteNutritionPrescription; changes: NutritionRevisionChange[] } | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseScope, setReviseScope] = useState<ReviseScope>("training");
  const [autoChecked, setAutoChecked] = useState(false);
  const autoCheckRanForRef = useRef<string | null>(null);

  const program = composer.assignedProgram;

  // Phase 5.6A.2 — OPTIM appears to monitor the client automatically: the
  // exact same detectAdaptationProposals/persistAdaptationProposalReview
  // pipeline the old manual "Check for proposals" button called now runs
  // once per client on its own. Idempotent by construction (see
  // detectAdaptationProposals' own dedup against existingProposals and
  // persistAdaptationProposalReview's own dedup against the client's real
  // ReviewRequests), so a StrictMode double-invoke or a re-run for the same
  // client is always safe — the ref guard just avoids a redundant call.
  useEffect(() => {
    if (!program) return;
    if (autoCheckRanForRef.current === clientId) return;
    autoCheckRanForRef.current = clientId;
    composer.checkForAdaptationProposals();
    setAutoChecked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, program]);

  if (!program) {
    return (
      <Card className="text-center">
        <AlertTriangle size={24} className="mx-auto mb-3 text-warning-strong" aria-hidden="true" />
        <p className="text-body text-off-white">No assigned program yet for {clientName}.</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={onBack}>
          Back to client page
        </Button>
      </Card>
    );
  }

  const direction = composer.latest?.directions?.find((d) => d.id === composer.latest?.selectedDirectionId) ?? null;
  const trainingName = direction ? meaningfulTrainingDirectionName(direction) : program.name;
  const frequencyPerWeek = direction?.frequencyPerWeek ?? program.weeks[0]?.days.filter((d) => d.type === "training").length ?? 0;
  const sessionLengthMin = direction?.estimatedSessionLengthMin ?? null;

  const nutritionStrategy = composer.latest?.nutritionOptions?.find((o) => o.id === composer.latest?.selectedNutritionOptionId) ?? null;
  const nutritionName = nutritionStrategy ? meaningfulNutritionStrategyName(nutritionStrategy) : (composer.assignedNutritionPlan?.sourceStrategyLabel ?? null);

  const startDateIso = composer.clientAppState?.programEnrollment.startDateIso;
  const startDateLabel = startDateIso ? new Date(`${startDateIso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not set";
  const lastUpdatedLabel = composer.latest?.updatedAtIso ? new Date(composer.latest.updatedAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const todayDayOfWeek = composer.clientAppState ? localDateDayOfWeek(composer.clientAppState.dateIso) : "Monday";

  const adaptiveState = resolveAdaptiveCheckState({ hasActiveProposals: composer.activeProposalReviews.length > 0, hasCheckedOnce: autoChecked, currentWeekNumber: composer.currentWeekNumber });

  function handleReviseOpen() {
    setReviseScope("training");
    setReviseOpen(true);
  }

  function handleRevisePreview() {
    if (!revisionInstruction.trim()) return;
    if (reviseScope === "training" || reviseScope === "both") {
      setRevisionPreview(composer.previewRevision(revisionInstruction));
    } else {
      setRevisionPreview(null);
    }
    if ((reviseScope === "nutrition" || reviseScope === "both") && composer.assignedNutritionPlan) {
      setNutritionRevisionPreview(composer.previewNutritionRevision(revisionInstruction));
    } else {
      setNutritionRevisionPreview(null);
    }
  }

  function handleReviseConfirm() {
    if (revisionPreview && (reviseScope === "training" || reviseScope === "both")) {
      composer.confirmRevision(revisionInstruction, revisionPreview.plan, revisionPreview.revisedProgram, revisionPreview.changes);
    }
    if (nutritionRevisionPreview && (reviseScope === "nutrition" || reviseScope === "both")) {
      composer.confirmNutritionRevision(nutritionRevisionPreview.revisedPrescription);
    }
    setRevisionPreview(null);
    setNutritionRevisionPreview(null);
    setRevisionInstruction("");
    setReviseOpen(false);
  }

  function handleReviseDiscard() {
    setRevisionPreview(null);
    setNutritionRevisionPreview(null);
  }

  return (
    <div className="space-y-5">
      {/* 1. Active plan and current week */}
      <ActivePlanHeader clientName={clientName} currentWeekNumber={composer.currentWeekNumber} durationWeeks={program.durationWeeks} startDateLabel={startDateLabel} lastUpdatedLabel={lastUpdatedLabel} onBack={onBack} />
      <ActivePlanOverview
        trainingName={trainingName}
        frequencyPerWeek={frequencyPerWeek}
        sessionLengthMin={sessionLengthMin}
        currentWeekNumber={composer.currentWeekNumber}
        nutritionName={nutritionName}
        nutritionTargets={composer.assignedNutritionPlan?.targets ?? null}
      />
      <ActivePlanCurrentWeek program={program} currentWeekNumber={composer.currentWeekNumber} todayDayOfWeek={todayDayOfWeek} onOpenWeek={setPreviewWeekNumber} />

      {/* 2. Any proposal requiring attention */}
      <AdaptiveStatusArea
        state={adaptiveState}
        clientName={clientName}
        activeProposalReviews={composer.activeProposalReviews}
        existingProposals={composer.existingProposals}
        onApply={(proposal, review) => composer.applyProposal(proposal, review)}
        onDismiss={(review) => composer.dismissProposal(review)}
        onRefresh={() => {
          composer.checkForAdaptationProposals();
          setAutoChecked(true);
        }}
      />

      {/* 3. Training and nutrition details — training is the current week above; nutrition detail here. */}
      {composer.assignedNutritionPlan ? (
        <Card>
          <p className="text-subheading text-off-white">{nutritionName ?? composer.assignedNutritionPlan.sourceStrategyLabel}</p>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            <NutritionStat label="Calories" value={`${composer.assignedNutritionPlan.targets.calories} kcal`} />
            <NutritionStat label="Protein" value={`${composer.assignedNutritionPlan.targets.proteinG}g`} />
            <NutritionStat label="Carbs" value={`${composer.assignedNutritionPlan.targets.carbsG}g`} />
            <NutritionStat label="Fat" value={`${composer.assignedNutritionPlan.targets.fatG}g`} />
          </div>
        </Card>
      ) : null}

      {/* 4. Adjustment controls */}
      <Card className="space-y-3">
        <p className="text-subheading text-off-white">Adjustments</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleReviseOpen}>
            <Wand2 size={15} aria-hidden="true" /> Adjust with OPTIM
          </Button>
          <Button variant="outline" onClick={() => router.push(`/coach/clients/${clientId}/setup/training`)}>
            <Layers size={15} aria-hidden="true" /> Fine-tune manually
          </Button>
        </div>
        <PlanChangeHistory trainingRevisions={composer.latest?.revisions ?? []} nutritionRevisions={composer.latest?.nutritionRevisions ?? []} />
      </Card>

      <ReviseWithOptimSheet
        open={reviseOpen}
        onClose={() => {
          setReviseOpen(false);
          handleReviseDiscard();
        }}
        scope={reviseScope}
        onScopeChange={setReviseScope}
        hasNutrition={!!composer.assignedNutritionPlan}
        instruction={revisionInstruction}
        onInstructionChange={setRevisionInstruction}
        onPreview={handleRevisePreview}
        trainingPreview={revisionPreview}
        nutritionPreview={nutritionRevisionPreview}
        onConfirm={handleReviseConfirm}
        onDiscard={handleReviseDiscard}
      />

      <ProgramWeekPreviewSheet week={program.weeks.find((w) => w.weekNumber === previewWeekNumber) ?? null} open={previewWeekNumber !== null} onClose={() => setPreviewWeekNumber(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function ClientIntelligenceSection({ latest }: { latest: ActivationGenerationRecord }) {
  if (!latest.programmingProfile) return null;
  const completeness = latest.programmingProfile.dailyActivityLevelIsAssumed || latest.programmingProfile.cardioPreferenceIsAssumed ? "Some inputs assumed" : "Fully reported";
  return <ClientIntelligencePanel profile={latest.programmingProfile} coachModelVersion={latest.coachModelVersion} dataCompleteness={completeness} />;
}

function NutritionStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-meta text-neutral">{label}</p>
      <p className="font-medium text-off-white">{value}</p>
    </div>
  );
}
