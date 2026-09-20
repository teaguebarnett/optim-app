"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgramEditor } from "@/components/coach/program-editor";
import { ProgramWeekPreviewSheet } from "@/components/coach/program-preview-sheet";
import { useCoachClientView } from "@/hooks/use-coach-data";
import { saveClientProgram } from "@/lib/coach/program-assignment";
import { createEmptyClientProgram, isValidWeek1, resolveProgramOrigin } from "@/lib/coach/training";
import { cn } from "@/lib/cn";
import type { ClientAssignedProgram, ProgramWeek } from "@/lib/types";

/**
 * The full week-by-week editor for exactly one client's own training
 * protocol — reachable only from that client's "Complete setup" page.
 * Writes directly into this client's AppState (see
 * lib/coach/program-assignment.ts's saveClientProgram), never a template,
 * and never any other client's program.
 */
export default function ClientTrainingEditorPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const view = useCoachClientView(params.clientId);
  const { client, workspaceId, clientAppState, platform } = view;

  // Gate 4D — the client's real, currently-live program (if any), read
  // fresh on every render so it always reflects the true current state,
  // never a stale snapshot from when this page first opened. Distinct from
  // `draft` below, which also covers a freshly created empty scaffold that
  // hasn't been assigned yet.
  const currentAssignedProgram = clientAppState?.assignedProgram ?? null;
  const programOrigin = currentAssignedProgram ? resolveProgramOrigin(currentAssignedProgram, platform.activationGenerations, platform.programTemplates) : null;

  const initialProgram: ClientAssignedProgram | null =
    currentAssignedProgram ??
    (client
      ? createEmptyClientProgram({
          workspaceId,
          clientId: client.id,
          coachId: client.primaryCoachId,
          name: `${client.name.split(" ")[0]}'s program`,
          durationWeeks: clientAppState?.programEnrollment.durationWeeks ?? 12,
          nowIso: new Date().toISOString(),
        })
      : null);

  const [draft, setDraft] = useState<ClientAssignedProgram | null>(initialProgram);
  const [syncedClientId, setSyncedClientId] = useState(client?.id);
  const [justSaved, setJustSaved] = useState(false);
  const [previewWeek, setPreviewWeek] = useState<ProgramWeek | null>(null);

  if (client && client.id !== syncedClientId) {
    setSyncedClientId(client.id);
    setDraft(initialProgram);
  }

  if (!client || !draft) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push("/coach/clients")} className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
          <ChevronLeft size={16} /> Back to clients
        </button>
        <Card>
          <p className="text-sm text-neutral">No client found for this id.</p>
        </Card>
      </div>
    );
  }

  function persist(next: ClientAssignedProgram) {
    setDraft(next);
    saveClientProgram(client!.id, workspaceId, client!.primaryCoachId, next);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
  }

  const week1Ready = isValidWeek1({ ...draft, status: "assigned" });

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28 md:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => router.push(`/coach/clients/${client.id}/setup`)}
          className="flex items-center gap-1 text-sm text-neutral hover:text-off-white"
        >
          <ChevronLeft size={16} /> Back to {client.name}&apos;s setup
        </button>
        <div className="flex items-center gap-3">
          {justSaved ? <span className="text-sm text-success">Saved</span> : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPreviewWeek(draft.weeks.find((w) => w.weekNumber === 1) ?? null)}
          >
            <Eye size={14} /> Preview Week 1
          </Button>
        </div>
      </div>

      <div>
        <p className="text-label text-brass-strong">Training protocol</p>
        <h1 className="mt-1 text-display text-off-white">{client.name}</h1>
        <p className="mt-1 text-body text-neutral">
          {currentAssignedProgram?.status === "assigned"
            ? "You're editing the client's real, currently assigned program — every change here saves immediately and reaches what the client sees."
            : "Build this client's own program. Nothing here reaches the client until you assign it below."}
        </p>
      </div>

      {/* Gate 4D — a current assigned program's real origin, using only the
          existing correlation between an ActivationApprovalRecord and the
          exact program id it produced (see resolveProgramOrigin's own doc)
          — never a fabricated provenance. Answers "does this client already
          have a program, where did it come from, and is there somewhere
          else to see it" before the coach edits anything below. */}
      {currentAssignedProgram && programOrigin ? (
        <Card className="space-y-1.5">
          <p className="text-label text-neutral">Current program</p>
          <p className="text-sm text-off-white">
            {programOrigin.kind === "optim_generated"
              ? `Generated through OPTIM Plan, approved ${new Date(programOrigin.approvedAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
              : programOrigin.kind === "template"
                ? `Assigned from your saved template "${programOrigin.templateName}".`
                : `Built directly for ${client.name.split(" ")[0]} in this editor.`}
          </p>
          <Link href={`/coach/clients/${client.id}/activate`} className="inline-flex items-center gap-1 text-sm text-accent-fg hover:underline">
            View in OPTIM Plan workspace <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </Card>
      ) : null}

      <Card
        className={cn(
          "flex items-center justify-between gap-3",
          draft.status === "assigned" && week1Ready ? "border-success/40 bg-success-soft/40" : "border-warning/40 bg-warning-soft/40"
        )}
      >
        <div>
          <p className="text-sm font-medium text-off-white">
            {draft.status === "draft" ? "Draft — not visible to the client" : "Assigned"}
          </p>
          <p className="mt-0.5 text-xs text-neutral">
            {week1Ready ? "Week 1 has a usable session and can activate this client." : "Week 1 still needs at least one training day with a real exercise."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => persist({ ...draft, status: draft.status === "assigned" ? "draft" : "assigned", updatedAtIso: new Date().toISOString() })}
        >
          {draft.status === "assigned" ? "Move back to draft" : "Assign to client"}
        </Button>
      </Card>

      <Card>
        <ProgramEditor
          workspaceId={workspaceId}
          name={draft.name}
          durationWeeks={draft.durationWeeks}
          weeks={draft.weeks}
          onChangeName={(name) => persist({ ...draft, name, updatedAtIso: new Date().toISOString() })}
          onChangeDurationWeeks={(durationWeeks) => persist({ ...draft, durationWeeks, updatedAtIso: new Date().toISOString() })}
          onChangeWeeks={(weeks) => persist({ ...draft, weeks, updatedAtIso: new Date().toISOString() })}
        />
      </Card>

      <ProgramWeekPreviewSheet week={previewWeek} open={!!previewWeek} onClose={() => setPreviewWeek(null)} />
    </div>
  );
}
