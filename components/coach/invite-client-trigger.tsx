"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InviteClientSheet } from "@/components/coach/invite-client-sheet";

export function InviteClientTrigger({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus size={16} /> Invite client
      </Button>
      <InviteClientSheet open={open} onClose={() => setOpen(false)} workspaceId={workspaceId} />
    </>
  );
}
