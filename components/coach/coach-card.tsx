import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { usePrototypeState } from "@/hooks/use-prototype-state";

interface CoachCardProps {
  note: string;
  noteLabel?: string;
  showChatLink?: boolean;
}

export function CoachCard({ note, noteLabel = "Coach note", showChatLink = true }: CoachCardProps) {
  const { activeContext } = usePrototypeState();
  const coach = activeContext.primaryCoach;

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-charcoal p-4">
      <div className="flex items-center gap-3">
        <Avatar initials={coach?.avatarInitials ?? "?"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-off-white">{coach?.displayName ?? "Coach"}</p>
          <p className="text-xs text-neutral">{coach?.title ?? "Your Coach"}</p>
        </div>
        {showChatLink ? (
          <Link
            href="/chat"
            className="flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-medium text-accent-strong hover:bg-accent-soft"
          >
            Message
            <ChevronRight size={14} />
          </Link>
        ) : null}
      </div>
      <p className="mt-3 text-[13px] font-medium uppercase tracking-wide text-neutral">{noteLabel}</p>
      <p className="mt-1 text-[15px] leading-relaxed text-off-white">{note}</p>
    </div>
  );
}
