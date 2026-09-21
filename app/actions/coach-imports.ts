"use server";

// Gate 6B — Import Staging.
//
// The coach-callable surface over lib/production/imports.ts. Every
// underlying function re-checks staff authority in the target workspace
// itself, exactly like app/actions/coach-communications.ts's own doc
// explains — a workspaceId is never trusted as proof of anything on its
// own. This file also revalidates the one page that reads this data
// (/coach/clients/import), never anything invitation- or activation-
// related, because this feature can't touch either.

import { revalidatePath } from "next/cache";
import {
  createImportBatchFromCsv,
  getWorkspaceImportBatches,
  correctStagedClientField,
  markStagedClientReady,
  rejectStagedClient,
  cancelImportBatch,
  ImportParseError,
  type ImportBatchView,
} from "../../lib/production/imports";
import { resolveOwnStaffWorkspace } from "../../lib/production/auth";
import type { ImportBatchStatus, StagedClientStatus } from "../../lib/imports/types";

const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — a roster export, never a bulk data dump.

export type UploadImportCsvResult = { kind: "ok"; batch: ImportBatchView } | { kind: "error"; message: string; parseErrors?: string[] };

export async function uploadImportCsvAction(formData: FormData): Promise<UploadImportCsvResult> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  const file = formData.get("file");
  if (!(file instanceof File)) return { kind: "error", message: "No file was received." };
  if (file.size === 0) return { kind: "error", message: "That file is empty." };
  if (file.size > MAX_IMPORT_FILE_BYTES) return { kind: "error", message: "That file is too large — please export a smaller batch (under 2 MB)." };

  const csvText = await file.text();
  try {
    const batch = await createImportBatchFromCsv({ workspaceId, fileName: file.name, csvText });
    revalidatePath("/coach/clients/import");
    return { kind: "ok", batch };
  } catch (err) {
    if (err instanceof ImportParseError) {
      return { kind: "error", message: err.message, parseErrors: err.parseErrors };
    }
    return { kind: "error", message: err instanceof Error ? err.message : "That file couldn't be staged." };
  }
}

export async function getImportBatchesAction(): Promise<ImportBatchView[]> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  return getWorkspaceImportBatches(workspaceId);
}

export async function correctStagedClientFieldAction(params: { stagedClientId: string; fieldId: string; fieldKey: string; correctedValue: string }): Promise<void> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  await correctStagedClientField({ workspaceId, ...params });
  revalidatePath("/coach/clients/import");
}

export async function markStagedClientReadyAction(params: { stagedClientId: string }): Promise<void> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  await markStagedClientReady({ workspaceId, ...params });
  revalidatePath("/coach/clients/import");
}

export async function rejectStagedClientAction(params: { stagedClientId: string; currentStatus: StagedClientStatus }): Promise<void> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  await rejectStagedClient({ workspaceId, ...params });
  revalidatePath("/coach/clients/import");
}

export async function cancelImportBatchAction(params: { batchId: string; currentStatus: ImportBatchStatus }): Promise<void> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  await cancelImportBatch({ workspaceId, ...params });
  revalidatePath("/coach/clients/import");
}
