// Phase 8C/8D — Generated Program Review and Approval Workflow.
//
// The full-training-horizon coach review surface — every generated week is
// reviewable and editable through the SAME universal per-item form Phase 8C
// introduced for week 1 alone (see lib/training/program-proposal-editing.ts
// for why this required almost no new editing logic: week-1-only was a UI
// restriction, not an architectural one). Progressive disclosure via native
// <details> — week 1 open by default, every later week and every item's
// edit form collapsed until the coach opens it, so a 12-week program never
// forces hundreds of controls into view (or any client-side JS/round-trip)
// just to render. Plain coaching language throughout: no
// TrainingItemInstance, no schemaVersion, no prescription family enum ever
// surfaces here.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  editProgramProposalItemAction,
  editProgramProposalBlockAction,
  removeProgramProposalItemAction,
  addProgramProposalItemAction,
  moveProgramProposalBlockAction,
  renameProgramProposalSessionAction,
  convertProgramProposalDayToRestAction,
  approveProgramProposalAction,
  resolveReasonerFitDecisionAction,
  confirmDraftFitDecisionAction,
  recordExerciseFitDecisionsAction,
  requestRevisionAction,
  acceptPlanAdequacyAction,
  resolveProgramIntegrityAction,
  requestRepairRecommendationAction,
  rejectProgramProposalAction,
  type ProgramProposalReviewView,
} from "@/app/actions/production-programs";
import type { TrainingItemPath, SessionPath, BlockPath, TrainingItemPatch, BlockPatch } from "@/lib/training/program-proposal-editing";
import type { TrainingItemInstance, UniversalTrainingProgramContent, AdjustmentProvenance, GenerationInputs, UniversalProgramDay, UniversalProgramWeek } from "@/lib/training/types";
import type { AdequacyDecision, IntegrityDecision, ReasonerReviewModel } from "@/lib/synthesis/reasoner/review-gate";
import type { ReasonerJobView } from "@/lib/synthesis/reasoner/proposal-job";
import { PART_LABEL, type PlanningStatePart } from "@/lib/synthesis/planning-state";
import { ProposalScheduleNavigator } from "@/components/coach/proposal-schedule-navigator";
import { RevisionPoller } from "@/components/coach/revision-poller";
import { ProposalApproveForm } from "@/components/coach/proposal-approve-form";
import { ProposalRejectForm } from "@/components/coach/proposal-reject-form";
import { parseRejectionReason } from "@/lib/coach/proposal-rejection";
import type { SaveResult } from "@/components/coach/live-start-date-form";
import { describeIntervalOverview } from "@/lib/workout/interval";
import { describeCircuitOverview, isUnboundedRounds } from "@/lib/workout/circuit";
import { describePowerOverview } from "@/lib/workout/power";
import { describeMobilityOverview } from "@/lib/workout/mobility";
import { describeEmomOverview } from "@/lib/workout/emom";
import { isCircuitBlock, isEmomBlock } from "@/lib/workout/session-flow";

