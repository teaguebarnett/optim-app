// Phase 6.0C — Coach-Trained Chat Intelligence and Escalation.
//
// The Coach Playbook: OPTIM's intelligence source, built from — not a
// duplicate of — the existing coach calibration data model
// (operating-model.ts's CoachOperatingModel) and AI authority settings
// (ai-authority.ts's CoachAiAuthoritySettings). This file adds only what
// those two didn't already have: a place for examples of prior coach
// decisions/corrections, and the version/status envelope
// supabase/migrations/20260910000012_chat_intelligence.sql's coach_playbooks
// table persists.
//
// Pure and demo-independent — no localStorage, no PlatformState import —
// so both the Supabase-mode repository (lib/production/playbooks.ts) and
// tests can use these functions without pulling in browser-only code.

import type { CoachOperatingModel } from "./operating-model.ts";
import { createDefaultCoachOperatingModel } from "./operating-model.ts";
import type { CoachAiAuthoritySettings } from "./ai-authority.ts";
import { defaultAiAuthorityConfig } from "./ai-authority.ts";
import type { CoachProfileId, WorkspaceId } from "../tenancy/types.ts";

/** One prior coach decision or correction, offered as future context for
 * similar situations. Never auto-added — see
 * lib/production/playbooks.ts's proposePlaybookExampleFromEscalation,
 * which only ever creates a new DRAFT version containing a proposed
 * example; only an explicit coach approval makes it part of the active
 * Playbook. "A single resolution must not silently change global
 * methodology." */
export interface PlaybookExample {
  id: string;
  /** Null for a hand-authored example never tied to a real escalation. */
  sourceEscalationId: string | null;
  situation: string;
  resolution: string;
  addedAtIso: string;
}

export type CoachPlaybookStatus = "draft" | "approved";

export interface CoachPlaybookContent {
  operatingModel: CoachOperatingModel;
  aiAuthority: CoachAiAuthoritySettings;
  examples: PlaybookExample[];
}

export interface CoachPlaybook {
  id: string;
  workspaceId: WorkspaceId;
  version: number;
  status: CoachPlaybookStatus;
  content: CoachPlaybookContent;
  createdByUserId: string | null;
  createdAtIso: string;
  approvedByUserId: string | null;
  approvedAtIso: string | null;
}

/** A complete, honest starting Playbook — every section has a real,
 * reasonable default (same posture as createDefaultCoachOperatingModel's
 * own doc: never a blank/undefined leaf) and zero examples, since there is
 * no prior decision history yet for a brand-new workspace. This is what
 * bootstraps version 1, approved, for a workspace that has never had a
 * Playbook before — not a "silent rewrite" of an existing one (there isn't
 * one yet), the same distinction createDefaultCoachOperatingModel's own doc
 * draws for a legacy coach who skips calibration entirely. */
export function buildDefaultPlaybookContent(input: {
  coachId: CoachProfileId;
  workspaceId: WorkspaceId;
  nowIso: string;
  businessName: string;
}): CoachPlaybookContent {
  return {
    operatingModel: createDefaultCoachOperatingModel(input),
    aiAuthority: { coachId: input.coachId, workspaceId: input.workspaceId, global: defaultAiAuthorityConfig(), clientOverrides: {}, updatedAtIso: input.nowIso },
    examples: [],
  };
}

/** Plain-language phrasing for each `coachMustRespondPersonally` /
 * `aiMayRespondDirectly` enum value, matching
 * lib/coach/coach-onboarding-questions.ts's comm_must_respond_personally /
 * comm_ai_direct_response option labels exactly (in meaning, not verbatim
 * UI text) — so the model is told the same thing the coach actually agreed
 * to, never a paraphrase invented at prompt-build time. `none` is handled
 * separately below since it isn't a topic, it's the exclusive "review
 * everything" choice. */
const MUST_RESPOND_PERSONALLY_PHRASES: Record<string, string> = {
  pain_or_injury_report: "any pain or injury report",
  emotional_distress: "emotional distress",
  billing_or_account: "billing or account questions",
  major_goal_change_request: "a major goal-change request",
};

const MAY_RESPOND_DIRECTLY_PHRASES: Record<string, string> = {
  routine_logistics: "routine logistics (e.g. session timing)",
  how_to_log_a_meal: "how to log something",
  exercise_how_to: "how to perform an exercise",
};

function phraseList(values: string[], phrases: Record<string, string>): string[] {
  return values.map((v) => phrases[v]).filter((p): p is string => typeof p === "string");
}

