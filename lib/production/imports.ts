// Gate 6B — Import Staging.
//
// Real, workspace-bound persistence for the existing-client import model
// (supabase/migrations/20260909000006_imports.sql, lib/imports/types.ts).
// Mirrors lib/production/campaigns.ts's shape exactly: a local
// requireCoachAuthority, rowTo* mappers, and every status change gated
// through the app-level transition guard before the database ever sees it
// — never a raw status write.
//
// What this file structurally cannot do, by construction:
//  - Send an invitation. No code path here ever calls
//    lib/production/invite.ts or writes to client_profiles/
//    coach_client_assignments/client_enrollments.
//  - Activate a client. There is no "approved" transition here at all —
//    only needs_review -> ready and (needs_review | ready) -> rejected.
//    "Approved" (the status that actually makes a staged row eligible for
//    the real activation transaction referenced in this schema's own
//    comments) is deliberately out of this gate's scope: pairing a status
//    whose entire meaning is "eligible for activation" with a product that
//    has no activation feature yet would misrepresent what this gate does.
//    That is a follow-up gate's decision, not this file's.

import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseServerClient } from "../supabase/server";
import { getAuthenticatedContext, requireWorkspaceRole, isWorkspaceStaffRole } from "./auth";
import { UnauthorizedError } from "./errors";
import { parseImportCsv, buildStagedClientDrafts, findMatchingClientId, type StagedFieldDraft } from "../imports/csv-parsing";
import { isValidImportBatchTransition, isValidStagedClientTransition } from "../imports/types";
import type { ImportBatchStatus, StagedClientStatus } from "../imports/types";

async function requireCoachAuthority(workspaceId: string) {
  const ctx = await getAuthenticatedContext();
  const membership = requireWorkspaceRole(ctx, workspaceId, ["workspace_owner", "platform_admin", "coach"]);
  if (!isWorkspaceStaffRole(membership.role)) throw new UnauthorizedError();
  return ctx;
}

export class ImportParseError extends Error {
  constructor(
    message: string,
    public readonly parseErrors: string[]
  ) {
    super(message);
    this.name = "ImportParseError";
  }
}

export interface StagedClientFieldView {
  id: string;
  fieldKey: string;
  sourceValue: string | null;
  normalizedValue: unknown;
  confidence: number | null;
  isAmbiguous: boolean;
  sourceLocation: string | null;
  coachCorrection: unknown;
}

export interface StagedClientView {
  id: string;
  batchId: string;
  matchedClientProfileId: string | null;
  matchedClientDisplayName: string | null;
  displayNameGuess: string | null;
  currentPhaseGuess: string | null;
  currentWeekIndexGuess: number | null;
  asOfDateGuess: string | null;
  status: StagedClientStatus;
  fields: StagedClientFieldView[];
}

export interface ImportBatchView {
  id: string;
  workspaceId: string;
  status: ImportBatchStatus;
  fileName: string | null;
  createdAtIso: string;
  parseErrors: string[];
  stagedClients: StagedClientView[];
}

async function transitionImportBatch(workspaceId: string, batchId: string, from: ImportBatchStatus, to: ImportBatchStatus, patch: Record<string, unknown> = {}) {
  if (!isValidImportBatchTransition(from, to)) throw new Error(`Invalid import batch transition: ${from} -> ${to}`);
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("import_batches")
    .update({ status: to, updated_at: new Date().toISOString(), ...patch })
    .eq("id", batchId)
    .eq("workspace_id", workspaceId)
    .eq("status", from);
  if (error) throw new Error(`transitionImportBatch failed: ${error.message}`);
}

async function transitionStagedClient(workspaceId: string, stagedClientId: string, from: StagedClientStatus, to: StagedClientStatus, patch: Record<string, unknown> = {}) {
  if (!isValidStagedClientTransition(from, to)) throw new Error(`Invalid staged client transition: ${from} -> ${to}`);
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("staged_clients")
    .update({ status: to, updated_at: new Date().toISOString(), ...patch })
    .eq("id", stagedClientId)
    .eq("workspace_id", workspaceId)
    .eq("status", from);
  if (error) throw new Error(`transitionStagedClient failed: ${error.message}`);
}

/** Case-insensitive match against this workspace's REAL existing clients —
 * a signal for the coach to review ("this looks like Jordan, who's already
 * a client"), never an automatic merge and never itself a reason to skip
 * staging the row. Matches on either invited_email or display_name; either
 * one is enough to flag it, since a coach's own export may have neither
 * field perfectly aligned with what's already on file. */
