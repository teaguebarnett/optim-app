import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { getScriptedTopicById } from "@/lib/scripted-chat";
import { chatAssistantDescription } from "@/lib/mock-data";

export function TechniqueQuestionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const topic = getScriptedTopicById("exercise-technique");
  const { activeContext } = usePrototypeState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";

  return (
    <Sheet
      open={open}
      onClose={onClose}
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
          <Link href="/chat" className="font-medium text-accent-strong">
            Open chat
          </Link>{" "}
          to ask {coachName} directly.
        </p>
      </div>
    </Sheet>
  );
}
