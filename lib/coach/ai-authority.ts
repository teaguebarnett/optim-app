// Phase 5.3B — AI Coaching Authority: how much autonomy OPTIM has, per
// coach and per client. This file holds the real permission model (types +
// a pure, testable policy resolver) — no generative AI service exists in
// this repository, and nothing here pretends one does. What this DOES
// establish is the actual contract a future automation layer would have to
// respect: given a level and an action, is it merely suggested, drafted
// for approval, executed automatically, or escalated to the coach.
//
// Persisted per coach in PlatformState.aiAuthoritySettings (see
// platform-store.ts) — a coach's own global default plus a sparse map of
// per-client overrides, exactly mirroring how CoachProgramTemplate/
// MealRecommendation are already owned and isolated by coachId. Two coaches
// in the same workspace (Teague, Alex — see lib/tenancy/seed.ts) each get
// their own independent settings record.

import type { ClientProfileId, CoachProfileId, WorkspaceId } from "../tenancy/types";

/** Four discrete, increasingly autonomous levels — never an ambiguous
 * continuous percentage (see this phase's brief). */
export type AiAuthorityLevel = "advisor" | "copilot" | "ai_led" | "review_only";

export const AI_AUTHORITY_LEVELS: AiAuthorityLevel[] = ["advisor", "copilot", "ai_led", "review_only"];

export const AI_AUTHORITY_LEVEL_LABELS: Record<AiAuthorityLevel, string> = {
  advisor: "Advisor",
  copilot: "Copilot",
  ai_led: "AI-led",
  // Phase 5.4A corrective pass: "Review only" read as passive/ambiguous —
  // this is the most autonomous level (OPTIM may auto-execute within
  // policy), so it's relabeled to say that plainly. The underlying value
  // stays "review_only" — see this const's own module doc above.
  review_only: "Autonomous",
};

/** Plain-language effect of each level — shown directly in the UI so a
 * coach never has to guess what a label implies. Phase 5.4A: rewritten to
 * the exact behavioral meanings that phase's brief specifies (§II.1.I) —
 * `review_only`'s real value is unchanged (still the most autonomous
 * level, still gated by every existing safety check) so every already-
 * persisted CoachAiAuthoritySettings record and the 16 pre-existing
 * ai-authority tests remain valid; only the label/description text moved
 * from "review the decision trail" framing to the brief's own "Autonomous /
 * Coach review" framing. */
export const AI_AUTHORITY_LEVEL_DESCRIPTIONS: Record<AiAuthorityLevel, string> = {
  advisor: "OPTIM analyzes and recommends. You apply everything yourself.",
  copilot: "OPTIM completes the work. You approve before it executes.",
  ai_led: "OPTIM executes routine, approved actions on its own. You confirm major changes and handle escalations.",
  review_only: "OPTIM operates within your policies. You review outcomes and exceptions.",
};

/** Live (Supabase) wording for the same levels. In production today the
 * level is a real, per-coach, versioned preference that shapes how OPTIM's
 * client chat frames its role — but no level executes plan or nutrition
 * changes on its own (chat never writes to a plan; every program and
 * adjustment is a draft the coach approves). So the live UI describes the
 * coach's preference without claiming autonomy that isn't built. The
 * descriptions above stay as-is: demo mode and the chat prompt use them. */
export const AI_AUTHORITY_LEVEL_LIVE_DESCRIPTIONS: Record<AiAuthorityLevel, string> = {
  advisor: "OPTIM suggests, and you decide everything.",
  copilot: "OPTIM prepares drafts for you to review. Nothing reaches a client until you approve it.",
  ai_led: "Your preference for OPTIM to take on more routine work. For now, every plan change still comes to you for approval.",
  review_only: "Your preference for OPTIM to work within your policies with fewer check-ins. For now, every plan change still comes to you for approval.",
};

/** Phase 5.3B's original four coarse domains, kept exactly as-is (still
 * valid AiAuthorityDomain values, still what any already-persisted
 * settings/tests reference) — see this phase's audit: extend, never
 * replace. Phase 5.4A adds seven more specific domains below, which is what
 * AI_AUTHORITY_DOMAINS (the array new UI iterates) now contains; the four
 * legacy values remain supported by the type and the resolver but are no
 * longer offered as a fresh override target in new UI. */
