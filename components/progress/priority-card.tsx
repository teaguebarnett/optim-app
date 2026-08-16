"use client";

import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import type { PriorityCardModel } from "@/lib/progress/types";

/**
 * Renders nothing at all when no eligible, functionally actionable priority
 * exists — never a placeholder, never "all caught up" filler. See
 * lib/progress/aggregate-priority.ts for the capability filter that decides
 * eligibility.
 */
export function PriorityCard({ priority }: { priority: PriorityCardModel }) {
  const router = useRouter();
  if (!priority.eligible) return null;

  const label =
    priority.kind === "unread_coach_feedback" ? "New guidance from your coach" : "An adjustment is ready for your review";

  return (
    <div className="px-4">
      <button
        type="button"
        onClick={() => router.push("/chat")}
        className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-accent/30 bg-accent-soft p-4 text-left"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
          <MessageCircle size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-off-white">{label}</p>
          {priority.detail ? <p className="mt-0.5 text-xs text-neutral">{priority.detail}</p> : null}
        </div>
      </button>
    </div>
  );
}
