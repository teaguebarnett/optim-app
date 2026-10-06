"use client";

// Gate 4.0C-4 — Client setup → Training program, for clients enabled for
// OPTIM's Fitness Reasoner (server-side allowlist; never a UI toggle).
// The request returns immediately; this panel shows the job's state and
// polls while it prepares. When the draft is ready the page refreshes into
// the existing proposal review. Nothing here can publish or approve.

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getReasonerJobAction, recordExerciseFitDecisionsAction, requestReasonerProposalAction } from "@/app/actions/production-programs";
import type { MissingPrerequisite } from "@/lib/coach/generation-prerequisites";
import type { ReasonerJobView } from "@/lib/synthesis/reasoner/proposal-job";

const POLL_MS = 5000;
const WHO: Record<string, string> = { client: "the client", coach: "you", either: "you or the client" };

/** `revision`: shown next to a pending draft — only the revision's preflight questions / progress, no new-proposal form. */
export function ReasonerProposalPanel({ workspaceId, clientProfileId, initialJob, missing, revision = false }: { workspaceId: string; clientProfileId: string; initialJob: ReasonerJobView | null; missing: MissingPrerequisite[]; revision?: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState<ReasonerJobView | null>(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<MissingPrerequisite[]>(missing);
  const [title, setTitle] = useState("Training program");
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const refreshed = useRef<string | null>(null);
  // Synchronous re-entry guard: rapid clicks in one tick must send ONE request (the server is single-flight too).
  const submitting = useRef(false);
  const [fit, setFit] = useState<Record<string, "cleared" | "excluded">>({});

  // Poll while preparing; refresh the page once into whatever the job produced.
  useEffect(() => {
    if (job?.status !== "preparing") return;
    const t = setInterval(async () => {
      setNow(Date.now());
      try {
        const next = await getReasonerJobAction({ workspaceId, clientProfileId });
        if (next) setJob(next);
        if (next && next.status !== "preparing" && refreshed.current !== next.jobId) {
          refreshed.current = next.jobId;
          router.refresh();
        }
      } catch {
        // A transient read failure just waits for the next poll.
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [job, workspaceId, clientProfileId, router]);

  function request() {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await requestReasonerProposalAction({ workspaceId, clientProfileId, title });
        if (res.ok) setJob(res.job);
        else {
          setError(res.message);
          if (res.missing) setBlockers(res.missing);
        }
      } catch {
        setError("Couldn't start preparing a proposal. Nothing was changed — try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  // Gate 4.0C-5 — preflight: the coach's fit decisions are the authorization for ONE proposal for the new state.
  function confirmFit() {
    const questions = job?.outcome.fitQuestions ?? [];
    if (submitting.current || questions.some((q) => !fit[q.exerciseId])) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await recordExerciseFitDecisionsAction({ workspaceId, clientProfileId, context: "preflight", decisions: questions.map((q) => ({ exerciseId: q.exerciseId, verdict: fit[q.exerciseId] })) });
        if (!res.ok) setError(res.errors.join(" "));
        else {
          const next = await getReasonerJobAction({ workspaceId, clientProfileId });
          if (next) setJob(next);
          if (res.generation !== "queued") router.refresh();
        }
      } catch {
        setError("Couldn't save your decisions. Nothing was changed — try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  if (job?.status === "preparing") {
    const seconds = Math.max(0, Math.round((now - Date.parse(job.createdAtIso)) / 1000));
    return (
      <div role="status" className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-3">
        <p className="text-sm font-medium text-off-white">OPTIM is preparing a proposal…</p>
        <p className="mt-1 text-sm text-neutral">This usually takes one to two minutes. You can leave this page — the draft will be waiting here for your review. Nothing is sent to the client.</p>
        <p className="mt-1 text-xs text-neutral">Started {seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`} ago.</p>
      </div>
    );
  }

  const blocked = blockers.length > 0;
  const fitQuestions = job?.status === "needs_input" ? (job.outcome.fitQuestions ?? []) : [];
  const fitForm =
    fitQuestions.length > 0 ? (
      <div className="rounded-[var(--radius-sm)] border border-warning bg-warning-soft/40 px-3 py-2.5">
        <p className="text-sm font-medium text-warning-strong">Before OPTIM plans, decide whether these exercises fit the client&apos;s restrictions.</p>
        <p className="mt-1 text-sm text-warning-strong">Each is the only way left to train something the plan needs, and OPTIM can&apos;t confirm it stays within the confirmed restrictions. No proposal was prepared, and no model call was spent.</p>
        <ul className="mt-2 space-y-2.5">
          {fitQuestions.map((q) => (
            <li key={q.exerciseId} className="text-sm text-off-white">
              <p>
                <span className="font-medium">{q.exerciseName}</span> — trains {q.serves.map((x) => x.replace(/_/g, " ")).join(", ")}; restriction: {q.restriction}.
              </p>
              <div className="mt-1 flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name={`fit-${q.exerciseId}`} checked={fit[q.exerciseId] === "cleared"} onChange={() => setFit((f) => ({ ...f, [q.exerciseId]: "cleared" }))} />
                  It fits with {q.conditions.join(" and ")}
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name={`fit-${q.exerciseId}`} checked={fit[q.exerciseId] === "excluded"} onChange={() => setFit((f) => ({ ...f, [q.exerciseId]: "excluded" }))} />
                  Exclude it for this client
                </label>
              </div>
            </li>
          ))}
        </ul>
        <Button type="button" variant="primary" size="sm" className="mt-3" loading={pending} disabled={pending || fitQuestions.some((q) => !fit[q.exerciseId])} onClick={confirmFit}>
          {revision ? "Confirm — OPTIM revises the proposal" : "Confirm — OPTIM prepares the proposal"}
        </Button>
        <p className="mt-1 text-xs text-warning-strong">Saved as your decisions for this client. Nothing is sent to the client.</p>
      </div>
    ) : null;
  if (revision) return <div className="space-y-3">{fitForm}{error ? <p role="status" className="text-sm text-error">{error}</p> : null}</div>;
  return (
    <div className="space-y-3">
      {fitForm}
      {job?.status === "needs_input" && !fitQuestions.length ? (
        <div className="rounded-[var(--radius-sm)] border border-warning bg-warning-soft/40 px-3 py-2.5">
          <p className="text-sm font-medium text-warning-strong">OPTIM needs more information before it can prepare a proposal.</p>
          <ul className="mt-1.5 space-y-1 text-sm text-warning-strong">
            {(job.outcome.missing ?? []).map((m) => (
              <li key={m.fact}>
                • {m.why} <span className="text-xs">(from {WHO[m.providedBy] ?? m.providedBy})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {job?.status === "unsupported" || job?.status === "failed" ? (
        <p role="status" className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-off-white">
          {job.outcome.message ?? "No proposal was prepared. Nothing was saved."}
        </p>
      ) : null}
      {blocked ? (
        <div className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2.5">
          <p className="text-sm font-medium text-off-white">Before OPTIM can build a program:</p>
          <ul className="mt-1.5 space-y-1.5">
            {blockers.map((m) => (
              <li key={m.id} className="text-sm text-neutral">
                {m.message}{" "}
                {m.href && m.linkLabel ? (
                  <Link href={m.href} className="font-medium text-accent-fg hover:underline">
                    {m.linkLabel}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-sm text-neutral">OPTIM designs this plan from your coaching method, the client&apos;s intake and their confirmed restrictions. You review and decide; nothing reaches the client until you approve it.</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-neutral">
          Program name
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="w-full rounded border border-border-strong bg-transparent px-2 py-1.5 text-sm text-off-white" />
        </label>
        <Button type="button" variant="primary" size="sm" loading={pending} disabled={blocked || pending} onClick={request}>
          {pending ? "Starting…" : job?.status === "failed" || job?.status === "needs_input" ? "Try again" : "Prepare proposal"}
        </Button>
      </div>
      {error ? (
        <p role="status" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
