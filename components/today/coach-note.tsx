import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { usePrototypeState } from "@/hooks/use-prototype-state";

/**
 * Today-only presentation of the coach's note — deliberately distinct from
 * the shared CoachCard used on Training (see components/coach/coach-card.tsx),
 * which stays untouched. Per the Visual Constitution §16, the client must
 * always be able to tell what came from their coach versus OPTIM/system
 * information. This reads as personal correspondence through composition —
 * a brass keyline, an explicit "From your coach" label, and a warmer
 * dedicated surface — not through a different typeface. Every line here
 * uses the same Manrope semantic tokens as the rest of the product; nothing
 * here is fabricated, it's the same real note text passed in.
 *
 * Lives directly beneath the day/program context line at the top of Today
 * (see app/today/page.tsx) — part of the day's human context, not a
 * low-priority tile — so it stays compact rather than a full padded card.
 *
 * Phase 4.4B-1 — `label` defaults to "From your coach" (Today's exact,
 * unchanged copy) but is overridable so Training can reuse this identical
 * treatment for Teague's current-week focus note while preserving that
 * note's own original label wording ("{coach}'s focus for this week")
 * instead of forcing Today's generic label onto different content.
 */
export function CoachNote({ note, label = "From your coach" }: { note: string; label?: string }) {
  const { activeContext } = usePrototypeState();
  const coach = activeContext.primaryCoach;

  return (
    <div className="mx-4 rounded-[var(--radius-md)] border-l-2 border-brass bg-surface-raised px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar initials={coach?.avatarInitials ?? "?"} size="sm" />
        <p className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-subheading text-off-white">{coach?.displayName ?? "Coach"}</span>
          <span className="text-label text-brass-strong">{label}</span>
        </p>
        <Link
          href="/chat"
          className="flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-action text-brass-strong hover:bg-brass-soft"
        >
          Message
          <ChevronRight size={14} />
        </Link>
      </div>
      <p className="mt-1.5 text-meta text-neutral">&ldquo;{note}&rdquo;</p>
    </div>
  );
}
