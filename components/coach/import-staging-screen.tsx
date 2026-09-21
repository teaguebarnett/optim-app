"use client";

// Gate 6B — Import Staging.
//
// The real, workspace-bound review surface for /coach/clients/import in
// Supabase mode. A client component (not a plain <form action>) on
// purpose: uploading a bad file, or a parse producing zero usable rows,
// needs to tell the coach something real — a plain server-action-bound
// form has nowhere to put that. Mirrors components/chat/live-chat-screen.tsx's
// own load/act/reload/notice pattern.
//
// What this screen can never do, visibly as well as structurally: send an
// invitation, or activate a client. There is no button here that does
// either — see lib/production/imports.ts's own doc for why "approved" (the
// status that would actually make a row eligible for activation) isn't
// implemented yet at all.

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, AlertTriangle, CheckCircle2, Loader2, X, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/progress/status-badge";
import {
  getImportBatchesAction,
  uploadImportCsvAction,
  correctStagedClientFieldAction,
  markStagedClientReadyAction,
  rejectStagedClientAction,
  cancelImportBatchAction,
} from "@/app/actions/coach-imports";
import type { ImportBatchView, StagedClientView, StagedClientFieldView } from "@/lib/production/imports";
import type { ImportBatchStatus, StagedClientStatus } from "@/lib/imports/types";
import { cn } from "@/lib/cn";

