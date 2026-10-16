"use client";

// Gate U3B — the coach's review of ONE unified program proposal (lifting, cardio, nutrition): what OPTIM proposes and
// why, what it needs the coach to decide, what the latest revalidation found, and the edit / approve / reject controls.
// Approval records the coach's decision on exactly these drafts — it does not publish, assign or notify (the client
// sees nothing until atomic publication). Every edit returns a freshly revalidated review.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  approveUnifiedProposalAction,
  prepareUnifiedProposalAction,
  planUnifiedPublicationAction,
  publishUnifiedProposalAction,
  editUnifiedNutritionAction,
  editUnifiedTrainingAction,
  recordUnifiedDecisionAction,
  rejectUnifiedProposalAction,
  withdrawUnifiedExclusionAction,
  type UnifiedReviewResult,
} from "@/app/actions/unified-review";
import type { UnifiedReviewView } from "@/lib/production/unified-review";
import type { PublicationPlan } from "@/lib/production/unified-publication";
import type { TrainingItemPatch, TrainingItemPath } from "@/lib/training/program-proposal-editing";
import type { Prescription, TrainingItemInstance } from "@/lib/training/types";
import type { DomainId } from "@/lib/synthesis/unified/contract";
import { handledItems, optionRole, reviewTasks, type HandledItem, type ReviewTask } from "@/lib/coach/unified-review-tasks";
import { formatEffort } from "@/lib/workout/continuous";

const DOMAIN_LABEL: Record<DomainId, string> = { resistance: "Lifting", cardio: "Cardio", nutrition: "Nutrition" };
const STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Proposed",
  APPROVED_EXISTING: "Approved program (unchanged)",
  NO_ADDITIONAL: "No additional cardio",
  NOT_COACHED: "Not in your method",
  NEEDS_COACH_REVIEW: "Needs your review",
  NEEDS_INPUT: "Needs input",
  UNSUPPORTED: "Not supported yet",
  ESCALATE: "Held for clearance",
  REJECTED: "Couldn't be produced",
  PROVIDER_FAILED: "Couldn't be produced",
  HELD: "Held",
};
const DAY_SHORT: Record<string, string> = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };

export function prescriptionSummary(p: Prescription): string {
  if (p.family === "resistance") return [p.sets && p.reps ? `${p.sets} × ${p.reps.low === p.reps.high ? p.reps.low : `${p.reps.low}–${p.reps.high}`}` : null, p.rpe ? `RPE ${p.rpe}` : null].filter(Boolean).join(" · ");
  if (p.family === "continuous") return [p.duration ? `${Math.round(p.duration.seconds / 60)} min` : null, p.effort ? formatEffort(p.effort) : null].filter(Boolean).join(" · ");
  if (p.family === "interval") return [p.rounds ? `${p.rounds} × ${p.workInterval?.seconds ?? "?"}s on / ${p.recoveryInterval?.seconds ?? 0}s off` : null, p.effort ? formatEffort(p.effort) : null].filter(Boolean).join(" · ");
  return p.family;
}

