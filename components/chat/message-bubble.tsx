import { Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CLIENT, COACH } from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.sender === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-neutral">{message.text}</span>
      </div>
    );
  }

  if (message.sender === "client") {
    return (
      <div className="flex items-end justify-end gap-2 py-1">
        <div className="max-w-[78%] rounded-[var(--radius-md)] rounded-br-sm bg-accent px-3.5 py-2.5">
          <p className="text-[15px] leading-relaxed text-off-white">{message.text}</p>
        </div>
        <Avatar initials={CLIENT.avatarInitials} size="sm" />
      </div>
    );
  }

  if (message.sender === "coach") {
    return (
      <div className="flex items-start gap-2 py-1">
        <Avatar initials={COACH.avatarInitials} size="sm" variant="accent" />
        <div className="max-w-[78%]">
          <p className="mb-1 text-xs font-semibold text-off-white">{COACH.name} · Coach</p>
          <div className="rounded-[var(--radius-md)] rounded-tl-sm border border-accent/30 bg-charcoal px-3.5 py-2.5">
            <p className="text-[15px] leading-relaxed text-off-white">{message.text}</p>
          </div>
          <p className="mt-1 text-[11px] text-neutral">{formatTime(message.createdAtIso)}</p>
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-neutral">
        <Sparkles size={14} />
      </span>
      <div className="max-w-[78%]">
        <p className="mb-1 text-xs font-medium text-neutral">OPTIM Assistant</p>
        <div className={cn("rounded-[var(--radius-md)] rounded-tl-sm bg-surface-raised px-3.5 py-2.5")}>
          <p className="text-[15px] leading-relaxed text-off-white/90">{message.text}</p>
        </div>
      </div>
    </div>
  );
}
