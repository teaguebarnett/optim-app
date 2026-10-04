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
import { getReasonerJobAction, requestReasonerProposalAction } from "@/app/actions/production-programs";
import type { MissingPrerequisite } from "@/lib/coach/generation-prerequisites";
import type { ReasonerJobView } from "@/lib/synthesis/reasoner/proposal-job";

const POLL_MS = 5000;
const WHO: Record<string, string> = { client: "the client", coach: "you", either: "you or the client" };

export function ReasonerProposalPanel({ workspaceId, clientProfileId, initialJob, missing }: { workspaceId: string; clientProfileId: string; initialJob: ReasonerJobView | null; missing: MissingPrerequisite[] }) {
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
  return (
    <div className="space-y-3">
      {job?.status === "needs_input" ? (
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
