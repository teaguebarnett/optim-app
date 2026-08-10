import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { getScriptedTopicById } from "@/lib/scripted-chat";
import { CHAT_ASSISTANT_DESCRIPTION } from "@/lib/mock-data";

export function TechniqueQuestionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const topic = getScriptedTopicById("exercise-technique");

  return (
    <Sheet open={open} onClose={onClose} title="Technique question" description={CHAT_ASSISTANT_DESCRIPTION}>
      <div className="space-y-4">
        {topic ? (
          <div className="rounded-[var(--radius-md)] border border-border-strong p-4">
            <p className="text-sm font-medium text-off-white">{topic.prompt}</p>
            <p className="mt-2 text-sm leading-relaxed text-neutral">{topic.response}</p>
          </div>
        ) : null}
        <p className="text-sm text-neutral">
          Have a different question about this exercise?{" "}
          <Link href="/chat" className="font-medium text-accent-strong">
            Open chat
          </Link>{" "}
          to ask Teague directly.
        </p>
      </div>
    </Sheet>
  );
}
