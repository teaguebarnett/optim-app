"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Bookmark, Check, Sparkles, Wand2, CheckCircle2, XCircle, PenLine, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextArea } from "@/components/ui/textarea";
import { ProgramWeekPreviewSheet } from "@/components/coach/program-preview-sheet";
import { useProgramComposer } from "@/hooks/use-program-composer";
import { AI_AUTHORITY_LEVEL_DESCRIPTIONS, type AiAuthorityLevel } from "@/lib/coach/ai-authority";
import type { ProgramDirectionSummary } from "@/lib/coach/program-directions";
import type { RevisionChange, RevisionPlan } from "@/lib/coach/program-revision";
import type { ClientAssignedProgram } from "@/lib/types";

/**
 * Phase 5.5 — the OPTIM Program Composer (spec Part 4): the two-stage
 * direction-then-full-program flow for a not-yet-active client, and
 * conversational revision + adaptation proposals for an already-active
 * one. Replaces the old "generate three full programs immediately" flow —
 * see hooks/use-program-composer.ts's Stage A/B split.
 */
export default function ProgramComposerPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const composer = useProgramComposer(params.clientId);

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

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <BackLink onClick={() => router.push(`/coach/clients/${client.id}`)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display text-off-white">Program Composer — {client.name}</h1>
          <p className="mt-1 text-body text-neutral">
            {client.goal} · {composer.effectiveLevelLabel} authority
          </p>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-accent-soft px-3.5 py-2 text-sm text-accent-strong">
          {AI_AUTHORITY_LEVEL_DESCRIPTIONS[composer.effectiveLevel as AiAuthorityLevel]}
        </div>
      </div>

      {!composer.activeModel ? (
        <BlockedState
          icon={Sparkles}
          title="Calibrate OPTIM before composing a program"
          body="This workspace hasn't completed coach onboarding yet — there's no active Coaching Method for OPTIM to generate from."
          actionLabel="Go to coach onboarding"
          onAction={() => router.push("/coach-onboarding")}
        />
      ) : composer.isActiveClient ? (
        <ActiveClientComposer composer={composer} clientId={client.id} clientName={client.name} onBack={() => router.push(`/coach/clients/${client.id}`)} />
      ) : !composer.onboarding?.completedAtIso ? (
        <BlockedState icon={AlertTriangle} title="Waiting on client onboarding" body={`${client.name} hasn't completed their intake yet.`} />
      ) : composer.healthReviewResolved === false ? (
        <BlockedState
          icon={AlertTriangle}
          title="Blocked by an unresolved health review"
          body="This client's intake flagged something that needs your review before OPTIM can generate or activate anything."
          actionLabel="Review on client page"
          onAction={() => router.push(`/coach/clients/${client.id}`)}
        />
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
  const [justApproved, setJustApproved] = useState(false);
  const [previewWeekNumber, setPreviewWeekNumber] = useState<number | null>(null);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [revisionPreview, setRevisionPreview] = useState<{ plan: RevisionPlan; revisedProgram: ClientAssignedProgram; changes: RevisionChange[] } | null>(null);

  const latest = composer.latest;

  useEffect(() => {
    const t = setTimeout(() => {
      if (latest?.directions?.length && !selectedDirectionId) {
        setSelectedDirectionId(latest.selectedDirectionId ?? latest.directions.find((d) => d.kind === "best_fit")?.id ?? latest.directions[0].id);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  if (justApproved || latest?.state === "activated") {
    return (
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
    );
  }

  if (!latest || latest.state === "generation_failed" || latest.state === "blocked") {
    return (
      <Card className="text-center">
        <Sparkles size={24} className="mx-auto mb-3 text-accent-strong" aria-hidden="true" />
        <p className="text-body text-off-white">Understand {clientName}, then compare OPTIM&apos;s ranked program directions.</p>
        {latest?.failureReason ? <p className="mt-2 text-meta text-error-strong">Last attempt failed: {latest.failureReason}</p> : null}
        {latest?.state === "blocked" && latest.blockedReasons?.length ? (
          <p className="mt-2 text-meta text-warning-strong">Last attempt was blocked: {latest.blockedReasons.join(" ")}</p>
        ) : null}
        <Button size="lg" className="mt-4" onClick={() => composer.runDirections()}>
          {latest ? "Try again" : "Generate program directions"}
        </Button>
      </Card>
    );
  }

  if (latest.state === "directions_ready" && latest.directions) {
    return (
      <div className="space-y-5">
        <ClientIntelligenceSummary composer={composer} />
        <div>
          <h2 className="text-heading text-off-white">Ranked program directions</h2>
          <p className="mt-1 text-meta text-neutral">Three concise, structurally distinct directions — pick one, or combine two before generating the full program.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {latest.directions.map((direction) => (
              <DirectionCard
                key={direction.id}
                direction={direction}
                selectedPrimary={selectedDirectionId === direction.id}
                selectedSecondary={combineWithId === direction.id}
                onSelectPrimary={() => {
                  setSelectedDirectionId(direction.id);
                  if (combineWithId === direction.id) setCombineWithId(null);
                }}
                onToggleCombine={() => {
                  if (direction.id === selectedDirectionId) return;
                  setCombineWithId((prev) => (prev === direction.id ? null : direction.id));
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
            {combineWithId ? <span className="text-meta text-accent-strong">Combining with a second direction</span> : null}
          </div>
        </Card>
      </div>
    );
  }

  // ready_for_review — exactly one full, periodized program.
  const option = latest.trainingOptions[0];
  const direction = latest.directions?.find((d) => d.id === latest.selectedDirectionId) ?? null;
  if (!option) return null;

  function applyDraftPreview() {
    if (!revisionInstruction.trim()) return;
    setRevisionPreview(composer.previewDraftRevision(option.program, revisionInstruction));
  }

  function confirmDraftPreview() {
    if (!revisionPreview || !latest) return;
    composer.confirmDraftRevision(latest, revisionInstruction, revisionPreview.plan, revisionPreview.revisedProgram, revisionPreview.changes);
    setRevisionPreview(null);
    setRevisionInstruction("");
  }

  return (
    <div className="space-y-5">
      <ClientIntelligenceSummary composer={composer} />

      {direction ? (
        <Card>
          <p className="text-subheading text-off-white">Selected strategy — {direction.label}</p>
          <p className="mt-1 text-sm text-neutral">{direction.whyItFits}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {direction.constraintsHonored.map((c) => (
              <span key={c} className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
                {c}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <ConstraintSummary option={option} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-subheading text-off-white">{option.program.durationWeeks}-week program — {option.program.weeks.length} weeks generated</p>
          <div className="flex flex-wrap items-center gap-2">
            {option.program.weeks.map((w) => (
              <button
                key={w.weekNumber}
                onClick={() => setPreviewWeekNumber(w.weekNumber)}
                className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-2.5 py-1 text-xs font-medium text-off-white hover:bg-surface-input"
              >
                Wk {w.weekNumber}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-subheading text-off-white">Revise before approving</p>
        <p className="mt-1 text-meta text-neutral">Describe a change in plain language — e.g. &quot;Keep all workouts under 60 minutes.&quot;</p>
        <div className="mt-3 max-w-xl">
          <TextArea id="draft-revision" label="What should change?" value={revisionInstruction} onChange={(e) => setRevisionInstruction(e.target.value)} rows={2} />
          <Button size="sm" variant="secondary" className="mt-2" onClick={applyDraftPreview} disabled={!revisionInstruction.trim()}>
            <PenLine size={14} aria-hidden="true" /> Preview change
          </Button>
        </div>
        {revisionPreview ? <RevisionPreviewPanel preview={revisionPreview} onConfirm={confirmDraftPreview} onDiscard={() => setRevisionPreview(null)} /> : null}
      </Card>

      <Card>
        <p className="text-subheading text-off-white">Approval</p>
        <p className="mt-1 text-meta text-neutral">
          Approving assigns this program (every week, every exercise) and nutrition targets directly to {clientName}&apos;s real account.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={() => {
              const result = composer.approveInitial(latest);
              if (result) setJustApproved(true);
            }}
          >
            Approve &amp; assign
          </Button>
          <Button variant="secondary" size="lg" onClick={() => router.push(`/coach/clients/${clientId}/setup/training`)}>
            <Layers size={16} aria-hidden="true" /> Fine-tune manually
          </Button>
        </div>
      </Card>

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

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-subheading text-off-white">{program.name}</p>
        <p className="mt-1 text-meta text-neutral">
          Currently week {composer.currentWeekNumber} of {program.durationWeeks}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {program.weeks.map((w) => (
            <button
              key={w.weekNumber}
              onClick={() => setPreviewWeekNumber(w.weekNumber)}
              className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-2.5 py-1 text-xs font-medium text-off-white hover:bg-surface-input"
            >
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

function DirectionCard({
  direction,
  selectedPrimary,
  selectedSecondary,
  onSelectPrimary,
  onToggleCombine,
}: {
  direction: ProgramDirectionSummary;
  selectedPrimary: boolean;
  selectedSecondary: boolean;
  onSelectPrimary: () => void;
  onToggleCombine: () => void;
}) {
  return (
    <Card className={selectedPrimary ? "border-l-2 border-l-accent" : selectedSecondary ? "border-l-2 border-l-accent-soft" : ""}>
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-strong">{direction.kind.replace(/_/g, " ")}</p>
      <p className="mt-1 text-subheading text-off-white">{direction.label}</p>
      <p className="mt-1 text-sm text-neutral">{direction.splitName} · {direction.frequencyPerWeek}x/week · ~{direction.estimatedSessionLengthMin} min</p>
      <p className="mt-2 text-sm text-off-white">{direction.whyItFits}</p>
      <p className="mt-2 text-meta text-neutral">Tradeoff: {direction.tradeoff}</p>
      <p className="mt-2 text-meta text-neutral">{direction.periodizationApproach} · {direction.approxVolumeDescription} · {direction.approxIntensityDescription}</p>
      <p className="mt-2 text-meta text-neutral">{direction.confidenceNote}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant={selectedPrimary ? "primary" : "secondary"} onClick={onSelectPrimary}>
          {selectedPrimary ? "Selected" : "Select"}
        </Button>
        <Button size="sm" variant={selectedSecondary ? "primary" : "outline"} onClick={onToggleCombine} disabled={selectedPrimary}>
          {selectedSecondary ? "Combining" : "Combine"}
        </Button>
      </div>
    </Card>
  );
}

function ConstraintSummary({ option }: { option: { constraints: { passed: boolean; checks: { id: string; label: string; passed: boolean; reason?: string }[] } } }) {
  return (
    <Card>
      <p className="text-subheading text-off-white">Constraints {option.constraints.passed ? "honored" : "— attention needed"}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {option.constraints.checks.map((c) => (
          <span
            key={c.id}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.passed ? "bg-success-soft text-success" : "bg-error-soft text-error-strong"}`}
            title={c.reason}
          >
            {c.label}
          </span>
        ))}
      </div>
    </Card>
  );
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

function ClientIntelligenceSummary({ composer }: { composer: ReturnType<typeof useProgramComposer> }) {
  const about = composer.onboarding?.answers.about_you;
  const week = composer.onboarding?.answers.your_week;
  const goals = composer.onboarding?.answers.what_you_want;
  const fuel = composer.onboarding?.answers.fuel_recovery;

  return (
    <Card>
      <p className="text-subheading text-off-white">Client intelligence</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
        <SummaryStat label="Goal" value={typeof goals?.primaryGoal === "string" ? goals.primaryGoal.replace(/_/g, " ") : "—"} />
        <SummaryStat label="Availability" value={Array.isArray(week?.availableDays) ? `${week.availableDays.length} days/week` : "—"} />
        <SummaryStat label="Session length" value={typeof week?.maxSessionLength === "string" ? `${week.maxSessionLength} min` : "—"} />
        <SummaryStat label="Experience" value={typeof composer.onboarding?.answers.starting_point?.trainingExperience === "string" ? composer.onboarding.answers.starting_point.trainingExperience.replace(/_/g, " ") : "—"} />
        <SummaryStat label="Age" value={typeof about?.age === "number" ? String(about.age) : "—"} />
        <SummaryStat
          label="Dietary restrictions"
          value={fuel?.hasDietaryRestrictions === "yes" ? (typeof fuel.dietaryRestrictionsDetail === "string" && fuel.dietaryRestrictionsDetail ? fuel.dietaryRestrictionsDetail : "Reported, no detail") : "None reported"}
        />
        <SummaryStat label="Health review" value={composer.healthReviewResolved === "no_review_needed" ? "None needed" : composer.healthReviewResolved ? "Resolved" : "Unresolved"} />
        <SummaryStat label="Coach model" value={`v${composer.activeModel?.version ?? "—"}`} />
      </div>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-meta text-neutral">{label}</p>
      <p className="font-medium capitalize text-off-white">{value}</p>
    </div>
  );
}
