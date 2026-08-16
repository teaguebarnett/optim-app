// Shared primitives every Phase 4.1 history/scheduling record type builds
// on: authorship, record provenance, and the common attribution stamp. Kept
// in their own module so lib/history/types.ts and lib/scheduling/types.ts
// (and any future record type) import one definition rather than each
// re-declaring an equivalent shape.
//
// "Organization/tenant" in the Phase 4.1 spec maps directly to this repo's
// existing WorkspaceId (see lib/tenancy/types.ts's Workspace/WorkspaceOwned)
// — there is no separate organization layer above Workspace to reinvent.

import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

export type AuthorKind = "client" | "coach" | "assistant" | "system";

/**
 * Who is responsible for a piece of content or a decision. An OPTIM
 * (assistant) interpretation must never silently become coach guidance —
 * every record that could ever be read as "the coach said X" carries this so
 * the UI (in a later phase) can render the real source instead of implying
 * coach authorship for an assistant-authored note.
 */
export interface Authorship {
  authorKind: AuthorKind;
  /** Set for "coach" (which coach) and, once multi-profile logins exist,
   * "client" (which client). Never set for "assistant"/"system" — those
   * are never attributed to a specific person. */
  authorId?: string;
}

export function authorshipClient(clientId: ClientProfileId): Authorship {
  return { authorKind: "client", authorId: clientId };
}

export function authorshipSystem(): Authorship {
  return { authorKind: "system" };
}

/** Where a record's data actually came from. "live" is real client-produced
 * history; "fixture" is the isolated, resettable demo history seed (see
 * lib/history/demo-fixture.ts); "correction" marks a Correction record
 * itself (as distinct from the DailyRecord it corrects). */
export type RecordSource = "live" | "fixture" | "correction";

/** A pointer to the specific record (and optionally field) a derived claim
 * is based on — the minimal shape a future pattern-detection/coach-approval
 * pipeline (Phase 4.5+) needs to cite its evidence. Defined now because the
 * record types below already need to reference it; nothing in Phase 4.1
 * generates or consumes these automatically. */
export interface EvidenceRef {
  recordType: "DailyRecord" | "WeeklyReview";
  recordId: string;
  fieldPath?: string;
}

/**
 * Common attribution every Phase 4.1+ backend-ready record stamps. Mirrors
 * lib/tenancy/types.ts's WorkspaceOwned/ClientOwned mixins (workspaceId/
 * clientId) so these records plug into the same scoping helpers
 * (scopeClientOwnedRecords, etc.) — and adds the fields Phase 4.1 requires
 * beyond that: a denormalized coachId (captured from the client's
 * primaryCoachId at write time, so a real backend query could filter by it
 * directly instead of always joining through the client), explicit source
 * and authorship, a creation timestamp, and a schema version for additive
 * migration.
 */
export interface RecordAttribution {
  schemaVersion: number;
  workspaceId: WorkspaceId;
  clientId: ClientProfileId;
  coachId: CoachProfileId;
  source: RecordSource;
  authorship: Authorship;
  createdAtIso: string;
}