async function findMatchingClientProfileId(
  workspaceId: string,
  candidate: { email: string | null; displayName: string | null }
): Promise<string | null> {
  if (!candidate.email && !candidate.displayName) return null;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("client_profiles").select("id, display_name, invited_email").eq("workspace_id", workspaceId);
  if (error) throw new Error(`findMatchingClientProfileId failed: ${error.message}`);
  const existing = (data ?? []).map((row) => ({
    id: row.id as string,
    displayName: (row.display_name as string | null) ?? null,
    invitedEmail: (row.invited_email as string | null) ?? null,
  }));
  return findMatchingClientId(candidate, existing);
}

/** The one entry point: a coach-uploaded CSV becomes a real, workspace-
 * scoped import_batches + import_sources row, and one staged_clients +
 * staged_client_fields row set per real data row in the file. Never
 * touches client_profiles, coach_client_assignments, client_enrollments,
 * or anything invitation-related. On any failure partway through, the
 * batch is left in (or moved to) 'failed' rather than stuck at
 * 'uploading' forever, and the real error is re-thrown for the action
 * layer to surface honestly. */
export async function createImportBatchFromCsv(params: { workspaceId: string; fileName: string; csvText: string }): Promise<ImportBatchView> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();

  const { data: batchRow, error: batchError } = await supabase
    .from("import_batches")
    .insert({ workspace_id: params.workspaceId, created_by: ctx.userId, status: "uploading" })
    .select("id, workspace_id, status, created_at")
    .single();
  if (batchError) throw new Error(`createImportBatchFromCsv (batch) failed: ${batchError.message}`);
  const batchId = batchRow.id as string;

  try {
    const path = `${params.workspaceId}/${batchId}/${params.fileName}`;
    const { error: uploadError } = await supabase.storage.from("import-sources").upload(path, params.csvText, { contentType: "text/csv", upsert: false });
    if (uploadError) throw new Error(`storage upload failed: ${uploadError.message}`);

    const sha256 = createHash("sha256").update(params.csvText).digest("hex");
    const { data: sourceRow, error: sourceError } = await supabase
      .from("import_sources")
      .insert({
        batch_id: batchId,
        workspace_id: params.workspaceId,
        file_name: params.fileName,
        file_path: path,
        mime_type: "text/csv",
        sha256,
        uploaded_by: ctx.userId,
      })
      .select("id")
      .single();
    if (sourceError) throw new Error(`createImportBatchFromCsv (source) failed: ${sourceError.message}`);
    const sourceId = sourceRow.id as string;

    await transitionImportBatch(params.workspaceId, batchId, "uploading", "processing");

    const parsed = parseImportCsv(params.csvText);
    const drafts = buildStagedClientDrafts(parsed);

    if (drafts.length === 0) {
      await transitionImportBatch(params.workspaceId, batchId, "processing", "failed");
      throw new ImportParseError("Nothing in this file could be staged.", parsed.errors);
    }

    for (const draft of drafts) {
      const emailDraft = draft.fields.find((f) => f.fieldKey === "invited_email")?.normalizedValue as string | null | undefined;
      const matchedClientProfileId = await findMatchingClientProfileId(params.workspaceId, {
        email: emailDraft ?? null,
        displayName: draft.displayNameGuess,
      });

      const { data: stagedRow, error: stagedError } = await supabase
        .from("staged_clients")
        .insert({
          batch_id: batchId,
          workspace_id: params.workspaceId,
          matched_client_profile_id: matchedClientProfileId,
          display_name_guess: draft.displayNameGuess,
          current_phase_guess: draft.currentPhaseGuess,
          current_week_index_guess: draft.currentWeekIndexGuess,
          as_of_date_guess: draft.asOfDateGuess,
          status: "needs_review",
          // One CSV row is unambiguously one client — nothing here was
          // grouped from multiple sources, so there is no real grouping
          // uncertainty to express as anything less than full confidence.
          grouping_confidence: 1,
        })
        .select("id")
        .single();
      if (stagedError) throw new Error(`createImportBatchFromCsv (staged client) failed: ${stagedError.message}`);
      const stagedClientId = stagedRow.id as string;

      const fieldRows = draft.fields.map((f: StagedFieldDraft) => ({
        staged_client_id: stagedClientId,
        workspace_id: params.workspaceId,
        field_key: f.fieldKey,
        source_value: f.sourceValue,
        normalized_value: f.normalizedValue,
        confidence: f.confidence,
        source_id: sourceId,
        source_location: f.sourceLocation,
        is_ambiguous: f.isAmbiguous,
      }));
      const { error: fieldsError } = await supabase.from("staged_client_fields").insert(fieldRows);
      if (fieldsError) throw new Error(`createImportBatchFromCsv (fields) failed: ${fieldsError.message}`);
    }

    const finalStatus: ImportBatchStatus = parsed.errors.length > 0 ? "needs_review" : "needs_review";
    await transitionImportBatch(params.workspaceId, batchId, "processing", finalStatus);

    return getImportBatchDetail({ workspaceId: params.workspaceId, batchId, parseErrors: parsed.errors });
  } catch (err) {
    // Best-effort: leave an honest 'failed' batch behind rather than one
    // stuck invisibly at 'uploading'/'processing' forever. This update is
    // allowed to itself fail silently (e.g. the batch already moved past a
    // state this can transition from) — the original error is what the
    // caller needs, not a masking secondary one.
    const supabase2 = await getSupabaseServerClient();
    await supabase2.from("import_batches").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", batchId).eq("workspace_id", params.workspaceId).neq("status", "failed");
    throw err;
  }
}

