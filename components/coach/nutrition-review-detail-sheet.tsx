"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import {
  moveReviewToWaiting,
  requiresClientNotificationBeforeResolution,
  requiresResolutionNote,
  resolveReviewRequest,
  reopenReviewRequest,
  startReviewRequest,
} from "@/lib/coach/review-lifecycle";
import { applyCoachApprovedSubstitution, resolutionOutcomeVerb } from "@/lib/coach/nutrition-authoring";
import { getAiAuthoritySettings } from "@/lib/coach/repository";
import { resolveSubstitutionDisposition, BOUNDED_SUBSTITUTION_RULES } from "@/lib/nutrition/substitution";
import { mealOptionHasIngredient, mealDisplayName, mealProvenanceLabel } from "@/lib/nutrition/view-model";
import { loadClientAppState } from "@/lib/tenancy/client-state-store";
import { MEAL_OPTIONS, MEAL_PERIOD_LABELS } from "@/lib/mock-data";
import type { AttentionQueueItem } from "@/lib/coach/types";
import type { PlatformState } from "@/lib/coach/platform-store";
import type { CoachProfileId } from "@/lib/tenancy/types";
import type { MacroValues } from "@/lib/types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Correction-pass MealSummary's own "—" convention, reused here so the
 * coach sees a client's partial evidence exactly as honestly as the client
 * themselves does — never a real 0 standing in for a field never entered. */
function macroField(macros: MacroValues, field: keyof MacroValues, unit: string, unknownFields: (keyof MacroValues)[] | undefined): string {
  return unknownFields?.includes(field) ? `—${unit}` : `${Math.round(macros[field])}${unit}`;
}

/**
 * Gate 3C — the nutrition-aware sibling of ReviewDetailSheet, shown instead
 * of it (see app/coach/reviews/page.tsx) only for a review carrying
 * `nutritionContext` (see ReviewRequest's own doc). Everything about the
 * underlying review lifecycle — start/resolve/wait/reopen, the resolution-
 * receipt gate for a "significant" kind — is the exact same
 * lib/coach/review-lifecycle.ts this workspace already uses everywhere
 * else; this sheet only ever ADDS the structured evidence/proposal panel
 * and, when a specific registered rule was requested, a real "Approve
 * substitution" action that logs through the exact same
 * describeSubstitutionLog contract the client's own auto-execute path uses.
 */
