"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Check, CalendarRange, Dumbbell, Salad, Info, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { NumberWheel } from "@/components/ui/number-wheel";
import { Combobox } from "@/components/ui/combobox";
import { SectionHeader } from "@/components/coach/section-header";
import { useCoachClientView } from "@/hooks/use-coach-data";
import { applyCoachSetup, shouldAdvanceLifecycleOnSetupSave } from "@/lib/coach/setup";
import { assignTemplateToClientAppState } from "@/lib/coach/program-assignment";
import { isValidWeek1 } from "@/lib/coach/training";
import { NUTRITION_TARGETS } from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import type { NutritionTargets } from "@/lib/types";

const DURATION_OPTIONS = [8, 12, 16, 20];

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof CalendarRange;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
          <Icon size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-subheading text-off-white">{title}</p>
          <p className="mt-0.5 text-meta text-neutral">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

/**
 * "Complete setup" — the focused, confidence-building workflow a coach uses
 * to turn an onboarded client into an activatable one: review/edit the
 * program start date and duration, set real coach-controlled nutrition
 * targets, and finalize (or skip) a weekly check-in. Saving writes directly
 * into this ONE client's own AppState (see lib/coach/setup.ts) — never the
 * seeded demo client's, never any other client's. Four clearly separated
 * sections (program, nutrition, check-in, review) so the page never blurs
 * into one long form.
 */
