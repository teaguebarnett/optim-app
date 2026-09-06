"use client";

import { useState } from "react";
import { Sparkles, ShieldAlert, CheckCircle2, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import {
  approveDailyBriefing,
  editDailyBriefingText,
  generateDailyBriefing,
  isBriefingVisibleToClient,
  publishDailyBriefing,
  resolveBriefingGenerationInput,
  type BriefingAutomationSetting,
  type DailyBriefingRecord,
} from "@/lib/coach/daily-briefing";
import { ensureBriefingBoundaryReview } from "@/lib/coach/briefing-escalation";
import type { AppState } from "@/lib/state";
import type { CoachProfileId } from "@/lib/tenancy/types";

const STATUS_LABEL: Record<DailyBriefingRecord["status"], string> = {
  draft: "Draft — not yet sent",
  held_for_review: "Held for your review",
  approved: "Approved — not yet published",
  scheduled: "Scheduled",
  published: "Published to client",
  auto_published: "Auto-published to client",
};

/**
 * The coach-controlled Daily Briefing workflow for exactly one client on
 * their own current day (spec §7): prepare (generate), preview, edit,
 * approve, publish. A sensitive-content hold always shows regardless of the
 * automation setting; an already-published/auto-published briefing still
 * shows here, read-only-by-default with an explicit Edit action, so a coach
 * can always see and correct what the client is currently seeing.
 */
export function DailyBriefingCard({
  clientAppState,
  briefing,
  coachId,
  coachName,
  automation,
  onSave,
}: {
  clientAppState: AppState | null;
  briefing: DailyBriefingRecord | null;
  coachId: CoachProfileId;
  coachName: string;
  automation: BriefingAutomationSetting;
  onSave: (record: DailyBriefingRecord) => void;
}) {
  const [draftText, setDraftText] = useState(briefing?.todaysEdgeText ?? "");
  const [editing, setEditing] = useState(false);

  if (!clientAppState) {
    return (
      <Card>
        <p className="text-subheading text-off-white">Today&apos;s Edge</p>
        <p className="mt-1.5 text-sm text-neutral">No live daily state yet — nothing to brief until this client is active.</p>
      </Card>
    );
  }

  function handlePrepare() {
    const nowIso = new Date().toISOString();
    const input = resolveBriefingGenerationInput(clientAppState!, coachId, automation, nowIso);
    const record = generateDailyBriefing(input);
    setDraftText(record.todaysEdgeText);
    onSave(record);
    // Spec §3 — a held-for-review briefing is exactly OPTIM reaching an
    // authority boundary, so it also surfaces in the unified attention
    // queue, not just this card.
    ensureBriefingBoundaryReview(clientAppState!.clientId, record, nowIso);
  }

  function handleSaveEdit() {
    if (!briefing) return;
    onSave(editDailyBriefingText(briefing, draftText, new Date().toISOString()));
    setEditing(false);
  }

  function handleApprove() {
    if (!briefing) return;
    onSave(approveDailyBriefing(briefing, coachId, coachName, new Date().toISOString()));
  }

  function handlePublish() {
    if (!briefing) return;
    onSave(publishDailyBriefing(briefing, new Date().toISOString()));
  }

  if (!briefing) {
    return (
      <Card className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
          <Sparkles size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-off-white">No Today&apos;s Edge prepared yet</p>
          <p className="mt-1 text-meta text-neutral">Generate today&apos;s short client-facing focus from their real program and status.</p>
          <Button size="sm" className="mt-3" onClick={handlePrepare}>
            Prepare today&apos;s briefing
          </Button>
        </div>
      </Card>
    );
  }

  const held = briefing.status === "held_for_review";
  const visible = isBriefingVisibleToClient(briefing.status);

  return (
    <Card className={held ? "border-l-2 border-l-error" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-subheading text-off-white">Today&apos;s Edge</p>
        <span className="flex items-center gap-1.5 text-meta text-neutral">
          {visible ? <CheckCircle2 size={13} className="text-success" aria-hidden="true" /> : null}
          {STATUS_LABEL[briefing.status]}
        </span>
      </div>

      {held && briefing.heldForReviewReason ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-[var(--radius-sm)] bg-error-soft px-3 py-2 text-sm text-error-strong">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {briefing.heldForReviewReason}
        </p>
      ) : null}

      {editing ? (
        <div className="mt-3 space-y-2">
          <TextArea id={`briefing-edit-${briefing.id}`} label="Client-facing text" value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={3} />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveEdit}>
              Save edit
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 rounded-[var(--radius-sm)] bg-surface-raised px-3 py-2.5 text-sm text-off-white">&ldquo;{briefing.todaysEdgeText}&rdquo;</p>
      )}

      {!editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {briefing.status === "draft" || briefing.status === "held_for_review" ? (
            <Button size="sm" onClick={handleApprove}>
              Approve
            </Button>
          ) : null}
          {briefing.status === "approved" ? (
            <Button size="sm" onClick={handlePublish}>
              <Send size={13} aria-hidden="true" /> Publish
            </Button>
          ) : null}
          {visible ? (
            <Button size="sm" variant="secondary" onClick={handlePrepare}>
              Regenerate
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
