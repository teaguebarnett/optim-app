"use client";

// "Approve & activate" for a pending proposal, with inline pending / error
// feedback. The server re-checks everything (verified generation inputs,
// current prerequisites, adjustment staleness) and a refusal is shown here
// rather than as a redacted crash page. When the proposal is unverified the
// button is replaced by the reason, so it can't be approved from the UI.

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { SaveResult } from "@/components/coach/live-start-date-form";

export function ProposalApproveForm({ action, blockedReason }: { action: (prev: SaveResult, formData: FormData) => Promise<SaveResult>; blockedReason: string | null }) {
  const [result, formAction, pending] = useActionState(action, null);
  if (blockedReason) return <p className="max-w-xs text-xs text-warning-strong">{blockedReason}</p>;
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="primary" size="sm" loading={pending}>
        Approve &amp; activate
      </Button>
      {result && !result.ok ? (
        <p role="status" className="max-w-xs text-right text-xs text-error">
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