export type AiAuthorityDomain =
  | "training"
  | "nutrition"
  | "daily_planning"
  | "accountability_messaging"
  | "training_generation"
  | "training_adjustment"
  | "nutrition_generation"
  | "nutrition_adjustment"
  | "communication"
  | "scheduling"
  | "check_ins";

/** The seven domains Phase 5.4A's Chapter 8 (AI authority) and the AI
 * Authority Playbook panel actually offer for override — see this file's
 * own doc above for why the legacy four aren't included here. */
export const AI_AUTHORITY_DOMAINS: AiAuthorityDomain[] = [
  "training_generation",
  "training_adjustment",
  "nutrition_generation",
  "nutrition_adjustment",
  "communication",
  "scheduling",
  "check_ins",
];

export const AI_AUTHORITY_DOMAIN_LABELS: Record<AiAuthorityDomain, string> = {
  training: "Training",
  nutrition: "Nutrition",
  daily_planning: "Daily planning",
  accountability_messaging: "Accountability & messaging",
  training_generation: "Training generation",
  training_adjustment: "Training adjustment",
  nutrition_generation: "Nutrition generation",
  nutrition_adjustment: "Nutrition adjustment",
  communication: "Communication",
  scheduling: "Scheduling",
  check_ins: "Check-ins",
};

/** A real action category the resolver can classify — deliberately NOT the
 * same shape as ReviewRequestKind (lib/types.ts): those are already-
 * escalated events; these are the categories a hypothetical automation
 * layer would check BEFORE deciding whether to escalate one.
 * `activation_approval` (Phase 5.4A) is deliberately separate from
 * `training_change`/`nutrition_change`: a client's very FIRST generated
 * program/nutrition strategy is not an "adjustment" to an existing plan,
 * so it is never subject to the "a major training/nutrition change always
 * escalates" rule below — see resolveAiActionDisposition. */
export type AiActionCategory = "training_change" | "nutrition_change" | "daily_planning_adjustment" | "messaging_nudge" | "pain_or_injury" | "out_of_bounds" | "activation_approval";

/** Whether a training/nutrition change is routine or major — only these two
 * categories carry this distinction; a "major" change always escalates
 * regardless of level (see resolveAiActionDisposition). */
export type AiActionScope = "routine" | "major";

/** What the resolver decided should happen with a candidate action. */
export type AiActionDisposition = "suggest" | "draft" | "auto_execute" | "escalate";

export interface AiAuthorityDomainOverrides {
  training?: AiAuthorityLevel;
  nutrition?: AiAuthorityLevel;
  daily_planning?: AiAuthorityLevel;
  accountability_messaging?: AiAuthorityLevel;
  training_generation?: AiAuthorityLevel;
  training_adjustment?: AiAuthorityLevel;
  nutrition_generation?: AiAuthorityLevel;
  nutrition_adjustment?: AiAuthorityLevel;
  communication?: AiAuthorityLevel;
  scheduling?: AiAuthorityLevel;
  check_ins?: AiAuthorityLevel;
}

export interface AiAuthorityConfig {
  level: AiAuthorityLevel;
  domainOverrides: AiAuthorityDomainOverrides;
}

export interface CoachAiAuthoritySettings {
  coachId: CoachProfileId;
  workspaceId: WorkspaceId;
  global: AiAuthorityConfig;
  /** Sparse — a client only appears here once a coach has explicitly set an
   * override for them. Absence means "use the global default." */
  clientOverrides: Record<ClientProfileId, AiAuthorityConfig>;
  updatedAtIso: string;
}

export const DEFAULT_AI_AUTHORITY_LEVEL: AiAuthorityLevel = "copilot";

export function defaultAiAuthorityConfig(): AiAuthorityConfig {
  return { level: DEFAULT_AI_AUTHORITY_LEVEL, domainOverrides: {} };
}

/** Every read site gets a real, complete config — never undefined — even
 * for a coach who has never touched this setting (see this phase's
 * "honest handling of missing data": the honest default is a named,
 * documented level, never a silent no-op or a fabricated "AI is disabled"
 * claim). */
export function defaultCoachAiAuthoritySettings(coachId: CoachProfileId, workspaceId: WorkspaceId, nowIso: string): CoachAiAuthoritySettings {
  return { coachId, workspaceId, global: defaultAiAuthorityConfig(), clientOverrides: {}, updatedAtIso: nowIso };
}