const BATCH_BADGE: Record<ImportBatchStatus, { label: string; tone: BadgeTone }> = {
  uploading: { label: "Uploading", tone: "accent" },
  processing: { label: "Processing", tone: "accent" },
  needs_review: { label: "Needs review", tone: "warning" },
  ready: { label: "Ready", tone: "success" },
  activated: { label: "Activated", tone: "success" },
  failed: { label: "Failed", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const STAGED_BADGE: Record<StagedClientStatus, { label: string; tone: BadgeTone }> = {
  needs_review: { label: "Needs review", tone: "warning" },
  ready: { label: "Ready", tone: "success" },
  approved: { label: "Approved", tone: "accent" },
  rejected: { label: "Rejected", tone: "neutral" },
};

const FIELD_LABELS: Record<string, string> = {
  display_name: "Name",
  invited_email: "Email",
  goal: "Goal",
  current_phase: "Program phase",
  current_week_index: "Program week",
  as_of_date: "As of date",
};

function fieldLabel(fieldKey: string): string {
  if (fieldKey.startsWith("extra:")) return fieldKey.slice("extra:".length);
  return FIELD_LABELS[fieldKey] ?? fieldKey;
}

function FieldRow({ field, onCorrect }: { field: StagedClientFieldView; onCorrect: (fieldId: string, fieldKey: string, value: string) => Promise<void> }) {
  const currentValue = (field.coachCorrection as string | null) ?? (typeof field.normalizedValue === "string" ? field.normalizedValue : null) ?? field.sourceValue ?? "";
  const [value, setValue] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const dirty = value !== currentValue;

  async function save() {
    setSaving(true);
    try {
      await onCorrect(field.id, field.fieldKey, value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-1.5 border-t border-border py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[140px_1fr_auto] sm:items-center sm:gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-off-white">{fieldLabel(field.fieldKey)}</span>
        {field.isAmbiguous ? <AlertTriangle size={13} className="shrink-0 text-warning" aria-label="Uncertain extraction" /> : null}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={field.sourceValue ?? ""}
        className="h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface-input px-3 text-sm text-off-white outline-none placeholder:text-neutral focus-visible:border-accent"
      />
      <Button size="sm" variant="secondary" disabled={!dirty || saving} onClick={save} className="justify-self-start sm:justify-self-auto">
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function StagedClientCard({
  staged,
  onCorrect,
  onMarkReady,
  onReject,
}: {
  staged: StagedClientView;
  onCorrect: (stagedClientId: string, fieldId: string, fieldKey: string, value: string) => Promise<void>;
  onMarkReady: (stagedClientId: string) => Promise<void>;
  onReject: (stagedClientId: string, currentStatus: StagedClientStatus) => Promise<void>;
}) {
  const [open, setOpen] = useState(staged.status === "needs_review");
  const [busy, setBusy] = useState(false);
  const badge = STAGED_BADGE[staged.status];
  const decided = staged.status === "ready" || staged.status === "rejected" || staged.status === "approved";

  return (
    <Card className="space-y-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-off-white">{staged.displayNameGuess || "Unnamed row"}</p>
          {staged.matchedClientProfileId ? (
            <p className="mt-0.5 text-meta text-warning">Looks like an existing client: {staged.matchedClientDisplayName ?? "unknown"}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge label={badge.label} tone={badge.tone} />
          <ChevronDown size={16} className={cn("text-neutral transition-transform", open && "rotate-180")} style={{ transitionDuration: "var(--motion-fast)" }} />
        </div>
      </button>

      {open ? (
        <div className="space-y-0.5">
          {staged.fields.map((f) => (
            <FieldRow key={f.id} field={f} onCorrect={(fieldId, fieldKey, value) => onCorrect(staged.id, fieldId, fieldKey, value)} />
          ))}

          {!decided ? (
            <div className="flex gap-2 border-t border-border pt-3">
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onMarkReady(staged.id);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Mark as ready
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onReject(staged.id, staged.status);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reject this row
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function BatchCard({
  batch,
  onCorrect,
  onMarkReady,
  onReject,
  onCancel,
}: {
  batch: ImportBatchView;
  onCorrect: (stagedClientId: string, fieldId: string, fieldKey: string, value: string) => Promise<void>;
  onMarkReady: (stagedClientId: string) => Promise<void>;
  onReject: (stagedClientId: string, currentStatus: StagedClientStatus) => Promise<void>;
  onCancel: (batchId: string, currentStatus: ImportBatchStatus) => Promise<void>;
}) {
  const badge = BATCH_BADGE[batch.status];
  const canCancel = ["uploading", "processing", "needs_review", "ready"].includes(batch.status);
  const [cancelling, setCancelling] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-off-white">{batch.fileName ?? "Untitled file"}</p>
          <p className="text-meta text-neutral">{new Date(batch.createdAtIso).toLocaleString()} · {batch.stagedClients.length} row{batch.stagedClients.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={badge.label} tone={badge.tone} />
          {canCancel ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true);
                try {
                  await onCancel(batch.id, batch.status);
                } finally {
                  setCancelling(false);
                }
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      {batch.parseErrors.length > 0 ? (
        <Card className="border-warning/40 bg-warning-soft/40">
          <p className="flex items-center gap-1.5 text-sm font-medium text-off-white">
            <AlertTriangle size={14} className="text-warning" /> {batch.parseErrors.length} row{batch.parseErrors.length === 1 ? "" : "s"} skipped
          </p>
          <ul className="mt-1.5 space-y-0.5 text-meta text-neutral">
            {batch.parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="space-y-2.5">
        {batch.stagedClients.map((staged) => (
          <StagedClientCard key={staged.id} staged={staged} onCorrect={onCorrect} onMarkReady={onMarkReady} onReject={onReject} />
        ))}
      </div>
    </div>
  );
}

export function ImportStagingScreen() {
  const [batches, setBatches] = useState<ImportBatchView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setBatches(await getImportBatchesAction());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadImportCsvAction(formData);
      if (result.kind === "error") {
        setNotice({ tone: "warn", text: result.parseErrors?.length ? `${result.message} ${result.parseErrors.join(" ")}` : result.message });
      } else {
        const count = result.batch.stagedClients.length;
        setNotice({ tone: "info", text: `Staged ${count} client${count === 1 ? "" : "s"} from ${result.batch.fileName ?? "your file"} for review. Nothing was created, invited, or activated.` });
      }
      await load();
    } catch (err) {
      setNotice({ tone: "warn", text: err instanceof Error ? err.message : "That file couldn't be staged." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleCorrect(stagedClientId: string, fieldId: string, fieldKey: string, value: string) {
    try {
      await correctStagedClientFieldAction({ stagedClientId, fieldId, fieldKey, correctedValue: value });
      await load();
    } catch (err) {
      setNotice({ tone: "warn", text: err instanceof Error ? err.message : "That correction couldn't be saved." });
    }
  }

  async function handleMarkReady(stagedClientId: string) {
    try {
      await markStagedClientReadyAction({ stagedClientId });
      await load();
    } catch (err) {
      setNotice({ tone: "warn", text: err instanceof Error ? err.message : "Couldn't mark that row ready." });
    }
  }

  async function handleReject(stagedClientId: string, currentStatus: StagedClientStatus) {
    try {
      await rejectStagedClientAction({ stagedClientId, currentStatus });
      await load();
    } catch (err) {
      setNotice({ tone: "warn", text: err instanceof Error ? err.message : "Couldn't reject that row." });
    }
  }

  async function handleCancel(batchId: string, currentStatus: ImportBatchStatus) {
    try {
      await cancelImportBatchAction({ batchId, currentStatus });
      await load();
    } catch (err) {
      setNotice({ tone: "warn", text: err instanceof Error ? err.message : "Couldn't cancel that batch." });
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-dashed">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
            <Upload size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-off-white">Upload a CSV export</p>
            <p className="mt-1 text-meta text-neutral">
              One row per client — a name and email at minimum. Nothing is created, invited, or activated: this only stages the file for your
              review.
            </p>
            <div className="mt-3">
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} disabled={uploading} className="hidden" id="import-csv-input" />
              <Button size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : null}
                {uploading ? "Staging…" : "Choose file"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {notice ? (
        <p
          className={cn(
            "flex items-start gap-2 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-sm",
            notice.tone === "warn" ? "border-error/40 bg-error-soft/40 text-off-white" : "border-success/40 bg-success-soft/40 text-off-white"
          )}
        >
          {notice.tone === "warn" ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-error" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />}
          {notice.text}
        </p>
      ) : null}

      {loadError ? (
        <Card className="border-error/40">
          <p className="flex items-center gap-2 text-sm font-semibold text-off-white">
            <X size={15} className="text-error" /> Couldn&apos;t load imports
          </p>
          <p className="mt-1 text-sm text-neutral">{loadError}</p>
        </Card>
      ) : null}

      {batches === null && !loadError ? (
        <p className="text-sm text-neutral">Loading…</p>
      ) : batches && batches.length === 0 ? (
        <p className="text-sm text-neutral">No imports yet — upload a file above to get started.</p>
      ) : (
        <div className="space-y-8">
          {batches?.map((batch) => (
            <BatchCard key={batch.id} batch={batch} onCorrect={handleCorrect} onMarkReady={handleMarkReady} onReject={handleReject} onCancel={handleCancel} />
          ))}
        </div>
      )}
    </div>
  );
}
