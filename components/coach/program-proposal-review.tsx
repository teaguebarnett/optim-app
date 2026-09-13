// Phase 8C — Generated Program Review and Approval Workflow.
//
// The smallest functional coach review surface this phase's own scope
// calls for — not a dashboard redesign, not a full universal program
// builder. Shows Week 1 (the representative starting point of a periodized
// program — see this phase's completion report for why full multi-week
// editing is out of V1 scope) in plain coaching language: no
// TrainingItemInstance, no schemaVersion, no prescription family enum ever
// surfaces here. Approve is always one click away; editing is real but
// tucked behind a native <details> disclosure per item — zero extra
// client-side JS required for that progressive disclosure.

import { revalidatePath } from "next/cache";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  editProgramProposalItemAction,
  approveProgramProposalAction,
  rejectProgramProposalAction,
  type ProgramProposalReviewView,
} from "@/app/actions/production-programs";
import type { TrainingItemPath, TrainingItemPatch } from "@/lib/training/program-proposal-editing";
import type { TrainingItemInstance } from "@/lib/training/types";

function numberOrUndefined(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function stringOrUndefined(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (raw === null) return undefined;
  const s = String(raw).trim();
  return s ? s : undefined;
}

export function ProgramProposalReview({ workspaceId, clientProfileId, clientId, proposal }: { workspaceId: string; clientProfileId: string; clientId: string; proposal: ProgramProposalReviewView }) {
  async function revalidate() {
    "use server";
    revalidatePath(`/coach/clients/${clientId}`);
  }

  async function approveAction() {
    "use server";
    await approveProgramProposalAction({ workspaceId, clientProfileId, versionId: proposal.versionId });
    await revalidate();
  }

  async function rejectAction(formData: FormData) {
    "use server";
    const reason = stringOrUndefined(formData, "reason");
    await rejectProgramProposalAction({ workspaceId, clientProfileId, versionId: proposal.versionId, reason });
    await revalidate();
  }

  function editActionFor(path: TrainingItemPath, isContinuous: boolean) {
    async function edit(formData: FormData) {
      "use server";
      const patch: TrainingItemPatch = isContinuous
        ? {
            name: stringOrUndefined(formData, "name"),
            durationSeconds: numberOrUndefined(formData, "durationSeconds"),
            distanceValue: numberOrUndefined(formData, "distanceValue"),
            distanceUnit: stringOrUndefined(formData, "distanceUnit") as TrainingItemPatch["distanceUnit"],
            heartRateLow: numberOrUndefined(formData, "heartRateLow"),
            heartRateHigh: numberOrUndefined(formData, "heartRateHigh"),
            rpe: numberOrUndefined(formData, "rpe"),
          }
        : {
            name: stringOrUndefined(formData, "name"),
            sets: numberOrUndefined(formData, "sets"),
            repsLow: numberOrUndefined(formData, "repsLow"),
            repsHigh: numberOrUndefined(formData, "repsHigh"),
            rpe: numberOrUndefined(formData, "rpe"),
            rir: numberOrUndefined(formData, "rir"),
            loadValue: numberOrUndefined(formData, "loadValue"),
            loadUnit: stringOrUndefined(formData, "loadUnit") as TrainingItemPatch["loadUnit"],
            restSeconds: numberOrUndefined(formData, "restSeconds"),
            tempo: stringOrUndefined(formData, "tempo"),
            warmupInstruction: stringOrUndefined(formData, "warmupInstruction"),
          };
      await editProgramProposalItemAction({ workspaceId, clientProfileId, versionId: proposal.versionId, path, patch });
      await revalidate();
    }
    return edit;
  }

  const week1 = proposal.content.weeks.find((w) => w.weekNumber === 1);
  const trainingDays = (week1?.days ?? []).filter((d) => d.type === "training");

  return (
    <Card className="border-l-2 border-l-accent">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-off-white">
            Proposed program {proposal.wasEdited ? "(edited)" : "(as generated)"} — {proposal.content.durationWeeks} weeks
          </p>
          <p className="mt-0.5 text-xs text-neutral">{proposal.content.directionLabel ?? proposal.content.name}</p>
          {proposal.content.generationRationale ? <p className="mt-1 text-xs text-neutral">{proposal.content.generationRationale}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <form action={approveAction}>
            <Button type="submit" variant="primary" size="sm">
              Approve &amp; activate
            </Button>
          </form>
        </div>
      </div>

      {proposal.restrictionWarnings.length > 0 ? (
        <div className="mb-3 rounded border border-warning bg-warning-soft/40 px-3 py-2">
          <p className="text-xs font-medium text-warning-strong">This proposal may conflict with a documented client restriction:</p>
          <ul className="mt-1 space-y-0.5 text-xs text-warning-strong">
            {proposal.restrictionWarnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral">Week 1 — what the client will see first</p>
      <div className="space-y-2.5">
        {trainingDays.map((day) =>
          (day.sessions ?? []).map((session, sessionIndex) => (
            <div key={`${day.dayOfWeek}-${sessionIndex}`} className="rounded border border-border-strong p-2.5">
              <p className="mb-1.5 text-xs font-medium text-off-white">
                {day.dayOfWeek} — {session.name}
              </p>
              <div className="space-y-2">
                {session.blocks.flatMap((block) =>
                  block.items.map((item) => {
                    const path: TrainingItemPath = { weekNumber: 1, dayOfWeek: day.dayOfWeek, sessionIndex, blockId: block.id, itemId: item.id };
                    const isContinuous = item.category === "continuous";
                    return (
                      <details key={item.id} className="rounded bg-surface-raised px-2.5 py-2">
                        <summary className="cursor-pointer text-sm text-off-white">
                          {item.name} — {describeItem(item)}
                        </summary>
                        <form action={editActionFor(path, isContinuous)} className="mt-2 flex flex-wrap items-end gap-2">
                          <label className="flex flex-col text-xs text-neutral">
                            Name
                            <input type="text" name="name" defaultValue={item.name} className="w-40 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
                          </label>
                          {isContinuous ? (
                            <>
                              <NumField label="Duration (sec)" name="durationSeconds" defaultValue={item.prescription.duration?.seconds} />
                              <NumField label="Distance" name="distanceValue" defaultValue={item.prescription.distance?.value} />
                              <label className="flex flex-col text-xs text-neutral">
                                Unit
                                <select name="distanceUnit" defaultValue={item.prescription.distance?.unit ?? "mi"} className="rounded border border-border-strong bg-surface px-2 py-1 text-off-white">
                                  <option value="mi">mi</option>
                                  <option value="km">km</option>
                                  <option value="m">m</option>
                                </select>
                              </label>
                              <NumField label="HR low" name="heartRateLow" defaultValue={item.prescription.heartRate?.low} />
                              <NumField label="HR high" name="heartRateHigh" defaultValue={item.prescription.heartRate?.high} />
                              <NumField label="RPE" name="rpe" defaultValue={item.prescription.rpe} />
                            </>
                          ) : (
                            <>
                              <NumField label="Sets" name="sets" defaultValue={item.prescription.sets} />
                              <NumField label="Reps low" name="repsLow" defaultValue={item.prescription.reps?.low} />
                              <NumField label="Reps high" name="repsHigh" defaultValue={item.prescription.reps?.high} />
                              <NumField label="RPE" name="rpe" defaultValue={item.prescription.rpe} />
                              <NumField label="RIR" name="rir" defaultValue={item.prescription.rir} />
                              <NumField label="Load" name="loadValue" defaultValue={item.prescription.load?.value} />
                              <label className="flex flex-col text-xs text-neutral">
                                Unit
                                <select name="loadUnit" defaultValue={item.prescription.load?.unit ?? "lb"} className="rounded border border-border-strong bg-surface px-2 py-1 text-off-white">
                                  <option value="lb">lb</option>
                                  <option value="kg">kg</option>
                                </select>
                              </label>
                              <NumField label="Rest (sec)" name="restSeconds" defaultValue={item.prescription.restSeconds} />
                              <label className="flex flex-col text-xs text-neutral">
                                Tempo
                                <input type="text" name="tempo" defaultValue={item.prescription.tempo ?? ""} className="w-20 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
                              </label>
                            </>
                          )}
                          <Button type="submit" variant="secondary" size="sm">
                            Save change
                          </Button>
                        </form>
                      </details>
                    );
                  })
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <form action={rejectAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <label className="flex flex-col text-xs text-neutral">
          Reason (optional)
          <select name="reason" defaultValue="" className="w-48 rounded border border-border-strong bg-surface px-2 py-1 text-off-white">
            <option value="">No reason given</option>
            <option value="too_much_volume">Too much volume</option>
            <option value="wrong_exercise_selection">Wrong exercise selection</option>
            <option value="too_aggressive">Too aggressive</option>
            <option value="does_not_fit_schedule">Doesn&apos;t fit schedule</option>
            <option value="other">Other</option>
          </select>
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Reject &amp; regenerate later
        </Button>
      </form>
    </Card>
  );
}

function NumField({ label, name, defaultValue }: { label: string; name: string; defaultValue?: number }) {
  return (
    <label className="flex flex-col text-xs text-neutral">
      {label}
      <input type="number" name={name} defaultValue={defaultValue ?? ""} step="any" className="w-16 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
    </label>
  );
}

function describeItem(item: TrainingItemInstance): string {
  if (item.category === "continuous") {
    const d = item.prescription.duration ? `${Math.round(item.prescription.duration.seconds / 60)} min` : null;
    const dist = item.prescription.distance ? `${item.prescription.distance.value} ${item.prescription.distance.unit}` : null;
    const hr = item.prescription.heartRate ? `HR ${item.prescription.heartRate.low}-${item.prescription.heartRate.high}` : null;
    return [d, dist, hr].filter(Boolean).join(", ") || "continuous work";
  }
  const sets = item.prescription.sets;
  const reps = item.prescription.reps ? `${item.prescription.reps.low}-${item.prescription.reps.high} reps` : null;
  const rpe = item.prescription.rpe ? `RPE ${item.prescription.rpe}` : null;
  return [sets ? `${sets} sets` : null, reps, rpe].filter(Boolean).join(", ") || "resistance work";
}

export type { ProgramProposalReviewView };
