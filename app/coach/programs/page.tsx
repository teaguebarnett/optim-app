"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/coach/page-header";
import { EmptyState } from "@/components/coach/empty-state";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { createEmptyTemplate } from "@/lib/coach/training";

/**
 * A coach's own reusable training-protocol library — owned and isolated by
 * coach account (see lib/coach/platform-store.ts's PlatformState.
 * programTemplates and lib/coach/types.ts's CoachProgramTemplate doc).
 * Assigning one to a client always produces an independent copy (see
 * lib/coach/training.ts's assignTemplateToClient) from the client's own
 * setup page — this page only manages the reusable source templates.
 */
export default function CoachProgramsPage() {
  const router = useRouter();
  const workspace = useCoachWorkspace();
  const coachId = workspace.coachId;

  const templates = coachId ? workspace.platform.programTemplates.filter((t) => t.coachId === coachId) : [];

  function handleCreate() {
    if (!coachId) return;
    const template = createEmptyTemplate({
      workspaceId: workspace.workspaceId,
      coachId,
      name: "New program",
      durationWeeks: 12,
      nowIso: new Date().toISOString(),
    });
    workspace.dispatchPlatform({ type: "SAVE_PROGRAM_TEMPLATE", template });
    router.push(`/coach/programs/${template.id}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programs"
        description="Your own reusable training templates — assign a copy to any client from their setup page."
        action={
          <Button onClick={handleCreate} disabled={!coachId}>
            <Plus size={16} /> New template
          </Button>
        }
      />

      {templates.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No templates yet" description="Create a reusable program once, then assign your own copy to any client." />
      ) : (
        <div className="max-w-2xl space-y-2">
          {templates.map((template) => (
            <Link key={template.id} href={`/coach/programs/${template.id}`} className="block">
              <Card className="flex items-center justify-between gap-3 transition-colors hover:border-accent/40" style={{ transitionDuration: "var(--motion-fast)" }}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-off-white">{template.name || "Untitled program"}</p>
                  <p className="mt-0.5 text-sm text-neutral">
                    {template.durationWeeks} weeks · {template.weeks.length} week{template.weeks.length === 1 ? "" : "s"} authored
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
