// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// The Supabase-mode sibling of app/coach/clients/[clientId]/page.tsx's demo
// ActivationWorkspace/ClientWorkspace split — the real bridge between
// onboarding review, program/nutrition assignment (reusing Phase 6.0B's
// existing create/publish/assign actions, previously stranded on the
// disconnected app/coach/clients/[clientId]/assign-live proof page — see
// this file's own removal note there), lifecycle control, and the
// Phase 6.0C communication system (conversation history, Personal Coach
// Notes). One real, connected client detail surface, never a second
// competing "proof page."

import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/coach/section-header";
import { LifecycleBadge } from "@/components/coach/lifecycle-badge";
import { getClientDetailAction, setClientLifecycleActionServer, activateClientAction } from "@/app/actions/coach-roster";
import {
  createProgramProposalAction,
  createPublishAndAssignNutritionAction,
  setProgramStartDateAction,
} from "@/app/actions/production-programs";
import { ProgramProposalReview } from "@/components/coach/program-proposal-review";
import { getProgramProposalForReviewAction, getClientWorkspaceIntelligenceAction, getFindingEvidenceDetailAction, resolveAdjustmentProposalAction } from "@/app/actions/production-programs";
import { ClientStateNoticeSection } from "@/components/coach/client-state-notice";
import { getClientChatHistoryForCoachAction, getClientCoachNotesAction, publishCoachNoteAction } from "@/app/actions/coach-communications";
import { ONBOARDING_STEPS } from "@/lib/coach/onboarding-steps";
import { formatHeightFromAnswers, describePrimaryGoal, formatFieldValue, NOT_PROVIDED } from "@/lib/coach/onboarding-format";
import type { OnboardingStepAnswers, OnboardingStepId } from "@/lib/coach/types";

async function loadDetail(clientId: string) {
  try {
    return await getClientDetailAction(clientId);
  } catch {
    notFound();
  }
}

