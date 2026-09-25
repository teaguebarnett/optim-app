"use server";

// Gate 6C — /coach/settings's real Supabase-mode write path. Settings has
// exactly one editable, production-backed control (AI Coaching Authority —
// see lib/production/playbooks.ts's updateApprovedPlaybookAiAuthorityGlobal
// for why this writes in place rather than through the draft/approve
// pipeline); every other section on that page either has no production
// data source yet (Workspace baseline, Daily Briefings) or is already real
// (Appearance, via ThemeProvider).

import { resolveOwnStaffWorkspace } from "@/lib/production/auth";
import { updateApprovedPlaybookAiAuthorityGlobal } from "@/lib/production/playbooks";
import type { AiAuthorityConfig, CoachAiAuthoritySettings } from "@/lib/coach/ai-authority";

export async function updateMyWorkspaceAiAuthorityGlobalAction(config: AiAuthorityConfig): Promise<CoachAiAuthoritySettings> {
  const { workspaceId } = await resolveOwnStaffWorkspace();
  const playbook = await updateApprovedPlaybookAiAuthorityGlobal({ workspaceId, config });
  return playbook.content.aiAuthority;
}
