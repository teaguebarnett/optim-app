"use client";

// One coach-correctable onboarding answer (e.g. target weight): what planning uses, the client's own answer when it
// differs, the recorded correction, and a correct / clear control. The client's answer itself is never changed.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { correctClientIntakeAnswerAction } from "@/app/actions/intake-corrections";
import type { IntakeCorrection } from "@/lib/coach/intake-corrections";

export function IntakeCorrectionRow(p: {
  workspaceId: string;
  clientProfileId: string;
  step: string;
  field: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** What planning uses (corrections applied; unseen-question answers dropped). */
  effective: number | null;
  /** The client's own answer, as they saved it. */
  clientValue: number | null;
  correction: IntakeCorrection | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(p.effective !== null ? String(p.effective) : "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fmt = (v: unknown) => (typeof v === "number" ? `${v} ${p.unit}` : "not specified");
  const save = (next: number | null) =>
    start(async () => {
      setError(null);
      const r = await correctClientIntakeAnswerAction({ workspaceId: p.workspaceId, clientProfileId: p.clientProfileId, step: p.step, field: p.field, value: next, reason });
      if (!r.ok) return setError(r.message);
      setEditing(false);
      setReason("");
      router.refresh();
    });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-neutral">{p.label}</dt>
        <dd className="flex items-center gap-2 text-off-white">
          {fmt(p.effective)}
          {!editing ? (
            <button type="button" className="text-xs font-medium text-accent" onClick={() => setEditing(true)}>
              Correct
            </button>
          ) : null}
        </dd>
      </div>
      {p.correction ? (
        <p className="text-meta text-neutral">
          You {p.correction.cleared ? "cleared" : "corrected"} this on {new Date(p.correction.correctedAtIso).toLocaleDateString()} — the client&apos;s answer was {fmt(p.correction.original)}. Reason: {p.correction.reason}
        </p>
      ) : p.clientValue !== null && p.effective === null ? (
        <p className="text-meta text-neutral">The client&apos;s saved answer ({fmt(p.clientValue)}) is ignored: that question wasn&apos;t shown for their goal.</p>
      ) : null}
      {editing ? (
        <div className="space-y-2 rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={p.min}
              max={p.max}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={`${p.label} (${p.unit})`}
              className="w-28 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 py-1.5 text-sm text-off-white"
            />
            <span className="text-meta text-neutral">{p.unit}</span>
          </div>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? (recorded with the change)"
            aria-label="Reason for the correction"
            className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 py-1.5 text-sm text-off-white"
          />
          {error ? <p role="alert" className="text-meta text-warning-strong">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={pending} disabled={pending || !reason.trim() || value.trim() === ""} onClick={() => save(Number(value))}>
              Save correction
            </Button>
            <Button size="sm" variant="secondary" disabled={pending || !reason.trim()} onClick={() => save(null)}>
              Clear it
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-meta text-neutral">The client&apos;s own answer is kept; planning uses your correction.</p>
        </div>
      ) : null}
    </div>
  );
}
