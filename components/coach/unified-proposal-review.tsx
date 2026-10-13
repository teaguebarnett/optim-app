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
  const scope = { workspaceId, clientProfileId };
  const open = view.approvalState === "proposed";

  const act = (f: () => Promise<UnifiedReviewResult>) =>
    start(async () => {
      const r = await f();
      if (r.ok) {
        setView(r.view);
        setError(null);
      } else setError(r.error);
    });

  return (
    <section className="space-y-3" aria-label="Unified program review">
      <ReviewHeader view={view} pending={pending} error={error} onApprove={() => act(() => approveUnifiedProposalAction(scope, { rowId: view.rowId, expected: { training: view.training?.versionId ?? null, nutrition: view.nutrition?.versionId ?? null } }))} onReject={(reason) => act(() => rejectUnifiedProposalAction(scope, { rowId: view.rowId, reason }))} />

      {view.approvalState === "approved" || view.approvalState === "published" ? <PublishCard view={view} pending={pending} onPublish={(expected) => act(() => publishUnifiedProposalAction(scope, { rowId: view.rowId, expected }))} scope={scope} /> : null}

      <div className="grid gap-3 md:grid-cols-3">
        {(["resistance", "cardio", "nutrition"] as DomainId[]).map((d) => (
          <DomainCard key={d} view={view} domain={d} />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <DecisionsCard
          view={view}
          disabled={!open || pending}
          onAnswer={(key, answer) => act(() => recordUnifiedDecisionAction(scope, { rowId: view.rowId, key, answer }))}
          onRemoveExercise={(name) => act(() => editUnifiedTrainingAction(scope, { rowId: view.rowId, expectedVersionId: view.training!.versionId, edit: { kind: "removeExercise", name } }))}
          onLimitEffort={(name) => act(() => editUnifiedTrainingAction(scope, { rowId: view.rowId, expectedVersionId: view.training!.versionId, edit: { kind: "limitEffort", name } }))}
          onWithdraw={(key) => act(() => withdrawUnifiedExclusionAction(scope, { rowId: view.rowId, key }))}
        />
        <ChecksCard view={view} />
      </div>

      <WeekCard view={view} />

      {view.training ? (
        <TrainingCard
          view={view}
          disabled={!open || pending}
          onEdit={(path, patch) => act(() => editUnifiedTrainingAction(scope, { rowId: view.rowId, expectedVersionId: view.training!.versionId, edit: { kind: "patch", path, patch } }))}
          onRemove={(path) => act(() => editUnifiedTrainingAction(scope, { rowId: view.rowId, expectedVersionId: view.training!.versionId, edit: { kind: "remove", path } }))}
        />
      ) : null}
      {view.nutrition ? <NutritionCard view={view} disabled={!open || pending} onSave={(edit) => act(() => editUnifiedNutritionAction(scope, { rowId: view.rowId, expectedVersionId: view.nutrition!.versionId, edit }))} /> : view.nutritionStrategy ? (
        <Card>
          <p className="text-label text-neutral">Nutrition</p>
          <p className="mt-1 text-body text-off-white">A nutrition strategy was prepared but isn&apos;t a plan the client can receive yet.</p>
          <p className="mt-1 text-meta text-neutral">{view.nutritionStrategy.reason}</p>
        </Card>
      ) : null}

      {view.revisions.length ? (
        <Card>
          <p className="text-label text-neutral">Your edits</p>
          <ul className="mt-2 space-y-1">
            {view.revisions.map((r) => (
              <li key={r.toVersionId} className="text-meta text-off-white">
                {r.summary} <span className="text-neutral">· {new Date(r.atIso).toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-meta text-neutral">Every edit is a new draft version; earlier versions are kept.</p>
        </Card>
      ) : null}
    </section>
  );
}

function ReviewHeader({ view, pending, error, onApprove, onReject }: { view: UnifiedReviewView; pending: boolean; error: string | null; onApprove: () => void; onReject: (reason: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const open = view.approvalState === "proposed";
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label text-neutral">Unified program · prepared by OPTIM for your review</p>
          <p className="mt-1 text-subheading text-off-white">{view.title}</p>
          <p className="mt-1 text-body text-neutral">{view.proposal.objective.summary}</p>
          <p className="mt-1 text-meta text-neutral">
            Your method v{view.proposal.coachMethodVersion ?? "—"} · prepared {new Date(view.createdAtIso).toLocaleDateString()}
          </p>
        </div>
        <StatePill view={view} />
      </div>

      {open ? (
        view.blockers.length ? (
          <div className="rounded border border-warning bg-warning-soft/40 px-3 py-2">
            <p className="text-sm font-medium text-warning-strong">Before you can approve</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-meta text-off-white">
              {view.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-meta text-success">
            <CheckCircle2 size={16} aria-hidden="true" /> Revalidated against the current client, restrictions and your method — ready for your approval
            {view.revalidation.findings.some((f) => f.severity === "warning") ? ` (look at the ${view.revalidation.findings.filter((f) => f.severity === "warning").length} warning${view.revalidation.findings.filter((f) => f.severity === "warning").length === 1 ? "" : "s"} below first)` : ""}.
          </p>
        )
      ) : view.approvalState === "approved" ? (
        <p className="text-meta text-off-white">Approved {view.reviewedAtIso ? new Date(view.reviewedAtIso).toLocaleString() : ""}. Not published yet — the client sees nothing until it&apos;s published.</p>
      ) : view.approvalState === "published" ? (
        <p className="text-meta text-off-white">Published {view.publishedAtIso ? new Date(view.publishedAtIso).toLocaleString() : ""} — assigned to the client.</p>
      ) : view.approvalState === "superseded" ? (
        <p className="text-meta text-off-white">Superseded by a newer published program. Its drafts were archived.</p>
      ) : (
        <p className="text-meta text-off-white">Rejected{view.rejectionReason ? `: ${view.rejectionReason}` : "."} Its drafts were archived.</p>
      )}

      {error ? (
        <p role="alert" className="rounded border border-error/40 bg-error-soft px-3 py-2 text-meta text-off-white">
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onApprove} disabled={pending || view.blockers.length > 0} loading={pending}>
            Approve program
          </Button>
          {rejecting ? (
            <>
              <input aria-label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" maxLength={1000} className="h-9 min-w-0 flex-1 rounded border border-border-strong bg-surface px-2 text-sm text-off-white" />
              <Button size="sm" variant="danger" disabled={pending} onClick={() => onReject(reason)}>
                Reject proposal
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(true)}>
              Reject…
            </Button>
          )}
          <p className="w-full text-meta text-neutral">Approving records your decision on exactly these drafts. Nothing is published to the client yet.</p>
        </div>
      ) : null}
    </Card>
  );
}

function StatePill({ view }: { view: UnifiedReviewView }) {
  const text = view.approvalState === "published" ? "Published" : view.approvalState === "superseded" ? "Superseded" : view.approvalState === "approved" ? "Approved — not published" : view.approvalState === "rejected" ? "Rejected" : view.blockers.length ? "Needs your decisions" : "Ready to approve";
  const tone = view.approvalState === "rejected" ? "border-border-strong text-neutral" : view.approvalState === "approved" || !view.blockers.length ? "border-success/40 text-success" : "border-warning text-warning-strong";
  return <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>{text}</span>;
}

function DomainCard({ view, domain }: { view: UnifiedReviewView; domain: DomainId }) {
  const d = view.proposal.domains[domain];
  const r = view.revalidation.domains[domain];
  const evidence = view.evidence[domain] ?? [];
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-neutral">{DOMAIN_LABEL[domain]}</p>
        <span className="text-xs text-neutral">{STATUS_LABEL[d.status] ?? d.status}</span>
      </div>
      <p className="text-body text-off-white">{view.proposal.objective.byDomain[domain] ?? d.summary}</p>
      {d.reasons.length && d.status !== "PROPOSED" ? <p className="text-meta text-neutral">{d.reasons.join(" ").replace(/\b([a-z]+(?:_[a-z]+)+)\b/g, (m) => m.replace(/_/g, " "))}</p> : null}
      <div className="flex flex-wrap gap-2 text-xs">
        {r.edited ? <span className="rounded-full border border-accent/40 px-2 py-0.5 text-off-white">Edited by you</span> : null}
        {!r.ok ? <span className="rounded-full border border-error/40 px-2 py-0.5 text-off-white">Has a problem</span> : null}
      </div>
      {evidence.length ? (
        <details className="mt-auto">
          <summary className="flex cursor-pointer items-center gap-1 text-xs font-medium text-off-white">
            Why OPTIM proposed this <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <ul className="mt-2 space-y-2">
            {evidence.map((e, i) => (
              <li key={i} className="text-meta">
                <p className="text-off-white">{e.decision}</p>
                <p className="text-neutral">{e.because}</p>
                {e.sources.length ? <p className="text-neutral">Evidence: {e.sources.map((s) => s.title).join("; ")}</p> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function DecisionsCard({ view, disabled, onAnswer, onRemoveExercise, onLimitEffort, onWithdraw }: { view: UnifiedReviewView; disabled: boolean; onAnswer: (key: string, answer: string) => void; onRemoveExercise: (name: string) => void; onLimitEffort: (name: string) => void; onWithdraw: (key: string) => void }) {
  const [changing, setChanging] = useState<string | null>(null);
  return (
    <Card>
      {view.effortLimits.length ? (
        <div className="mb-3 space-y-2">
          <p className="text-label text-neutral">Exercises you limited (stay well short of failure)</p>
          {view.effortLimits.map((x) => (
            <div key={x.key} className="rounded border border-border-strong bg-surface-raised px-3 py-2">
              {x.exercises.map((e) => (
                <div key={e.name} className="flex flex-wrap items-center justify-between gap-2 py-0.5">
                  <p className="text-meta text-off-white">
                    {e.name}{" "}
                    {e.harderIn.length ? <span className="text-warning-strong">— prescribed harder than your limit ({e.harderIn.length} session{e.harderIn.length === 1 ? "" : "s"}); it can&apos;t be approved until the limit is applied</span> : <span className="text-success">— within your limit (3+ reps in reserve)</span>}
                  </p>
                  {e.harderIn.length && !disabled ? (
                    <Button size="sm" variant="secondary" onClick={() => onLimitEffort(e.name)}>
                      Apply the limit to {e.name} (3+ reps in reserve)
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {view.exclusions.length ? (
        <div className="mb-3 space-y-2">
          <p className="text-label text-neutral">Exercises you excluded</p>
          {view.exclusions.map((x) => (
            <div key={x.key} className="rounded border border-border-strong bg-surface-raised px-3 py-2">
              {x.exercises.map((e) => (
                <div key={e.name} className="flex flex-wrap items-center justify-between gap-2 py-0.5">
                  <p className="text-meta text-off-white">
                    {e.name}{" "}
                    {e.presentIn.length ? <span className="text-warning-strong">— still in the program ({e.presentIn.length} session{e.presentIn.length === 1 ? "" : "s"}); it can&apos;t be approved until it&apos;s removed or replaced</span> : <span className="text-success">— removed from the program</span>}
                  </p>
                  {e.presentIn.length && !disabled ? (
                    <Button size="sm" variant="secondary" onClick={() => onRemoveExercise(e.name)}>
                      Remove {e.name} from the program
                    </Button>
                  ) : null}
                </div>
              ))}
              {!disabled ? (
                <button type="button" className="mt-1 text-xs font-medium text-accent" onClick={() => onWithdraw(x.key)}>
                  Withdraw this exclusion (re-opens the decision)
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <p className="text-label text-neutral">Your decisions {view.decisions.length ? `(${view.decisions.filter((d) => d.answer).length}/${view.decisions.length})` : ""}</p>
      {view.decisions.length === 0 ? <p className="mt-2 text-meta text-neutral">Nothing needs your decision.</p> : null}
      <ul className="mt-2 space-y-3">
        {view.decisions.map((d) => (
          <li key={d.key} className="rounded border border-border-strong bg-surface-raised px-3 py-2">
            <p className="text-sm font-medium text-off-white">{d.question}</p>
            {d.why ? <p className="mt-0.5 text-meta text-neutral">{d.why}</p> : null}
            {d.answer && changing !== d.key ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-meta text-success">You decided: {d.answer.answer}</p>
                {!disabled ? (
                  <button type="button" className="text-xs font-medium text-accent" onClick={() => setChanging(d.key)}>
                    Change
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {d.options.map((o) => (
                  <Button
                    key={o}
                    size="sm"
                    variant={o === d.recommended ? "primary" : "secondary"}
                    disabled={disabled}
                    onClick={() => {
                      setChanging(null);
                      onAnswer(d.key, o);
                    }}
                  >
                    {o}
                    {o === d.recommended ? " (recommended)" : ""}
                  </Button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ChecksCard({ view }: { view: UnifiedReviewView }) {
  const r = view.revalidation;
  return (
    <Card>
      <p className="text-label text-neutral">OPTIM&apos;s checks</p>
      {r.errors.length === 0 && r.findings.length === 0 ? <p className="mt-2 flex items-center gap-2 text-meta text-success"><CheckCircle2 size={14} aria-hidden="true" /> Every domain and the combined week pass.</p> : null}
      <ul className="mt-2 space-y-1.5">
        {r.errors.map((e) => (
          <li key={e.message} className="flex gap-2 text-meta text-off-white">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-error" aria-hidden="true" /> {e.message}
          </li>
        ))}
        {r.findings.map((f) => (
          <li key={f.code + f.message} className="flex gap-2 text-meta text-off-white">
            {f.severity === "warning" ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" /> : <Info size={14} className="mt-0.5 shrink-0 text-neutral" aria-hidden="true" />} {f.message}
          </li>
        ))}
      </ul>
      {view.documentedLimitations ? (
        <p className="mt-3 text-meta text-neutral">
          <span className="text-off-white">Documented limitations:</span> {view.documentedLimitations}
        </p>
      ) : null}
      {[...view.proposal.uncertainties, ...view.proposal.assumptions].length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-off-white">Assumptions and uncertainties</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-meta text-neutral">
            {[...view.proposal.uncertainties, ...view.proposal.assumptions].map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function WeekCard({ view }: { view: UnifiedReviewView }) {
  const w = view.revalidation.workload;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-label text-neutral">Week 1, coordinated</p>
        <p className="text-meta text-neutral">
          {w.resistanceDays} lifting · {w.cardioMinutes.total} min cardio · {w.restDays} rest
        </p>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {view.revalidation.week.map((d) => (
          <div key={d.day} className={`min-h-[84px] rounded border px-1.5 py-1.5 ${d.available ? "border-border-strong bg-surface-raised" : "border-dashed border-border text-neutral"}`}>
            <p className="text-xs font-medium text-off-white">{DAY_SHORT[d.day]}</p>
            {d.resistance ? <p className="mt-1 text-[11px] leading-tight text-off-white">Lift {d.resistance.minutes}′</p> : null}
            {d.cardio ? (
              <p className="mt-1 text-[11px] leading-tight text-off-white">
                {d.cardio.type === "intervals" ? "Intervals" : `${d.cardio.intensity[0].toUpperCase()}${d.cardio.intensity.slice(1)}`} {d.cardio.minutes}′{d.cardio.optional ? " (opt.)" : ""}
              </p>
            ) : null}
            {!d.resistance && !d.cardio ? <p className="mt-1 text-[11px] text-neutral">Rest</p> : null}
          </div>
        ))}
      </div>
    </Card>
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
        <p className="text-sm text-neutral">OPTIM&apos;s program is waiting for your review below — approve and publish it, or reject it to build again.</p>
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
