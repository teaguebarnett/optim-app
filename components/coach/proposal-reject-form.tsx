"use client";

// "Reject proposal" with an optional reason and inline pending / error
// feedback. On success the server action redirects back to the client page
// with a notice, so the refreshed page itself confirms the rejection (the
// proposal card this form lives in is gone by then). Rejecting never
// generates or activates anything, and doesn't depend on a confirmed
// method or completed intake.

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { SaveResult } from "@/components/coach/live-start-date-form";
import { REJECTION_REASONS } from "@/lib/coach/proposal-rejection";

export function ProposalRejectForm({ action, defaultReason = "" }: { action: (prev: SaveResult, formData: FormData) => Promise<SaveResult>; defaultReason?: string }) {
  const [result, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral">
          Reason (optional)
          <select name="reason" defaultValue={defaultReason} className="w-52 max-w-full rounded border border-border-strong bg-surface px-2 py-1.5 text-sm text-off-white">
            <option value="">No reason given</option>
            {REJECTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {pending ? "Rejecting…" : "Reject proposal"}
        </Button>
      </div>
      {result && !result.ok ? (
        <p role="status" className="text-sm text-error">
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