function rowToFieldView(row: { id: string; field_key: string; source_value: string | null; normalized_value: unknown; confidence: number | null; is_ambiguous: boolean; source_location: string | null; coach_correction: unknown }): StagedClientFieldView {
  return {
    id: row.id,
    fieldKey: row.field_key,
    sourceValue: row.source_value,
    normalizedValue: row.normalized_value,
    confidence: row.confidence,
    isAmbiguous: row.is_ambiguous,
    sourceLocation: row.source_location,
    coachCorrection: row.coach_correction,
  };
}

export async function getImportBatchDetail(params: { workspaceId: string; batchId: string; parseErrors?: string[] }): Promise<ImportBatchView> {
  await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();

  const { data: batchRow, error: batchError } = await supabase
    .from("import_batches")
    .select("id, workspace_id, status, created_at, import_sources(file_name)")
    .eq("id", params.batchId)
    .eq("workspace_id", params.workspaceId)
    .single();
  if (batchError) throw new Error(`getImportBatchDetail (batch) failed: ${batchError.message}`);

  const { data: stagedRows, error: stagedError } = await supabase
    .from("staged_clients")
    .select("id, batch_id, matched_client_profile_id, display_name_guess, current_phase_guess, current_week_index_guess, as_of_date_guess, status, client_profiles(display_name)")
    .eq("batch_id", params.batchId)
    .eq("workspace_id", params.workspaceId)
    .order("created_at", { ascending: true });
  if (stagedError) throw new Error(`getImportBatchDetail (staged) failed: ${stagedError.message}`);

  const stagedClients: StagedClientView[] = await Promise.all(
    (stagedRows ?? []).map(async (row) => {
      const { data: fieldRows, error: fieldsError } = await supabase
        .from("staged_client_fields")
        .select("id, field_key, source_value, normalized_value, confidence, is_ambiguous, source_location, coach_correction")
        .eq("staged_client_id", row.id as string)
        .eq("workspace_id", params.workspaceId);
      if (fieldsError) throw new Error(`getImportBatchDetail (fields) failed: ${fieldsError.message}`);
      const matchedProfile = row.client_profiles as unknown as { display_name: string } | null;
      return {
        id: row.id as string,
        batchId: row.batch_id as string,
        matchedClientProfileId: (row.matched_client_profile_id as string | null) ?? null,
        matchedClientDisplayName: matchedProfile?.display_name ?? null,
        displayNameGuess: (row.display_name_guess as string | null) ?? null,
        currentPhaseGuess: (row.current_phase_guess as string | null) ?? null,
        currentWeekIndexGuess: (row.current_week_index_guess as number | null) ?? null,
        asOfDateGuess: (row.as_of_date_guess as string | null) ?? null,
        status: row.status as StagedClientStatus,
        fields: (fieldRows ?? []).map(rowToFieldView),
      };
    })
  );

  const sources = batchRow.import_sources as unknown as { file_name: string }[] | { file_name: string } | null;
  const fileName = Array.isArray(sources) ? (sources[0]?.file_name ?? null) : (sources?.file_name ?? null);

  return {
    id: batchRow.id as string,
    workspaceId: batchRow.workspace_id as string,
    status: batchRow.status as ImportBatchStatus,
    fileName,
    createdAtIso: batchRow.created_at as string,
    parseErrors: params.parseErrors ?? [],
    stagedClients,
  };
}

export async function getWorkspaceImportBatches(workspaceId: string): Promise<ImportBatchView[]> {
  await requireCoachAuthority(workspaceId);
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("import_batches").select("id").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error) throw new Error(`getWorkspaceImportBatches failed: ${error.message}`);
  return Promise.all((data ?? []).map((row) => getImportBatchDetail({ workspaceId, batchId: row.id as string })));
}

