"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Bookmark, Check, Sparkles, Wand2, CheckCircle2, XCircle, PenLine, Layers, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextArea } from "@/components/ui/textarea";
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
import { useProgramComposer } from "@/hooks/use-program-composer";
import { materialNutritionAssumptions } from "@/lib/coach/plan-presentation";
import { AI_AUTHORITY_LEVEL_DESCRIPTIONS, type AiAuthorityLevel } from "@/lib/coach/ai-authority";
import type { RevisionChange, RevisionPlan } from "@/lib/coach/program-revision";
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
  const showGenericHeader = composer.isActiveClient || !composer.latest || (composer.latest.state !== "ready_for_review" && composer.latest.state !== "revision_prepared");

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
  const approveDisabled = materialAssumptions.length > 0 && !assumptionsAcknowledged;

  function handleRevisePreview() {
    if (!revisionInstruction.trim() || !latest) return;
    if (reviseScope === "training" || reviseScope === "both") {
      setRevisionPreview(composer.previewDraftRevision(option.program, revisionInstruction));
    } else {
      setRevisionPreview(null);
    }
    if ((reviseScope === "nutrition" || reviseScope === "both") && latest.selectedNutritionPrescription) {
      const weightLb = composer.onboarding?.answers.about_you?.weightLb;
      const baseProteinGPerLb = composer.activeModel?.nutritionPhilosophy.proteinTargetGramsPerLbBodyweight ?? 1;
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
          const result = composer.approveInitial(latest);
          if (result) setJustApproved(true);
        }}
        onRevise={() => setReviseOpen(true)}
        onFineTune={() => router.push(`/coach/clients/${clientId}/setup/training`)}
        approveDisabled={approveDisabled}
        approveDisabledReason={approveDisabled ? "Review the flagged assumption above before approving." : undefined}
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
  const [nutritionRevisionInstruction, setNutritionRevisionInstruction] = useState("");
  const [nutritionRevisionPreview, setNutritionRevisionPreview] = useState<{ plan: NutritionRevisionPlan; revisedPrescription: CompleteNutritionPrescription; changes: NutritionRevisionChange[] } | null>(null);
  const [checked, setChecked] = useState(false);

  const program = composer.assignedProgram;
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

  function applyPreview() {
    if (!revisionInstruction.trim()) return;
    setRevisionPreview(composer.previewRevision(revisionInstruction));
  }

  function confirmPreview() {
    if (!revisionPreview) return;
    composer.confirmRevision(revisionInstruction, revisionPreview.plan, revisionPreview.revisedProgram, revisionPreview.changes);
    setRevisionPreview(null);
    setRevisionInstruction("");
  }

  function applyNutritionPreview() {
    if (!nutritionRevisionInstruction.trim()) return;
    setNutritionRevisionPreview(composer.previewNutritionRevision(nutritionRevisionInstruction));
  }

  function confirmNutritionPreview() {
    if (!nutritionRevisionPreview) return;
    composer.confirmNutritionRevision(nutritionRevisionPreview.revisedPrescription);
    setNutritionRevisionPreview(null);
    setNutritionRevisionInstruction("");
  }

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-subheading text-off-white">{program.name}</p>
        <p className="mt-1 text-meta text-neutral">
          Currently week {composer.currentWeekNumber} of {program.durationWeeks}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {program.weeks.map((w) => (
            <button key={w.weekNumber} onClick={() => setPreviewWeekNumber(w.weekNumber)} className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-2.5 py-1 text-xs font-medium text-off-white hover:bg-surface-input">
              Wk {w.weekNumber}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-subheading text-off-white">Revise upcoming training</p>
        <p className="mt-1 text-meta text-neutral">
          Only week {composer.currentWeekNumber + 1} onward can change — {clientName}&apos;s current and past weeks stay exactly as they are.
        </p>
        <div className="mt-3 max-w-xl">
          <TextArea id="active-revision" label="What should change?" value={revisionInstruction} onChange={(e) => setRevisionInstruction(e.target.value)} rows={2} placeholder="e.g. Reduce next week's fatigue without changing frequency." />
          <Button size="sm" variant="secondary" className="mt-2" onClick={applyPreview} disabled={!revisionInstruction.trim()}>
            <PenLine size={14} aria-hidden="true" /> Preview change
          </Button>
        </div>
        {revisionPreview ? <RevisionPreviewPanel preview={revisionPreview} onConfirm={confirmPreview} onDiscard={() => setRevisionPreview(null)} confirmLabel="Approve & assign this revision" /> : null}
      </Card>

      {composer.assignedNutritionPlan ? (
        <Card>
          <p className="text-subheading text-off-white">Nutrition plan — {composer.assignedNutritionPlan.sourceStrategyLabel}</p>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            <NutritionStat label="Calories" value={`${composer.assignedNutritionPlan.targets.calories} kcal`} />
            <NutritionStat label="Protein" value={`${composer.assignedNutritionPlan.targets.proteinG}g`} />
            <NutritionStat label="Carbs" value={`${composer.assignedNutritionPlan.targets.carbsG}g`} />
            <NutritionStat label="Fat" value={`${composer.assignedNutritionPlan.targets.fatG}g`} />
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-sm font-medium text-off-white">Revise nutrition</p>
            <div className="mt-2 max-w-xl">
              <TextArea id="active-nutrition-revision" label="What should change?" value={nutritionRevisionInstruction} onChange={(e) => setNutritionRevisionInstruction(e.target.value)} rows={2} placeholder="e.g. Reduce calories slightly." />
              <Button size="sm" variant="secondary" className="mt-2" onClick={applyNutritionPreview} disabled={!nutritionRevisionInstruction.trim()}>
                <PenLine size={14} aria-hidden="true" /> Preview change
              </Button>
            </div>
            {nutritionRevisionPreview ? <NutritionRevisionPreviewPanel preview={nutritionRevisionPreview} onConfirm={confirmNutritionPreview} onDiscard={() => setNutritionRevisionPreview(null)} confirmLabel="Approve & assign this revision" /> : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-subheading text-off-white">Adaptive proposals</p>
            <p className="mt-1 text-meta text-neutral">Real signals from {clientName}&apos;s logged training — checked against your Coach Operating Model.</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              composer.checkForAdaptationProposals();
              setChecked(true);
            }}
          >
            <Sparkles size={14} aria-hidden="true" /> Check for proposals
          </Button>
        </div>
        {checked && composer.activeProposalReviews.length === 0 ? <p className="mt-3 text-sm text-neutral">Nothing new to review.</p> : null}
        {composer.activeProposalReviews.length > 0 ? (
          <div className="mt-3 space-y-2">
            {composer.activeProposalReviews.map((review) => {
              const proposal = composer.existingProposals.find((p) => p.id === review.sourceEventId);
              if (!proposal) return null;
              return (
                <div key={review.id} className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised p-3.5">
                  <p className="text-sm font-medium text-off-white">{proposal.proposedChangeSummary}</p>
                  <p className="mt-1 text-meta text-neutral">{proposal.reasoning}</p>
                  <p className="mt-1 text-meta text-neutral">
                    Targets week{proposal.affectedWeeks.length > 1 ? "s" : ""} {proposal.affectedWeeks.join(", ")} · confidence {Math.round(proposal.confidence * 100)}%
                    {proposal.status === "auto_applied" ? " · already applied" : ""}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    {proposal.status !== "auto_applied" ? (
                      <Button size="sm" onClick={() => composer.applyProposal(proposal, review)}>
                        <CheckCircle2 size={14} aria-hidden="true" /> Apply
                      </Button>
                    ) : null}
                    <Button size="sm" variant="secondary" onClick={() => composer.dismissProposal(review)}>
                      <XCircle size={14} aria-hidden="true" /> Dismiss
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="lg" onClick={() => router.push(`/coach/clients/${clientId}/setup/training`)}>
            <Layers size={16} aria-hidden="true" /> Fine-tune manually
          </Button>
        </div>
      </Card>

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

function RevisionPreviewPanel({
  preview,
  onConfirm,
  onDiscard,
  confirmLabel,
}: {
  preview: { plan: RevisionPlan; revisedProgram: ClientAssignedProgram; changes: RevisionChange[] };
  onConfirm: () => void;
  onDiscard: () => void;
  confirmLabel?: string;
}) {
  if (preview.plan.kind === "unrecognized") {
    return <p className="mt-3 text-sm text-warning-strong">{preview.plan.summary}</p>;
  }
  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-3.5">
      <p className="text-sm font-medium text-off-white">{preview.plan.summary}</p>
      {preview.changes.length === 0 ? (
        <p className="mt-2 text-sm text-neutral">No concrete change resulted — nothing to apply.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {preview.changes.map((c, i) => (
            <li key={i} className="text-meta text-neutral">
              Week {c.weekNumber}, {c.dayOfWeek} — {c.field}: <span className="text-off-white">{c.before}</span> → <span className="text-success">{c.after}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={onConfirm} disabled={preview.changes.length === 0}>
          <Bookmark size={14} aria-hidden="true" /> {confirmLabel ?? "Confirm change"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function NutritionRevisionPreviewPanel({
  preview,
  onConfirm,
  onDiscard,
  confirmLabel,
}: {
  preview: { plan: NutritionRevisionPlan; revisedPrescription: CompleteNutritionPrescription; changes: NutritionRevisionChange[] };
  onConfirm: () => void;
  onDiscard: () => void;
  confirmLabel?: string;
}) {
  if (preview.plan.kind === "unrecognized") {
    return <p className="mt-3 text-sm text-warning-strong">{preview.plan.summary}</p>;
  }
  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-3.5">
      <p className="text-sm font-medium text-off-white">{preview.plan.summary}</p>
      {preview.changes.length === 0 ? (
        <p className="mt-2 text-sm text-neutral">No concrete change resulted — nothing to apply.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {preview.changes.map((c, i) => (
            <li key={i} className="text-meta text-neutral">
              {c.field}: <span className="text-off-white">{c.before}</span> → <span className="text-success">{c.after}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={onConfirm} disabled={preview.changes.length === 0}>
          <Bookmark size={14} aria-hidden="true" /> {confirmLabel ?? "Confirm change"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function NutritionStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-meta text-neutral">{label}</p>
      <p className="font-medium text-off-white">{value}</p>
    </div>
  );
}
