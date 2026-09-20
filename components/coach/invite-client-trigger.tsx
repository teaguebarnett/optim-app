"use client";

// Gate 6A — this is the real coach Clients action in Supabase mode: the
// same canonical two-choice entry demo mode's "Add client" button opens
// (see components/coach/add-client-entry-sheet.tsx and
// components/coach/demo-clients-page.tsx), wired to THIS mode's own real
// invitation flow — never a duplicate of it. "Start with a new client"
// opens InviteClientSheet completely unchanged, workspaceId passed through
// exactly as before, so the real client_profiles + coach_client_assignments
// + client_enrollments + Supabase Auth invitation email path
// (lib/production/roster.ts's inviteClient) and this coach's own
// workspace binding are untouched. "Import existing client(s)" routes to
// /coach/clients/import — the same real (currently non-activating)
// placeholder demo mode's choice already leads to; there is exactly one
// import landing page, not a per-mode duplicate.

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InviteClientSheet } from "@/components/coach/invite-client-sheet";
import { AddClientEntrySheet } from "@/components/coach/add-client-entry-sheet";

export function InviteClientTrigger({ workspaceId }: { workspaceId: string }) {
  const [entryOpen, setEntryOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setEntryOpen(true)}>
        <UserPlus size={16} /> Add client
      </Button>
      <AddClientEntrySheet open={entryOpen} onClose={() => setEntryOpen(false)} onStartNewClient={() => setInviteOpen(true)} />
      <InviteClientSheet open={inviteOpen} onClose={() => setInviteOpen(false)} workspaceId={workspaceId} />
    </>
  );
}