export function UnifiedProposalReview({ initial, workspaceId, clientProfileId }: { initial: UnifiedReviewView; workspaceId: string; clientProfileId: string }) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [openTask, setOpenTask] = useState<string | null>(null);
  // Answered decisions the coach chose to "Change": shown as open again until they pick (the stored answer stays until then).
  const [reopened, setReopened] = useState<string[]>([]);
  const scope = { workspaceId, clientProfileId };
  const open = view.approvalState === "proposed";
  const shown = reopened.length ? { ...view, decisions: view.decisions.map((d) => (reopened.includes(d.key) ? { ...d, answer: null } : d)) } : view;
  const tasks = open ? reviewTasks(shown) : [];
  const handled = handledItems(shown);
  // One task open at a time; the first one is open until the coach chooses another.
  const focused = tasks.find((t) => t.id === openTask) ?? tasks[0] ?? null;

  const act = (f: () => Promise<UnifiedReviewResult>) =>
    start(async () => {
      const r = await f();
      if (r.ok) {
        setView(r.view);
        setReopened([]);
        setError(null);
      } else setError(r.error);
    });
  /** The coach's explicit "apply" for several exercises: the same per-exercise edit as before, one after another, each
   * against the draft version the previous one produced (every edit is still its own revision). */
  const applyAll = (mode: "limit" | "remove", names: string[]) =>
    start(async () => {
      let versionId = view.training!.versionId;
      for (const name of names) {
        const r = await editUnifiedTrainingAction(scope, { rowId: view.rowId, expectedVersionId: versionId, edit: mode === "limit" ? { kind: "limitEffort", name } : { kind: "removeExercise", name } });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setView(r.view);
        versionId = r.view.training!.versionId;
      }
      setError(null);
    });
  // What these drafts are now, from the proposal's own approval state (never "Proposed" once approved or published).
  const draftStage = { proposed: "Proposed", approved: "Approved (not published)", published: "Published", superseded: "Superseded", rejected: "Rejected" }[view.approvalState] ?? "Proposed";
  const reveal = (id: string) => {
    setOpenTask(id);
    requestAnimationFrame(() => document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <section className="space-y-5" aria-label="Unified program review">
      <ReviewHeader
        view={view}
        tasks={tasks}
        handled={handled.length}
        pending={pending}
        error={error}
        onNext={() => tasks[0] && reveal(tasks[0].id)}
        onApprove={() => act(() => approveUnifiedProposalAction(scope, { rowId: view.rowId, expected: { training: view.training?.versionId ?? null, nutrition: view.nutrition?.versionId ?? null } }))}
        onReject={(reason) => act(() => rejectUnifiedProposalAction(scope, { rowId: view.rowId, reason }))}
      />

      {view.approvalState === "approved" || view.approvalState === "published" ? <PublishCard view={view} pending={pending} onPublish={(expected) => act(() => publishUnifiedProposalAction(scope, { rowId: view.rowId, expected }))} scope={scope} /> : null}

      {/* Decisions lead; supporting context sits beside them on wide screens (stacked on a phone). */}
      <div className={tasks.length ? "grid items-start gap-5 lg:grid-cols-12" : "space-y-5"}>
      {tasks.length ? (
        <div className="lg:col-span-7">
          <ZoneHeading title="Needs you" count={tasks.length} />
          <ol className="space-y-2">
            {tasks.map((t, i) => (
              <TaskItem
                key={t.id}
                task={t}
                index={i + 1}
                expanded={focused?.id === t.id}
                disabled={pending}
                onToggle={() => setOpenTask(focused?.id === t.id ? "__none__" : t.id)}
                onAnswer={(key, answer) => act(() => recordUnifiedDecisionAction(scope, { rowId: view.rowId, key, answer }))}
                onApplyAll={applyAll}
                onWithdraw={(key) => act(() => withdrawUnifiedExclusionAction(scope, { rowId: view.rowId, key }))}
                onOpenSessions={() => {
                  const d = document.getElementById("review-training-sessions") as HTMLDetailsElement | null;
                  if (d) {
                    d.open = true;
                    d.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
              />
            ))}
          </ol>
        </div>
      ) : null}

        <div className={tasks.length ? "space-y-5 lg:col-span-5" : "space-y-5"}>
          <WorthKnowing view={view} beside={tasks.length > 0} />
      {handled.length ? (
        <Handled
          items={handled}
          disabled={!open || pending}
          onChange={(key) => {
            setReopened((r) => [...r, key]);
            reveal(`decide:${key}`);
          }}
          onWithdraw={(key) => act(() => withdrawUnifiedExclusionAction(scope, { rowId: view.rowId, key }))}
        />
      ) : null}

        </div>
      </div>

      <div>
        <ZoneHeading title="Program details" />
        <div className="grid items-start gap-2 lg:grid-cols-2">
          {view.training ? (
            <Disclosure id="review-training-sessions" title={`${draftStage} training sessions`} meta={`${view.training.content.weeks.length} weeks · view or edit any session`}>
              <TrainingCard
                view={view}
                disabled={!open || pending}
                onEdit={(path, patch) => act(() => editUnifiedTrainingAction(scope, { rowId: view.rowId, expectedVersionId: view.training!.versionId, edit: { kind: "patch", path, patch } }))}
                onRemove={(path) => act(() => editUnifiedTrainingAction(scope, { rowId: view.rowId, expectedVersionId: view.training!.versionId, edit: { kind: "remove", path } }))}
              />
            </Disclosure>
          ) : null}
          {view.nutrition ? (
            <Disclosure title={`${draftStage} nutrition plan`} meta={view.nutrition.summary.targets.length ? view.nutrition.summary.targets.join(" · ") : view.nutrition.summary.approach}>
              <NutritionCard view={view} disabled={!open || pending} onSave={(edit) => act(() => editUnifiedNutritionAction(scope, { rowId: view.rowId, expectedVersionId: view.nutrition!.versionId, edit }))} />
            </Disclosure>
          ) : null}
          {Object.values(view.evidence).some((e) => e?.length) ? (
            <Disclosure title="Why OPTIM proposed this" meta="OPTIM's reasoning per domain">
              <EvidenceList view={view} />
            </Disclosure>
          ) : null}
          {[...view.proposal.uncertainties, ...view.proposal.assumptions].length ? (
            <Disclosure title="Assumptions and uncertainties" meta={plural([...view.proposal.uncertainties, ...view.proposal.assumptions].length, "item")}>
              <ul className="list-disc space-y-1 pl-5 text-meta text-neutral">
                {[...view.proposal.uncertainties, ...view.proposal.assumptions].map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
          {view.revisions.length ? (
            <Disclosure title="Edit history" meta={`${plural(view.revisions.length, "edit")} · earlier versions are kept`}>
              <ul className="space-y-1">
                {[...view.revisions].reverse().map((r) => (
                  <li key={r.toVersionId} className="text-meta text-off-white">
                    {r.summary} <span className="text-neutral">· {new Date(r.atIso).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
        </div>
      </div>
    </section>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ZoneHeading({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-label text-neutral">
      {title}
      {count ? <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[11px] leading-none text-warning-strong">{count}</span> : null}
    </h3>
  );
}

function Disclosure({ id, title, meta, children }: { id?: string; title: string; meta?: string; children: React.ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-24 rounded-[var(--radius-lg)] border border-border bg-charcoal open:lg:col-span-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-off-white/[0.03]">
        <span className="min-w-0 lg:truncate">
          <span className="text-subheading text-off-white">{title}</span>
          {meta ? <span className="ml-2 text-meta text-neutral">{meta}</span> : null}
        </span>
        <ChevronDown size={16} className="shrink-0 text-neutral transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function ReviewHeader({ view, tasks, handled, pending, error, onNext, onApprove, onReject }: { view: UnifiedReviewView; tasks: ReviewTask[]; handled: number; pending: boolean; error: string | null; onNext: () => void; onApprove: () => void; onReject: (reason: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const open = view.approvalState === "proposed";
  const decide = tasks.filter((t) => t.kind === "decide").length;
  const apply = tasks.filter((t) => t.kind === "apply").length;
  const problems = tasks.filter((t) => t.kind === "problem").length;
  const ready = open && view.blockers.length === 0 && tasks.length === 0;
  const status = !open
    ? view.approvalState === "approved"
      ? `Approved ${view.reviewedAtIso ? new Date(view.reviewedAtIso).toLocaleDateString() : ""} — not published yet. The client sees nothing until you publish.`
      : view.approvalState === "published"
        ? `Published ${view.publishedAtIso ? new Date(view.publishedAtIso).toLocaleDateString() : ""} — assigned to the client.`
        : view.approvalState === "superseded"
          ? "Superseded by a newer published program. Its drafts were archived."
          : `Rejected${view.rejectionReason ? `: ${view.rejectionReason}` : "."} Its drafts were archived.`
    : ready
      ? "Everything is resolved and revalidated against the client's current restrictions and your method."
      : [decide ? plural(decide, "decision") : null, apply ? plural(apply, "change") + " to apply" : null, problems ? plural(problems, "problem") : null].filter(Boolean).join(" · ") + " before you can approve.";
  const total = tasks.length + handled;
  const label = !open ? (view.approvalState === "approved" ? "Approved" : view.approvalState === "published" ? "Published" : view.approvalState === "superseded" ? "Superseded" : "Rejected") : ready ? "Ready to approve" : "Needs your decisions";
  return (
    <div className={`${open && !ready ? "pc-signature-surface" : "border border-border bg-charcoal shadow-[var(--shadow-subtle)]"} rounded-[var(--radius-xl)] p-5 md:p-6`}>
      {(() => {
        const ink = open && !ready ? "text-navy-ink" : "text-off-white";
        const muted = open && !ready ? "text-navy-ink-muted" : "text-neutral";
        return (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-label ${muted}`}>Program review · prepared by OPTIM</p>
                <h2 className={`mt-1 text-heading ${ink}`}>{view.proposal.objective.summary.replace(/^./, (c) => c.toUpperCase())}</h2>
                <p className={`mt-1 text-meta ${muted}`}>
                  Your method v{view.proposal.coachMethodVersion ?? "—"} · prepared {new Date(view.createdAtIso).toLocaleDateString()}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${open && !ready ? "bg-white/10 text-navy-ink" : ready || view.approvalState === "approved" || view.approvalState === "published" ? "bg-success-soft text-success" : "bg-off-white/[0.06] text-neutral"}`}>{label}</span>
            </div>

            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className={`text-body ${ink}`}>{status}</p>
              {open && total > 0 ? (
                <span className={`text-meta ${muted}`}>
                  {handled}/{total} resolved
                </span>
              ) : null}
            </div>
            {open && total > 0 ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={handled} aria-label={`${handled} of ${total} resolved`}>
                <div className={`h-full rounded-full ${ready ? "bg-success" : "bg-accent"}`} style={{ width: `${Math.round((handled / total) * 100)}%` }} />
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 rounded-[var(--radius-sm)] border border-error/40 bg-error-soft px-3 py-2 text-meta text-off-white">
                {error}
              </p>
            ) : null}

            {open ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {ready ? (
                  <Button onClick={onApprove} disabled={pending || view.blockers.length > 0} loading={pending}>
                    Approve program
                  </Button>
                ) : tasks.length ? (
                  <Button onClick={onNext} disabled={pending}>
                    Resolve next: {tasks[0].title}
                  </Button>
                ) : null}
                {rejecting ? (
                  <span className="flex w-full flex-wrap items-center gap-2">
                    <input aria-label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" maxLength={1000} className="h-9 min-w-0 flex-1 rounded border border-border-strong bg-surface px-2 text-sm text-off-white" />
                    <Button size="sm" variant="danger" disabled={pending} onClick={() => onReject(reason)}>
                      Reject proposal
                    </Button>
                    <Button size="sm" variant={open && !ready ? "secondary" : "ghost"} onClick={() => setRejecting(false)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <button type="button" disabled={pending} className={`text-action ${muted} hover:underline`} onClick={() => setRejecting(true)}>
                    Reject proposal…
                  </button>
                )}
                {ready ? <p className={`w-full text-meta ${muted}`}>Approving records your decision on exactly these drafts. Nothing reaches the client until you publish.</p> : null}
              </div>
            ) : null}
          </>
        );
      })()}
    </div>
  );
}

const ROLE_COPY: Record<"keep" | "limit" | "exclude", { label: string; consequence: string }> = {
  keep: { label: "Keep", consequence: "No change — stays as prescribed." },
  limit: { label: "Limit effort", consequence: "Stays in, capped at RPE 7 (3+ reps in reserve) in every week." },
  exclude: { label: "Exclude", consequence: "Comes out of every week. You'll remove it in one step next." },
};

function TaskItem({ task, index, expanded, disabled, onToggle, onAnswer, onApplyAll, onWithdraw, onOpenSessions }: { task: ReviewTask; index: number; expanded: boolean; disabled: boolean; onToggle: () => void; onAnswer: (key: string, answer: string) => void; onApplyAll: (mode: "limit" | "remove", names: string[]) => void; onWithdraw: (key: string) => void; onOpenSessions: () => void }) {
  const exercises = task.kind === "decide" ? task.decision.exercises ?? [] : task.kind === "apply" ? task.exercises.map((e) => e.name) : [];
  const kindLabel = task.kind === "decide" ? "Decide" : task.kind === "apply" ? "Apply" : "Fix";
  return (
    <li id={`task-${task.id}`} className={`scroll-mt-24 rounded-[var(--radius-lg)] border bg-charcoal transition-colors ${expanded ? "border-accent/50 shadow-[var(--shadow-subtle)]" : "border-border"}`}>
      <button type="button" aria-expanded={expanded} onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${expanded ? "bg-accent text-on-accent" : "bg-off-white/[0.08] text-off-white"}`}>{index}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-subheading text-off-white">{task.title}</span>
            <span className="text-meta text-neutral">
              {kindLabel}
              {exercises.length ? ` · ${exercises.length <= 2 ? exercises.join(", ") : plural(exercises.length, "exercise")}` : ""}
            </span>
          </span>
        </span>
        <ChevronDown size={16} className={`mt-1 shrink-0 text-neutral transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {expanded ? (
        <div className="space-y-3 px-4 pb-4 md:pl-[52px]">
          <p className="text-body text-off-white">{task.summary}</p>
          {task.kind === "problem" && /\bweek \d+/.test(task.summary) ? (
            <button type="button" className="text-action text-accent-fg hover:underline" onClick={() => onOpenSessions()}>
              Open training sessions to fix it
            </button>
          ) : null}
          {task.kind === "decide" ? <DecideBody decision={task.decision} disabled={disabled} onAnswer={onAnswer} /> : null}
          {task.kind === "apply" ? (
            <>
              <ul className="flex flex-wrap gap-1.5">
                {task.exercises.map((e) => (
                  <li key={e.name} className="rounded-full bg-off-white/[0.06] px-2.5 py-1 text-meta text-off-white">
                    {e.name} <span className="text-neutral">· {plural(e.sessions, "session")}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button size="sm" disabled={disabled} loading={disabled} onClick={() => onApplyAll(task.mode, task.exercises.map((e) => e.name))}>
                  {task.mode === "limit" ? `Apply the limit${task.exercises.length > 1 ? ` to all ${task.exercises.length}` : ""}` : `Remove ${task.exercises.length > 1 ? `all ${task.exercises.length}` : task.exercises[0].name} from the program`}
                </Button>
                {task.mode === "remove" ? (
                  <button type="button" disabled={disabled} className="text-action text-accent-fg hover:underline" onClick={() => onWithdraw(task.key)}>
                    Withdraw the exclusion
                  </button>
                ) : null}
              </div>
              {task.exercises.length > 1 ? (
                <details>
                  <summary className="cursor-pointer text-action text-neutral">One at a time instead</summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {task.exercises.map((e) => (
                      <Button key={e.name} size="sm" variant="secondary" disabled={disabled} onClick={() => onApplyAll(task.mode, [e.name])}>
                        {task.mode === "limit" ? "Limit" : "Remove"} {e.name}
                      </Button>
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function DecideBody({ decision: d, disabled, onAnswer }: { decision: UnifiedReviewView["decisions"][number]; disabled: boolean; onAnswer: (key: string, answer: string) => void }) {
  const exerciseDecision = !!d.exercises?.length;
  return (
    <>
      {exerciseDecision ? (
        <ul className="flex flex-wrap gap-1.5">
          {d.exercises!.map((e) => (
            <li key={e} className="rounded-full bg-off-white/[0.06] px-2.5 py-1 text-meta text-off-white">
              {e}
            </li>
          ))}
        </ul>
      ) : null}
      <div className={exerciseDecision ? "grid gap-2 sm:grid-cols-3" : "flex flex-wrap gap-2"}>
        {d.options.map((o) => {
          const role = optionRole(d, o);
          const copy = role === "other" ? null : ROLE_COPY[role];
          const keepCopy = role === "keep" && o === "Keep them at the confirmed minimums" ? { label: "Keep", consequence: "Stays at the confirmed minimums (6+ reps, 2+ reps in reserve)." } : role === "keep" && o !== "Keep them as prescribed" ? { label: "Keep", consequence: `${o}.` } : copy;
          return keepCopy ? (
            <button key={o} type="button" disabled={disabled} onClick={() => onAnswer(d.key, o)} className="rounded-[var(--radius-md)] border border-border-strong bg-surface-raised px-3 py-2.5 text-left transition-colors hover:border-accent/60 disabled:opacity-50">
              <span className="block text-subheading text-off-white">{keepCopy.label}</span>
              <span className="mt-0.5 block text-meta text-neutral">{keepCopy.consequence}</span>
            </button>
          ) : (
            <Button key={o} size="sm" variant={o === d.recommended ? "primary" : "secondary"} disabled={disabled} onClick={() => onAnswer(d.key, o)}>
              {o}
              {o === d.recommended ? " (recommended)" : ""}
            </Button>
          );
        })}
      </div>
      <details>
        <summary className="cursor-pointer text-action text-neutral">OPTIM&apos;s full wording</summary>
        <p className="mt-2 text-meta text-off-white">{d.question}</p>
        {d.why ? <p className="mt-1 text-meta text-neutral">{d.why}</p> : null}
      </details>
    </>
  );
}

function WorthKnowing({ view, beside }: { view: UnifiedReviewView; beside: boolean }) {
  const w = view.revalidation.workload;
  // A domain's label follows the proposal's approval, so an approved or published program never reads "Proposed".
  const reviewed = (status: string) => status === "PROPOSED" || status === "NEEDS_COACH_REVIEW";
  const stage = (status: string) => (view.approvalState === "approved" && reviewed(status) ? "Approved — not published" : view.approvalState === "published" && reviewed(status) ? "Published" : STATUS_LABEL[status] ?? status);
  const weeks = view.training?.content.weeks.length ?? null;
  const cardio = view.proposal.domains.cardio;
  const findings = view.revalidation.findings;
  return (
    <div>
      <ZoneHeading title="Worth knowing" />
      <div className={`grid gap-3 ${beside ? "md:grid-cols-2 lg:grid-cols-1" : "md:grid-cols-2 lg:grid-cols-3"}`}>
        {view.documentedLimitations ? (
          <div className={`rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 md:col-span-2 ${beside ? "lg:col-span-1" : "lg:col-span-1"}`}>
            <p className="text-label text-neutral">Health limitation · your documented notes</p>
            <p className="mt-1.5 text-body text-off-white">{view.documentedLimitations}</p>
          </div>
        ) : null}
        <div className="rounded-[var(--radius-lg)] border border-border bg-charcoal p-4">
          <p className="text-label text-neutral">Training · {stage(view.proposal.domains.resistance.status)}</p>
          <p className="mt-1.5 text-subheading text-off-white">
            {[weeks ? `${weeks} weeks` : null, `${w.resistanceDays} lifting days`, w.cardioMinutes.total ? `${w.cardioMinutes.total} min cardio` : null, `${w.restDays} rest`].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {view.revalidation.week.map((d) => (
              <div key={d.day} className={`rounded-[var(--radius-sm)] px-1 py-1.5 text-center ${d.resistance || d.cardio ? "bg-accent-soft" : "bg-off-white/[0.04]"}`}>
                <p className="text-[11px] font-semibold text-off-white">{DAY_SHORT[d.day]}</p>
                <p className="text-[11px] leading-tight text-neutral">{d.resistance ? `${d.resistance.minutes}′` : d.cardio ? `${d.cardio.minutes}′` : "Rest"}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-meta text-neutral">
            Cardio: {STATUS_LABEL[cardio.status] ?? cardio.status}
            {cardio.status !== "PROPOSED" && cardio.reasons.length ? ` — ${cardio.reasons[0].replace(/\b([a-z]+(?:_[a-z]+)+)\b/g, (m) => m.replace(/_/g, " "))}` : ""}
          </p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-border bg-charcoal p-4">
          <p className="text-label text-neutral">Nutrition · {stage(view.proposal.domains.nutrition.status)}</p>
          {view.nutrition ? (
            <>
              <p className="mt-1.5 text-subheading text-off-white">{view.nutrition.summary.targets.length ? view.nutrition.summary.targets.join(" · ") : "No calorie or macro numbers"}</p>
              <p className="mt-1 text-meta text-neutral">
                {view.nutrition.summary.approach}
                {view.approvalState === "proposed" ? " · proposed — not assigned to the client until you publish" : view.approvalState === "approved" ? " · approved — not assigned to the client until you publish" : ""}
              </p>
            </>
          ) : view.nutritionStrategy ? (
            <p className="mt-1.5 text-meta text-off-white">A strategy was prepared but isn&apos;t a plan the client can receive yet — {view.nutritionStrategy.reason}</p>
          ) : (
            <p className="mt-1.5 text-meta text-neutral">No nutrition plan in this proposal.</p>
          )}
          {view.revalidation.domains.resistance.edited || view.revalidation.domains.nutrition.edited ? (
            <p className="mt-2 text-meta text-neutral">Edited by you: {[view.revalidation.domains.resistance.edited ? "training" : null, view.revalidation.domains.nutrition.edited ? "nutrition" : null].filter(Boolean).join(" and ")}.</p>
          ) : null}
        </div>
        {findings.length ? (
          <ul className="space-y-1.5 md:col-span-2 lg:col-span-full">
            {findings.map((f) => (
              <li key={f.code + f.message} className="flex gap-2 text-meta text-off-white">
                {f.severity === "warning" ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" /> : <Info size={14} className="mt-0.5 shrink-0 text-neutral" aria-hidden="true" />} {f.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function Handled({ items, disabled, onChange, onWithdraw }: { items: HandledItem[]; disabled: boolean; onChange: (key: string) => void; onWithdraw: (key: string) => void }) {
  return (
    <details className="group rounded-[var(--radius-lg)] border border-border bg-charcoal">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
          <span className="text-subheading text-off-white">Handled</span>
          <span className="text-meta text-neutral">{items.map((i) => i.title).join(" · ")}</span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-neutral transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
            <span className="min-w-0">
              <span className="text-meta font-semibold text-off-white">{i.title}</span> <span className="text-meta text-neutral">— {i.detail}</span>
            </span>
            {!disabled && (i.changeKey || i.withdrawKey) ? (
              <button type="button" className="text-action text-accent-fg hover:underline" onClick={() => (i.withdrawKey ? onWithdraw(i.withdrawKey) : onChange(i.changeKey!))}>
                {i.withdrawKey ? "Withdraw" : "Change"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function EvidenceList({ view }: { view: UnifiedReviewView }) {
  return (
    <div className="space-y-3">
      {(["resistance", "cardio", "nutrition"] as DomainId[])
        .filter((d) => view.evidence[d]?.length)
        .map((d) => (
          <div key={d}>
            <p className="text-label text-neutral">{DOMAIN_LABEL[d]}</p>
            <ul className="mt-1 space-y-2">
              {view.evidence[d]!.map((e, i) => (
                <li key={i} className="text-meta">
                  <p className="text-off-white">{e.decision}</p>
                  <p className="text-neutral">{e.because}</p>
                  {/* Only named sources; an internal knowledge id (a title that is just the id) isn't shown. */}
                  {e.sources.some((s) => s.title !== s.id) ? <p className="text-neutral">Evidence: {e.sources.filter((s) => s.title !== s.id).map((s) => s.title).join("; ")}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

function TrainingCard({ view, disabled, onEdit, onRemove }: { view: UnifiedReviewView; disabled: boolean; onEdit: (path: TrainingItemPath, patch: TrainingItemPatch) => void; onRemove: (path: TrainingItemPath) => void }) {
  const content = view.training!.content;
  const [weekNumber, setWeekNumber] = useState(1);
  const week = content.weeks.find((w) => w.weekNumber === weekNumber) ?? content.weeks[0];
  const liftingLocked = view.resistanceSource === "approved_program";
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label text-neutral">Training prescriptions</p>
        <label className="flex items-center gap-2 text-meta text-neutral">
          Week
          <select value={weekNumber} onChange={(e) => setWeekNumber(Number(e.target.value))} className="h-8 rounded border border-border-strong bg-surface px-2 text-sm text-off-white">
            {content.weeks.map((w) => (
              <option key={w.weekNumber} value={w.weekNumber}>
                {w.weekNumber}
              </option>
            ))}
          </select>
        </label>
      </div>
      {liftingLocked ? <p className="mt-1 text-meta text-neutral">Lifting comes from the client&apos;s approved program and can&apos;t be changed here — use a program adjustment.</p> : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {week.days
          .filter((d) => d.sessions?.length)
          .map((d) => (
            <div key={d.dayOfWeek} className="rounded border border-border-strong bg-surface-raised px-3 py-2">
              <p className="text-sm font-medium text-off-white">{d.dayOfWeek}</p>
              {d.sessions!.map((s, si) => (
                <div key={s.id} className="mt-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral">
                    {s.name} · ~{s.estimatedDurationMin} min{s.optional ? " · optional" : ""}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {s.blocks.flatMap((b) =>
                      b.items.map((i) => (
                        <ItemRow key={i.id} item={i} locked={disabled || (liftingLocked && i.prescription.family === "resistance")} path={{ weekNumber: week.weekNumber, dayOfWeek: d.dayOfWeek, sessionIndex: si, blockId: b.id, itemId: i.id }} onEdit={onEdit} onRemove={onRemove} />
                      ))
                    )}
                  </ul>
                </div>
              ))}
            </div>
          ))}
      </div>
    </Card>
  );
}

function ItemRow({ item, path, locked, onEdit, onRemove }: { item: TrainingItemInstance; path: TrainingItemPath; locked: boolean; onEdit: (path: TrainingItemPath, patch: TrainingItemPatch) => void; onRemove: (path: TrainingItemPath) => void }) {
  const [editing, setEditing] = useState(false);
  const p = item.prescription;
  const [f, setF] = useState<Record<string, string>>({});
  const num = (k: string, fallback: number | undefined) => (f[k] ?? (fallback !== undefined ? String(fallback) : ""));
  const field = (k: string, label: string, fallback: number | undefined) => (
    <label key={k} className="flex flex-col gap-1 text-xs text-neutral">
      {label}
      <input inputMode="numeric" value={num(k, fallback)} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="w-20 rounded border border-border-strong bg-surface px-2 py-1 text-off-white" />
    </label>
  );
  const save = () => {
    const n = (k: string) => (f[k] !== undefined && f[k] !== "" ? Number(f[k]) : undefined);
    const patch: TrainingItemPatch = {};
    if (p.family === "resistance") Object.assign(patch, { sets: n("sets"), repsLow: n("repsLow"), repsHigh: n("repsHigh"), rpe: n("rpe") });
    if (p.family === "continuous") Object.assign(patch, { durationSeconds: n("minutes") !== undefined ? n("minutes")! * 60 : undefined });
    if (p.family === "interval") Object.assign(patch, { rounds: n("rounds"), workIntervalSeconds: n("work"), recoveryIntervalSeconds: n("recovery") });
    if (p.family === "continuous" || p.family === "interval") Object.assign(patch, { effortLow: n("effortLow"), effortHigh: n("effortHigh") });
    for (const k of Object.keys(patch) as Array<keyof TrainingItemPatch>) if (patch[k] === undefined || Number.isNaN(patch[k])) delete patch[k];
    if (Object.keys(patch).length) onEdit(path, patch);
    setEditing(false);
    setF({});
  };
  return (
    <li className="text-meta">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-off-white">
          {item.name} <span className="text-neutral">· {prescriptionSummary(p)}</span>
        </p>
        {!locked ? (
          <span className="flex shrink-0 gap-1">
            <button type="button" aria-label={`Edit ${item.name}`} className="rounded p-1 text-neutral hover:text-off-white" onClick={() => setEditing((e) => !e)}>
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Remove ${item.name}`} className="rounded p-1 text-neutral hover:text-off-white" onClick={() => onRemove(path)}>
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded border border-accent/30 bg-accent/[0.03] p-2">
          {p.family === "resistance" ? [field("sets", "Sets", p.sets), field("repsLow", "Reps from", p.reps?.low), field("repsHigh", "Reps to", p.reps?.high), field("rpe", "RPE (6–10)", p.rpe)] : null}
          {p.family === "continuous" ? field("minutes", "Minutes", p.duration ? Math.round(p.duration.seconds / 60) : undefined) : null}
          {p.family === "interval" ? [field("rounds", "Rounds", p.rounds), field("work", "Work (s)", p.workInterval?.seconds), field("recovery", "Recovery (s)", p.recoveryInterval?.seconds)] : null}
          {p.family === "continuous" || p.family === "interval" ? [field("effortLow", "Effort from (0–10)", p.effort?.low), field("effortHigh", "Effort to", p.effort?.high)] : null}
          <Button size="sm" onClick={save}>
            Save edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function NutritionCard({ view, disabled, onSave }: { view: UnifiedReviewView; disabled: boolean; onSave: (edit: { targets?: Record<string, number>; habits?: string[] }) => void }) {
  const n = view.nutrition!;
  const m = n.content.method;
  const prescribed = m ? m.prescribed : n.content.targets;
  const keys = (["calories", "proteinG", "carbsG", "fatG"] as const).filter((k) => prescribed && prescribed[k] !== null && prescribed[k] !== undefined);
  const LABELS = { calories: "Calories (kcal)", proteinG: "Protein (g)", carbsG: "Carbs (g)", fatG: "Fat (g)" };
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [habits, setHabits] = useState((m?.habits ?? []).join("\n"));
  const s = n.summary;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-neutral">Nutrition · {s.approach}</p>
        {!disabled ? (
          <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
            {editing ? "Close" : "Edit"}
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-subheading text-off-white">{s.targets.length ? s.targets.join(" · ") : "No calorie or macro numbers"}</p>
      {s.note ? <p className="mt-1 text-meta text-neutral">{s.note}</p> : null}
      {s.dayVariation ? <p className="mt-1 text-meta text-neutral">{s.dayVariation}</p> : null}
      {s.meals.length ? (
        <ul className="mt-2 space-y-1">
          {s.meals.map((meal) => (
            <li key={meal.name} className="text-meta text-off-white">
              {meal.name} <span className="text-neutral">({meal.timing})</span> — {meal.intent}
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? (
        <div className="mt-3 space-y-2 rounded border border-accent/30 bg-accent/[0.03] p-2.5">
          {keys.length ? (
            <div className="flex flex-wrap gap-2">
              {keys.map((k) => (
                <label key={k} className="flex flex-col gap-1 text-xs text-neutral">
                  {LABELS[k]}
                  <input inputMode="numeric" value={vals[k] ?? String(prescribed![k])} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} className="w-28 rounded border border-border-strong bg-surface px-2 py-1 text-off-white" />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-meta text-neutral">This plan sets no numeric targets — your method decides that.</p>
          )}
          {m ? (
            <label className="flex flex-col gap-1 text-xs text-neutral">
              Habits (one per line)
              <textarea value={habits} onChange={(e) => setHabits(e.target.value)} rows={3} className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-sm text-off-white" />
            </label>
          ) : null}
          <p className="text-meta text-neutral">Only targets your method prescribes for this plan can change; OPTIM never adds one.</p>
          <Button
            size="sm"
            onClick={() => {
              const targets = Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
              const nextHabits = habits.split("\n").map((h) => h.trim()).filter(Boolean);
              const habitsChanged = m ? JSON.stringify(nextHabits) !== JSON.stringify(m.habits) : false;
              onSave({ ...(Object.keys(targets).length ? { targets } : {}), ...(habitsChanged ? { habits: nextHabits } : {}) });
              setEditing(false);
              setVals({});
            }}
          >
            Save nutrition edit
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function PublishCard({ view, pending, onPublish, scope: { workspaceId, clientProfileId } }: { view: UnifiedReviewView; pending: boolean; onPublish: (expected: { activeTrainingVersionId: string | null; activeNutritionVersionId: string | null; replaceActive: boolean; startDate: string | null }) => void; scope: { workspaceId: string; clientProfileId: string } }) {
  const [plan, setPlan] = useState<PublicationPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [startDate, setStartDate] = useState("");
  useEffect(() => {
    if (view.approvalState !== "approved") return;
    let live = true;
    planUnifiedPublicationAction({ workspaceId, clientProfileId }, { rowId: view.rowId }).then((r) => {
      if (!live) return;
      if (r.ok) setPlan(r.plan);
      else setLoadError(r.error);
    });
    return () => {
      live = false;
    };
  }, [view.rowId, view.approvalState, workspaceId, clientProfileId]);

  if (view.approvalState === "published") {
    const p = view.publication as { positionPreserved?: boolean; startDate?: string | null; supersededProposalIds?: string[]; archivedTrainingVersionIds?: string[]; replaced?: { trainingVersionId: string | null; nutritionVersionId: string | null }; notificationId?: string | null } | null;
    return (
      <Card>
        <p className="text-label text-neutral">Published to the client</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-meta text-off-white">
          <li>{[view.training ? "Training" : null, view.nutrition ? "nutrition" : null].filter(Boolean).join(" and ")} published and assigned together.</li>
          {p?.replaced?.trainingVersionId || p?.replaced?.nutritionVersionId ? <li>The client&apos;s previous {[p.replaced.trainingVersionId ? "program" : null, p.replaced.nutritionVersionId ? "nutrition plan" : null].filter(Boolean).join(" and ")} {p.replaced.trainingVersionId && p.replaced.nutritionVersionId ? "were" : "was"} replaced (kept in history).</li> : null}
          <li>{p?.startDate ? `New program starts ${p.startDate}.` : "The client's program position was kept."}</li>
          {p?.supersededProposalIds?.length ? <li>{p.supersededProposalIds.length} other open proposal{p.supersededProposalIds.length === 1 ? " was" : "s were"} superseded and {p.supersededProposalIds.length === 1 ? "its" : "their"} drafts archived.</li> : null}
          <li>{p?.notificationId ? "The client was notified in the app." : "The client hasn't signed in yet, so no notification was sent."}</li>
        </ul>
      </Card>
    );
  }
  if (loadError) return <Card><p className="text-meta text-off-white">{loadError}</p></Card>;
  if (!plan) return <Card><p className="text-meta text-neutral">Checking what publishing would do…</p></Card>;
  const replacing = plan.replaces.training || plan.replaces.nutrition;
  const ready = plan.canPublish && (!replacing || confirmReplace) && (!plan.needsStartDate || !!startDate);
  return (
    <Card className="space-y-2">
      <p className="text-label text-neutral">Publish to the client</p>
      {plan.blockers.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-meta text-warning-strong">
          {plan.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5 text-meta text-off-white">
          <li>Publishes {[view.training ? "the training" : null, view.nutrition ? "the nutrition" : null].filter(Boolean).join(" and ")} together — all or nothing.{plan.omits.length ? ` (${plan.omits.join(" and ")} isn't part of this proposal and stays as it is.)` : ""}</li>
          {plan.continuesApprovedProgram ? <li>Continues the client&apos;s approved program — their program position is kept.</li> : null}
          {plan.supersedes.openProposals || plan.supersedes.legacyPendingDrafts ? <li>Supersedes {plan.supersedes.openProposals} other open proposal(s) and archives {plan.supersedes.legacyPendingDrafts} pending program draft(s).</li> : null}
          <li>The client is notified in the app only after publishing succeeds.</li>
        </ul>
      )}
      {plan.canPublish && replacing ? (
        <label className="flex items-start gap-2 text-meta text-off-white">
          <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} className="mt-0.5" />
          Replace the client&apos;s active {[plan.replaces.training ? "program" : null, plan.replaces.nutrition ? "nutrition plan" : null].filter(Boolean).join(" and ")} (kept in their history).
        </label>
      ) : null}
      {plan.canPublish && plan.needsStartDate ? (
        <label className="flex flex-col gap-1 text-xs text-neutral">
          New program start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-44 rounded border border-border-strong bg-surface px-2 text-sm text-off-white" />
        </label>
      ) : null}
      <Button size="sm" disabled={!ready || pending} loading={pending} onClick={() => onPublish({ activeTrainingVersionId: plan.active.trainingVersionId, activeNutritionVersionId: plan.active.nutritionVersionId, replaceActive: confirmReplace, startDate: plan.needsStartDate ? startDate : null })}>
        Publish to client
      </Button>
    </Card>
  );
}

/** "Let OPTIM Build" — the coach's one primary way to build this client's program: OPTIM's Fitness Reasoner plans the
 * lifting (or keeps the approved program as-is) and coordinates cardio, nutrition, scheduling and recovery into ONE
 * draft proposal for review. Decisions still open (health review, restrictions, method, intake) are listed first and
 * keep the button disabled. Nothing reaches the client until the coach reviews, approves and publishes. */
export function UnifiedPrepareCard({ workspaceId, clientProfileId, activeLabel, missing = [], waitingForReview = false }: { workspaceId: string; clientProfileId: string; activeLabel: string; missing?: Array<{ id: string; message: string; href: string | null; linkLabel: string | null }>; waitingForReview?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const blocked = missing.length > 0;
  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-off-white">Training program</h3>
        <p className="mt-0.5 text-sm text-neutral">Active: {activeLabel}</p>
      </div>
      {waitingForReview ? (
        <p className="text-sm text-neutral">OPTIM&apos;s program is waiting for your review at the top of this page — approve and publish it, or reject it to build again.</p>
      ) : (
        <>
          <p className="text-body text-off-white">Let OPTIM build this client&apos;s program from your method: lifting, cardio where it applies, nutrition, schedule and recovery — one draft for you to review, edit and approve.</p>
          {blocked ? (
            <div className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2.5">
              <p className="text-sm font-medium text-off-white">Decide these first:</p>
              <ul className="mt-1.5 space-y-1.5">
                {missing.map((m) => (
                  <li key={m.id} className="text-sm text-neutral">
                    {m.message}{" "}
                    {m.href && m.linkLabel ? (
                      <a href={m.href} className="font-medium text-accent-fg hover:underline">
                        {m.linkLabel}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-meta text-neutral">Takes a few minutes. Nothing reaches the client until you review, approve and publish.</p>
          )}
          {result ? (
            <p role="status" className={`text-meta ${result.ok ? "text-success" : "text-warning-strong"}`}>
              {result.message}
            </p>
          ) : null}
          <Button
            size="sm"
            loading={pending}
            disabled={pending || blocked}
            onClick={() =>
              start(async () => {
                const r = await prepareUnifiedProposalAction({ workspaceId, clientProfileId });
                setResult({ ok: r.ok, message: r.message });
                if (r.ok) router.refresh();
              })
            }
          >
            {pending ? "OPTIM is building the program — this takes a few minutes…" : "Let OPTIM Build"}
          </Button>
        </>
      )}
    </Card>
  );
}
