"use client";

import Link from "next/link";
import { BookOpen, ChevronRight, ClipboardList, UtensilsCrossed, Wrench } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { usePrototypeState } from "@/hooks/use-prototype-state";

const DEV_TOOLS_AVAILABLE = process.env.NODE_ENV !== "production";

/** Mobile-only overflow menu for the coach workspace — legitimate secondary
 * destinations (Playbook) plus, outside production, a clearly separated
 * link into /dev. Never a dumping ground: exactly the items that don't fit
 * in the four primary bottom-nav slots. */
export function CoachMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeContext } = usePrototypeState();
  const coachName = activeContext.coachProfile?.displayName ?? "Coach";
  const initials = activeContext.coachProfile?.avatarInitials ?? "C";

  return (
    <Sheet open={open} onClose={onClose} title="More">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-surface-raised px-4 py-3">
          <Avatar initials={initials} variant="accent" />
          <div className="min-w-0">
            <p className="truncate text-subheading text-off-white">{coachName}</p>
            <p className="text-meta text-neutral">{activeContext.branding.businessName} · Coach</p>
          </div>
        </div>

        <Link
          href="/coach/programs"
          onClick={onClose}
          className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border px-4 py-3.5 hover:border-accent/40"
        >
          <ClipboardList size={18} className="shrink-0 text-neutral" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-off-white">Programming</span>
            <span className="block text-xs text-neutral">Your saved training templates.</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-neutral" />
        </Link>

        <Link
          href="/coach/meals"
          onClick={onClose}
          className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border px-4 py-3.5 hover:border-accent/40"
        >
          <UtensilsCrossed size={18} className="shrink-0 text-neutral" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-off-white">Nutrition</span>
            <span className="block text-xs text-neutral">Your saved meal recommendations.</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-neutral" />
        </Link>

        <Link
          href="/coach/settings"
          onClick={onClose}
          className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border px-4 py-3.5 hover:border-accent/40"
        >
          <BookOpen size={18} className="shrink-0 text-neutral" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-off-white">Playbook</span>
            <span className="block text-xs text-neutral">How OPTIM supports you and where it always defers to you.</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-neutral" />
        </Link>

        {DEV_TOOLS_AVAILABLE ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border-strong p-3">
            <p className="px-1 text-xs font-medium uppercase tracking-wide text-neutral">Development only</p>
            <Link
              href="/dev"
              onClick={onClose}
              className="mt-2 flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 hover:bg-surface-raised"
            >
              <Wrench size={16} className="shrink-0 text-neutral" />
              <span className="text-sm text-off-white">Dev console</span>
            </Link>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
