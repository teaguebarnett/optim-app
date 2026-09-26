"use client";

// Phase 6.0D-B — Controlled Live-Client Pilot and Production Client Lifecycle.
//
// The Supabase-mode sibling of components/coach/add-client-sheet.tsx — the
// smallest secure single-client invite workflow: a real client_profiles +
// coach_client_assignments + client_enrollments row, plus a real Supabase
// Auth invitation email (see lib/production/roster.ts's inviteClient). No
// bulk import, no CSV — the mission's own explicit Phase 6.1B boundary.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { inviteClientAction } from "@/app/actions/coach-roster";

interface InviteClientSheetProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}

export function InviteClientSheet({ open, onClose, workspaceId }: InviteClientSheetProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && !submitting;

  function resetForm() {
    setName("");
    setEmail("");
    setGoal("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await inviteClientAction({ workspaceId, email: email.trim(), displayName: name.trim(), goal: goal.trim() });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      resetForm();
      onClose();
      router.push(`/coach/clients/${result.clientProfileId}`);
    } catch (err) {
      // A genuine crash (network drop, etc.) rather than the expected-error
      // path above, which inviteClientAction never throws for — Next.js's
      // production redaction (see that action's own doc) means err.message
      // here is only ever its own generic placeholder text, not anything
      // this code produced, but showing it is still better than nothing.
      setError(err instanceof Error ? err.message : "Failed to invite this client.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite client"
      description="Sends a real sign-in invitation to this email — the smallest secure single-client workflow for this pilot."
      footer={
        <Button form="invite-client-form" type="submit" className="w-full" size="lg" disabled={!canSubmit}>
          {submitting ? "Sending invitation…" : "Send invitation"}
        </Button>
      }
    >
      <form id="invite-client-form" onSubmit={handleSubmit} className="space-y-6">
        <TextField id="invite-client-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client's full name" required />
        <TextField id="invite-client-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" required />
        <TextField id="invite-client-goal" label="Goal (optional)" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Build strength, lose fat" />
        {error ? <p className="text-sm text-error">{error}</p> : null}
      </form>
    </Sheet>
  );
}
