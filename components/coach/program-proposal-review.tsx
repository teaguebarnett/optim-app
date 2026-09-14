// Phase 8C/8D — Generated Program Review and Approval Workflow.
//
// The full-training-horizon coach review surface — every generated week is
// reviewable and editable through the SAME universal per-item form Phase 8C
// introduced for week 1 alone (see lib/training/program-proposal-editing.ts
// for why this required almost no new editing logic: week-1-only was a UI
// restriction, not an architectural one). Progressive disclosure via native
// <details> — week 1 open by default, every later week and every item's
// edit form collapsed until the coach opens it, so a 12-week program never
// forces hundreds of controls into view (or any client-side JS/round-trip)
// just to render. Plain coaching language throughout: no
// TrainingItemInstance, no schemaVersion, no prescription family enum ever
// surfaces here.

import { revalidatePath } from "next/cache";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  editProgramProposalItemAction,
  removeProgramProposalItemAction,
  addProgramProposalItemAction,
  moveProgramProposalBlockAction,
  renameProgramProposalSessionAction,
  convertProgramProposalDayToRestAction,
  approveProgramProposalAction,
  rejectProgramProposalAction,
  type ProgramProposalReviewView,
} from "@/app/actions/production-programs";
import type { TrainingItemPath, SessionPath, BlockPath, TrainingItemPatch } from "@/lib/training/program-proposal-editing";
import type { TrainingItemInstance, UniversalTrainingProgramContent, AdjustmentProvenance } from "@/lib/training/types";
import { describeIntervalOverview } from "@/lib/workout/interval";

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

/** A concise "what did OPTIM build?" summary — computed from week 1's
 * structure (which weeks of a periodized program) as the representative
 * training pattern (see this phase's completion report: dosage varies
 * week-to-week, the trained-days/session-name structure does not). */
