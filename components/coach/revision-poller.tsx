"use client";

// Gate 4.0C-5 — while OPTIM prepares a revised proposal next to a superseded draft, refresh the page once the job
// finishes so the revision (or its outcome) replaces the old draft in review.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getReasonerJobAction } from "@/app/actions/production-programs";

const POLL_MS = 5000;

export function RevisionPoller({ workspaceId, clientProfileId, jobId }: { workspaceId: string; clientProfileId: string; jobId: string }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const job = await getReasonerJobAction({ workspaceId, clientProfileId });
        if (!done.current && (!job || job.jobId !== jobId || job.status !== "preparing")) {
          done.current = true;
          router.refresh();
        }
      } catch {
        // A transient read failure just waits for the next poll.
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [workspaceId, clientProfileId, jobId, router]);
  return null;
}