export default function CoachClientSetupPage() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const view = useCoachClientView(params.clientId);

  const { client, lifecycle, intendedProgram, clientAppState, workspaceId, dispatchPlatform, coachId, platform } = view;
  const [assignJustHappened, setAssignJustHappened] = useState(false);
  // Gate 4D — a template selected while a real, already-assigned program
  // exists must not replace it on the spot; see handleSelectTemplate below.
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(
    clientAppState?.programEnrollment.startDateIso ?? intendedProgram?.intendedStartDateIso ?? new Date().toISOString().slice(0, 10)
  );
  const [durationWeeks, setDurationWeeks] = useState(
    clientAppState?.programEnrollment.durationWeeks ?? intendedProgram?.intendedDurationWeeks ?? 12
  );
  const [targets, setTargets] = useState<NutritionTargets>(clientAppState?.nutritionTargets ?? NUTRITION_TARGETS);
  const [assignWeeklyCheckIn, setAssignWeeklyCheckIn] = useState(
    clientAppState ? clientAppState.checkInSchedule !== null : (intendedProgram?.intendedWeeklyCheckIn ?? false)
  );
  const [justSaved, setJustSaved] = useState(false);

  if (!client) {
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

  function updateTarget(key: keyof NutritionTargets, value: number) {
    setTargets((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    applyCoachSetup({
      clientId: client!.id,
      workspaceId,
      primaryCoachId: client!.primaryCoachId,
      startDateIso: startDate,
      durationWeeks,
      nutritionTargets: targets,
      assignWeeklyCheckIn,
      now: new Date(),
    });
    if (shouldAdvanceLifecycleOnSetupSave(lifecycle)) {
      dispatchPlatform({
        type: "SET_CLIENT_LIFECYCLE",
        clientId: client!.id,
        workspaceId,
        status: "ready_to_activate",
        nowIso: new Date().toISOString(),
      });
    }
    setJustSaved(true);
    window.setTimeout(() => router.push(`/coach/clients/${client!.id}`), 260);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28 md:pb-6">
      <button onClick={() => router.push(`/coach/clients/${client.id}`)} className="flex items-center gap-1 text-sm text-neutral hover:text-off-white">
        <ChevronLeft size={16} /> Back to {client.name}
      </button>

      <div>
        <p className="text-label text-brass-strong">Complete setup</p>
        <h1 className="mt-1 text-display text-off-white">{client.name}</h1>
        <p className="mt-1 text-body text-neutral">
          What&apos;s still needed before {client.name.split(" ")[0]} can be activated. You retain final control — nothing here
          takes effect until you save, and activation is always a separate, explicit step.
        </p>
      </div>

      <SectionCard icon={CalendarRange} title="Program timing" description="This client's start date and program length — set the training protocol itself below.">

        <div className="grid grid-cols-2 gap-3">
          <TextField id="setup-start-date" label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          <div>
            <p className="mb-1.5 text-sm font-medium text-off-white">Duration</p>
            <div className="grid grid-cols-4 gap-2">
              {DURATION_OPTIONS.map((weeks) => (
                <button
                  key={weeks}
                  type="button"
                  onClick={() => setDurationWeeks(weeks)}
                  aria-pressed={durationWeeks === weeks}
                  className={cn(
                    "h-11 rounded-[var(--radius-sm)] border-2 text-sm font-medium transition-colors",
                    durationWeeks === weeks ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong text-off-white hover:border-accent/40"
                  )}
                  style={{ transitionDuration: "var(--motion-fast)" }}
                >
                  {weeks}w
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={Dumbbell}
        title="Training protocol"
        description="This client's real, loggable training content — create one from scratch or assign a copy of one of your saved templates."
      >
        {(() => {
          const assignedProgram = clientAppState?.assignedProgram;
          const coachTemplates = coachId ? platform.programTemplates.filter((t) => t.coachId === coachId) : [];
          const status = !assignedProgram
            ? "No protocol assigned yet."
            : assignedProgram.status === "draft"
              ? "Draft in progress — not visible to the client yet."
              : isValidWeek1(assignedProgram)
                ? "Assigned — Week 1 is ready."
                : "Assigned — Week 1 still needs at least one usable exercise.";

          const pendingTemplate = pendingTemplateId ? coachTemplates.find((t) => t.id === pendingTemplateId) : null;

          function applyTemplateAssignment(templateId: string) {
            const template = coachTemplates.find((t) => t.id === templateId);
            if (!template || !coachId) return;
            assignTemplateToClientAppState(client!.id, workspaceId, coachId, template, new Date().toISOString());
            setPendingTemplateId(null);
            setAssignJustHappened(true);
            window.setTimeout(() => setAssignJustHappened(false), 1500);
          }

          // Gate 4D — a real, live-assigned program already exists here: a
          // one-click template swap would silently replace it (and
          // everything the client currently sees) with zero coach
          // confirmation. A not-yet-assigned program carries no such risk
          // and keeps assigning immediately, unchanged from before.
          function handleSelectTemplate(templateId: string) {
            if (assignedProgram?.status === "assigned") {
              setPendingTemplateId(templateId);
              return;
            }
            applyTemplateAssignment(templateId);
          }

          return (
            <div className="space-y-3">
              <p className="text-sm text-neutral">
                {status} {assignJustHappened ? <span className="text-success">Assigned.</span> : null}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => router.push(`/coach/clients/${client!.id}/setup/training`)}>
                  {assignedProgram ? "Edit training protocol" : "Create new program"}
                </Button>
              </div>
              {coachTemplates.length > 0 ? (
                <div className="max-w-sm space-y-2">
                  <p className="mb-1.5 text-xs text-neutral">Or assign one of your saved templates (creates an independent copy for this client)</p>
                  <Combobox
                    ariaLabel="Assign a saved template"
                    placeholder="Choose a template…"
                    value={null}
                    onChange={handleSelectTemplate}
                    options={coachTemplates.map((t) => ({ value: t.id, label: t.name || "Untitled program", description: `${t.durationWeeks} weeks` }))}
                  />
                  {pendingTemplate ? (
                    <div className="rounded-[var(--radius-sm)] border border-warning/40 bg-warning-soft/40 p-3 text-sm">
                      <p className="text-off-white">
                        Replace {client!.name.split(" ")[0]}&apos;s current assigned program with &ldquo;{pendingTemplate.name || "Untitled program"}&rdquo;? This immediately
                        replaces what the client sees.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => applyTemplateAssignment(pendingTemplate.id)}>
                          Replace program
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setPendingTemplateId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })()}
      </SectionCard>

      <SectionCard icon={Salad} title="Nutrition configuration" description="Coach-controlled targets — OPTIM never decides or changes them on its own.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-off-white">Calories</p>
            <NumberWheel id="setup-calories" fieldLabel="Daily calorie target" value={targets.calories} onChange={(v) => updateTarget("calories", v)} min={1200} max={6000} step={50} unit="cal" />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-off-white">Protein</p>
            <NumberWheel id="setup-protein" fieldLabel="Protein target" value={targets.proteinG} onChange={(v) => updateTarget("proteinG", v)} min={0} max={400} step={5} unit="g" />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-off-white">Carbs</p>
            <NumberWheel id="setup-carbs" fieldLabel="Carbohydrate target" value={targets.carbsG} onChange={(v) => updateTarget("carbsG", v)} min={0} max={600} step={5} unit="g" />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-off-white">Fat</p>
            <NumberWheel id="setup-fat" fieldLabel="Fat target" value={targets.fatG} onChange={(v) => updateTarget("fatG", v)} min={0} max={200} step={5} unit="g" />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={Info}
        title="Weekly check-in"
        description={
          intendedProgram?.intendedWeeklyCheckIn
            ? `${client.name} requested a weekly check-in when they were invited.`
            : `${client.name} chose "None for now" at invite — that stays valid; a check-in is never required.`
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAssignWeeklyCheckIn(true)}
            aria-pressed={assignWeeklyCheckIn}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-2 px-3 py-2.5 text-sm font-medium transition-colors",
              assignWeeklyCheckIn ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong text-off-white"
            )}
            style={{ transitionDuration: "var(--motion-fast)" }}
          >
            {assignWeeklyCheckIn ? <Check size={14} /> : null}
            Assign weekly check-in
          </button>
          <button
            type="button"
            onClick={() => setAssignWeeklyCheckIn(false)}
            aria-pressed={!assignWeeklyCheckIn}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-2 px-3 py-2.5 text-sm font-medium transition-colors",
              !assignWeeklyCheckIn ? "border-accent bg-selected-bg text-accent-fg" : "border-border-strong text-off-white"
            )}
            style={{ transitionDuration: "var(--motion-fast)" }}
          >
            {!assignWeeklyCheckIn ? <Check size={14} /> : null}
            None for now
          </button>
        </div>
      </SectionCard>

      <div>
        <SectionHeader title="Final review" />
        <Card className="space-y-2 bg-surface-raised">
          <div className="flex items-center gap-2 text-sm text-off-white">
            <ClipboardCheck size={15} className="shrink-0 text-brass-strong" />
            Saving activates readiness — not the client. Activation stays a separate confirmation.
          </div>
          <dl className="divide-y divide-border text-sm">
            <div className="flex items-center justify-between py-1.5">
              <dt className="text-neutral">Start date</dt>
              <dd className="text-off-white">{startDate}</dd>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <dt className="text-neutral">Duration</dt>
              <dd className="text-off-white">{durationWeeks} weeks</dd>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <dt className="text-neutral">Daily calories</dt>
              <dd className="text-off-white">{targets.calories} cal</dd>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <dt className="text-neutral">Macros</dt>
              <dd className="text-off-white">
                {targets.proteinG}P / {targets.carbsG}C / {targets.fatG}F
              </dd>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <dt className="text-neutral">Weekly check-in</dt>
              <dd className="text-off-white">{assignWeeklyCheckIn ? "Assigned" : "None for now"}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Desktop inline actions */}
      <div className="hidden gap-2 md:flex">
        <Button className="flex-1" size="lg" onClick={handleSave}>
          {justSaved ? "Saved" : "Save setup"}
        </Button>
        <Button variant="ghost" size="lg" onClick={() => router.push(`/coach/clients/${client.id}`)}>
          Cancel
        </Button>
      </div>

      {/* Mobile sticky save action — always reachable without scrolling. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-charcoal px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:hidden">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Button className="flex-1" size="lg" onClick={handleSave}>
            {justSaved ? "Saved" : "Save setup"}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => router.push(`/coach/clients/${client.id}`)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