/** Renders the Playbook into the natural-language system prompt section a
 * ChatModelProvider is given — the model never sees this file's field
 * names, only plain prose, matching operating-model.ts's own "no coach ever
 * sees a field key from this file" posture extended to the model itself.
 * Deliberately concise (bounded context, per the phase's "bound conversation
 * history and context size deliberately" requirement) — the full nested
 * model is not dumped verbatim, only the parts that actually change how a
 * response should sound or what it may promise.
 *
 * Gate 5C — `communication.aiMayRespondDirectly` and
 * `coachMustRespondPersonally` are real, coach-configured during onboarding,
 * but were never previously rendered into the prompt at all: the model had
 * no way to know either list existed. This prompt section is the first
 * layer only — lib/ai/communication-authority.ts's
 * enforceCoachCommunicationAuthority is the structural backstop that can
 * force the model's own decision to escalate regardless of what it wrote,
 * using a bounded keyword/phrase match against the client's message (see
 * that module's own doc for exactly what it can and cannot detect). Neither
 * layer invents a new escalation category or picks a specific
 * EscalationReason from thin air for the coach's own labels
 * (`billing_or_account` in particular has no matching reason in
 * lib/communications/types.ts's fixed enum, mirroring the real database
 * constraint — the enforcement module documents its own approximation) — it
 * only instructs the model to escalate (using whichever of its existing
 * seven reasons actually fits) for a "must respond personally"
 * topic, and that it may skip escalation/review for a "may respond
 * directly" topic. The onboarding question's exclusive "None — I want to
 * see everything first" option never actually survives into storage as the
 * string "none": lib/coach/coach-onboarding-engine.ts's
 * comm_ai_direct_response handler filters it out before assignment
 * (`.filter((v) => v !== "none")`), so choosing it produces an EMPTY
 * `aiMayRespondDirectly` array — which is otherwise unreachable, since
 * createDefaultCoachOperatingModel's own default for a coach who never
 * answered this question is non-empty. An empty array is therefore an
 * unambiguous "review everything" signal, not a missing-data state, and is
 * rendered as an explicit instruction to escalate every non-safety-critical
 * message — escalation is the only mechanism this system has for routing
 * something to the coach before a client sees it; there is no separate
 * "hold for draft review" queue for a plain answer today. This is a
 * meaningful behavior change for any coach who chose that option; see this
 * phase's own report for the full reasoning.
 *
 * `communication.aiMayDraftOnly` is deliberately NOT rendered here: no
 * onboarding question ever sets it (grep confirms zero
 * `modelFieldsAffected: ["communication.aiMayDraftOnly"]` entries), so every
 * coach's value is the same untouched default from
 * createDefaultCoachOperatingModel — there is nothing coach-specific to
 * enforce yet, and rendering the default as if a coach had chosen it would
 * be dishonest. Wiring this up needs a real onboarding question and
 * Playbook-editing UI first (separate follow-up work), not a prompt change. */
export function renderPlaybookForPrompt(content: CoachPlaybookContent): string {
  const { operatingModel: m, examples } = content;
  const lines: string[] = [];
  lines.push(`Coaching style: ${m.communication.tone}, ${m.communication.conciseness} responses, directness ${m.communication.directness}/5, warmth ${m.communication.warmth}/5.`);
  lines.push(`Program philosophy: ${m.programArchitecture.progressionMethod}, RPE/RIR target proximity: ${m.programArchitecture.proximityToFailure}.`);
  lines.push(`Substitution rule: ${m.programArchitecture.substitutionLogic}.`);
  lines.push(`Nutrition philosophy: ${m.nutritionPhilosophy.calorieTargetPhilosophy}; adherence standard: ${m.nutritionPhilosophy.adherenceStandard}.`);
  lines.push(`Safety: pain -> ${m.safety.painResponsePolicy}; injury -> ${m.safety.injuryResponsePolicy}; medical concern -> ${m.safety.medicalConcernPolicy}.`);
  if (m.safety.absoluteOverrideRules.length > 0) {
    lines.push(`Coach's absolute rules (never overridden): ${m.safety.absoluteOverrideRules.join("; ")}.`);
  }

  const mustEscalate = phraseList(m.communication.coachMustRespondPersonally, MUST_RESPOND_PERSONALLY_PHRASES);
  if (mustEscalate.length > 0) {
    lines.push(
      `This coach always wants to respond personally to: ${mustEscalate.join("; ")}. You must escalate to the coach (never answer these yourself) whenever a client message is genuinely about one of these, using whichever escalation reason best fits.`
    );
  }

  const wantsEverythingReviewed = m.communication.aiMayRespondDirectly.length === 0;
  if (wantsEverythingReviewed) {
    lines.push(
      "This coach wants to review everything before you respond independently — escalate every client message that isn't a plain safety-critical situation requiring immediate conservative guidance, rather than answering on your own."
    );
  } else {
    const mayRespond = phraseList(m.communication.aiMayRespondDirectly, MAY_RESPOND_DIRECTLY_PHRASES);
    if (mayRespond.length > 0) {
      lines.push(`This coach has said you may answer directly, with no need to escalate for review, for: ${mayRespond.join("; ")}.`);
    }
  }

  if (examples.length > 0) {
    lines.push("Examples of how this coach has resolved similar situations before:");
    for (const ex of examples.slice(-5)) {
      lines.push(`- Situation: ${ex.situation} -> Resolution: ${ex.resolution}`);
    }
  }
  return lines.join("\n");
}
