"use client";

// Client setup -> Training program -> Generate proposal. Shows exactly what
// is missing before OPTIM may build a program (a confirmed coaching method,
// completed intake, a resolved health review — lib/coach/
// generation-prerequisites.ts), with links to the screens that resolve
// each, and pending / success / error feedback. The server enforces the
// same prerequisites; this form only reflects them.

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MissingPrerequisite } from "@/lib/coach/generation-prerequisites";
import type { SaveResult } from "@/components/coach/live-start-date-form";

export function LiveProposalGenerateForm({
  action,
  missing,
  programLengthHint = null,
}: {
  action: (prev: SaveResult, formData: FormData) => Promise<SaveResult>;
  missing: MissingPrerequisite[];
  /** Gate 3.1 — the coach's usual program length from their method. */
  programLengthHint?: { min: number; max: number | null; preferred: number | null } | null;
}) {
  const [weeks, setWeeks] = useState<string>(programLengthHint ? (programLengthHint.preferred !== null ? String(programLengthHint.preferred) : "") : "4");
  const weeksNumber = Number(weeks);
  const outsideUsual = !!programLengthHint && weeks !== "" && Number.isFinite(weeksNumber) && (weeksNumber < programLengthHint.min || (programLengthHint.max !== null && weeksNumber > programLengthHint.max));
  const usualLabel = programLengthHint ? (programLengthHint.max === null ? `${programLengthHint.min}+` : programLengthHint.min === programLengthHint.max ? String(programLengthHint.min) : `${programLengthHint.min}–${programLengthHint.max}`) : null;
  const [result, formAction, pending] = useActionState(action, null);
  const blocked = missing.length > 0;

  return (
    <div className="space-y-3">
      {blocked ? (
        <div className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2.5">
          <p className="text-sm font-medium text-off-white">Before OPTIM can build a program:</p>
          <ul className="mt-1.5 space-y-1.5">
            {missing.map((m) => (
              <li key={m.id} className="text-sm text-neutral">
                {m.message}{" "}
                {m.href && m.linkLabel ? (
                  <Link href={m.href} className="font-medium text-accent-fg hover:underline">
                    {m.linkLabel}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <form action={formAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-neutral">
          Program name
          <input type="text" name="title" required defaultValue="Training program" className="w-full rounded border border-border-strong bg-transparent px-2 py-1.5 text-sm text-off-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral">
          Weeks
          <input type="number" name="durationWeeks" required value={weeks} onChange={(e) => setWeeks(e.target.value)} min={1} max={20} step={1} className="w-24 rounded border border-border-strong bg-transparent px-2 py-1.5 text-sm text-off-white" />
        </label>
        <Button type="submit" variant="primary" size="sm" loading={pending} disabled={blocked}>
          {pending ? "Generating…" : "Generate proposal"}
        </Button>
      </form>
      {usualLabel ? <p className="text-xs text-neutral">Your usual program length: {usualLabel} weeks.{outsideUsual ? " This is outside it — that's fine if it's intentional." : ""}</p> : null}
      {result ? (
        <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-error"}`}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