export async function LiveClientWorkspace({ clientId }: { clientId: string }) {
  const detail = await loadDetail(clientId);

  // Phase 10B — resolved BEFORE the pending-proposal read below: bounded,
  // deterministic evaluation "on client workspace request" (spec section
  // 53) that may persist a new adjustment draft when a real, eligible
  // finding justifies one. Never creates a second pending draft when one
  // already exists (existing_pending short-circuits inside the action
  // itself) — so the subsequent getProgramProposalForReviewAction call
  // below always reflects whatever is now actually pending, adjustment or
  // fresh-generation alike, through the exact same existing review UI.
  await resolveAdjustmentProposalAction({ workspaceId: detail.workspaceId, clientProfileId: clientId });

  const [history, notes, pendingProposal, clientStateFindings] = await Promise.all([
    getClientChatHistoryForCoachAction(clientId),
    getClientCoachNotesAction(clientId),
    getProgramProposalForReviewAction({ workspaceId: detail.workspaceId, clientProfileId: clientId }),
    getClientWorkspaceIntelligenceAction({ workspaceId: detail.workspaceId, clientProfileId: clientId }),
  ]);
  const pendingAdjustmentProvenance = pendingProposal?.content.adjustmentProvenance ?? null;
  // Bounded — clientStateFindings is already capped to a small set (see
  // lib/client-state/presentation.ts) — eagerly resolving each one's own
  // small evidence-ref list here keeps the review-evidence UI a plain
  // <details> with zero client-side JS, matching this file's established
  // server-component convention (same as components/coach/pattern-
  // candidate-section.tsx's own evidence examples).
  const clientStateEvidence = await Promise.all(
    clientStateFindings.map((f) =>
      Promise.all([getFindingEvidenceDetailAction({ workspaceId: detail.workspaceId, clientProfileId: clientId, observationIds: f.finding.supportingEvidenceRefs }), getFindingEvidenceDetailAction({ workspaceId: detail.workspaceId, clientProfileId: clientId, observationIds: f.finding.contradictingEvidenceRefs })])
    )
  ).then((pairs) => pairs.map(([supporting, contradicting]) => ({ supporting, contradicting })));

  const answers = (detail.onboarding?.answers ?? {}) as Partial<Record<OnboardingStepId, OnboardingStepAnswers>>;
  const hasOnboarding = detail.onboarding !== null;
  const aboutYou = answers.about_you;
  const goals = answers.what_you_want;
  const week = answers.your_week;
  const start = answers.starting_point;

  const readyToActivate = !!detail.startDateIso && !!detail.activeProgram && !!detail.activeNutrition && detail.lifecycle !== "active";

  async function revalidate() {
    "use server";
    revalidatePath(`/coach/clients/${clientId}`);
    revalidatePath("/coach/clients");
  }

  async function setStartDateAction(formData: FormData) {
    "use server";
    const startDateIso = String(formData.get("startDateIso") ?? "");
    const timeZone = String(formData.get("timeZone") ?? "UTC");
    if (!startDateIso) return;
    await setProgramStartDateAction({ workspaceId: detail.workspaceId, clientProfileId: clientId, startDateIso, timeZone });
    await revalidate();
  }

  async function createProgramProposalFormAction(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "Training program");
    const durationWeeks = Number(formData.get("durationWeeks") ?? 4);
    await createProgramProposalAction({ workspaceId: detail.workspaceId, clientProfileId: clientId, title, durationWeeks });
    await revalidate();
  }

  async function createNutritionFormAction(formData: FormData) {
    "use server";
    const calories = Number(formData.get("calories") ?? 2200);
    const proteinG = Number(formData.get("proteinG") ?? 160);
    const carbsG = Number(formData.get("carbsG") ?? 220);
    const fatG = Number(formData.get("fatG") ?? 70);
    await createPublishAndAssignNutritionAction({ workspaceId: detail.workspaceId, clientProfileId: clientId, calories, proteinG, carbsG, fatG });
    await revalidate();
  }

  async function activate() {
    "use server";
    await activateClientAction({ workspaceId: detail.workspaceId, clientProfileId: clientId });
    await revalidate();
  }

  async function lifecycleAction(action: "pause" | "resume" | "complete" | "archive" | "unarchive") {
    "use server";
    await setClientLifecycleActionServer({ workspaceId: detail.workspaceId, clientProfileId: clientId, action });
    await revalidate();
  }

  async function addNoteAction(formData: FormData) {
    "use server";
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return;
    await publishCoachNoteAction({ clientProfileId: clientId, body });
    await revalidate();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/coach/clients" className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
          <ChevronLeft size={16} /> Back to clients
        </Link>
        <LifecycleBadge lifecycle={detail.lifecycle} />
      </div>

      <div>
        <h1 className="text-display text-off-white">{detail.displayName}</h1>
        <p className="mt-1 text-body text-neutral">
          {detail.goal || "No goal recorded"} {detail.archived ? " · Archived" : ""}
        </p>
        {!detail.hasSignedIn ? <p className="mt-1 text-meta text-neutral">Invited at {detail.invitedEmail} — hasn&apos;t signed in yet.</p> : null}
      </div>

      {hasOnboarding ? (
        <section className="space-y-3">
          <SectionHeader title="Onboarding answers" />
          <Card>
            {detail.onboarding?.completedAtIso ? (
              <dl className="space-y-2 text-sm">
                <Row label="Height" value={formatHeightFromAnswers(aboutYou)} />
                <Row label="Goal" value={goals ? describePrimaryGoal(ONBOARDING_STEPS, goals) : NOT_PROVIDED} />
                <Row
                  label="Available days"
                  value={Array.isArray(week?.availableDays) && (week!.availableDays as string[]).length > 0 ? `${(week!.availableDays as string[]).length}/week` : NOT_PROVIDED}
                />
                <Row
                  label="Experience"
                  value={
                    start?.trainingExperience
                      ? formatFieldValue(ONBOARDING_STEPS.find((s) => s.id === "starting_point")!.fields.find((f) => f.key === "trainingExperience")!, start.trainingExperience)
                      : NOT_PROVIDED
                  }
                />
              </dl>
            ) : (
              <p className="text-sm text-neutral">Onboarding in progress — chapter {(detail.onboarding?.currentStepIndex ?? 0) + 1} of {ONBOARDING_STEPS.length}.</p>
            )}
          </Card>
        </section>
      ) : (
        <Card>
          <p className="text-sm text-neutral">This client hasn&apos;t started onboarding yet.</p>
        </Card>
      )}

      <ClientStateNoticeSection findings={clientStateFindings} evidenceByFinding={clientStateEvidence} pendingAdjustment={pendingAdjustmentProvenance} />

      <section className="space-y-3">
        <SectionHeader title="Program setup" />
        <Card>
          <h3 className="mb-2 text-sm font-medium text-off-white">Start date</h3>
          <p className="mb-2 text-sm text-neutral">Current: <span className="text-off-white">{detail.startDateIso ?? "not set"}</span></p>
          <form action={setStartDateAction} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col text-xs text-neutral">
              Date
              <input type="date" name="startDateIso" defaultValue={detail.startDateIso ?? ""} className="rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" required />
            </label>
            <label className="flex flex-col text-xs text-neutral">
              Timezone
              <input type="text" name="timeZone" defaultValue={detail.timezone} className="rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
            </label>
            <Button type="submit" variant="secondary" size="sm">Set start date</Button>
          </form>
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-medium text-off-white">Training program</h3>
          <p className="mb-2 text-sm text-neutral">
            Active: {detail.activeProgram ? `"${detail.activeProgram.name}" (v${detail.activeProgram.versionNumber}, ${detail.activeProgram.durationWeeks}w)` : "none"}
          </p>
          {pendingProposal ? (
            <p className="text-sm text-neutral">A generated proposal is waiting on your review below — resolve it before generating another.</p>
          ) : (
            <form action={createProgramProposalFormAction} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-xs text-neutral">
                Title
                <input type="text" name="title" defaultValue="Training program" className="rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
              </label>
              <label className="flex flex-col text-xs text-neutral">
                Weeks
                <input type="number" name="durationWeeks" defaultValue={4} min={1} max={20} className="w-20 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
              </label>
              <Button type="submit" variant="primary" size="sm">Generate proposal</Button>
            </form>
          )}
        </Card>

        {pendingProposal ? <ProgramProposalReview workspaceId={detail.workspaceId} clientProfileId={clientId} clientId={clientId} proposal={pendingProposal} /> : null}

        <Card>
          <h3 className="mb-2 text-sm font-medium text-off-white">Nutrition plan</h3>
          <p className="mb-2 text-sm text-neutral">Active: {detail.activeNutrition ? `v${detail.activeNutrition.versionNumber}` : "none"}</p>
          <form action={createNutritionFormAction} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col text-xs text-neutral">
              Calories
              <input type="number" name="calories" defaultValue={2200} className="w-24 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
            </label>
            <label className="flex flex-col text-xs text-neutral">
              Protein g
              <input type="number" name="proteinG" defaultValue={160} className="w-20 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
            </label>
            <label className="flex flex-col text-xs text-neutral">
              Carbs g
              <input type="number" name="carbsG" defaultValue={220} className="w-20 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
            </label>
            <label className="flex flex-col text-xs text-neutral">
              Fat g
              <input type="number" name="fatG" defaultValue={70} className="w-20 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
            </label>
            <Button type="submit" variant="primary" size="sm">Create, publish &amp; assign</Button>
          </form>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Lifecycle" />
        <Card className="flex flex-wrap items-center gap-2">
          {readyToActivate ? (
            <form action={activate}>
              <Button type="submit" size="sm">Activate client</Button>
            </form>
          ) : null}
          {detail.lifecycle === "active" ? (
            <form action={lifecycleAction.bind(null, "pause")}>
              <Button type="submit" variant="secondary" size="sm">Pause</Button>
            </form>
          ) : null}
          {detail.lifecycle === "paused" ? (
            <form action={lifecycleAction.bind(null, "resume")}>
              <Button type="submit" variant="secondary" size="sm">Resume</Button>
            </form>
          ) : null}
          {detail.lifecycle === "active" || detail.lifecycle === "paused" ? (
            <form action={lifecycleAction.bind(null, "complete")}>
              <Button type="submit" variant="secondary" size="sm">Mark completed</Button>
            </form>
          ) : null}
          {detail.lifecycle === "completed" && !detail.archived ? (
            <form action={lifecycleAction.bind(null, "archive")}>
              <Button type="submit" variant="secondary" size="sm">Archive</Button>
            </form>
          ) : null}
          {detail.archived ? (
            <form action={lifecycleAction.bind(null, "unarchive")}>
              <Button type="submit" variant="secondary" size="sm">Unarchive</Button>
            </form>
          ) : null}
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Conversation" action={<Link href="/coach/escalations" className="text-action text-accent-strong hover:underline">Escalations</Link>} />
        {history.every((conv) => conv.messages.length === 0) ? (
          <Card><p className="text-sm text-neutral">No conversation yet.</p></Card>
        ) : (
          <Card className="max-h-[420px] space-y-2.5 overflow-y-auto">
            {history.flatMap((conv) =>
              conv.messages.map((m) => (
                <div key={m.id} className="text-sm">
                  <span className="text-label text-neutral">
                    {m.actorType === "coach" ? "You" : m.actorType === "assistant" ? "OPTIM" : m.actorType === "client" ? detail.displayName : "System"}
                    {" · "}
                    {new Date(m.createdAtIso).toLocaleString()}:{" "}
                  </span>
                  <span className="text-off-white">{m.body}</span>
                </div>
              ))
            )}
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Personal coach notes" />
        <Card>
          <p className="mb-2 text-meta text-neutral">A one-way note, attributed to you, delivered to {detail.displayName}&apos;s own chat — not a DM thread.</p>
          <form action={addNoteAction} className="flex flex-col gap-2">
            <textarea name="body" rows={2} placeholder="Write a note to this client…" className="rounded border border-border-strong bg-transparent px-2 py-1.5 text-sm text-off-white" />
            <Button type="submit" variant="secondary" size="sm" className="self-start">Add note</Button>
          </form>
          {notes.length > 0 ? (
            <ul className="mt-3 space-y-2 divide-y divide-border">
              {notes.map((n) => (
                <li key={n.id} className="pt-2 first:pt-0">
                  <p className="text-sm text-off-white">{n.body}</p>
                  <p className="mt-0.5 text-meta text-neutral">{new Date(n.publishedAtIso).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-neutral">{label}</dt>
      <dd className="text-off-white">{value}</dd>
    </div>
  );
}
