// Phase 6.0B — Persist the Complete Revenue Loop.
//
// The one minimal, real, functional Supabase-mode coach surface this
// vertical slice adds: create → publish → assign a real training program
// and nutrition plan for one client, and set their program start date —
// proving the actual persistence/publish/assign/isolation loop against
// real content. Deliberately NOT a redesign or extension of the existing,
// much richer demo-mode program composer (lib/coach/training.ts and its
// surrounding UI, app/coach/clients/[clientId]/setup/training) — that
// system is deeply coupled to the localStorage-backed PlatformState and
// porting its full authoring experience to Supabase is real future work,
// not this phase's job (Part 7 explicitly forbids a broad new authoring UI
// here). "Create" below builds real, non-fabricated content from this
// prototype's one actually-authored catalog Workout — see
// lib/production/programs.ts's buildDraftProgramFromCatalog.
//
// Server Component: reads real Supabase data directly, and every mutation
// is a real Server Action — never a client-side Supabase call.

import { notFound } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resolveAppMode } from "@/lib/production/mode";
import {
  getCoachClientLiveSummaryAction,
  createPublishAndAssignProgramAction,
  createPublishAndAssignNutritionAction,
  setProgramStartDateAction,
} from "@/app/actions/production-programs";

export default async function AssignLivePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  if (resolveAppMode() !== "supabase") {
    // This surface only exists to prove real persistence against a real
    // Supabase project — in demo mode it doesn't exist at all, matching
    // "do not add dead/coming-soon surfaces."
    notFound();
  }

  const summary = await getCoachClientLiveSummaryAction(clientId);

  async function createProgramAction(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "Training program");
    const durationWeeks = Number(formData.get("durationWeeks") ?? 4);
    await createPublishAndAssignProgramAction({ workspaceId: summary.workspaceId, clientProfileId: clientId, title, durationWeeks });
    revalidatePath(`/coach/clients/${clientId}/assign-live`);
  }

  async function createNutritionAction(formData: FormData) {
    "use server";
    const calories = Number(formData.get("calories") ?? 2200);
    const proteinG = Number(formData.get("proteinG") ?? 160);
    const carbsG = Number(formData.get("carbsG") ?? 220);
    const fatG = Number(formData.get("fatG") ?? 70);
    await createPublishAndAssignNutritionAction({ workspaceId: summary.workspaceId, clientProfileId: clientId, calories, proteinG, carbsG, fatG });
    revalidatePath(`/coach/clients/${clientId}/assign-live`);
  }

  async function setStartDateAction(formData: FormData) {
    "use server";
    const startDateIso = String(formData.get("startDateIso") ?? "");
    const timeZone = String(formData.get("timeZone") ?? "UTC");
    if (!startDateIso) return;
    await setProgramStartDateAction({ workspaceId: summary.workspaceId, clientProfileId: clientId, startDateIso, timeZone });
    revalidatePath(`/coach/clients/${clientId}/assign-live`);
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <Link href="/coach/clients" className="text-sm text-off-white/60 hover:text-off-white">
        ← Clients
      </Link>
      <h1 className="text-xl font-semibold text-off-white">Live assignment — {summary.displayName}</h1>
      <p className="text-sm text-off-white/60">
        Real, Supabase-persisted training/nutrition assignment for this client — Phase 6.0B&apos;s minimal proof surface, not the full program
        composer.
      </p>

      <Card>
        <h2 className="mb-2 text-sm font-medium text-off-white">Program start date</h2>
        <p className="mb-2 text-sm text-off-white/60">
          Current: <span className="text-off-white">{summary.startDateIso ?? "not set"}</span>
        </p>
        <form action={setStartDateAction} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-off-white/60">
            Start date
            <input type="date" name="startDateIso" className="rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" required />
          </label>
          <label className="flex flex-col text-xs text-off-white/60">
            Timezone
            <input type="text" name="timeZone" defaultValue="UTC" className="rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Set start date
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-medium text-off-white">Training program</h2>
        <p className="mb-2 text-sm text-off-white/60">
          Active: {summary.activeProgram ? `"${summary.activeProgram.name}" (v${summary.activeProgram.versionNumber})` : "none"}
        </p>
        <form action={createProgramAction} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-off-white/60">
            Title
            <input type="text" name="title" defaultValue="Training program" className="rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
          </label>
          <label className="flex flex-col text-xs text-off-white/60">
            Weeks
            <input type="number" name="durationWeeks" defaultValue={4} min={1} max={20} className="w-20 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
          </label>
          <Button type="submit" variant="primary" size="sm">
            Create, publish &amp; assign
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-medium text-off-white">Nutrition plan</h2>
        <p className="mb-2 text-sm text-off-white/60">Active: {summary.activeNutrition ? `v${summary.activeNutrition.versionNumber}` : "none"}</p>
        <form action={createNutritionAction} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-off-white/60">
            Calories
            <input type="number" name="calories" defaultValue={2200} className="w-24 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
          </label>
          <label className="flex flex-col text-xs text-off-white/60">
            Protein g
            <input type="number" name="proteinG" defaultValue={160} className="w-20 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
          </label>
          <label className="flex flex-col text-xs text-off-white/60">
            Carbs g
            <input type="number" name="carbsG" defaultValue={220} className="w-20 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
          </label>
          <label className="flex flex-col text-xs text-off-white/60">
            Fat g
            <input type="number" name="fatG" defaultValue={70} className="w-20 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
          </label>
          <Button type="submit" variant="primary" size="sm">
            Create, publish &amp; assign
          </Button>
        </form>
      </Card>

      {summary.todayActivity && (
        <Card>
          <h2 className="mb-2 text-sm font-medium text-off-white">Today&apos;s logged activity</h2>
          <p className="text-sm text-off-white/60">
            Session: {summary.todayActivity.training.sessionStatus ?? "not started"} · Sets completed:{" "}
            {summary.todayActivity.training.workingSetsCompleted}/{summary.todayActivity.training.workingSetsPrescribed}
          </p>
        </Card>
      )}
    </main>
  );
}
