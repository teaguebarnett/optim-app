"use client";

import { useState } from "react";
import { Scale, Pencil } from "lucide-react";
import { TaskShell } from "@/components/today/task-shell";
import { NumberField } from "@/components/ui/number-field";
import { Button } from "@/components/ui/button";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { isValidWeight } from "@/lib/calculations";
import type { DailyTaskState } from "@/lib/types";

export function MorningWeightTask({
  state,
  emphasisOverride,
}: {
  state: DailyTaskState;
  emphasisOverride?: "primary" | "secondary";
}) {
  const { state: appState, dispatch, activeContext } = usePrototypeState();
  const { morningWeight } = appState;
  const previousWeightLb = activeContext.clientProfile?.previousWeightLb ?? null;
  const [draft, setDraft] = useState<number | "">("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const isLogged = morningWeight.weightLb !== null;

  function handleSave() {
    if (draft === "") {
      setError("Enter your weight to save it.");
      return;
    }
    if (!isValidWeight(draft)) {
      setError("Enter a realistic weight between 60 and 600 lb.");
      return;
    }
    dispatch({ type: "SET_MORNING_WEIGHT", weightLb: draft });
    setEditing(false);
    setError(null);
    setJustSaved(true);
  }

  if ((isLogged || morningWeight.skipped) && !editing) {
    return (
      <TaskShell title="Morning weight" icon={<Scale size={17} />} state={state} emphasisOverride={emphasisOverride}>
        {isLogged ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold text-off-white">{morningWeight.weightLb} lb</p>
              {justSaved ? (
                <p className="mt-1 text-sm text-success">
                  Logged. Weekly trends matter more than a single morning.
                </p>
              ) : previousWeightLb !== null ? (
                <p className="mt-1 text-sm text-neutral">Previous: {previousWeightLb} lb</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(morningWeight.weightLb ?? "");
                setEditing(true);
                setJustSaved(false);
              }}
            >
              <Pencil size={14} />
              Edit
            </Button>
          </div>
        ) : (
          <p className="text-sm text-neutral">Skipped for today. You can still log it later if you&apos;d like.</p>
        )}
      </TaskShell>
    );
  }

  return (
    <TaskShell
      title="Morning weight"
      icon={<Scale size={17} />}
      state={state}
      emphasisOverride="secondary"
    >
      {previousWeightLb !== null ? (
        <p className="mb-3 text-sm text-neutral">Previous recorded weight: {previousWeightLb} lb</p>
      ) : null}
      <NumberField
        id="morning-weight"
        label="Today's weight"
        value={draft}
        onChange={(v) => {
          setDraft(v);
          setError(null);
        }}
        step={0.2}
        min={60}
        max={600}
        suffix="lb"
        placeholder={previousWeightLb !== null ? String(previousWeightLb) : undefined}
        errorText={error ?? undefined}
      />
      <div className="mt-3 flex gap-2">
        <Button onClick={handleSave} className="flex-1">
          Save
        </Button>
        {editing ? (
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => {
              dispatch({ type: "SKIP_MORNING_WEIGHT" });
              setError(null);
            }}
          >
            Skip
          </Button>
        )}
      </div>
    </TaskShell>
  );
}
