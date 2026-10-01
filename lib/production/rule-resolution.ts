// Phase 9C — the ONE real read boundary between generation and the
// coach-confirmed learned-rule layer (Phase 9B). This is the sole place
// coach_learned_rules is ever queried for generation purposes — never
// scattered across program-directions.ts, universal-program-generation.ts,
// or any UI (spec section 8: "centralize it").
//
// Security (spec section 20): rules are read through the CALLING coach's
// own real session — coach_learned_rules_select's RLS (coach_user_id =
// auth.uid()) is what actually enforces "only this coach's own rules,"
// exactly like every other Phase 8B/9B read in this codebase.
//
// Gate 3 — methodology belongs to the client's PRIMARY coach (their Coach
// Brain). When the caller passes that owner (ownerCoachUserId), the rules
// are that coach's own, read through the service role with an explicit
// coach_user_id + workspace filter — so a different staff member acting on
// the client never applies THEIR learned rules to someone else's client.
// The caller must already have authorized access to the client. This
// function additionally filters to (coach_general) OR (client_specific
// for exactly this client) at the query level, so a client-specific rule
// for Client A can never even be fetched while generating for Client B
// (spec section 21) — not merely filtered out downstream.
//
// Failure semantics (spec section 38): if this query fails unexpectedly,
// generation must not become unusable — the learning subsystem is
// strictly additive. A failure here is caught, logged, and treated as
// "zero applicable rules," never fabricated, never a thrown error that
// would block a coach from generating a proposal at all.

import "server-only";
import { getSupabaseAdminClient } from "../supabase/admin.ts";
import { getSupabaseServerClient } from "../supabase/server";
import type { ApplicableRule } from "../coach/rule-application";

/** Loads the CALLING coach's own real, active, applicable learned rules
 * for a specific client's generation request — coach-general rules plus
 * any client-specific rules for exactly this client, and nothing else.
 * Superseded/deactivated rules are excluded by the status='active' filter
 * itself (spec section 4) — there is no separate "is this rule current"
 * check needed downstream. */
export async function resolveApplicableCoachRules(params: { clientProfileId: string; owner?: { coachUserId: string; workspaceId: string } }): Promise<ApplicableRule[]> {
  try {
    const base = params.owner
      ? getSupabaseAdminClient().from("coach_learned_rules").select("id, scope, client_profile_id, decision_domain, field, item_family, direction").eq("coach_user_id", params.owner.coachUserId).eq("workspace_id", params.owner.workspaceId)
      : (await getSupabaseServerClient()).from("coach_learned_rules").select("id, scope, client_profile_id, decision_domain, field, item_family, direction");
    const { data, error } = await base
      .eq("status", "active")
      .or(`scope.eq.coach_general,and(scope.eq.client_specific,client_profile_id.eq.${params.clientProfileId})`);
    if (error) {
      console.error(`resolveApplicableCoachRules failed, generating without learned rules: ${error.message}`);
      return [];
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      scope: r.scope as ApplicableRule["scope"],
      clientProfileId: (r.client_profile_id as string | null) ?? null,
      decisionDomain: r.decision_domain as string,
      decisionType: deriveDecisionType(r.decision_domain as string, r.field as string),
      field: r.field as string,
      itemFamily: (r.item_family as string | null) ?? null,
      direction: r.direction as ApplicableRule["direction"],
    }));
  } catch (err) {
    console.error(`resolveApplicableCoachRules threw unexpectedly, generating without learned rules: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export interface LearnedRuleProvenance {
  id: string;
  scope: "coach_general" | "client_specific";
  clientProfileId: string | null;
  summary: string;
  direction: string;
  field: string;
  itemFamily: string | null;
  /** The rule's CURRENT status — shown only as "this preference has since
   * been turned off" context, never used to decide whether it influenced
   * the historical proposal (that's already decided by the proposal's own
   * frozen appliedLearnedRuleIds — spec section 18/41). */
  status: "active" | "deactivated" | "superseded";
}

/** Phase 10A — resolves real historical rule PROVENANCE for the program
 * review surface: given the exact rule ids a proposal's own frozen
 * appliedLearnedRuleIds/methodologyConflictedLearnedRuleIds recorded at
 * generation time, looks them up BY ID — never by current status —
 * because coach_learned_rules rows are never deleted (only `status`
 * changes; see the Phase 9B migration's own revoke-delete grant), a rule
 * that has since been deactivated/superseded still resolves its own real,
 * unchanged summary/scope/direction/field/itemFamily here. This is what
 * keeps a historical proposal's provenance truthful even after the coach
 * turns the preference off later (spec section 18/41 — "do not rewrite
 * history based on current rule state").
 *
 * RLS (coach_learned_rules_select) is the real authorization backstop —
 * the caller's own session determines what this can ever return, exactly
 * like every other read in this file. A rule id belonging to a different
 * coach simply resolves to nothing. */
export async function getLearnedRuleProvenance(ruleIds: string[]): Promise<LearnedRuleProvenance[]> {
  if (ruleIds.length === 0) return [];
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("coach_learned_rules").select("id, scope, client_profile_id, summary, direction, field, item_family, status").in("id", ruleIds);
    if (error) {
      console.error(`getLearnedRuleProvenance failed, showing no provenance: ${error.message}`);
      return [];
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      scope: r.scope as LearnedRuleProvenance["scope"],
      clientProfileId: (r.client_profile_id as string | null) ?? null,
      summary: r.summary as string,
      direction: r.direction as string,
      field: r.field as string,
      itemFamily: (r.item_family as string | null) ?? null,
      status: r.status as LearnedRuleProvenance["status"],
    }));
  } catch (err) {
    console.error(`getLearnedRuleProvenance threw unexpectedly, showing no provenance: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/** coach_learned_rules doesn't store decision_type as its own column
 * (decision_domain + field already disambiguate every real rule family
 * this codebase produces today — see lib/patterns/analyze-coach-decision-patterns.ts's
 * own capability-map doc for why: "activityIdentity" is just another FIELD
 * within item_prescription_edited/continuous_item_edited, never its own
 * domain). Mechanical, deterministic, and the single place this mapping
 * lives — never duplicated. */
function deriveDecisionType(decisionDomain: string, field: string): string {
  if (decisionDomain === "cardio_conditioning") return "continuous_item_edited";
  if (decisionDomain === "prescription") return "item_prescription_edited";
  if (decisionDomain === "exercise_selection") return field === "itemRemoved" ? "training_item_removed" : "training_item_added";
  if (decisionDomain === "scheduling") return "training_day_converted_to_rest";
  if (decisionDomain === "program_structure") return "program_generated";
  return "unknown";
}
