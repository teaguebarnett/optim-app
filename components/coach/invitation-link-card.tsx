"use client";

import { useState } from "react";
import { Copy, ExternalLink, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ClientInvitation } from "@/lib/coach/types";

/**
 * Honest local-prototype invitation delivery — no real email is ever sent
 * or claimed to be sent (see lib/coach/types.ts's InvitationDeliveryMethod).
 * "Copy invitation link" and "Open as client" are the two real actions this
 * phase supports; a real email/SMS adapter would only need to add a new
 * delivery method, never change how this card itself works.
 */
export function InvitationLinkCard({ invitation }: { invitation: ClientInvitation }) {
  const [copied, setCopied] = useState(false);
  const path = `/invite/${invitation.token}`;
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — the visible
      // URL text below is still selectable/copyable by hand.
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="text-subheading text-off-white">Invitation</p>
        <span className="text-meta text-neutral">
          {invitation.acceptedAtIso
            ? `Opened ${new Date(invitation.acceptedAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : "Not opened yet"}
        </span>
      </div>
      <p className="mt-2 truncate rounded-[var(--radius-sm)] bg-surface-input px-3 py-2 text-meta text-neutral">{url}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" type="button" onClick={handleCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a href={path} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline" type="button">
            <ExternalLink size={14} /> Open as client
          </Button>
        </a>
      </div>
      <p className="mt-2.5 text-meta text-neutral">No real email was sent — this is a local prototype link.</p>
    </Card>
  );
}
