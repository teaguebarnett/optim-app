"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgramEditor } from "@/components/coach/program-editor";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import type { CoachProgramTemplate } from "@/lib/coach/types";

export default function ProgramTemplateEditorPage() {
  const params = useParams<{ templateId: string }>();
  const router = useRouter();
  const workspace = useCoachWorkspace();

  const storedTemplate = workspace.platform.programTemplates.find((t) => t.id === params.templateId && t.coachId === workspace.coachId);
  const [draft, setDraft] = useState<CoachProgramTemplate | null>(storedTemplate ?? null);
  const [syncedTemplateId, setSyncedTemplateId] = useState(storedTemplate?.id);
  const [justSaved, setJustSaved] = useState(false);

  // The stored copy only ever changes here via this page's own save below —
  // this just adjusts the draft the first time it loads (or after
  // navigating to a different template) during render, the documented
  // React pattern for this rather than an effect (which would commit a
  // stale draft for one extra frame first).
  if (storedTemplate && storedTemplate.id !== syncedTemplateId) {
    setSyncedTemplateId(storedTemplate.id);
    setDraft(storedTemplate);
  }

  if (!workspace.isPlatformHydrated) return null;

  if (!storedTemplate || !draft) {
    return (
      <Card className="max-w-lg">
        <p className="text-sm text-neutral">This template doesn&apos;t exist, or belongs to a different coach.</p>
        <Link href="/coach/programs" className="mt-3 inline-block text-sm text-accent-strong">
          Back to programs
        </Link>
      </Card>
    );
  }

  function handleSave() {
    workspace.dispatchPlatform({ type: "SAVE_PROGRAM_TEMPLATE", template: { ...draft!, updatedAtIso: new Date().toISOString() } });
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
  }

  function handleDelete() {
    if (!workspace.coachId) return;
    workspace.dispatchPlatform({ type: "DELETE_PROGRAM_TEMPLATE", templateId: draft!.id, coachId: workspace.coachId });
    router.push("/coach/programs");
  }

  return (
    <div className="max-w-3xl space-y-4 pb-10">
      <div className="flex items-center justify-between gap-3">
        <Link href="/coach/programs" className="inline-flex items-center gap-1 text-sm text-neutral hover:text-off-white">
          <ChevronLeft size={16} /> Programs
        </Link>
        <div className="flex items-center gap-3">
          {justSaved ? <span className="text-sm text-success">Saved</span> : null}
          <Button variant="secondary" size="sm" onClick={handleDelete}>
            <Trash2 size={14} /> Delete template
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>

      <Card>
        <ProgramEditor
          workspaceId={draft.workspaceId}
          name={draft.name}
          durationWeeks={draft.durationWeeks}
          weeks={draft.weeks}
          onChangeName={(name) => setDraft({ ...draft, name })}
          onChangeDurationWeeks={(durationWeeks) => setDraft({ ...draft, durationWeeks })}
          onChangeWeeks={(weeks) => setDraft({ ...draft, weeks })}
        />
      </Card>
    </div>
  );
}
