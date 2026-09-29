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
import { getRecentActivityAction } from "@/app/actions/coach-daily-activity";
import { formatLongDateLabel, resolveClientLocalTime24 } from "@/lib/shared/local-date";
import { formatTimeLabel } from "@/lib/planning/training-plan";
import type { RecentActivityDay } from "@/lib/production/daily-activity";
import type { WorkoutSessionStatus } from "@/lib/types";
import {
  createProgramProposalAction,
  createPublishAndAssignNutritionAction,
  setProgramStartDateAction,
} from "@/app/actions/production-programs";
import { ProgramProposalReview } from "@/components/coach/program-proposal-review";
import { LiveNutritionAssignmentForm, type NutritionAssignResult } from "@/components/coach/live-nutrition-assignment-form";
import { LiveStartDateForm, type SaveResult } from "@/components/coach/live-start-date-form";
import { LiveProposalGenerateForm } from "@/components/coach/live-proposal-generate-form";
import { parseNutritionTargetsInput } from "@/lib/coach/nutrition-targets-input";
import { getProgramProposalForReviewAction, getClientWorkspaceIntelligenceAction, getFindingEvidenceDetailAction, resolveAdjustmentProposalAction, getGenerationPrerequisitesAction } from "@/app/actions/production-programs";
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

export async function LiveClientWorkspace({ clientId, notice = null }: { clientId: string; notice?: "proposal-rejected" | null }) {
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

  const [history, notes, pendingProposal, clientStateFindings, recentActivity, generationPrerequisites] = await Promise.all([
    getClientChatHistoryForCoachAction(clientId),
    getClientCoachNotesAction(clientId),
    getProgramProposalForReviewAction({ workspaceId: detail.workspaceId, clientProfileId: clientId }),
    getClientWorkspaceIntelligenceAction({ workspaceId: detail.workspaceId, clientProfileId: clientId }),
    getRecentActivityAction(clientId),
    getGenerationPrerequisitesAction({ workspaceId: detail.workspaceId, clientProfileId: clientId }),
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

  const readyToActivate = !!detail.startDateIso && !!detail.activeProgram && !!detail.activeNutrition && detail.hasConfirmedTimezone && detail.lifecycle !== "active";
  const blockedOnTimezoneOnly = !!detail.startDateIso && !!detail.activeProgram && !!detail.activeNutrition && !detail.hasConfirmedTimezone && detail.lifecycle !== "active";

  async function revalidate() {
    "use server";
    revalidatePath(`/coach/clients/${clientId}`);
    revalidatePath("/coach/clients");
  }

  // No fallbacks: a missing date or time zone is reported, never replaced
  // with "UTC" (setClientProgramStartDate re-validates both).
  async function setStartDateAction(_prev: SaveResult, formData: FormData): Promise<SaveResult> {
    "use server";
    const startDateIso = String(formData.get("startDateIso") ?? "").trim();
    const timeZone = String(formData.get("timeZone") ?? "").trim();
    if (!startDateIso || !timeZone) return { ok: false, message: "Choose both a start date and the client's time zone. Nothing was saved." };
    try {
      await setProgramStartDateAction({ workspaceId: detail.workspaceId, clientProfileId: clientId, startDateIso, timeZone });
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Could not save the start date." };
    }
    await revalidate();
    return { ok: true, message: "Start date saved." };
  }

  async function createProgramProposalFormAction(_prev: SaveResult, formData: FormData): Promise<SaveResult> {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const durationWeeks = Number(formData.get("durationWeeks"));
    if (!title) return { ok: false, message: "Give the program a name." };
    if (!Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > 20) return { ok: false, message: "Weeks must be a whole number from 1 to 20." };
    try {
      await createProgramProposalAction({ workspaceId: detail.workspaceId, clientProfileId: clientId, title, durationWeeks });
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Could not generate a proposal." };
    }
    await revalidate();
    return { ok: true, message: "Proposal generated — review it below." };
  }

  // Only explicitly entered values are ever saved — a blank field is
  // reported back as missing, never defaulted (this used to fall back to
  // hardcoded 2200/160/220/70, and a blank field became 0).
  async function createNutritionFormAction(_prev: NutritionAssignResult, formData: FormData): Promise<NutritionAssignResult> {
    "use server";
    const parsed = parseNutritionTargetsInput({
      calories: formData.get("calories"),
      proteinG: formData.get("proteinG"),
      carbsG: formData.get("carbsG"),
      fatG: formData.get("fatG"),
    });
    if (!parsed.ok) return parsed;
    let saved;
    try {
      saved = await createPublishAndAssignNutritionAction({ workspaceId: detail.workspaceId, clientProfileId: clientId, ...parsed.targets });
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Failed to assign this nutrition plan." };
    }
    if (saved.unchanged) return { ok: true, message: `No change — these targets are already assigned${saved.versionNumber ? ` (v${saved.versionNumber})` : ""}.` };
    await revalidate();
    const t = parsed.targets;
    return { ok: true, message: `Saved and assigned${saved.versionNumber ? ` v${saved.versionNumber}` : ""}: ${t.calories} kcal · ${t.proteinG}g protein · ${t.carbsG}g carbs · ${t.fatG}g fat.` };
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
          <h3 className="mb-3 text-sm font-medium text-off-white">Start date</h3>
          <LiveStartDateForm action={setStartDateAction} initialDateIso={detail.startDateIso} timezone={detail.timezone} timezoneSource={detail.timezoneSource} />
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-medium text-off-white">Training program</h3>
          <p className="mb-2 text-sm text-neutral">
            Active: {detail.activeProgram ? `"${detail.activeProgram.name}" (v${detail.activeProgram.versionNumber}, ${detail.activeProgram.durationWeeks}w)` : "none"}
          </p>
          {notice === "proposal-rejected" && !pendingProposal ? (
            <p role="status" className="mb-3 rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm text-success">
              Proposal rejected. Nothing was generated or activated.
            </p>
          ) : null}
          {pendingProposal ? (
            <p className="text-sm text-neutral">A generated proposal is waiting on your review below — resolve it before generating another.</p>
          ) : (
            <LiveProposalGenerateForm action={createProgramProposalFormAction} missing={generationPrerequisites.missing} />
          )}
        </Card>

        {pendingProposal ? <ProgramProposalReview workspaceId={detail.workspaceId} clientProfileId={clientId} clientId={clientId} proposal={pendingProposal} /> : null}

        <Card>
          <h3 className="mb-2 text-sm font-medium text-off-white">Nutrition plan</h3>
          {detail.activeNutrition ? (
            <p className="mb-2 text-sm text-neutral">
              Assigned: <span className="text-off-white">v{detail.activeNutrition.versionNumber}</span> ·{" "}
              {detail.activeNutrition.targets.calories} kcal · {detail.activeNutrition.targets.proteinG}g protein · {detail.activeNutrition.targets.carbsG}g carbs ·{" "}
              {detail.activeNutrition.targets.fatG}g fat
            </p>
          ) : (
            <p className="mb-2 text-sm text-neutral">
              <span className="text-off-white">Nutrition not assigned.</span> Enter targets below to create, publish, and assign a plan.
            </p>
          )}
          <LiveNutritionAssignmentForm action={createNutritionFormAction} assignedTargets={detail.activeNutrition?.targets ?? null} assignedVersionNumber={detail.activeNutrition?.versionNumber ?? null} />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Recent activity" />
        {recentActivity.length === 0 ? (
          <Card><p className="text-sm text-neutral">No training or nutrition activity logged yet.</p></Card>
        ) : (
          <Card className="space-y-4">
            {recentActivity.map((day) => (
              <RecentActivityDayRow key={day.dateIso} day={day} timeZone={detail.timezone} />
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Lifecycle" />
        <Card className="flex flex-wrap items-center gap-2">
          {readyToActivate ? (
            <form action={activate}>
              <Button type="submit" size="sm">Activate client</Button>
            </form>
          ) : null}
          {blockedOnTimezoneOnly ? (
            <p className="text-sm text-neutral">Cannot activate: no confirmed timezone yet — set one from the start date field above first.</p>
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
        <SectionHeader title="Conversation" action={<Link href="/coach/escalations" className="text-action text-accent-fg hover:underline">Escalations</Link>} />
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

// "not-started" is deliberately absent — a day with no real progress on its
// session isn't a status worth stating; RecentActivityDayRow only ever
// renders a training line when this map has an entry for it, so a workout
// merely started never gets mislabeled "completed" and vice versa.
const SESSION_STATUS_LABEL: Partial<Record<WorkoutSessionStatus, string>> = {
  "in-progress": "Workout started",
  completed: "Workout completed",
  "ended-early": "Workout ended early",
  skipped: "Workout skipped",
};

/** Formats a real ISO instant (startedAtIso/completedAtIso/a meal's own
 * completedAtIso) in the CLIENT's own saved timezone — never the coach's
 * browser timezone, which would silently mislabel every timestamp for a
 * client in a different zone than the coach reading this. */
function formatInstantForClient(iso: string, timeZone: string): string {
  return formatTimeLabel(resolveClientLocalTime24(new Date(iso), timeZone));
}

function RecentActivityDayRow({ day, timeZone }: { day: RecentActivityDay; timeZone: string }) {
  const statusLabel = day.sessionStatus ? SESSION_STATUS_LABEL[day.sessionStatus] : undefined;
  return (
    <div className="space-y-1.5 border-b border-border pb-3 text-sm last:border-b-0 last:pb-0">
      <p className="font-medium text-off-white">{formatLongDateLabel(day.dateIso)}</p>
      {statusLabel ? (
        <p className="text-neutral">
          {statusLabel}
          {day.workoutName ? ` — ${day.workoutName}` : ""}
          {day.workingSetsPrescribed > 0 ? ` (${day.workingSetsCompleted}/${day.workingSetsPrescribed} working sets)` : ""}
          {day.startedAtIso ? ` · started ${formatInstantForClient(day.startedAtIso, timeZone)}` : ""}
          {day.completedAtIso ? ` · ended ${formatInstantForClient(day.completedAtIso, timeZone)}` : ""}
        </p>
      ) : null}
      {day.meals.length > 0 ? (
        <ul className="space-y-0.5 text-neutral">
          {day.meals.map((meal) => (
            <li key={meal.period}>
              {meal.label} logged{meal.calories !== null ? ` — ${meal.calories} cal` : ""}
              {meal.completedAtIso ? ` · ${formatInstantForClient(meal.completedAtIso, timeZone)}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {day.weightLb !== null ? (
        <p className="text-neutral">
          Weight logged — {day.weightLb} lb{day.weightLoggedAtIso ? ` · ${formatInstantForClient(day.weightLoggedAtIso, timeZone)}` : ""}
        </p>
      ) : null}
    </div>
  );
}
