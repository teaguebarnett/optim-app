// Phase 6.0A — Production Foundation.
//
// Typed contracts for the "Newly approved existing-client migration model."
// Mirrors supabase/migrations/20260909000006_imports.sql's tables exactly.
// Contracts and validity checks ONLY — no OCR, no spreadsheet parsing, no
// AI normalization logic. Those write INTO the shapes defined here in a
// later phase; this file only defines what a valid staged-import state is.

export type ImportBatchStatus =
  | "uploading"
  | "processing"
  | "needs_review"
  | "ready"
  | "activated"
  | "failed"
  | "cancelled";

export interface ImportBatch {
  id: string;
  workspaceId: string;
  createdBy: string;
  status: ImportBatchStatus;
  createdAtIso: string;
  updatedAtIso: string;
}

const VALID_BATCH_TRANSITIONS: Record<ImportBatchStatus, ImportBatchStatus[]> = {
  uploading: ["processing", "cancelled", "failed"],
  processing: ["needs_review", "ready", "failed", "cancelled"],
  needs_review: ["ready", "cancelled"],
  ready: ["activated", "needs_review", "cancelled"],
  activated: [],
  failed: [],
  cancelled: [],
};

export function isValidImportBatchTransition(from: ImportBatchStatus, to: ImportBatchStatus): boolean {
  return VALID_BATCH_TRANSITIONS[from].includes(to);
}

export interface ImportSource {
  id: string;
  batchId: string;
  workspaceId: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  sha256: string | null;
  uploadedBy: string;
  uploadedAtIso: string;
}

export type StagedClientStatus = "needs_review" | "ready" | "approved" | "rejected";

/** The program-position anchors a staged client carries BEFORE activation
 * — the exact fields client_enrollments (see
 * supabase/migrations/20260909000003_coaching_relationships.sql) will be
 * seeded from once approved. "An imported client in Week 7 must resume in
 * Week 7" is this type's entire reason for existing: these are real,
 * independently-reviewable fields, never derived after the fact from
 * elapsed calendar time. */
export interface StagedClientPositionAnchors {
  currentPhaseGuess: string | null;
  currentWeekIndexGuess: number | null;
  asOfDateGuess: string | null;
}

export interface StagedClient {
  id: string;
  batchId: string;
  workspaceId: string;
  matchedClientProfileId: string | null;
  displayNameGuess: string | null;
  status: StagedClientStatus;
  position: StagedClientPositionAnchors;
  groupingConfidence: number | null;
  createdAtIso: string;
  updatedAtIso: string;
}

const VALID_STAGED_CLIENT_TRANSITIONS: Record<StagedClientStatus, StagedClientStatus[]> = {
  needs_review: ["ready", "rejected"],
  ready: ["approved", "needs_review", "rejected"],
  approved: [],
  rejected: [],
};

export function isValidStagedClientTransition(from: StagedClientStatus, to: StagedClientStatus): boolean {
  return VALID_STAGED_CLIENT_TRANSITIONS[from].includes(to);
}

/** A staged client is eligible for the explicit coach-approved activation
 * transaction (which creates/links real client_profiles + client_enrollments
 * rows — see lib/production/repository.ts's activateStagedClient contract)
 * only once its own status is "approved". Never true from "needs_review" or
 * "ready" alone — approval is a distinct, deliberate step from merely being
 * ready for review. */
export function canActivateStagedClient(staged: Pick<StagedClient, "status">): boolean {
  return staged.status === "approved";
}

export interface StagedClientField {
  id: string;
  stagedClientId: string;
  workspaceId: string;
  fieldKey: string;
  /** The raw value as it literally appeared in the source. */
  sourceValue: string | null;
  /** An AI-normalized interpretation of sourceValue — kept as a genuinely
   * separate field from sourceValue per the model's explicit "separate
   * sourced facts / AI-normalized values" requirement; never overwrites it. */
  normalizedValue: unknown;
  confidence: number | null;
  sourceId: string | null;
  sourceLocation: string | null;
  isAmbiguous: boolean;
  coachCorrection: unknown;
  createdAtIso: string;
}

/** Mirrors staged_client_fields_needs_provenance's CHECK constraint: a
 * field must trace to a real source value, a real source file, or an
 * explicit coach correction — never a bare invented value with none of the
 * three. This is the code-level enforcement of "NEVER invent exercises/
 * sets/reps/RPE/dates/completion history/symptoms/nutrition targets/
 * adherence/identity details." */
export function hasProvenance(field: Pick<StagedClientField, "sourceValue" | "sourceId" | "coachCorrection">): boolean {
  return field.sourceValue !== null || field.sourceId !== null || field.coachCorrection !== null;
}

export type ImportReviewEventType = "reviewed" | "corrected" | "approved" | "rejected" | "activated";

export interface ImportReviewEvent {
  id: string;
  stagedClientId: string;
  workspaceId: string;
  actorUserId: string;
  eventType: ImportReviewEventType;
  notes: string | null;
  occurredAtIso: string;
}