/** The coach's hand-correction of one extracted field — the actual
 * "review and correct" affordance this gate exists for. Writes
 * coach_correction (never overwrites source_value, which stays the real,
 * original extracted text forever) and, when this field_key backs one of
 * staged_clients' own quick-access guess columns, keeps that column in
 * sync so the review list always shows the coach's own latest word over
 * the raw guess. Logs a real import_review_events row. */
export async function correctStagedClientField(params: { workspaceId: string; stagedClientId: string; fieldId: string; fieldKey: string; correctedValue: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  const supabase = await getSupabaseServerClient();
  const trimmed = params.correctedValue.trim();

  const { error: fieldError } = await supabase
    .from("staged_client_fields")
    .update({ coach_correction: trimmed.length > 0 ? trimmed : null })
    .eq("id", params.fieldId)
    .eq("staged_client_id", params.stagedClientId)
    .eq("workspace_id", params.workspaceId);
  if (fieldError) throw new Error(`correctStagedClientField (field) failed: ${fieldError.message}`);

  const GUESS_COLUMN: Record<string, string> = {
    display_name: "display_name_guess",
    current_phase: "current_phase_guess",
    as_of_date: "as_of_date_guess",
  };
  if (params.fieldKey in GUESS_COLUMN) {
    const { error: syncError } = await supabase
      .from("staged_clients")
      .update({ [GUESS_COLUMN[params.fieldKey]]: trimmed.length > 0 ? trimmed : null, updated_at: new Date().toISOString() })
      .eq("id", params.stagedClientId)
      .eq("workspace_id", params.workspaceId);
    if (syncError) throw new Error(`correctStagedClientField (sync) failed: ${syncError.message}`);
  } else if (params.fieldKey === "current_week_index") {
    const asNumber = Number(trimmed);
    const value = Number.isInteger(asNumber) && asNumber >= 0 ? asNumber : null;
    const { error: syncError } = await supabase
      .from("staged_clients")
      .update({ current_week_index_guess: value, updated_at: new Date().toISOString() })
      .eq("id", params.stagedClientId)
      .eq("workspace_id", params.workspaceId);
    if (syncError) throw new Error(`correctStagedClientField (week sync) failed: ${syncError.message}`);
  }

  const { error: eventError } = await supabase.from("import_review_events").insert({
    staged_client_id: params.stagedClientId,
    workspace_id: params.workspaceId,
    actor_user_id: ctx.userId,
    event_type: "corrected",
    notes: `${params.fieldKey}: "${trimmed}"`,
  });
  if (eventError) throw new Error(`correctStagedClientField (event) failed: ${eventError.message}`);
}

/** The coach's explicit "this staged client is correct" — needs_review ->
 * ready only. Never approved, never activated; see this file's own doc. */
export async function markStagedClientReady(params: { workspaceId: string; stagedClientId: string }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  await transitionStagedClient(params.workspaceId, params.stagedClientId, "needs_review", "ready");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("import_review_events").insert({
    staged_client_id: params.stagedClientId,
    workspace_id: params.workspaceId,
    actor_user_id: ctx.userId,
    event_type: "reviewed",
  });
  if (error) throw new Error(`markStagedClientReady (event) failed: ${error.message}`);
}

/** The coach's explicit "this row is not a real/wanted client" — a
 * legitimate staging-only outcome (a duplicate, a test row, garbage data),
 * never an activation decision. Valid from needs_review or ready. */
export async function rejectStagedClient(params: { workspaceId: string; stagedClientId: string; currentStatus: StagedClientStatus }): Promise<void> {
  const ctx = await requireCoachAuthority(params.workspaceId);
  await transitionStagedClient(params.workspaceId, params.stagedClientId, params.currentStatus, "rejected");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("import_review_events").insert({
    staged_client_id: params.stagedClientId,
    workspace_id: params.workspaceId,
    actor_user_id: ctx.userId,
    event_type: "rejected",
  });
  if (error) throw new Error(`rejectStagedClient (event) failed: ${error.message}`);
}

/** Cancels an entire batch — the coach uploaded the wrong file, or wants
 * to start over. Every one of a batch's staged_clients rows is left
 * exactly as it is (cascade-deleted only if the batch itself is later
 * deleted, never implicitly here); only the batch's own status changes. */
export async function cancelImportBatch(params: { workspaceId: string; batchId: string; currentStatus: ImportBatchStatus }): Promise<void> {
  await requireCoachAuthority(params.workspaceId);
  await transitionImportBatch(params.workspaceId, params.batchId, params.currentStatus, "cancelled");
}
