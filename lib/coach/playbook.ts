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

/** Renders the Playbook into the natural-language system prompt section a
 * ChatModelProvider is given — the model never sees this file's field
 * names, only plain prose, matching operating-model.ts's own "no coach ever
 * sees a field key from this file" posture extended to the model itself.
 * Deliberately concise (bounded context, per the phase's "bound conversation
 * history and context size deliberately" requirement) — the full nested
 * model is not dumped verbatim, only the parts that actually change how a
 * response should sound or what it may promise. */
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
  if (examples.length > 0) {
    lines.push("Examples of how this coach has resolved similar situations before:");
    for (const ex of examples.slice(-5)) {
      lines.push(`- Situation: ${ex.situation} -> Resolution: ${ex.resolution}`);
    }
  }
  return lines.join("\n");
}
