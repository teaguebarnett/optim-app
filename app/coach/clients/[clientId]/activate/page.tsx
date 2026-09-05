"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Bookmark, Check, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextArea } from "@/components/ui/textarea";
import { RankedTrainingCard } from "@/components/coach/activation-studio/ranked-training-card";
import { RankedNutritionCard } from "@/components/coach/activation-studio/ranked-nutrition-card";
import { useActivationStudio } from "@/hooks/use-activation-studio";
import { AI_AUTHORITY_LEVEL_DESCRIPTIONS, type AiAuthorityLevel } from "@/lib/coach/ai-authority";

/**
 * Phase 5.4A — the desktop Activation Studio (this phase's brief §IX).
 * Runs the real, deterministic activation-generation engine
 * (lib/coach/activation-generation.ts) against this client's real,
 * completed onboarding and the coach's real, active Coach Operating Model,
 * then lets the coach compare, select, and approve — approval is the one
 * real write path to the client's actual Today/Training/Nutrition
 * experience (see lib/coach/activation-lifecycle.ts's approveActivation).
 */
export default function ActivationStudioPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const studio = useActivationStudio(params.clientId);
  const [selectedTraining, setSelectedTraining] = useState<string | null>(null);
  const [selectedNutrition, setSelectedNutrition] = useState<string | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [justApproved, setJustApproved] = useState(false);
  const [justSavedAtIso, setJustSavedAtIso] = useState<string | null>(null);

  useEffect(() => {
    // Deferred per the established react-hooks/set-state-in-effect
    // workaround (see hooks/use-prototype-state.tsx) — reacting to a NEW
    // generation record appearing (an external event), not synchronizing
    // derived render state every render.
    const t = setTimeout(() => {
      if (studio.latest?.trainingOptions.length && !selectedTraining) {
        setSelectedTraining(studio.latest.selectedTrainingOptionId ?? studio.latest.trainingOptions.find((o) => o.kind === "best_fit")?.id ?? studio.latest.trainingOptions[0].id);
      }
      if (studio.latest?.nutritionOptions.length && !selectedNutrition) {
        setSelectedNutrition(studio.latest.selectedNutritionOptionId ?? studio.latest.nutritionOptions.find((o) => o.kind === "best_fit")?.id ?? studio.latest.nutritionOptions[0].id);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio.latest?.id]);

  if (!studio.client) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => router.push("/coach/clients")} />
        <Card>
          <p className="text-sm text-neutral">No client found for this id.</p>
        </Card>
      </div>
    );
  }

  const client = studio.client;

  function handleGenerate(instruction?: string) {
    studio.runGeneration(instruction);
    setSelectedTraining(null);
    setSelectedNutrition(null);
    setShowRegenerate(false);
    setRegenInstruction("");
  }

  function handleApprove() {
    if (!studio.latest || !selectedTraining) return;
    const updated = studio.selectOptions(studio.latest, selectedTraining, selectedNutrition);
    const result = studio.approve(updated);
    if (result) setJustApproved(true);
  }

  // Save for Later — persists the coach's real selection onto the real
  // ActivationGenerationRecord (the same SAVE_ACTIVATION_GENERATION write
  // handleApprove uses) WITHOUT activating anything: state stays
  // "ready_for_review", no program/nutrition/communication policy is
  // written to the client, and no lifecycle change occurs. A coach who
  // reopens this client's Activation Studio later (even after a full page
  // reload — this is real PlatformState, not component state) sees their
  // saved selection restored by the effect above and the confirmation
  // banner below, and can pick back up exactly where they left off.
  function handleSaveForLater() {
    if (!studio.latest || !selectedTraining) return;
    studio.selectOptions(studio.latest, selectedTraining, selectedNutrition);
    setJustSavedAtIso(new Date().toISOString());
  }

  const latest = studio.latest;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <BackLink onClick={() => router.push(`/coach/clients/${client.id}`)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display text-off-white">Activation Studio — {client.name}</h1>
          <p className="mt-1 text-body text-neutral">
            {client.goal} · {studio.effectiveLevelLabel} authority
          </p>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-accent-soft px-3.5 py-2 text-sm text-accent-strong">
          {AI_AUTHORITY_LEVEL_DESCRIPTIONS[studio.effectiveLevel as AiAuthorityLevel]}
        </div>
      </div>

      {!studio.activeModel ? (
        <BlockedState
          icon={Sparkles}
          title="Calibrate OPTIM before generating activation options"
          body="This workspace hasn't completed coach onboarding yet — there's no active Coaching Method for OPTIM to generate from."
          actionLabel="Go to coach onboarding"
          onAction={() => router.push("/coach-onboarding")}
        />
      ) : !studio.onboarding?.completedAtIso ? (
        <BlockedState icon={AlertTriangle} title="Waiting on client onboarding" body={`${client.name} hasn't completed their intake yet.`} />
      ) : studio.healthReviewResolved === false ? (
        <BlockedState
          icon={AlertTriangle}
          title="Blocked by an unresolved health review"
          body="This client's intake flagged something that needs your review before OPTIM can generate or activate anything."
          actionLabel="Review on client page"
          onAction={() => router.push(`/coach/clients/${client.id}`)}
        />
      ) : !latest || latest.state === "generation_failed" || latest.state === "blocked" ? (
        <Card className="text-center">
          <Sparkles size={24} className="mx-auto mb-3 text-accent-strong" aria-hidden="true" />
          <p className="text-body text-off-white">Ready to generate real, ranked training and nutrition options.</p>
          {latest?.failureReason ? <p className="mt-2 text-meta text-error-strong">Last attempt failed: {latest.failureReason}</p> : null}
          {latest?.state === "blocked" && latest.blockedReasons?.length ? (
            <p className="mt-2 text-meta text-warning-strong">Last attempt was blocked: {latest.blockedReasons.join(" ")}</p>
          ) : null}
          <Button size="lg" className="mt-4" onClick={() => handleGenerate()}>
            {latest ? "Try generating again" : "Generate options"}
          </Button>
        </Card>
      ) : justApproved || latest.state === "activated" ? (
        <Card className="border-l-2 border-l-success">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <Check size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="text-body font-semibold text-off-white">Activated — {client.name}&apos;s real Today, Training, and Nutrition experience is live.</p>
              <p className="mt-1 text-meta text-neutral">
                Program: {latest.approval?.resultingProgramId} · Approved by {latest.approval?.approvedByCoachId} at {latest.approval?.approvedAtIso ? new Date(latest.approval.approvedAtIso).toLocaleString() : "—"}
              </p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => router.push(`/coach/clients/${client.id}`)}>
                Back to client page
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {latest.selectedTrainingOptionId ? (
            <Card className="border-l-2 border-l-accent">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                  <Bookmark size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-off-white">
                    Saved selection — {latest.trainingOptions.find((o) => o.id === latest.selectedTrainingOptionId)?.label ?? "a training option"}
                    {latest.selectedNutritionOptionId ? ` · ${latest.nutritionOptions.find((o) => o.id === latest.selectedNutritionOptionId)?.label ?? "a nutrition strategy"}` : ""}
                  </p>
                  <p className="mt-0.5 text-meta text-neutral">Nothing has been activated yet — this is saved for whenever you&apos;re ready to approve. Last updated {new Date(latest.updatedAtIso).toLocaleString()}.</p>
                </div>
              </div>
            </Card>
          ) : null}

          <ClientIntelligenceSummary studio={studio} />

          <div>
            <h2 className="text-heading text-off-white">Training options</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
              {latest.trainingOptions.map((opt) => (
                <RankedTrainingCard key={opt.id} option={opt} selected={selectedTraining === opt.id} onSelect={() => setSelectedTraining(opt.id)} />
              ))}
            </div>
          </div>

          {latest.nutritionOptions.length > 0 ? (
            <div>
              <h2 className="text-heading text-off-white">Nutrition strategies</h2>
              <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
                {latest.nutritionOptions.map((opt) => (
                  <RankedNutritionCard key={opt.id} option={opt} selected={selectedNutrition === opt.id} onSelect={() => setSelectedNutrition(opt.id)} />
                ))}
              </div>
            </div>
          ) : (
            <Card>
              <p className="text-sm text-neutral">Nutrition coaching isn&apos;t part of this coach&apos;s service — no nutrition strategy will be assigned.</p>
            </Card>
          )}

          <Card>
            <p className="text-subheading text-off-white">Approval</p>
            <p className="mt-1 text-meta text-neutral">
              Approving will assign the selected program (every week, every exercise) and nutrition targets directly to {client.name}&apos;s real account, and
              prepare their initial communication policy.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={handleApprove} disabled={!selectedTraining}>
                Approve and activate
              </Button>
              <Button variant="secondary" size="lg" onClick={handleSaveForLater} disabled={!selectedTraining}>
                <Bookmark size={16} aria-hidden="true" /> Save for later
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setShowRegenerate((v) => !v)}>
                <RotateCcw size={16} aria-hidden="true" /> Regenerate with instruction
              </Button>
              {justSavedAtIso ? <span className="text-meta text-success">Saved — nothing activated.</span> : null}
            </div>
            {showRegenerate ? (
              <div className="mt-4 max-w-xl">
                <TextArea
                  id="regen-instruction"
                  label="What should change?"
                  value={regenInstruction}
                  onChange={(e) => setRegenInstruction(e.target.value)}
                  placeholder="e.g. Give this client more recovery time — reduce to 3 training days."
                  rows={2}
                />
                <Button size="sm" className="mt-2" onClick={() => handleGenerate(regenInstruction)} disabled={!regenInstruction.trim()}>
                  Regenerate
                </Button>
              </div>
            ) : null}
          </Card>
        </>
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

function ClientIntelligenceSummary({ studio }: { studio: ReturnType<typeof useActivationStudio> }) {
  const about = studio.onboarding?.answers.about_you;
  const week = studio.onboarding?.answers.your_week;
  const goals = studio.onboarding?.answers.what_you_want;
  const fuel = studio.onboarding?.answers.fuel_recovery;

  return (
    <Card>
      <p className="text-subheading text-off-white">Client intelligence</p>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
        <SummaryStat label="Goal" value={typeof goals?.primaryGoal === "string" ? goals.primaryGoal.replace(/_/g, " ") : "—"} />
        <SummaryStat label="Availability" value={Array.isArray(week?.availableDays) ? `${week.availableDays.length} days/week` : "—"} />
        <SummaryStat label="Session length" value={typeof week?.maxSessionLength === "string" ? `${week.maxSessionLength} min` : "—"} />
        <SummaryStat label="Experience" value={typeof studio.onboarding?.answers.starting_point?.trainingExperience === "string" ? studio.onboarding.answers.starting_point.trainingExperience.replace(/_/g, " ") : "—"} />
        <SummaryStat label="Age" value={typeof about?.age === "number" ? String(about.age) : "—"} />
        <SummaryStat
          label="Dietary restrictions"
          value={fuel?.hasDietaryRestrictions === "yes" ? (typeof fuel.dietaryRestrictionsDetail === "string" && fuel.dietaryRestrictionsDetail ? fuel.dietaryRestrictionsDetail : "Reported, no detail") : "None reported"}
        />
        <SummaryStat label="Health review" value={studio.healthReviewResolved === "no_review_needed" ? "None needed" : studio.healthReviewResolved ? "Resolved" : "Unresolved"} />
        <SummaryStat label="Coach model" value={`v${studio.activeModel?.version ?? "—"}`} />
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
