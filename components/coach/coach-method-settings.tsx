"use client";

// Gate 3 — Settings → Coaching method: the coach's active Coach Brain method.
//
// Gate 3.2 — for a method confirmed through the adaptive calibration, this IS
// the method editor (CoachMethodEditor): categories open in place and edit
// the canonical answers; a confirmed edit becomes one new version. The coach
// is never sent back through the calibration interview. A method confirmed
// before the adaptive calibration (v1, no v2 answers to edit) still refines
// once through the interview, unchanged.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MethodSummaryGrid } from "@/components/coach-onboarding/method-summary";
import { CoachMethodEditor } from "@/components/coach/coach-method-editor";
import { startMethodReviewAction } from "@/app/actions/coach-calibration";
import type { CoachOperatingModel } from "@/lib/coach/operating-model";
import type { CoachAiAuthoritySettings } from "@/lib/coach/ai-authority";

export function CoachMethodSettings({
  model,
  versionId,
  version,
  confirmedLabel,
  calibratedLabel,
  hasOpenReview,
  authority,
}: {
  model: CoachOperatingModel;
  versionId: string;
  version: number;
  confirmedLabel: string;
  calibratedLabel: string | null;
  hasOpenReview: boolean;
  authority: CoachAiAuthoritySettings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ version: number; changed: number } | null>(null);

  async function openReview() {
    setBusy(true);
    setError(null);
    const result = await startMethodReviewAction();
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push("/coach-onboarding");
  }

  if (model.calibration) {
    return (
      <div className="space-y-5">
        <StatusCard version={version} confirmedLabel={confirmedLabel} calibratedLabel={calibratedLabel} />
        {saved ? (
          <p role="status" className="rounded-[var(--radius-sm)] bg-success/10 px-3 py-2 text-meta text-off-white">
            Saved — version {saved.version} is now your active method ({saved.changed} setting{saved.changed === 1 ? "" : "s"} changed).
          </p>
        ) : null}
        <CoachMethodEditor
          key={versionId}
          activeAnswers={model.calibration.answers}
          baseVersionId={versionId}
          version={version}
          authority={authority}
          onSaved={(v, changed) => {
            setSaved({ version: v, changed });
            router.refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          <div>
            <p className="text-subheading text-off-white">Calibration complete · method active</p>
            <p className="mt-0.5 text-meta text-neutral">
              Version {version} · confirmed {confirmedLabel}
              {calibratedLabel && calibratedLabel !== confirmedLabel ? ` · first calibrated ${calibratedLabel}` : ""}
            </p>
            <p className="mt-1.5 max-w-xl text-meta text-neutral">OPTIM follows this method for everything it prepares for your clients. It never changes on its own — only when you confirm an update.</p>
          </div>
        </div>
        {/* A method from before the adaptive calibration: changing it means
            refining it (below). This only shows the method that's active now. */}
        <Button variant="secondary" onClick={() => document.getElementById("current-method-summary")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          View current method
        </Button>
      </div>
      {error ? <p role="alert" className="text-meta text-error-strong">{error}</p> : null}
      {
        <>
          {/* Gate 3.1 — a method confirmed before the adaptive calibration. It
              stays active; refining is optional and never automatic. */}
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-accent/30 bg-accent-soft p-4 sm:p-5">
            <div className="max-w-xl">
              <p className="text-subheading text-off-white">{hasOpenReview ? "Your refinement is in progress" : "Refine your method"}</p>
              <p className="mt-1 text-meta text-neutral">
                {hasOpenReview
                  ? "Pick up where you left off. Your current method stays active until you confirm the refined one."
                  : "OPTIM’s calibration now adapts to what you coach and captures ranges and “it depends” rules. Answers that kept their meaning carry over — you only confirm what changed and answer what’s new. Your current method stays active until you confirm."}
              </p>
            </div>
            <Button onClick={() => openReview()} disabled={busy}>
              {hasOpenReview ? "Continue refining" : "Refine your method"} <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
          <div id="current-method-summary" className="scroll-mt-24">
            <p className="mb-3 text-label text-neutral">Your current method</p>
            <MethodSummaryGrid model={model} />
          </div>
        </>
      }
    </div>
  );
}

function StatusCard({ version, confirmedLabel, calibratedLabel }: { version: number; confirmedLabel: string; calibratedLabel: string | null }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-charcoal p-4 sm:p-5">
      <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
      <div>
        <p className="text-subheading text-off-white">Calibration complete · method active</p>
        <p className="mt-0.5 text-meta text-neutral">
          Version {version} · last confirmed {confirmedLabel}
          {calibratedLabel && calibratedLabel !== confirmedLabel ? ` · first calibrated ${calibratedLabel}` : ""}
        </p>
        <p className="mt-1.5 max-w-xl text-meta text-neutral">OPTIM only changes this method when you confirm an update. Open any area below to edit it — nothing changes until you review and confirm.</p>
      </div>
    </div>
  );
}