export function NutritionReviewDetailSheet({
  item,
  coachId,
  coachName,
  platform,
  onClose,
  onChanged,
}: {
  item: AttentionQueueItem | null;
  coachId: CoachProfileId;
  coachName: string;
  platform: PlatformState;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  if (!item || !item.nutritionContext) return null;

  const { period, ruleId } = item.nutritionContext;
  const periodLabel = MEAL_PERIOD_LABELS[period];
  const clientAppState = loadClientAppState(item.clientId);
  const evidence = clientAppState?.meals[period];
  const evidenceName = clientAppState ? mealDisplayName(period, evidence) : null;
  const evidenceProvenance = clientAppState ? mealProvenanceLabel(evidence) : null;
  const evidenceUnknownFields = evidence?.source === "manual" ? evidence.unknownMacroFields : undefined;

  const rule = ruleId ? (BOUNDED_SUBSTITUTION_RULES.find((r) => r.id === ruleId) ?? null) : null;
  const evidenceOption = evidence?.source === "option" ? (MEAL_OPTIONS[period].find((o) => o.id === evidence.optionId) ?? null) : null;
  const ruleApplicable = rule ? mealOptionHasIngredient(evidenceOption, rule.fromLabel) : false;
  const authoritySettings = clientAppState ? getAiAuthoritySettings(platform, clientAppState.primaryCoachId, clientAppState.workspaceId) : null;
  const disposition = rule && authoritySettings ? resolveSubstitutionDisposition(rule, authoritySettings, item.clientId) : null;

  const canApprove = !!rule && ruleApplicable && !!evidence?.macros;

  // A nutrition review's kind is always "program-change-request" in
  // practice (see components/meals/meal-selection-sheet.tsx's
  // escalateToCoach, the only place nutritionContext is ever set) — this
  // guard exists only so TypeScript can see that, mirroring
  // ReviewDetailSheet's own identical guard for the two synthetic kinds
  // (health_review, plan_approval) that never carry a real ReviewRequestKind.
  const noteRequired = item.kind !== "health_review" && item.kind !== "plan_approval" && requiresResolutionNote(item.kind);
  const notificationRequired = item.kind !== "health_review" && item.kind !== "plan_approval" && requiresClientNotificationBeforeResolution(item.kind);
  const noteBlocksResolution = noteRequired && note.trim().length === 0;
  const messageBlocksResolution = notificationRequired && clientMessage.trim().length === 0;

  function handleStart() {
    startReviewRequest(item!.clientId, item!.reviewRequestId, new Date().toISOString());
    onChanged();
  }

  function handleReopen() {
    reopenReviewRequest(item!.clientId, item!.reviewRequestId, new Date().toISOString());
    onChanged();
  }

  function handleMoveToWaiting() {
    moveReviewToWaiting({
      clientId: item!.clientId,
      reviewId: item!.reviewRequestId,
      waitingOn: note.trim() || "Coach still deciding what to tell the client",
      actorLabel: coachName,
      nowIso: new Date().toISOString(),
    });
    onChanged();
  }

  function resolve(action: "reviewed_no_change" | "resolved", whatChanged?: string) {
    if (noteBlocksResolution || messageBlocksResolution) return;
    setBlockedReason(null);
    const result = resolveReviewRequest({
      clientId: item!.clientId,
      reviewId: item!.reviewRequestId,
      resolutionAction: action,
      resolutionNote: note.trim() || undefined,
      resolvedByCoachId: coachId,
      resolvedByCoachName: coachName,
      clientMessage: notificationRequired ? clientMessage.trim() : undefined,
      whatChanged,
      nowIso: new Date().toISOString(),
    });
    if (!result.ok) {
      setBlockedReason("Tell the client what this means before resolving — or move this to Waiting until you're ready.");
      return;
    }
    setNote("");
    setClientMessage("");
    onChanged();
  }

  function handleApprove() {
    if (!rule || !evidence?.macros) return;
    const applied = applyCoachApprovedSubstitution({ clientId: item!.clientId, period, ruleId: rule.id, originalMacros: evidence.macros });
    if (!applied.ok) {
      setBlockedReason("Couldn't apply this swap — the registered rule may have changed.");
      return;
    }
    resolve("resolved", `Approved: ${rule.toLabel} instead of ${rule.fromLabel}, logged for ${periodLabel.toLowerCase()}.`);
  }

  return (
    <Sheet open onClose={onClose} title={item.clientName} description={`Nutrition — ${periodLabel}`}>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-off-white">{item.summary}</p>
          <p className="mt-2 text-meta text-neutral">Flagged {formatTimestamp(item.createdAtIso)}</p>
        </div>

        {/* -- Evidence: the client's actual logged (or missing) meal -- */}
        <div className="rounded-[var(--radius-sm)] border border-border bg-surface-raised p-3.5">
          <p className="text-label text-neutral">Client&apos;s actual evidence</p>
          {!clientAppState ? (
            <p className="mt-1 text-sm text-neutral">No real state for this client yet.</p>
          ) : !evidence ? (
            <p className="mt-1 text-sm text-off-white">Unlogged — nothing recorded for {periodLabel.toLowerCase()} yet.</p>
          ) : evidence.source === "skipped" ? (
            <p className="mt-1 text-sm text-off-white">Skipped.</p>
          ) : evidence.source === "planned-later" ? (
            <p className="mt-1 text-sm text-off-white">Planned for later — not yet logged.</p>
          ) : (
            <div className="mt-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-off-white">{evidenceName ?? periodLabel}</p>
                {evidenceProvenance ? <span className="shrink-0 rounded-full bg-brass-soft px-2 py-0.5 text-label text-brass-strong">{evidenceProvenance}</span> : null}
              </div>
              {evidence.macros ? (
                <p className="mt-1 text-sm text-neutral">
                  {macroField(evidence.macros, "calories", " cal", evidenceUnknownFields)} · {macroField(evidence.macros, "proteinG", "g P", evidenceUnknownFields)} ·{" "}
                  {macroField(evidence.macros, "carbsG", "g C", evidenceUnknownFields)} · {macroField(evidence.macros, "fatG", "g F", evidenceUnknownFields)}
                </p>
              ) : null}
              {evidenceUnknownFields && evidenceUnknownFields.length > 0 ? <p className="mt-0.5 text-meta text-neutral">Some values weren&apos;t entered by the client.</p> : null}
            </div>
          )}
        </div>

        {/* -- Proposal: the specific registered swap, if one was asked about.
         * Gate 3C correction — once resolved, this is history: the original
         * proposal and decision, never re-litigated against whatever the
         * meal looks like now. An approved swap replaces the evidence
         * itself (see applyCoachApprovedSubstitution), so re-running the
         * ingredient-applicability check here after resolution would flag
         * the very swap that was just approved and logged. That check stays
         * live only while the proposal is still pending a decision. */}
        {rule ? (
          <div className="rounded-[var(--radius-sm)] border border-border bg-surface-raised p-3.5">
            <p className="text-label text-neutral">OPTIM&apos;s proposal</p>
            <p className="mt-1 text-sm font-medium text-off-white">
              {rule.fromLabel} → {rule.toLabel}
            </p>
            <p className="mt-1 text-meta text-neutral">{rule.constraint}</p>
            {item.status !== "resolved" ? (
              !ruleApplicable ? (
                <p className="mt-2 text-meta text-warning">
                  This swap&apos;s source ingredient isn&apos;t part of what&apos;s currently logged for this meal — check with the client before approving.
                </p>
              ) : disposition ? (
                <p className="mt-2 text-meta text-neutral">Client-side authority would resolve this as: {disposition.replace("_", " ")}.</p>
              ) : null
            ) : null}
          </div>
        ) : null}

        {/* -- Action -- */}
        {item.status === "resolved" ? (
          <div className="rounded-[var(--radius-sm)] border border-border bg-surface-raised p-3.5">
            <p className="text-sm font-medium text-off-white">{item.resolutionAction === "reviewed_no_change" ? "Reviewed — no change needed" : "Resolved"}</p>
            {item.resolutionNote ? <p className="mt-1.5 text-sm text-neutral">{item.resolutionNote}</p> : null}
            {item.resolutionReceipt ? (
              <div className="mt-2 space-y-1 border-t border-border pt-2 text-meta text-neutral">
                <p>
                  {resolutionOutcomeVerb(item)} by {item.resolutionReceipt.approvedByCoachName}
                </p>
                <p>{item.resolutionReceipt.whatChanged}</p>
                {item.resolutionReceipt.clientCommunicated ? <p>Told {item.clientName.split(" ")[0]}: &ldquo;{item.resolutionReceipt.clientCommunicated}&rdquo;</p> : null}
              </div>
            ) : null}
            {item.resolvedAtIso ? <p className="mt-2 text-meta text-neutral">{formatTimestamp(item.resolvedAtIso)}</p> : null}
            <Button variant="secondary" className="mt-3 w-full" onClick={handleReopen}>
              Reopen
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {item.status === "needs_review" ? (
              <Button variant="secondary" className="w-full" onClick={handleStart}>
                Start review
              </Button>
            ) : item.status === "waiting" ? (
              <p className="text-label text-brass-strong">Waiting — {item.waitingOn ?? "on something you noted"}</p>
            ) : (
              <p className="text-label text-brass-strong">In progress</p>
            )}

            <TextArea
              id="nutrition-review-note"
              label="Resolution note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you decide, and why?"
              rows={2}
            />
            <TextArea
              id="nutrition-review-client-message"
              label={`Message to relay to ${item.clientName.split(" ")[0]} (required before resolving)`}
              value={clientMessage}
              onChange={(e) => setClientMessage(e.target.value)}
              placeholder="What should OPTIM tell them, on your behalf?"
              rows={2}
            />
            {blockedReason ? <p className="text-meta text-error">{blockedReason}</p> : null}

            {canApprove ? (
              <Button className="w-full" onClick={handleApprove} disabled={messageBlocksResolution && clientMessage.trim().length === 0}>
                Approve — log {rule!.toLabel} for {periodLabel.toLowerCase()}
              </Button>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => resolve("reviewed_no_change")} disabled={noteBlocksResolution || messageBlocksResolution}>
                Reviewed — no change needed
              </Button>
              <Button variant={canApprove ? "outline" : "primary"} onClick={() => resolve("resolved")} disabled={noteBlocksResolution || messageBlocksResolution}>
                {canApprove ? "Correct — resolve without approving" : "Resolve review"}
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={handleMoveToWaiting}>
              Move to waiting
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