/** The effective level for one client (or the global default when
 * `clientId` is null/has no override), then narrowed by a domain override
 * if one exists at that same scope. Client-level domain overrides win over
 * global-level ones; a client override with no domain overrides of its own
 * still falls back to the GLOBAL domain overrides for domains it doesn't
 * mention — a coach setting "Nutrition: Advisor" globally shouldn't have to
 * repeat it on every per-client override that only exists to change
 * something else. */
export function resolveEffectiveAiAuthorityLevel(
  settings: CoachAiAuthoritySettings,
  clientId: ClientProfileId | null,
  domain?: AiAuthorityDomain
): AiAuthorityLevel {
  const clientConfig = clientId ? settings.clientOverrides[clientId] : undefined;
  const scopeConfig = clientConfig ?? settings.global;

  if (domain) {
    const clientDomainOverride = clientConfig?.domainOverrides[domain];
    if (clientDomainOverride) return clientDomainOverride;
    const globalDomainOverride = settings.global.domainOverrides[domain];
    if (globalDomainOverride) return globalDomainOverride;
  }

  return scopeConfig.level;
}

type RoutineCategory = "training_change" | "nutrition_change" | "daily_planning_adjustment" | "messaging_nudge" | "activation_approval";

const ROUTINE_DISPOSITION: Record<AiAuthorityLevel, Record<RoutineCategory, AiActionDisposition>> = {
  advisor: {
    training_change: "suggest",
    nutrition_change: "suggest",
    daily_planning_adjustment: "suggest",
    messaging_nudge: "suggest",
    activation_approval: "suggest",
  },
  copilot: {
    training_change: "draft",
    nutrition_change: "draft",
    daily_planning_adjustment: "auto_execute",
    messaging_nudge: "auto_execute",
    // A client's very first activation is always drafted for approval
    // under Copilot, matching this phase's brief exactly ("OPTIM creates
    // complete, activation-ready work. The coach approves before anything
    // reaches the client") — never auto_execute, even though other routine
    // training/nutrition changes at this level also draft rather than
    // execute, so this doesn't change existing Copilot behavior elsewhere.
    activation_approval: "draft",
  },
  ai_led: {
    training_change: "auto_execute",
    nutrition_change: "auto_execute",
    daily_planning_adjustment: "auto_execute",
    messaging_nudge: "auto_execute",
    // AI-led still auto-executes an initial activation, but the Activation
    // Studio UI always renders a concise confirmation for this specific
    // category regardless of disposition — see this phase's brief §II.1.I
    // ("Initial activation receives a concise confirmation") — deliberately
    // NOT a fifth disposition value; see activation-lifecycle.ts's module
    // doc for why that would be unnecessary type-surface growth.
    activation_approval: "auto_execute",
  },
  review_only: {
    training_change: "auto_execute",
    nutrition_change: "auto_execute",
    daily_planning_adjustment: "auto_execute",
    messaging_nudge: "auto_execute",
    activation_approval: "auto_execute",
  },
};

/**
 * The one place "what may OPTIM do with this action" is decided. Pure and
 * total: every (level, category, scope) combination returns a real,
 * deterministic disposition, never throws. Safety rules are enforced
 * BEFORE the level is ever consulted, so no level — not even the most
 * autonomous — can weaken them:
 *   - pain/injury and out-of-bounds actions always escalate.
 *   - a "major" training or nutrition change always escalates, regardless
 *     of level — only a "routine" one is ever eligible for the level's own
 *     table below.
 */
export function resolveAiActionDisposition(level: AiAuthorityLevel, category: AiActionCategory, scope: AiActionScope = "routine"): AiActionDisposition {
  if (category === "pain_or_injury" || category === "out_of_bounds") return "escalate";
  if (scope === "major" && (category === "training_change" || category === "nutrition_change")) return "escalate";
  return ROUTINE_DISPOSITION[level][category];
}

/** Convenience wrapper combining level resolution and disposition in one
 * call — what a coach-workspace screen actually wants: "given this client
 * and this kind of action, what should happen." */
export function resolveAiAction(
  settings: CoachAiAuthoritySettings,
  clientId: ClientProfileId | null,
  category: AiActionCategory,
  scope: AiActionScope = "routine",
  domain?: AiAuthorityDomain
): AiActionDisposition {
  const level = resolveEffectiveAiAuthorityLevel(settings, clientId, domain);
  return resolveAiActionDisposition(level, category, scope);
}