function numberOrUndefined(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function stringOrUndefined(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (raw === null) return undefined;
  const s = String(raw).trim();
  return s ? s : undefined;
}


/** "3 training days a week · Mon, Wed, Fri" — from week 1. */
function describeSchedule(content: UniversalTrainingProgramContent): string {
  const days = (content.weeks[0]?.days ?? []).filter((d) => d.type === "training").map((d) => d.dayOfWeek.slice(0, 3));
  if (days.length === 0) return "No training days scheduled";
  return `${days.length} training day${days.length === 1 ? "" : "s"} a week · ${days.join(", ")}`;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Exactly what this proposal was built from — recorded at generation time
 * (lib/coach/generation-prerequisites.ts), never recomputed from today's
 * state. */
/** Gate 4.0C-4 — what OPTIM's Fitness Reasoner wants the coach to know.
 * DECISIONS (blocking, one per underlying issue, each with an explicit
 * persisted resolution) come first; then NEEDS YOU (acknowledgements and
 * method tensions — visible, never blocking), WORTH KNOWING, HANDLED, and the
 * main decisions with their evidence. Plain language only — never run JSON. */
/** Gate 4.0C-4 — the post-edit consequence of the coach's changes, prepared like an assistant coach:
 * what training function the edit removed (facts), OPTIM's recommendation (if asked), feasible
 * options under the same restrictions, or consciously accepting the reduced stimulus. */
function IntegritySection({ d, repairEnabled, integrityAction, repairAction }: { d: IntegrityDecision; repairEnabled: boolean; integrityAction: (formData: FormData) => Promise<void>; repairAction: (formData: FormData) => Promise<void> }) {
  const a = d.analysis;
  const rec = d.recommendation;
  const hidden = (extra: Record<string, string>) => (
    <>
      <input type="hidden" name="decisionKey" value={d.key} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
  if (d.status === "accepted_tradeoff") {
    return (
      <li>
        <p className="text-off-white">You accepted reduced {a.deficiencies.map((x) => x.label.toLowerCase()).join(", ")} after {a.causes.map((c) => c.exerciseName).join(", ") || "your edits"}.</p>
        <p className="mt-1 text-success">Tradeoff accepted{d.resolution ? ` (${formatShortDate(d.resolution.resolvedAtIso)})` : ""} — it reopens if the plan loses more.</p>
      </li>
    );
  }
  return (
    <li>
      <p className="text-off-white">
        Your changes{a.causes.length ? ` (${a.causes.map((c) => (c.setsAfter === 0 ? `removed ${c.exerciseName}` : `reduced ${c.exerciseName}`)).join(", ")})` : ""} left these underrepresented:
      </p>
      <ul className="mt-1 space-y-0.5 text-neutral">
        {a.deficiencies.map((x) => (
          <li key={x.label}>
            – {x.label}: {x.before} → {x.after} sets a week, across {x.weeks.length} week{x.weeks.length === 1 ? "" : "s"}
          </li>
        ))}
      </ul>
      {rec ? (
        <div className="mt-2 rounded border border-border-strong bg-surface-raised px-2.5 py-2">
          {rec.verdict === "repair" && rec.recommendation ? (
            <>
              <p className="text-off-white">
                <span className="font-medium">OPTIM recommends: {rec.recommendation.exerciseName}</span> — {rec.recommendation.sets} sets of {rec.recommendation.reps.min}–{rec.recommendation.reps.max} on {rec.recommendation.days.join(", ")}.
              </p>
              <p className="mt-0.5 text-neutral">{rec.recommendation.why} {rec.tradeoff ? `Still not preserved: ${rec.tradeoff}` : ""}</p>
              <form action={integrityAction} className="mt-1.5">
                {hidden({ resolution: "replace", exerciseId: rec.recommendation.exerciseId, fromRecommendation: "1" })}
                <Button type="submit" variant="secondary" size="sm">
                  Accept this replacement
                </Button>
              </form>
            </>
          ) : (
            <p className="text-off-white">OPTIM couldn&apos;t find a confident replacement within the confirmed restrictions. {rec.rationale}</p>
          )}
        </div>
      ) : repairEnabled && a.candidates.length ? (
        <form action={repairAction} className="mt-2">
          {hidden({})}
          <Button type="submit" variant="secondary" size="sm">
            Ask OPTIM for a replacement
          </Button>
        </form>
      ) : null}
      {a.candidates.length ? (
        <div className="mt-2">
          <p className="text-neutral">Options that fit the client&apos;s confirmed restrictions:</p>
          <ul className="mt-1 space-y-1">
            {a.candidates.map((c) => (
              <li key={c.exerciseId} className="flex flex-wrap items-center gap-2">
                <span className="text-off-white">{c.exerciseName}</span>
                <span className="text-neutral">— restores {c.restores.join(", ").toLowerCase()}{c.fit === "conditional" ? `; only if ${c.conditions.join(", ")}` : ""}</span>
                <form action={integrityAction}>
                  {hidden({ resolution: "replace", exerciseId: c.exerciseId })}
                  <Button type="submit" variant="ghost" size="sm">
                    Use this
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-neutral">No exercise in OPTIM&apos;s knowledge restores this within the client&apos;s confirmed restrictions.</p>
      )}
      <form action={integrityAction} className="mt-2">
        {hidden({ resolution: "accept_tradeoff" })}
        <Button type="submit" variant="ghost" size="sm">
          Accept the reduced stimulus — no replacement
        </Button>
      </form>
    </li>
  );
}

function RevisionButton({ label, action }: { label: string; action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} className="mt-2">
      <Button type="submit" variant="secondary" size="sm">
        {label}
      </Button>
    </form>
  );
}

/** Gate 4.0C-5 — is this draft still the current solution for the client's authoritative state? */
function LifecycleSection({ review, revisionJob, revisionAction, workspaceId, clientProfileId }: { review: ReasonerReviewModel; revisionJob: ReasonerJobView | null; revisionAction: (formData: FormData) => Promise<void>; workspaceId: string; clientProfileId: string }) {
  const l = review.lifecycle;
  const changeLines = (changes: Array<{ part: string; added: string[]; removed: string[] }>) =>
    changes.map((c) => `${PART_LABEL[c.part as PlanningStatePart] ?? c.part}${c.added.length ? `: now ${c.added.join("; ")}` : ""}${c.removed.length ? `${c.added.length ? " —" : ":"} was ${c.removed.join("; ")}` : ""}`);
  const preparing = revisionJob?.status === "preparing";
  return (
    <>
      {review.revision ? (
        <div className="rounded border border-border-strong bg-surface-raised px-3 py-2 text-xs text-off-white">
          <p className="font-medium">Revised proposal — prepared from the client&apos;s current state</p>
          <p className="mt-1 text-neutral">
            OPTIM re-solved the whole program after {review.revision.trigger === "limitations_confirmed" ? "you confirmed the client's limitations" : review.revision.trigger === "fit_decision" ? "your exercise decision" : review.revision.trigger === "preflight_answered" ? "you answered its fit questions" : "you asked for a revision"} ({formatShortDate(review.revision.requestedAtIso)}). The proposal it replaces is kept unchanged in this program&apos;s history.
          </p>
          {review.revision.changes.length ? <ul className="mt-1 space-y-0.5 text-neutral">{changeLines(review.revision.changes).map((x) => <li key={x}>• {x}</li>)}</ul> : null}
        </div>
      ) : null}
      {l?.status === "superseded" ? (
        <div role="status" className="rounded border border-warning bg-warning-soft/40 px-3 py-2 text-xs text-warning-strong">
          <p className="font-medium">No longer the current plan for this client</p>
          <p className="mt-1">The client&apos;s planning state changed since OPTIM prepared this, so it can&apos;t be approved:</p>
          <ul className="mt-1 space-y-0.5">{l.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
          {preparing ? (
            <p className="mt-2">
              OPTIM is preparing a revised proposal from the current state. It will replace this one here when it&apos;s ready — nothing is sent to the client.
              <RevisionPoller workspaceId={workspaceId} clientProfileId={clientProfileId} jobId={revisionJob!.jobId} />
            </p>
          ) : revisionJob?.status === "needs_input" ? (
            <p className="mt-2">OPTIM needs your input before it can revise this — see Training program above.</p>
          ) : revisionJob?.status === "failed" || revisionJob?.status === "unsupported" ? (
            <>
              <p className="mt-2">{revisionJob.outcome.message ?? "The revision couldn't be prepared."}</p>
              <RevisionButton label="Try the revision again" action={revisionAction} />
            </>
          ) : (
            <RevisionButton label="Prepare a revised proposal" action={revisionAction} />
          )}
        </div>
      ) : l?.status === "loosened" ? (
        <div className="rounded border border-border-strong bg-surface-raised px-3 py-2 text-xs text-off-white">
          <p className="font-medium">A better plan may now be possible</p>
          <p className="mt-1 text-neutral">Since OPTIM prepared this, more exercises became usable for this client ({l.newlyAvailable.slice(0, 6).join(", ")}{l.newlyAvailable.length > 6 ? "…" : ""}). This plan still fits; a revision is optional.</p>
          {preparing ? (
            <p className="mt-1 text-neutral">
              OPTIM is preparing a revised proposal…
              <RevisionPoller workspaceId={workspaceId} clientProfileId={clientProfileId} jobId={revisionJob!.jobId} />
            </p>
          ) : (
            <RevisionButton label="Prepare a revised proposal" action={revisionAction} />
          )}
        </div>
      ) : l?.status === "unaffected" ? (
        <p className="rounded border border-border-strong bg-surface-raised px-3 py-2 text-xs text-neutral">The client&apos;s planning state changed since OPTIM prepared this ({changeLines(l.changes).join("; ")}). OPTIM rechecked the plan: nothing in it is affected.</p>
      ) : null}
    </>
  );
}

/** Gate 4.0C-5 — current-state adequacy: what this program can't do for the client now, and gaps it didn't resolve. */
function AdequacySection({ a, acceptAction }: { a: AdequacyDecision; acceptAction: (formData: FormData) => Promise<void> }) {
  return (
    <li>
      {a.limitations.length ? (
        <>
          <p className="font-medium text-off-white">What this program can&apos;t fully train right now</p>
          <ul className="mt-1 space-y-0.5">{a.limitations.map((f) => <li key={f.message} className="text-off-white">• {f.message}</li>)}</ul>
        </>
      ) : null}
      {a.deficiencies.length ? (
        <>
          <p className={`font-medium text-off-white ${a.limitations.length ? "mt-2" : ""}`}>Gaps OPTIM couldn&apos;t resolve</p>
          <ul className="mt-1 space-y-0.5">{a.deficiencies.map((f) => <li key={f.message} className="text-off-white">• {f.message}</li>)}</ul>
        </>
      ) : null}
      {a.status === "unresolved" ? (
        <form action={acceptAction} className="mt-1.5 flex flex-wrap items-center gap-2">
          <input type="hidden" name="decisionKey" value={a.key} />
          <Button type="submit" variant="secondary" size="sm">
            Accept these — I&apos;ll approve the program with them
          </Button>
          <span className="text-neutral">or edit the plan, change the client&apos;s exercise decisions, or prepare a revision.</span>
        </form>
      ) : (
        <p className="mt-1 text-success">Accepted{a.resolution ? ` (${formatShortDate(a.resolution.resolvedAtIso)})` : ""} — reopens if these findings change.</p>
      )}
    </li>
  );
}

function ReasonerContextSection({ review, resolveAction, repairEnabled, integrityAction, repairAction, revisionJob, revisionAction, adequacyAction, confirmDecisionAction, withheldAction, workspaceId, clientProfileId }: { workspaceId: string; clientProfileId: string; review: ReasonerReviewModel; resolveAction: (formData: FormData) => Promise<void>; repairEnabled: boolean; integrityAction: (formData: FormData) => Promise<void>; repairAction: (formData: FormData) => Promise<void>; revisionJob: ReasonerJobView | null; revisionAction: (formData: FormData) => Promise<void>; adequacyAction: (formData: FormData) => Promise<void>; confirmDecisionAction: (formData: FormData) => Promise<void>; withheldAction: (formData: FormData) => Promise<void> }) {
  const list = (items: string[]) => (
    <ul className="mt-1.5 space-y-1 text-xs">
      {items.map((line) => (
        <li key={line} className="text-off-white">
          • {line}
        </li>
      ))}
    </ul>
  );
  const KIND: Record<string, string> = { acknowledgement: "Acknowledge", method_tension: "Method tension", information: "For you" };
  return (
    <div className="mb-3 space-y-2">
      <p className="text-xs text-neutral">Prepared by OPTIM&apos;s Fitness Reasoner · {review.headline}</p>
      <LifecycleSection review={review} revisionJob={revisionJob} revisionAction={revisionAction} workspaceId={workspaceId} clientProfileId={clientProfileId} />
      {review.constraintsChanged && !review.lifecycle ? (
        <p className="rounded border border-border-strong bg-surface-raised px-3 py-2 text-xs text-off-white">
          The client&apos;s confirmed restrictions changed after OPTIM prepared this. Every exercise in every week was rechecked against the current ones; anything that no longer fits is listed below.
        </p>
      ) : null}
      {review.decisions.length > 0 || review.integrity || review.adequacy ? (
        <div className={`rounded border px-3 py-2 ${review.unresolvedCount ? "border-warning bg-warning-soft/40" : "border-border-strong bg-surface-raised"}`}>
          <p className={`text-xs font-medium ${review.unresolvedCount ? "text-warning-strong" : "text-off-white"}`}>
            {review.unresolvedCount ? `Decide before approving · ${review.unresolvedCount}` : "Decisions · all resolved"}
          </p>
          <ul className="mt-1.5 space-y-2.5 text-xs">
            {review.decisions.map((d) => (
              <li key={d.key}>
                <p className="text-off-white">
                  <span className="font-medium">{d.exerciseName}</span> —{" "}
                  {d.fit === "incompatible"
                    ? `conflicts with ${d.restriction}. Confirmed restrictions are authoritative, so it can't stay as is.`
                    : d.fit === "unverifiable"
                      ? `OPTIM can't check it against ${d.restriction}.`
                      : `OPTIM couldn't confirm it fits ${d.restriction}, even kept to ${d.conditions.join(" and ")}. It depends on load, setup and execution.`}
                </p>
                {d.status === "unresolved" ? (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {d.fit !== "incompatible" ? (
                      <form action={resolveAction}>
                        <input type="hidden" name="decisionKey" value={d.key} />
                        <input type="hidden" name="resolution" value="accept" />
                        <Button type="submit" variant="secondary" size="sm">
                          {d.fit === "unverifiable" ? "Keep it — I confirm it fits the restrictions" : "Keep it — I confirm it fits under these conditions"}
                        </Button>
                      </form>
                    ) : null}
                    <form action={resolveAction}>
                      <input type="hidden" name="decisionKey" value={d.key} />
                      <input type="hidden" name="resolution" value="remove" />
                      <Button type="submit" variant="ghost" size="sm">
                        Remove it from every week
                      </Button>
                    </form>
                    <span className="self-center text-neutral">or replace it session by session below.</span>
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-success">
                      {d.status === "accepted_with_conditions"
                        ? `Kept — you confirmed it fits under these conditions${d.resolution ? ` (${formatShortDate(d.resolution.resolvedAtIso)})` : ""}.`
                        : d.status === "removed"
                          ? `Removed from every week${d.resolution ? ` (${formatShortDate(d.resolution.resolvedAtIso)})` : ""}.`
                          : "Removed or replaced in your edits."}
                      {d.authoritative ? " Saved as your decision for this client — future proposals follow it." : ""}
                    </p>
                    {!d.authoritative && (d.status === "removed" || d.status === "accepted_with_conditions") && d.fit !== "unverifiable" ? (
                      <form action={confirmDecisionAction} className="mt-1.5 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="decisionKey" value={d.key} />
                        <Button type="submit" variant="secondary" size="sm">
                          {d.status === "removed" ? `Confirm: exclude ${d.exerciseName} for this client` : `Confirm: ${d.exerciseName} fits under these conditions`}
                        </Button>
                        <span className="text-neutral">This decision only lives in this draft so far. Confirming it makes it part of the client&apos;s planning state{d.status === "removed" ? " — and if the plan depended on it, OPTIM prepares one revised proposal." : "."}</span>
                      </form>
                    ) : null}
                  </>
                )}
              </li>
            ))}
            {review.integrity ? <IntegritySection d={review.integrity} repairEnabled={repairEnabled} integrityAction={integrityAction} repairAction={repairAction} /> : null}
            {review.adequacy ? <AdequacySection a={review.adequacy} acceptAction={adequacyAction} /> : null}
          </ul>
        </div>
      ) : null}
      {review.withheld.length > 0 ? (
        <details className="rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-off-white">Not used — fit unconfirmed · {review.withheld.length}</summary>
          <p className="mt-1.5 text-xs text-neutral">OPTIM didn&apos;t plan with these because it can&apos;t confirm they fit the client&apos;s confirmed restrictions. Your decision is saved for this client and used by future proposals.</p>
          <ul className="mt-1.5 space-y-2 text-xs">
            {review.withheld.map((w) => (
              <li key={w.exerciseId}>
                <p className="text-off-white">
                  <span className="font-medium">{w.exerciseName}</span> — {w.restriction}; would need {w.conditions.join(" and ")}.
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <form action={withheldAction}>
                    <input type="hidden" name="exerciseId" value={w.exerciseId} />
                    <input type="hidden" name="verdict" value="cleared" />
                    <Button type="submit" variant="secondary" size="sm">
                      It fits under these conditions
                    </Button>
                  </form>
                  <form action={withheldAction}>
                    <input type="hidden" name="exerciseId" value={w.exerciseId} />
                    <input type="hidden" name="verdict" value="excluded" />
                    <Button type="submit" variant="ghost" size="sm">
                      Exclude it for this client
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {review.adequacyNotes.length > 0 ? (
        <details className="rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-off-white">By design · {review.adequacyNotes.length}</summary>
          {list(review.adequacyNotes)}
        </details>
      ) : null}
      {review.history.length > 0 ? (
        <details className="rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-off-white">Your decisions · {review.history.length}</summary>
          <ul className="mt-1.5 space-y-1 text-xs text-off-white">
            {review.history.map((h) => (
              <li key={`${h.key}-${h.resolvedAtIso}`}>
                • {formatShortDate(h.resolvedAtIso)} —{" "}
                {h.resolution === "accepted_limitation" ? `accepted the program's limitations (${(h.limitations ?? []).length})` : h.resolution === "accepted_with_conditions" ? `kept ${h.exerciseName} under its conditions` : h.resolution === "removed" ? `removed ${h.exerciseName} from every week` : h.resolution === "accepted_replacement" ? `added ${h.replacement?.exerciseName ?? h.exerciseName}${h.replacement?.fromRecommendation ? " (OPTIM's recommendation)" : ""} on ${h.replacement?.days.join(", ") ?? ""}` : `accepted reduced ${(h.tradeoff ?? []).map((t) => `${t.label.toLowerCase()} (${t.before} → ${t.after})`).join(", ")}`}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {review.needsYou.length > 0 ? (
        <details open className="rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-off-white">Needs you · {review.needsYou.length} · doesn&apos;t block approval</summary>
          <ul className="mt-1.5 space-y-1 text-xs">
            {review.needsYou.map((n) => (
              <li key={n.text} className="text-off-white">
                • <span className="text-neutral">{KIND[n.kind]}:</span> {n.text}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {review.worthKnowing.length > 0 ? (
        <details className="rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-off-white">Worth knowing · {review.worthKnowing.length}</summary>
          {list(review.worthKnowing)}
        </details>
      ) : null}
      {review.handled.length > 0 ? (
        <details className="rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-off-white">Handled · {review.handled.length}</summary>
          {list(review.handled)}
        </details>
      ) : null}
      {review.why.length > 0 ? (
        <details className="rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-off-white">Why OPTIM decided this</summary>
          <ul className="mt-1.5 space-y-1.5 text-xs">
            {review.why.map((d) => (
              <li key={d.decision}>
                <span className="text-off-white">{d.decision}</span> <span className="text-neutral">— {d.because}</span>
                {d.evidence.length > 0 ? <span className="block text-neutral">Evidence: {d.evidence.join("; ")}</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-neutral">
            Run {review.reference.runId.slice(0, 8)} · {review.reference.reasonerVersion} · prompt {review.reference.promptVersion} · knowledge {review.reference.knowledgeVersion}
          </p>
        </details>
      ) : null}
      <p className="text-[11px] text-neutral">Your client sees the workouts with plain exercise instructions only — none of these review notes.</p>
    </div>
  );
}

function InputsUsedSection({ inputs }: { inputs: GenerationInputs }) {
  return (
    <details className="mb-3 rounded border border-border-strong bg-surface-raised px-3 py-2">
    <summary className="cursor-pointer text-xs font-medium text-off-white">Inputs used</summary>
    <div className="mt-2 grid gap-3 md:grid-cols-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">
          Your coaching method · confirmed {formatShortDate(inputs.coachMethod.confirmedAtIso)}
        </p>
        <dl className="mt-1.5 space-y-0.5 text-xs">
          {inputs.coachMethod.summary.map((f) => (
            <div key={f.label} className="flex gap-2">
              <dt className="shrink-0 text-neutral">{f.label}:</dt>
              <dd className="text-off-white">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">
          Client intake · completed {formatShortDate(inputs.clientIntake.completedAtIso)}
          {inputs.clientIntake.healthReview === "resolved" ? " · health review resolved" : ""}
        </p>
        <dl className="mt-1.5 space-y-0.5 text-xs">
          {inputs.clientIntake.summary.map((f) => (
            <div key={f.label} className="flex gap-2">
              <dt className="shrink-0 text-neutral">{f.label}:</dt>
              <dd className="text-off-white">{f.value}</dd>
            </div>
          ))}
        </dl>
        {inputs.clientIntake.assumptions.length > 0 ? (
          <p className="mt-1.5 text-xs text-warning-strong">Assumed (not answered in intake): {inputs.clientIntake.assumptions.join(" ")}</p>
        ) : null}
      </div>
    </div>
    </details>
  );
}

export function ProgramProposalReview({ workspaceId, clientProfileId, clientId, proposal }: { workspaceId: string; clientProfileId: string; clientId: string; proposal: ProgramProposalReviewView }) {
  // Server actions below close over just this id, not the whole proposal.
  const versionId = proposal.versionId;
  async function revalidate() {
    "use server";
    revalidatePath(`/coach/clients/${clientId}`);
  }

  async function approveAction(): Promise<SaveResult> {
    "use server";
    try {
      await approveProgramProposalAction({ workspaceId, clientProfileId, versionId });
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Could not approve this proposal." };
    }
    await revalidate();
    return { ok: true, message: "Approved and assigned." };
  }

  // Gate 4.0C-4 — explicit, persisted resolution of a blocking Reasoner review decision.
  async function resolveDecisionAction(formData: FormData): Promise<void> {
    "use server";
    const decisionKey = String(formData.get("decisionKey") ?? "");
    const resolution = formData.get("resolution") === "remove" ? "remove" : "accept";
    await resolveReasonerFitDecisionAction({ workspaceId, clientProfileId, versionId, decisionKey, resolution });
    await revalidate();
  }

  // Gate 4.0C-4 — post-edit program-integrity resolution (replacement or conscious tradeoff).
  async function resolveIntegrityAction(formData: FormData): Promise<void> {
    "use server";
    const decisionKey = String(formData.get("decisionKey") ?? "");
    const resolution = formData.get("resolution") === "replace" ? "replace" : "accept_tradeoff";
    await resolveProgramIntegrityAction({ workspaceId, clientProfileId, versionId, decisionKey, resolution, exerciseId: String(formData.get("exerciseId") ?? "") || undefined, fromRecommendation: formData.get("fromRecommendation") === "1" });
    await revalidate();
  }
  // Gate 4.0C-5 — lifecycle actions (all explicit coach actions; none approves or publishes).
  async function revisionAction(): Promise<void> {
    "use server";
    await requestRevisionAction({ workspaceId, clientProfileId });
    await revalidate();
  }
  async function adequacyAction(formData: FormData): Promise<void> {
    "use server";
    await acceptPlanAdequacyAction({ workspaceId, clientProfileId, versionId, decisionKey: String(formData.get("decisionKey") ?? "") });
    await revalidate();
  }
  async function confirmDecisionAction(formData: FormData): Promise<void> {
    "use server";
    await confirmDraftFitDecisionAction({ workspaceId, clientProfileId, versionId, decisionKey: String(formData.get("decisionKey") ?? "") });
    await revalidate();
  }
  async function withheldAction(formData: FormData): Promise<void> {
    "use server";
    const res = await recordExerciseFitDecisionsAction({ workspaceId, clientProfileId, context: "withheld", decisions: [{ exerciseId: String(formData.get("exerciseId") ?? ""), verdict: formData.get("verdict") === "excluded" ? "excluded" : "cleared" }] });
    if (!res.ok) throw new Error(res.errors.join(" "));
    await revalidate();
  }
  async function requestRepairAction(formData: FormData): Promise<void> {
    "use server";
    await requestRepairRecommendationAction({ workspaceId, clientProfileId, versionId, decisionKey: String(formData.get("decisionKey") ?? "") });
    await revalidate();
  }

  // No prerequisites here: rejecting only clears the proposal away. On
  // success, redirect so the refreshed page shows the notice and whatever
  // setup is still missing (the proposal card itself is gone by then).
  async function rejectAction(_prev: SaveResult, formData: FormData): Promise<SaveResult> {
    "use server";
    const reason = parseRejectionReason(formData.get("reason"));
    try {
      await rejectProgramProposalAction({ workspaceId, clientProfileId, versionId, reason });
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Could not reject this proposal." };
    }
    await revalidate();
    redirect(`/coach/clients/${clientId}?notice=proposal-rejected`);
  }

  function editActionFor(path: TrainingItemPath, category: "resistance" | "continuous" | "interval" | "power" | "mobility") {
    async function edit(formData: FormData) {
      "use server";
      const patch: TrainingItemPatch =
        category === "continuous"
          ? {
              name: stringOrUndefined(formData, "name"),
              durationSeconds: numberOrUndefined(formData, "durationSeconds"),
              distanceValue: numberOrUndefined(formData, "distanceValue"),
              distanceUnit: stringOrUndefined(formData, "distanceUnit") as TrainingItemPatch["distanceUnit"],
              heartRateLow: numberOrUndefined(formData, "heartRateLow"),
              heartRateHigh: numberOrUndefined(formData, "heartRateHigh"),
              rpe: numberOrUndefined(formData, "rpe"),
              paceValue: numberOrUndefined(formData, "paceValue"),
              paceUnit: stringOrUndefined(formData, "paceUnit") as TrainingItemPatch["paceUnit"],
            }
          : category === "power"
            ? {
                name: stringOrUndefined(formData, "name"),
                sets: numberOrUndefined(formData, "sets"),
                repsLow: numberOrUndefined(formData, "repsLow"),
                repsHigh: numberOrUndefined(formData, "repsHigh"),
                contactsValue: numberOrUndefined(formData, "contactsValue"),
                distanceValue: numberOrUndefined(formData, "distanceValue"),
                distanceUnit: stringOrUndefined(formData, "distanceUnit") as TrainingItemPatch["distanceUnit"],
                restSeconds: numberOrUndefined(formData, "restSeconds"),
              }
            : category === "mobility"
              ? {
                  name: stringOrUndefined(formData, "name"),
                  sets: numberOrUndefined(formData, "sets"),
                  durationSeconds: numberOrUndefined(formData, "durationSeconds"),
                  repsLow: numberOrUndefined(formData, "repsLow"),
                  repsHigh: numberOrUndefined(formData, "repsHigh"),
                  side: stringOrUndefined(formData, "side") as TrainingItemPatch["side"],
                  restSeconds: numberOrUndefined(formData, "restSeconds"),
                }
              : category === "interval"
                ? {
                name: stringOrUndefined(formData, "name"),
                rounds: numberOrUndefined(formData, "rounds"),
                workIntervalSeconds: numberOrUndefined(formData, "workIntervalSeconds"),
                recoveryIntervalSeconds: numberOrUndefined(formData, "recoveryIntervalSeconds"),
                distanceValue: numberOrUndefined(formData, "distanceValue"),
                distanceUnit: stringOrUndefined(formData, "distanceUnit") as TrainingItemPatch["distanceUnit"],
                recoveryDistanceValue: numberOrUndefined(formData, "recoveryDistanceValue"),
                recoveryDistanceUnit: stringOrUndefined(formData, "recoveryDistanceUnit") as TrainingItemPatch["recoveryDistanceUnit"],
                rpe: numberOrUndefined(formData, "rpe"),
                paceValue: numberOrUndefined(formData, "paceValue"),
                paceUnit: stringOrUndefined(formData, "paceUnit") as TrainingItemPatch["paceUnit"],
                heartRateLow: numberOrUndefined(formData, "heartRateLow"),
                heartRateHigh: numberOrUndefined(formData, "heartRateHigh"),
              }
            : {
                name: stringOrUndefined(formData, "name"),
                sets: numberOrUndefined(formData, "sets"),
                repsLow: numberOrUndefined(formData, "repsLow"),
                repsHigh: numberOrUndefined(formData, "repsHigh"),
                rpe: numberOrUndefined(formData, "rpe"),
                rir: numberOrUndefined(formData, "rir"),
                loadValue: numberOrUndefined(formData, "loadValue"),
                loadUnit: stringOrUndefined(formData, "loadUnit") as TrainingItemPatch["loadUnit"],
                restSeconds: numberOrUndefined(formData, "restSeconds"),
                tempo: stringOrUndefined(formData, "tempo"),
                warmupInstruction: stringOrUndefined(formData, "warmupInstruction"),
                warmupSets: numberOrUndefined(formData, "warmupSets"),
              };
      await editProgramProposalItemAction({ workspaceId, clientProfileId, versionId, path, patch });
      await revalidate();
    }
    return edit;
  }

  function removeActionFor(path: TrainingItemPath) {
    async function remove() {
      "use server";
      await removeProgramProposalItemAction({ workspaceId, clientProfileId, versionId, path });
      await revalidate();
    }
    return remove;
  }

  function moveBlockActionFor(path: BlockPath, direction: "up" | "down") {
    async function move() {
      "use server";
      await moveProgramProposalBlockAction({ workspaceId, clientProfileId, versionId, path, direction });
      await revalidate();
    }
    return move;
  }

  function editBlockActionFor(path: BlockPath) {
    async function edit(formData: FormData) {
      "use server";
      const patch: BlockPatch = {
        name: stringOrUndefined(formData, "blockName"),
        rounds: numberOrUndefined(formData, "blockRounds"),
        restBetweenItemsSeconds: numberOrUndefined(formData, "restBetweenItemsSeconds"),
        restBetweenRoundsSeconds: numberOrUndefined(formData, "restBetweenRoundsSeconds"),
        timeCapSeconds: numberOrUndefined(formData, "timeCapSeconds"),
        terminationMode: stringOrUndefined(formData, "terminationMode") as BlockPatch["terminationMode"],
        cadenceSeconds: numberOrUndefined(formData, "cadenceSeconds"),
      };
      await editProgramProposalBlockAction({ workspaceId, clientProfileId, versionId, path, patch });
      await revalidate();
    }
    return edit;
  }

  function renameActionFor(path: SessionPath) {
    async function rename(formData: FormData) {
      "use server";
      const name = stringOrUndefined(formData, "name");
      if (!name) return;
      await renameProgramProposalSessionAction({ workspaceId, clientProfileId, versionId, path, name });
      await revalidate();
    }
    return rename;
  }

  function convertToRestActionFor(weekNumber: number, dayOfWeek: TrainingItemPath["dayOfWeek"]) {
    async function convert() {
      "use server";
      await convertProgramProposalDayToRestAction({ workspaceId, clientProfileId, versionId, weekNumber, dayOfWeek });
      await revalidate();
    }
    return convert;
  }

  function addItemActionFor(sessionPath: SessionPath) {
    async function add(formData: FormData) {
      "use server";
      const name = stringOrUndefined(formData, "newItemName");
      const category = stringOrUndefined(formData, "newItemCategory") as "resistance" | "continuous" | undefined;
      if (!name || !category) return;
      await addProgramProposalItemAction({ workspaceId, clientProfileId, versionId, sessionPath, name, category });
      await revalidate();
    }
    return add;
  }

  function renderTrainingDay(week: UniversalProgramWeek, day: UniversalProgramDay) {
    return (
                  <div key={day.dayOfWeek} className="rounded border border-border-strong p-2.5">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-off-white">{day.dayOfWeek}</p>
                      <form action={convertToRestActionFor(week.weekNumber, day.dayOfWeek)}>
                        <Button type="submit" variant="ghost" size="sm">
                          Convert to rest day
                        </Button>
                      </form>
                    </div>
                    <div className="space-y-2">
                      {(day.sessions ?? []).map((session, sessionIndex) => {
                        const sessionPath: SessionPath = { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex };
                        return (
                          <div key={`${day.dayOfWeek}-${sessionIndex}`} className="rounded bg-surface-raised p-2">
                            <form action={renameActionFor(sessionPath)} className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:max-w-md">
                              <label className="flex flex-col gap-1 text-xs text-neutral">
                                Session name
                                <input type="text" name="name" defaultValue={session.name} className="w-full min-w-0 rounded border border-border-strong bg-transparent px-2 py-1.5 text-off-white" />
                              </label>
                              <Button type="submit" variant="secondary" size="sm">
                                Rename
                              </Button>
                            </form>
                            <div className="space-y-2">
                              {[...session.blocks]
                                .sort((a, b) => a.order - b.order)
                                .map((block, blockIndex, sortedBlocks) => {
                                const blockPathForBlock: BlockPath = { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex, blockId: block.id };
                                const circuit = isCircuitBlock(block);
                                const emom = isEmomBlock(block);
                                const distinctItems = emom ? [...new Map(block.items.map((i) => [i.id, i])).values()] : block.items;
                                const itemRows = distinctItems.map((item) => {
                                    const path: TrainingItemPath = { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex, blockId: block.id, itemId: item.id };
                                    const blockPath: BlockPath = { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex, blockId: block.id };
                                    const editCategory: "resistance" | "continuous" | "interval" | "power" | "mobility" =
                                      item.category === "interval"
                                        ? "interval"
                                        : item.category === "continuous"
                                          ? "continuous"
                                          : item.category === "power"
                                            ? "power"
                                            : item.category === "mobility"
                                              ? "mobility"
                                              : "resistance";
                                    return (
                                      <details key={item.id} className="rounded border border-border px-2.5 py-2">
                                        <summary className="cursor-pointer text-sm text-off-white">
                                          {item.name} — {describeItem(item)}
                                        </summary>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                          {/* Phase 11B — a circuit's own Move up/down already lives once at
                                              the block level above (moving the whole group as a unit) —
                                              showing it again per item here would be redundant and
                                              misleading (it never moves just this one item). Phase 11D —
                                              same reasoning for EMOM. */}
                                          {!circuit && !emom && blockIndex > 0 ? (
                                            <form action={moveBlockActionFor(blockPath, "up")}>
                                              <Button type="submit" variant="ghost" size="sm">
                                                Move up
                                              </Button>
                                            </form>
                                          ) : null}
                                          {!circuit && !emom && blockIndex < sortedBlocks.length - 1 ? (
                                            <form action={moveBlockActionFor(blockPath, "down")}>
                                              <Button type="submit" variant="ghost" size="sm">
                                                Move down
                                              </Button>
                                            </form>
                                          ) : null}
                                          <form action={removeActionFor(path)}>
                                            <Button type="submit" variant="ghost" size="sm">
                                              Remove
                                            </Button>
                                          </form>
                                        </div>
                                        <form action={editActionFor(path, editCategory)} className="mt-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral">
                                            Name
                                            <input type="text" name="name" defaultValue={item.name} className="w-full min-w-0 rounded border border-border-strong bg-transparent px-2 py-1.5 text-off-white" />
                                          </label>
                                          {editCategory === "interval" ? (
                                            <>
                                              <NumField label="Rounds" name="rounds" defaultValue={item.prescription.rounds} />
                                              <NumField label="Work (sec)" name="workIntervalSeconds" defaultValue={item.prescription.workInterval?.seconds} />
                                              <NumField label="Recovery (sec)" name="recoveryIntervalSeconds" defaultValue={item.prescription.recoveryInterval?.seconds} />
                                              <NumField label="Work distance" name="distanceValue" defaultValue={item.prescription.distance?.value} />
                                              <label className="flex flex-col gap-1 text-xs text-neutral">
                                                Unit
                                                <select name="distanceUnit" defaultValue={item.prescription.distance?.unit ?? "m"} className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-off-white">
                                                  <option value="m">m</option>
                                                  <option value="km">km</option>
                                                  <option value="mi">mi</option>
                                                </select>
                                              </label>
                                              <NumField label="Recovery distance" name="recoveryDistanceValue" defaultValue={item.prescription.recoveryDistance?.value} />
                                              <label className="flex flex-col gap-1 text-xs text-neutral">
                                                Unit
                                                <select name="recoveryDistanceUnit" defaultValue={item.prescription.recoveryDistance?.unit ?? "m"} className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-off-white">
                                                  <option value="m">m</option>
                                                  <option value="km">km</option>
                                                  <option value="mi">mi</option>
                                                </select>
                                              </label>
                                              <NumField label="RPE" name="rpe" defaultValue={item.prescription.rpe} />
                                              <NumField label="Pace" name="paceValue" defaultValue={item.prescription.pace?.value} />
                                              <label className="flex flex-col gap-1 text-xs text-neutral">
                                                Pace unit
                                                <select name="paceUnit" defaultValue={item.prescription.pace?.unit ?? "min_per_mi"} className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-off-white">
                                                  <option value="min_per_mi">min/mi</option>
                                                  <option value="min_per_km">min/km</option>
                                                </select>
                                              </label>
                                              <NumField label="HR low" name="heartRateLow" defaultValue={item.prescription.heartRate?.low} />
                                              <NumField label="HR high" name="heartRateHigh" defaultValue={item.prescription.heartRate?.high} />
                                            </>
                                          ) : editCategory === "power" ? (
                                            <>
                                              <NumField label="Sets" name="sets" defaultValue={item.prescription.sets} />
                                              <NumField label="Reps low" name="repsLow" defaultValue={item.prescription.reps?.low} />
                                              <NumField label="Reps high" name="repsHigh" defaultValue={item.prescription.reps?.high} />
                                              <NumField label="Contacts" name="contactsValue" defaultValue={item.prescription.contacts} />
                                              <NumField label="Distance" name="distanceValue" defaultValue={item.prescription.distance?.value} />
                                              <label className="flex flex-col gap-1 text-xs text-neutral">
                                                Unit
                                                <select name="distanceUnit" defaultValue={item.prescription.distance?.unit ?? "m"} className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-off-white">
                                                  <option value="m">m</option>
                                                  <option value="km">km</option>
                                                  <option value="mi">mi</option>
                                                </select>
                                              </label>
                                              <NumField label="Rest (sec)" name="restSeconds" defaultValue={item.prescription.restSeconds} />
                                            </>
                                          ) : editCategory === "mobility" ? (
                                            <>
                                              <NumField label="Sets" name="sets" defaultValue={item.prescription.sets} />
                                              <NumField label="Hold (sec)" name="durationSeconds" defaultValue={item.prescription.duration?.seconds} />
                                              <NumField label="Reps low" name="repsLow" defaultValue={item.prescription.reps?.low} />
                                              <NumField label="Reps high" name="repsHigh" defaultValue={item.prescription.reps?.high} />
                                              <label className="flex flex-col gap-1 text-xs text-neutral">
                                                Side
                                                <select name="side" defaultValue={item.prescription.side ?? ""} className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-off-white">
                                                  <option value="">—</option>
                                                  <option value="left">Left</option>
                                                  <option value="right">Right</option>
                                                  <option value="alternating">Alternating</option>
                                                  <option value="bilateral">Bilateral</option>
                                                </select>
                                              </label>
                                              <NumField label="Rest (sec)" name="restSeconds" defaultValue={item.prescription.restSeconds} />
                                            </>
                                          ) : editCategory === "continuous" ? (
                                            <>
                                              <NumField label="Duration (sec)" name="durationSeconds" defaultValue={item.prescription.duration?.seconds} />
                                              <NumField label="Distance" name="distanceValue" defaultValue={item.prescription.distance?.value} />
                                              <label className="flex flex-col gap-1 text-xs text-neutral">
                                                Unit
                                                <select name="distanceUnit" defaultValue={item.prescription.distance?.unit ?? "mi"} className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-off-white">
                                                  <option value="mi">mi</option>
                                                  <option value="km">km</option>
                                                  <option value="m">m</option>
                                                </select>
                                              </label>
                                              <NumField label="HR low" name="heartRateLow" defaultValue={item.prescription.heartRate?.low} />
                                              <NumField label="HR high" name="heartRateHigh" defaultValue={item.prescription.heartRate?.high} />
                                              <NumField label="RPE" name="rpe" defaultValue={item.prescription.rpe} />
                                              <NumField label="Pace" name="paceValue" defaultValue={item.prescription.pace?.value} />
                                              <label className="flex flex-col gap-1 text-xs text-neutral">
                                                Pace unit
                                                <select name="paceUnit" defaultValue={item.prescription.pace?.unit ?? "min_per_mi"} className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-off-white">
                                                  <option value="min_per_mi">min/mi</option>
                                                  <option value="min_per_km">min/km</option>
                                                </select>
                                              </label>
                                            </>
                                          ) : (
                                            <>
                                              <NumField label="Sets" name="sets" defaultValue={item.prescription.sets} />
                                              <NumField label="Reps low" name="repsLow" defaultValue={item.prescription.reps?.low} />
                                              <NumField label="Reps high" name="repsHigh" defaultValue={item.prescription.reps?.high} />
                                              <NumField label="RPE" name="rpe" defaultValue={item.prescription.rpe} />
                                              <NumField label="RIR" name="rir" defaultValue={item.prescription.rir} />
                                              <NumField label="Load" name="loadValue" defaultValue={item.prescription.load?.value} />
                                              <label className="flex flex-col gap-1 text-xs text-neutral">
                                                Unit
                                                <select name="loadUnit" defaultValue={item.prescription.load?.unit ?? "lb"} className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-off-white">
                                                  <option value="lb">lb</option>
                                                  <option value="kg">kg</option>
                                                </select>
                                              </label>
                                              <NumField label="Rest (sec)" name="restSeconds" defaultValue={item.prescription.restSeconds} />
                                              <label className="flex flex-col gap-1 text-xs text-neutral">
                                                Tempo
                                                <input type="text" name="tempo" defaultValue={item.prescription.tempo ?? ""} className="w-full min-w-0 rounded border border-border-strong bg-transparent px-2 py-1.5 text-off-white" />
                                              </label>
                                              <NumField label="Warmup sets" name="warmupSets" defaultValue={item.prescription.warmupSets} />
                                              <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral">
                                                Warmup instruction
                                                <input type="text" name="warmupInstruction" defaultValue={item.prescription.warmupInstruction ?? ""} className="w-full min-w-0 rounded border border-border-strong bg-transparent px-2 py-1.5 text-off-white" />
                                              </label>
                                            </>
                                          )}
                                          <Button type="submit" variant="secondary" size="sm">
                                            Save change
                                          </Button>
                                        </form>
                                      </details>
                                    );
                                  });

                                if (!circuit && !emom) {
                                  return (
                                    <div key={block.id} className="space-y-2">
                                      {itemRows}
                                    </div>
                                  );
                                }

                                if (emom) {
                                  const emomLines = describeEmomOverview(block);
                                  return (
                                    <div key={block.id} className="space-y-2 rounded border border-accent/30 bg-accent/[0.03] p-2.5">
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                          <p className="text-sm font-medium text-off-white">{block.name ?? "EMOM"}</p>
                                          {emomLines.map((line) => (
                                            <p key={line} className="text-xs text-neutral">
                                              {line}
                                            </p>
                                          ))}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          {blockIndex > 0 ? (
                                            <form action={moveBlockActionFor(blockPathForBlock, "up")}>
                                              <Button type="submit" variant="ghost" size="sm">
                                                Move up
                                              </Button>
                                            </form>
                                          ) : null}
                                          {blockIndex < sortedBlocks.length - 1 ? (
                                            <form action={moveBlockActionFor(blockPathForBlock, "down")}>
                                              <Button type="submit" variant="ghost" size="sm">
                                                Move down
                                              </Button>
                                            </form>
                                          ) : null}
                                        </div>
                                      </div>
                                      <form action={editBlockActionFor(blockPathForBlock)} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                        <label className="flex flex-col gap-1 text-xs text-neutral">
                                          Protocol name
                                          <input type="text" name="blockName" defaultValue={block.name ?? ""} className="w-full min-w-0 rounded border border-border-strong bg-transparent px-2 py-1.5 text-off-white" />
                                        </label>
                                        <NumField label="Cadence (sec)" name="cadenceSeconds" defaultValue={block.cadenceSeconds} />
                                        <NumField label="Total windows" name="blockRounds" defaultValue={block.rounds} />
                                        <Button type="submit" variant="secondary" size="sm">
                                          Save EMOM change
                                        </Button>
                                      </form>
                                      {itemRows}
                                    </div>
                                  );
                                }

                                const circuitLines = describeCircuitOverview(block);
                                return (
                                  <div key={block.id} className="space-y-2 rounded border border-accent/30 bg-accent/[0.03] p-2.5">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-medium text-off-white">{block.name ?? (isUnboundedRounds(block) ? "AMRAP" : "Circuit")}</p>
                                        {circuitLines.map((line) => (
                                          <p key={line} className="text-xs text-neutral">
                                            {line}
                                          </p>
                                        ))}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        {blockIndex > 0 ? (
                                          <form action={moveBlockActionFor(blockPathForBlock, "up")}>
                                            <Button type="submit" variant="ghost" size="sm">
                                              Move up
                                            </Button>
                                          </form>
                                        ) : null}
                                        {blockIndex < sortedBlocks.length - 1 ? (
                                          <form action={moveBlockActionFor(blockPathForBlock, "down")}>
                                            <Button type="submit" variant="ghost" size="sm">
                                              Move down
                                            </Button>
                                          </form>
                                        ) : null}
                                      </div>
                                    </div>
                                    <form action={editBlockActionFor(blockPathForBlock)} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                      <label className="flex flex-col gap-1 text-xs text-neutral">
                                        Circuit name
                                        <input type="text" name="blockName" defaultValue={block.name ?? ""} className="w-full min-w-0 rounded border border-border-strong bg-transparent px-2 py-1.5 text-off-white" />
                                      </label>
                                      <label className="flex flex-col gap-1 text-xs text-neutral">
                                        Termination
                                        <select name="terminationMode" defaultValue={block.terminationMode ?? "fixed_rounds"} className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-off-white">
                                          <option value="fixed_rounds">Fixed rounds</option>
                                          <option value="time_cap">AMRAP (time cap only)</option>
                                          <option value="rounds_or_time_cap">Rounds or time cap</option>
                                        </select>
                                      </label>
                                      <NumField label="Rounds" name="blockRounds" defaultValue={block.rounds} />
                                      <NumField label="Rest between items (sec)" name="restBetweenItemsSeconds" defaultValue={block.restBetweenItemsSeconds} />
                                      <NumField label="Rest between rounds (sec)" name="restBetweenRoundsSeconds" defaultValue={block.restBetweenRoundsSeconds} />
                                      <NumField label="Time cap (sec)" name="timeCapSeconds" defaultValue={block.timeCapSeconds} />
                                      <Button type="submit" variant="secondary" size="sm">
                                        Save circuit change
                                      </Button>
                                    </form>
                                    {itemRows}
                                  </div>
                                );
                              })}
                              <form action={addItemActionFor(sessionPath)} className="grid grid-cols-2 items-end gap-2 pt-1 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                                <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral sm:col-span-1">
                                  Add exercise — name
                                  <input type="text" name="newItemName" className="w-full min-w-0 rounded border border-border-strong bg-transparent px-2 py-1.5 text-off-white" />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-neutral">
                                  Type
                                  <select name="newItemCategory" defaultValue="resistance" className="w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-off-white">
                                    <option value="resistance">Resistance</option>
                                    <option value="continuous">Continuous</option>
                                  </select>
                                </label>
                                <Button type="submit" variant="ghost" size="sm">
                                  Add exercise
                                </Button>
                              </form>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
    );
  }

  const adjustment = proposal.content.adjustmentProvenance;
  const inputs = proposal.content.generationInputs;
  const weeks = proposal.content.durationWeeks;
  const title = adjustment ? "Adjustment proposal" : `Training proposal · ${weeks} week${weeks === 1 ? "" : "s"}${proposal.wasEdited ? " · edited" : ""}`;

  // A legacy proposal made before inputs were verified: say only that, and
  // offer the one sensible action. Its stored explanation ("Best fit…",
  // "your preferred…") is not shown anywhere — it was built from defaults
  // and placeholders, so it isn't evidence of anything.
  // Gate 3 — prepared under a different (or no) confirmed method version:
  // approving it would apply an old method as though it were current.
  if (proposal.inputsVerified && proposal.methodStaleMessage) {
    return (
      <Card id="proposal-review" className="border-l-2 border-l-warning">
        <p className="text-sm font-medium text-off-white">{title}</p>
        <p className="mt-0.5 text-xs text-neutral">{describeSchedule(proposal.content)}</p>
        <div className="mt-3 space-y-3 rounded border border-warning bg-warning-soft/40 px-3 py-3">
          <p className="text-sm font-medium text-warning-strong">{proposal.methodStaleMessage}</p>
          <ProposalRejectForm action={rejectAction} defaultReason="method_changed" />
        </div>
      </Card>
    );
  }

  if (!proposal.inputsVerified) {
    return (
      <Card id="proposal-review" className="border-l-2 border-l-warning">
        <p className="text-sm font-medium text-off-white">{title}</p>
        <p className="mt-0.5 text-xs text-neutral">{describeSchedule(proposal.content)}</p>
        <div className="mt-3 space-y-3 rounded border border-warning bg-warning-soft/40 px-3 py-3">
          <p className="text-sm font-medium text-warning-strong">Inputs unverified. Reject this proposal.</p>
          <ProposalRejectForm action={rejectAction} defaultReason="inputs_unverified" />
        </div>
      </Card>
    );
  }

  const whyThisPlan = inputs?.whyThisPlan ?? [];

  return (
    <Card id="proposal-review" className="border-l-2 border-l-accent">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-off-white">{title}</p>
          <p className="mt-0.5 text-xs text-neutral">{describeSchedule(proposal.content)}</p>
          {inputs?.rationale ? <p className="mt-2 text-sm text-off-white">{inputs.rationale}</p> : null}
        </div>
        <ProposalApproveForm action={approveAction} blockedReason={proposal.reasonerReview?.approvalBlockedReason ?? null} />
      </div>

      {adjustment ? <AdjustmentProposalBanner adjustment={adjustment} /> : null}
      {proposal.reasonerReview ? <ReasonerContextSection review={proposal.reasonerReview} resolveAction={resolveDecisionAction} repairEnabled={proposal.repairReasoningEnabled} integrityAction={resolveIntegrityAction} repairAction={requestRepairAction} revisionJob={proposal.revisionJob} revisionAction={revisionAction} adequacyAction={adequacyAction} confirmDecisionAction={confirmDecisionAction} withheldAction={withheldAction} workspaceId={workspaceId} clientProfileId={clientProfileId} /> : null}
      {whyThisPlan.length > 0 ? (
        <details className="mb-2 rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-off-white">Why this plan</summary>
          <ul className="mt-1.5 space-y-0.5 text-xs text-neutral">
            {whyThisPlan.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {inputs ? <InputsUsedSection inputs={inputs} /> : null}

      <RuleProvenanceSection proposal={proposal} />

      {proposal.changesSummary.length > 0 ? (
        <div className="mb-3 rounded border border-border-strong bg-surface-raised px-3 py-2">
          <p className="text-xs font-medium text-off-white">
            {proposal.changesSummary.length} change{proposal.changesSummary.length === 1 ? "" : "s"} from OPTIM&apos;s original proposal:
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-neutral">
            {proposal.changesSummary.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {proposal.restrictionWarnings.length > 0 ? (
        <div className="mb-3 rounded border border-warning bg-warning-soft/40 px-3 py-2">
          <p className="text-xs font-medium text-warning-strong">This proposal may conflict with a documented client restriction:</p>
          <ul className="mt-1 space-y-0.5 text-xs text-warning-strong">
            {proposal.restrictionWarnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ProposalScheduleNavigator
        weeks={proposal.content.weeks.map((week) => {
          const trainingDays = week.days.filter((d) => d.type === "training");
          const restDays = week.days.filter((d) => d.type === "rest");
          return {
            weekNumber: week.weekNumber,
            restDaysLabel: restDays.length > 0 ? restDays.map((d) => d.dayOfWeek.slice(0, 3)).join(", ") : null,
            days: trainingDays.map((day) => ({
              key: day.dayOfWeek,
              label: day.dayOfWeek,
              sublabel: (day.sessions ?? []).map((session) => session.name).filter(Boolean).join(" + ") || "Training",
              panel: renderTrainingDay(week, day),
            })),
          };
        })}
      />

      <div className="mt-3 border-t border-border pt-3">
        <ProposalRejectForm action={rejectAction} />
      </div>
    </Card>
  );
}

const ADJUSTMENT_SCOPE_LABELS: Record<string, string> = {
  temporary: "Temporary — next session only",
  current_block: "Current training block",
  program_level: "Remainder of the program",
};

/** Phase 10B — the coach-facing "why/what/scope" summary for an
 * adjustment proposal (spec section 22/58). Reuses the proposal's own
 * real, already-conservative rationale text verbatim (never rewritten
 * into a stronger claim) and lists exactly the real changes that were
 * made — never a generic "OPTIM adjusted your program." The coach still
 * approves/edits/rejects through the exact same controls as any other
 * proposal below — this is explanation, not a second decision surface. */
function AdjustmentProposalBanner({ adjustment }: { adjustment: AdjustmentProvenance }) {
  return (
    <div className="mb-3 space-y-2 rounded border border-border-strong bg-surface-raised px-3 py-2.5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Why</p>
        <p className="mt-1 text-xs text-off-white">{adjustment.rationale}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Proposed</p>
        <ul className="mt-1 space-y-0.5 text-xs text-off-white">
          {adjustment.changeDescriptions.map((c, i) => (
            <li key={i}>
              • Week {c.weekNumber} / {c.dayOfWeek}: {c.description}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Scope</p>
        <p className="mt-1 text-xs text-off-white">{ADJUSTMENT_SCOPE_LABELS[adjustment.scope] ?? adjustment.scope}</p>
      </div>
    </div>
  );
}

/** Phase 10A — subtle, bounded rule provenance (spec section 17/19/20).
 * Renders nothing at all when the proposal carries no provenance — never
 * a placeholder claiming OPTIM "used your preferences" when it didn't.
 * Deliberately distinguishes a confirmed LEARNED preference (this
 * section) from the coach's EXPLICIT methodology setup (never relabeled
 * as "learned" — spec section 19): every base value a rule nudges was
 * already methodology-derived before the rule ever touched it, so this
 * only ever describes the nudge, never claims credit for the whole
 * decision. Client-specific rules are labeled as such, never presented as
 * general methodology (spec section 21). The methodology-conflict note is
 * a separate, even quieter <details> — only rendered when a confirmed
 * preference existed but explicit setup took priority (spec section 20:
 * "default toward silence"). */
function RuleProvenanceSection({ proposal }: { proposal: ProgramProposalReviewView }) {
  if (proposal.appliedRuleProvenance.length === 0 && proposal.methodologyConflictedRuleProvenance.length === 0) return null;
  return (
    <>
      {proposal.appliedRuleProvenance.length > 0 ? (
        <details className="mb-3 rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-off-white">
            Based on {proposal.appliedRuleProvenance.length} confirmed coaching preference{proposal.appliedRuleProvenance.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-2">
            {proposal.appliedRuleProvenance.map((rule) => (
              <li key={rule.id} className="text-xs">
                <p className="text-off-white">{rule.summary}</p>
                <p className="mt-0.5 text-neutral">
                  {rule.scope === "client_specific" ? "A coaching preference confirmed for this client specifically" : "A general confirmed coaching preference"}
                  {rule.status !== "active" ? " — since turned off (this proposal still reflects it accurately, as generated)" : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {proposal.methodologyConflictedRuleProvenance.length > 0 ? (
        <details className="mb-3 rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs text-neutral">A confirmed preference wasn&apos;t applied here</summary>
          <ul className="mt-2 space-y-1 text-xs text-neutral">
            {proposal.methodologyConflictedRuleProvenance.map((rule) => (
              <li key={rule.id}>{rule.summary} — not applied, because it falls outside your explicit coaching setup for this client.</li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function NumField({ label, name, defaultValue }: { label: string; name: string; defaultValue?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral">
      {label}
      <input type="number" name={name} defaultValue={defaultValue ?? ""} step="any" inputMode="decimal" className="w-full min-w-0 rounded border border-border-strong bg-transparent px-2 py-1.5 text-off-white" />
    </label>
  );
}

function describeItem(item: TrainingItemInstance): string {
  // Phase 11A — reuses the exact same formatter the live client execution
  // panels render from (lib/workout/interval.ts), never a second
  // independently-drifting description — "8 rounds, 400 m work / 200 m
  // recovery, Target pace 1:42/km", never raw JSON (spec section 21).
  if (item.category === "interval") return describeIntervalOverview(item.prescription).join(", ") || "interval work";
  // Phase 11C — same "reuse the client-facing formatter" discipline, for
  // power/mobility (spec section 24's own worked examples: "Box Jump, 4
  // sets x 3 reps, 2:00 rest, Maximum intent" / "Couch Stretch, 2 sets x
  // 45 sec / side").
  if (item.category === "power") return describePowerOverview(item.prescription).join(", ") || "power work";
  if (item.category === "mobility") return describeMobilityOverview(item.prescription).join(", ") || "mobility work";
  if (item.category === "continuous") {
    const d = item.prescription.duration ? `${Math.round(item.prescription.duration.seconds / 60)} min` : null;
    const dist = item.prescription.distance ? `${item.prescription.distance.value} ${item.prescription.distance.unit}` : null;
    const hr = item.prescription.heartRate ? `HR ${item.prescription.heartRate.low}-${item.prescription.heartRate.high}` : null;
    const pace = item.prescription.pace ? `${item.prescription.pace.value} ${item.prescription.pace.unit === "min_per_km" ? "min/km" : "min/mi"}` : null;
    const parts = [d, dist, hr, pace].filter(Boolean);
    // Phase 11D — same "surface real coach-authored data over a generic
    // fallback" fix as lib/workout/circuit.ts's own describeCircuitItemTarget
    // (a calorie-based cardio target, e.g. "12 cal Bike", has no structured
    // duration/distance primitive to represent it honestly).
    if (parts.length === 0 && item.prescription.completionTarget) parts.push(item.prescription.completionTarget);
    return parts.join(", ") || "continuous work";
  }
  const sets = item.prescription.sets;
  const reps = item.prescription.reps ? `${item.prescription.reps.low}-${item.prescription.reps.high} reps` : null;
  const rpe = item.prescription.rpe ? `RPE ${item.prescription.rpe}` : null;
  return [sets ? `${sets} sets` : null, reps, rpe].filter(Boolean).join(", ") || "resistance work";
}

export type { ProgramProposalReviewView };
