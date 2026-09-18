"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { getScriptedTopicById } from "@/lib/scripted-chat";
import { chatAssistantDescription } from "@/lib/mock-data";

interface TechniqueQuestionSheetProps {
  open: boolean;
  onClose: () => void;
  /** When provided, this sheet also offers "This is specific to me" —
   * concise context the client can record and flag for their coach,
   * distinct from OPTIM's routine scripted answer above it (Phase 4.4B-2
   * §J: never presenting the static FAQ answer as if it were a personalized
   * coach response). Omitted call sites keep the original routine-question
   * behavior only. */
  onFlagForCoach?: (context: string) => void;
}

export function TechniqueQuestionSheet({ open, onClose, onFlagForCoach }: TechniqueQuestionSheetProps) {
  const topic = getScriptedTopicById("exercise-technique");
  const { activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [flagging, setFlagging] = useState(false);
  const [context, setContext] = useState("");
  const [flagged, setFlagged] = useState(false);

  function handleClose() {
    setFlagging(false);
    setContext("");
    setFlagged(false);
    onClose();
  }

  function handleFlag() {
    onFlagForCoach?.(context.trim());
    setFlagged(true);
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Technique question"
      description={chatAssistantDescription(activeContext.assistantDisplayName, coachName)}
    >
      <div className="space-y-4">
        {topic ? (
          <div className="rounded-[var(--radius-md)] border border-border-strong p-4">
            <p className="text-sm font-medium text-off-white">{topic.prompt}</p>
            <p className="mt-2 text-sm leading-relaxed text-neutral">{topic.response}</p>
          </div>
        ) : null}
        <p className="text-sm text-neutral">
          Have a different question about this exercise?{" "}
          <Link href="/chat" className="font-medium text-accent-fg">
            Open chat
          </Link>{" "}
          to ask {coachName} directly.
        </p>

        {onFlagForCoach ? (
          flagged ? (
            <p className="rounded-[var(--radius-sm)] bg-off-white/[0.04] px-3 py-2.5 text-sm text-off-white">
              Flagged for {coachName}&apos;s review — not a diagnosis or instruction change, just noted for next time.
            </p>
          ) : !flagging ? (
            <button
              type="button"
              onClick={() => setFlagging(true)}
              className="text-action text-accent-fg hover:underline"
            >
              This is specific to me — flag for {coachName}
            </button>
          ) : (
            <div className="space-y-3 border-t border-border pt-4">
              <TextArea
                id="technique-flag-context"
                label={`What's the concern? (for ${coachName})`}
                rows={2}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g. My shoulder feels off on the way down"
              />
              <Button className="w-full" onClick={handleFlag}>
                Flag for {coachName}
              </Button>
            </div>
          )
        ) : null}
      </div>
    </Sheet>
  );
}