function buildProgramOverview(content: UniversalTrainingProgramContent) {
  const week1 = content.weeks.find((w) => w.weekNumber === 1);
  const trainingDays = (week1?.days ?? []).filter((d) => d.type === "training");
  const restDays = (week1?.days ?? []).filter((d) => d.type === "rest").length;
  const sessionNames = trainingDays.flatMap((d) => (d.sessions ?? []).map((s) => `${d.dayOfWeek} — ${s.name}`));
  let resistanceItems = 0;
  let continuousItems = 0;
  let intervalItems = 0;
  for (const day of trainingDays) {
    for (const session of day.sessions ?? []) {
      for (const block of session.blocks) {
        for (const item of block.items) {
          if (item.category === "interval") intervalItems += 1;
          else if (item.category === "continuous") continuousItems += 1;
          else resistanceItems += 1;
        }
      }
    }
  }
  return { trainingDaysPerWeek: trainingDays.length, restDaysPerWeek: restDays, sessionNames, resistanceItems, continuousItems, intervalItems };
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

  function editActionFor(path: TrainingItemPath, category: "resistance" | "continuous" | "interval") {
    async function edit(formData: FormData) {
      "use server";
      const patch: TrainingItemPatch =
        category === "continuous"
          ? {
              name: stringOrUndefined(formData, "name"),
              durationSeconds: numberOrUndefined(formData, "durationSeconds"),
              distanceValue: numberOrUndefined(formData, "distanceValue"),
              distanceUnit: stringOrUndefined(formData, "distanceUnit") as TrainingItemPatch["distanceUnit"],
              heartRateLow: numberOrUndefined(formData, "heartRateLow"),
              heartRateHigh: numberOrUndefined(formData, "heartRateHigh"),
              rpe: numberOrUndefined(formData, "rpe"),
              paceValue: numberOrUndefined(formData, "paceValue"),
              paceUnit: stringOrUndefined(formData, "paceUnit") as TrainingItemPatch["paceUnit"],
            }
          : category === "interval"
            ? {
                name: stringOrUndefined(formData, "name"),
                rounds: numberOrUndefined(formData, "rounds"),
                workIntervalSeconds: numberOrUndefined(formData, "workIntervalSeconds"),
                recoveryIntervalSeconds: numberOrUndefined(formData, "recoveryIntervalSeconds"),
                distanceValue: numberOrUndefined(formData, "distanceValue"),
                distanceUnit: stringOrUndefined(formData, "distanceUnit") as TrainingItemPatch["distanceUnit"],
                recoveryDistanceValue: numberOrUndefined(formData, "recoveryDistanceValue"),
                recoveryDistanceUnit: stringOrUndefined(formData, "recoveryDistanceUnit") as TrainingItemPatch["recoveryDistanceUnit"],
                rpe: numberOrUndefined(formData, "rpe"),
                paceValue: numberOrUndefined(formData, "paceValue"),
                paceUnit: stringOrUndefined(formData, "paceUnit") as TrainingItemPatch["paceUnit"],
                heartRateLow: numberOrUndefined(formData, "heartRateLow"),
                heartRateHigh: numberOrUndefined(formData, "heartRateHigh"),
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
                warmupSets: numberOrUndefined(formData, "warmupSets"),
              };
      await editProgramProposalItemAction({ workspaceId, clientProfileId, versionId: proposal.versionId, path, patch });
      await revalidate();
    }
    return edit;
  }

  function removeActionFor(path: TrainingItemPath) {
    async function remove() {
      "use server";
      await removeProgramProposalItemAction({ workspaceId, clientProfileId, versionId: proposal.versionId, path });
      await revalidate();
    }
    return remove;
  }

  function moveBlockActionFor(path: BlockPath, direction: "up" | "down") {
    async function move() {
      "use server";
      await moveProgramProposalBlockAction({ workspaceId, clientProfileId, versionId: proposal.versionId, path, direction });
      await revalidate();
    }
    return move;
  }

  function renameActionFor(path: SessionPath) {
    async function rename(formData: FormData) {
      "use server";
      const name = stringOrUndefined(formData, "name");
      if (!name) return;
      await renameProgramProposalSessionAction({ workspaceId, clientProfileId, versionId: proposal.versionId, path, name });
      await revalidate();
    }
    return rename;
  }

  function convertToRestActionFor(weekNumber: number, dayOfWeek: TrainingItemPath["dayOfWeek"]) {
    async function convert() {
      "use server";
      await convertProgramProposalDayToRestAction({ workspaceId, clientProfileId, versionId: proposal.versionId, weekNumber, dayOfWeek });
      await revalidate();
    }
    return convert;
  }

  function addItemActionFor(sessionPath: SessionPath) {
    async function add(formData: FormData) {
      "use server";
      const name = stringOrUndefined(formData, "newItemName");
      const category = stringOrUndefined(formData, "newItemCategory") as "resistance" | "continuous" | undefined;
      if (!name || !category) return;
      await addProgramProposalItemAction({ workspaceId, clientProfileId, versionId: proposal.versionId, sessionPath, name, category });
      await revalidate();
    }
    return add;
  }

  const overview = buildProgramOverview(proposal.content);
  const adjustment = proposal.content.adjustmentProvenance;

  return (
    <Card id="proposal-review" className="border-l-2 border-l-accent">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-off-white">
            {adjustment ? "OPTIM proposes an adjustment" : `Proposed program ${proposal.wasEdited ? "(edited)" : "(as generated)"} — ${proposal.content.durationWeeks} weeks`}
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

      {adjustment ? <AdjustmentProposalBanner adjustment={adjustment} /> : null}

      <div className="mb-3 rounded border border-border-strong bg-surface-raised px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">What OPTIM built</p>
        <p className="mt-1 text-xs text-off-white">
          {proposal.content.durationWeeks} weeks · {overview.trainingDaysPerWeek} training days/week · {overview.restDaysPerWeek} rest days/week · {overview.resistanceItems} resistance items · {overview.continuousItems} continuous items · {overview.intervalItems} interval items (week 1 pattern)
        </p>
        {overview.sessionNames.length > 0 ? <p className="mt-1 text-xs text-neutral">{overview.sessionNames.join(" · ")}</p> : null}
      </div>

      <RuleProvenanceSection proposal={proposal} />

      {proposal.changesSummary.length > 0 ? (
        <div className="mb-3 rounded border border-border-strong bg-surface-raised px-3 py-2">
          <p className="text-xs font-medium text-off-white">
            {proposal.changesSummary.length} change{proposal.changesSummary.length === 1 ? "" : "s"} from OPTIM&apos;s original proposal:
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-neutral">
            {proposal.changesSummary.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      ) : null}

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

      <div className="space-y-2">
        {proposal.content.weeks.map((week) => {
          const trainingDays = week.days.filter((d) => d.type === "training");
          const restDays = week.days.filter((d) => d.type === "rest");
          return (
            <details key={week.weekNumber} className="rounded border border-border-strong" open={week.weekNumber === 1}>
              <summary className="cursor-pointer px-2.5 py-2 text-xs font-medium uppercase tracking-wide text-neutral">
                Week {week.weekNumber} — {trainingDays.length} training day{trainingDays.length === 1 ? "" : "s"}, {restDays.length} rest
              </summary>
              <div className="space-y-2.5 px-2.5 pb-2.5">
                {trainingDays.map((day) => (
                  <div key={day.dayOfWeek} className="rounded border border-border-strong p-2.5">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-off-white">{day.dayOfWeek}</p>
                      <form action={convertToRestActionFor(week.weekNumber, day.dayOfWeek)}>
                        <Button type="submit" variant="ghost" size="sm">
                          Convert to rest day
                        </Button>
                      </form>
                    </div>
                    <div className="space-y-2">
                      {(day.sessions ?? []).map((session, sessionIndex) => {
                        const sessionPath: SessionPath = { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex };
                        return (
                          <div key={`${day.dayOfWeek}-${sessionIndex}`} className="rounded bg-surface-raised p-2">
                            <form action={renameActionFor(sessionPath)} className="mb-2 flex flex-wrap items-end gap-2">
                              <label className="flex flex-col text-xs text-neutral">
                                Session name
                                <input type="text" name="name" defaultValue={session.name} className="w-48 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
                              </label>
                              <Button type="submit" variant="secondary" size="sm">
                                Rename
                              </Button>
                            </form>
                            <div className="space-y-2">
                              {[...session.blocks]
                                .sort((a, b) => a.order - b.order)
                                .map((block, blockIndex, sortedBlocks) => (
                                <div key={block.id} className="space-y-2">
                                  {block.items.map((item) => {
                                    const path: TrainingItemPath = { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex, blockId: block.id, itemId: item.id };
                                    const blockPath: BlockPath = { weekNumber: week.weekNumber, dayOfWeek: day.dayOfWeek, sessionIndex, blockId: block.id };
                                    const editCategory: "resistance" | "continuous" | "interval" = item.category === "interval" ? "interval" : item.category === "continuous" ? "continuous" : "resistance";
                                    return (
                                      <details key={item.id} className="rounded border border-border px-2.5 py-2">
                                        <summary className="cursor-pointer text-sm text-off-white">
                                          {item.name} — {describeItem(item)}
                                        </summary>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                          {blockIndex > 0 ? (
                                            <form action={moveBlockActionFor(blockPath, "up")}>
                                              <Button type="submit" variant="ghost" size="sm">
                                                Move up
                                              </Button>
                                            </form>
                                          ) : null}
                                          {blockIndex < sortedBlocks.length - 1 ? (
                                            <form action={moveBlockActionFor(blockPath, "down")}>
                                              <Button type="submit" variant="ghost" size="sm">
                                                Move down
                                              </Button>
                                            </form>
                                          ) : null}
                                          <form action={removeActionFor(path)}>
                                            <Button type="submit" variant="ghost" size="sm">
                                              Remove
                                            </Button>
                                          </form>
                                        </div>
                                        <form action={editActionFor(path, editCategory)} className="mt-2 flex flex-wrap items-end gap-2">
                                          <label className="flex flex-col text-xs text-neutral">
                                            Name
                                            <input type="text" name="name" defaultValue={item.name} className="w-40 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
                                          </label>
                                          {editCategory === "interval" ? (
                                            <>
                                              <NumField label="Rounds" name="rounds" defaultValue={item.prescription.rounds} />
                                              <NumField label="Work (sec)" name="workIntervalSeconds" defaultValue={item.prescription.workInterval?.seconds} />
                                              <NumField label="Recovery (sec)" name="recoveryIntervalSeconds" defaultValue={item.prescription.recoveryInterval?.seconds} />
                                              <NumField label="Work distance" name="distanceValue" defaultValue={item.prescription.distance?.value} />
                                              <label className="flex flex-col text-xs text-neutral">
                                                Unit
                                                <select name="distanceUnit" defaultValue={item.prescription.distance?.unit ?? "m"} className="rounded border border-border-strong bg-surface px-2 py-1 text-off-white">
                                                  <option value="m">m</option>
                                                  <option value="km">km</option>
                                                  <option value="mi">mi</option>
                                                </select>
                                              </label>
                                              <NumField label="Recovery distance" name="recoveryDistanceValue" defaultValue={item.prescription.recoveryDistance?.value} />
                                              <label className="flex flex-col text-xs text-neutral">
                                                Unit
                                                <select name="recoveryDistanceUnit" defaultValue={item.prescription.recoveryDistance?.unit ?? "m"} className="rounded border border-border-strong bg-surface px-2 py-1 text-off-white">
                                                  <option value="m">m</option>
                                                  <option value="km">km</option>
                                                  <option value="mi">mi</option>
                                                </select>
                                              </label>
                                              <NumField label="RPE" name="rpe" defaultValue={item.prescription.rpe} />
                                              <NumField label="Pace" name="paceValue" defaultValue={item.prescription.pace?.value} />
                                              <label className="flex flex-col text-xs text-neutral">
                                                Pace unit
                                                <select name="paceUnit" defaultValue={item.prescription.pace?.unit ?? "min_per_mi"} className="rounded border border-border-strong bg-surface px-2 py-1 text-off-white">
                                                  <option value="min_per_mi">min/mi</option>
                                                  <option value="min_per_km">min/km</option>
                                                </select>
                                              </label>
                                              <NumField label="HR low" name="heartRateLow" defaultValue={item.prescription.heartRate?.low} />
                                              <NumField label="HR high" name="heartRateHigh" defaultValue={item.prescription.heartRate?.high} />
                                            </>
                                          ) : editCategory === "continuous" ? (
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
                                              <NumField label="Pace" name="paceValue" defaultValue={item.prescription.pace?.value} />
                                              <label className="flex flex-col text-xs text-neutral">
                                                Pace unit
                                                <select name="paceUnit" defaultValue={item.prescription.pace?.unit ?? "min_per_mi"} className="rounded border border-border-strong bg-surface px-2 py-1 text-off-white">
                                                  <option value="min_per_mi">min/mi</option>
                                                  <option value="min_per_km">min/km</option>
                                                </select>
                                              </label>
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
                                              <NumField label="Warmup sets" name="warmupSets" defaultValue={item.prescription.warmupSets} />
                                              <label className="flex flex-col text-xs text-neutral">
                                                Warmup instruction
                                                <input type="text" name="warmupInstruction" defaultValue={item.prescription.warmupInstruction ?? ""} className="w-40 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
                                              </label>
                                            </>
                                          )}
                                          <Button type="submit" variant="secondary" size="sm">
                                            Save change
                                          </Button>
                                        </form>
                                      </details>
                                    );
                                  })}
                                </div>
                              ))}
                              <form action={addItemActionFor(sessionPath)} className="flex flex-wrap items-end gap-2 pt-1">
                                <label className="flex flex-col text-xs text-neutral">
                                  Add exercise — name
                                  <input type="text" name="newItemName" className="w-40 rounded border border-border-strong bg-transparent px-2 py-1 text-off-white" />
                                </label>
                                <label className="flex flex-col text-xs text-neutral">
                                  Type
                                  <select name="newItemCategory" defaultValue="resistance" className="rounded border border-border-strong bg-surface px-2 py-1 text-off-white">
                                    <option value="resistance">Resistance</option>
                                    <option value="continuous">Continuous</option>
                                  </select>
                                </label>
                                <Button type="submit" variant="ghost" size="sm">
                                  Add exercise
                                </Button>
                              </form>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
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

const ADJUSTMENT_SCOPE_LABELS: Record<string, string> = {
  temporary: "Temporary — next session only",
  current_block: "Current training block",
  program_level: "Remainder of the program",
};

/** Phase 10B — the coach-facing "why/what/scope" summary for an
 * adjustment proposal (spec section 22/58). Reuses the proposal's own
 * real, already-conservative rationale text verbatim (never rewritten
 * into a stronger claim) and lists exactly the real changes that were
 * made — never a generic "OPTIM adjusted your program." The coach still
 * approves/edits/rejects through the exact same controls as any other
 * proposal below — this is explanation, not a second decision surface. */
function AdjustmentProposalBanner({ adjustment }: { adjustment: AdjustmentProvenance }) {
  return (
    <div className="mb-3 space-y-2 rounded border border-border-strong bg-surface-raised px-3 py-2.5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Why</p>
        <p className="mt-1 text-xs text-off-white">{adjustment.rationale}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Proposed</p>
        <ul className="mt-1 space-y-0.5 text-xs text-off-white">
          {adjustment.changeDescriptions.map((c, i) => (
            <li key={i}>
              • Week {c.weekNumber} / {c.dayOfWeek}: {c.description}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral">Scope</p>
        <p className="mt-1 text-xs text-off-white">{ADJUSTMENT_SCOPE_LABELS[adjustment.scope] ?? adjustment.scope}</p>
      </div>
    </div>
  );
}

/** Phase 10A — subtle, bounded rule provenance (spec section 17/19/20).
 * Renders nothing at all when the proposal carries no provenance — never
 * a placeholder claiming OPTIM "used your preferences" when it didn't.
 * Deliberately distinguishes a confirmed LEARNED preference (this
 * section) from the coach's EXPLICIT methodology setup (never relabeled
 * as "learned" — spec section 19): every base value a rule nudges was
 * already methodology-derived before the rule ever touched it, so this
 * only ever describes the nudge, never claims credit for the whole
 * decision. Client-specific rules are labeled as such, never presented as
 * general methodology (spec section 21). The methodology-conflict note is
 * a separate, even quieter <details> — only rendered when a confirmed
 * preference existed but explicit setup took priority (spec section 20:
 * "default toward silence"). */
function RuleProvenanceSection({ proposal }: { proposal: ProgramProposalReviewView }) {
  if (proposal.appliedRuleProvenance.length === 0 && proposal.methodologyConflictedRuleProvenance.length === 0) return null;
  return (
    <>
      {proposal.appliedRuleProvenance.length > 0 ? (
        <details className="mb-3 rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-off-white">
            Based on {proposal.appliedRuleProvenance.length} confirmed coaching preference{proposal.appliedRuleProvenance.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-2">
            {proposal.appliedRuleProvenance.map((rule) => (
              <li key={rule.id} className="text-xs">
                <p className="text-off-white">{rule.summary}</p>
                <p className="mt-0.5 text-neutral">
                  {rule.scope === "client_specific" ? "A coaching preference confirmed for this client specifically" : "A general confirmed coaching preference"}
                  {rule.status !== "active" ? " — since turned off (this proposal still reflects it accurately, as generated)" : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {proposal.methodologyConflictedRuleProvenance.length > 0 ? (
        <details className="mb-3 rounded border border-border-strong bg-surface-raised px-3 py-2">
          <summary className="cursor-pointer text-xs text-neutral">A confirmed preference wasn&apos;t applied here</summary>
          <ul className="mt-2 space-y-1 text-xs text-neutral">
            {proposal.methodologyConflictedRuleProvenance.map((rule) => (
              <li key={rule.id}>{rule.summary} — not applied, because it falls outside your explicit coaching setup for this client.</li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
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
  // Phase 11A — reuses the exact same formatter the live client execution
  // panels render from (lib/workout/interval.ts), never a second
  // independently-drifting description — "8 rounds, 400 m work / 200 m
  // recovery, Target pace 1:42/km", never raw JSON (spec section 21).
  if (item.category === "interval") return describeIntervalOverview(item.prescription).join(", ") || "interval work";
  if (item.category === "continuous") {
    const d = item.prescription.duration ? `${Math.round(item.prescription.duration.seconds / 60)} min` : null;
    const dist = item.prescription.distance ? `${item.prescription.distance.value} ${item.prescription.distance.unit}` : null;
    const hr = item.prescription.heartRate ? `HR ${item.prescription.heartRate.low}-${item.prescription.heartRate.high}` : null;
    const pace = item.prescription.pace ? `${item.prescription.pace.value} ${item.prescription.pace.unit === "min_per_km" ? "min/km" : "min/mi"}` : null;
    return [d, dist, hr, pace].filter(Boolean).join(", ") || "continuous work";
  }
  const sets = item.prescription.sets;
  const reps = item.prescription.reps ? `${item.prescription.reps.low}-${item.prescription.reps.high} reps` : null;
  const rpe = item.prescription.rpe ? `RPE ${item.prescription.rpe}` : null;
  return [sets ? `${sets} sets` : null, reps, rpe].filter(Boolean).join(", ") || "resistance work";
}

export type { ProgramProposalReviewView };
