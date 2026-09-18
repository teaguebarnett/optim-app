import Link from "next/link";
import { ExpandableCard } from "./expandable-card";
import type { CoachGuidanceCardModel } from "@/lib/progress/types";

/** Only ever shows real, evidence-backed authored content — a real
 * coach-sent chat message and/or coach-authored Corrections. Never a
 * hardcoded note. Non-interactive (no expand) when there is genuinely
 * nothing to show. */
export function CoachGuidanceCard({ coachGuidance }: { coachGuidance: CoachGuidanceCardModel }) {
  const hasMessage = !!coachGuidance.latestMessage;
  const hasCorrections = coachGuidance.recentCorrections.length > 0;
  const hasDetail = hasMessage || hasCorrections;

  const collapsedText = hasMessage
    ? coachGuidance.latestMessage!.text
    : hasCorrections
      ? "A recent adjustment is available to review."
      : "No new coach guidance";

  return (
    <div className="px-4">
      <ExpandableCard
        title="Coach guidance"
        detailTitle="Coach guidance"
        detail={
          hasDetail ? (
            <div className="space-y-4">
              {coachGuidance.latestMessage ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral">{coachGuidance.latestMessage.authorName}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-off-white">{coachGuidance.latestMessage.text}</p>
                  {/* Gate 2D — Coach guidance interprets a real message that
                      already lives in the one Coach conversation (see
                      components/chat/demo-chat-screen.tsx); this is the
                      deliberate destination back to that full thread, never
                      a second copy of it here. */}
                  <Link href="/chat" className="mt-2 inline-block text-sm font-medium text-accent-fg hover:underline">
                    View in Coach
                  </Link>
                </div>
              ) : null}
              {coachGuidance.recentCorrections.length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral">Recent adjustments</p>
                  <ul className="mt-2 space-y-2">
                    {coachGuidance.recentCorrections.map((correction, index) => (
                      <li key={`${correction.dateIso}-${correction.fieldPath}-${index}`} className="rounded-[var(--radius-sm)] bg-off-white/[0.03] p-3">
                        <p className="text-xs text-neutral">
                          {correction.dateIso} · {correction.authorName}
                        </p>
                        {correction.reason ? <p className="mt-1 text-sm text-off-white">{correction.reason}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : undefined
        }
      >
        <p className={hasMessage ? "line-clamp-2 text-sm text-off-white" : "text-sm text-neutral"}>{collapsedText}</p>
      </ExpandableCard>
    </div>
  );
}
