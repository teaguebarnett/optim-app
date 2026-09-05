"use client";

import { useCallback } from "react";
import { useCoachWorkspace } from "@/hooks/use-coach-data";
import { getAiAuthoritySettings } from "@/lib/coach/repository";
import type { AiAuthorityConfig, CoachAiAuthoritySettings } from "@/lib/coach/ai-authority";
import type { ClientProfileId } from "@/lib/tenancy/types";

/**
 * The one place a coach screen reads/writes AI Coaching Authority — mirrors
 * useCoachWorkspace's own join pattern rather than reading PlatformState
 * directly. Always returns a real, complete settings record (see
 * lib/coach/repository.ts's getAiAuthoritySettings) even for a coach who
 * has never touched this setting.
 */
export function useAiAuthority(): {
  settings: CoachAiAuthoritySettings;
  coachId: string | null;
  setGlobal: (config: AiAuthorityConfig) => void;
  setClientOverride: (clientId: ClientProfileId, config: AiAuthorityConfig | null) => void;
} {
  const { platform, dispatchPlatform, coachId, workspaceId } = useCoachWorkspace();
  const settings = coachId
    ? getAiAuthoritySettings(platform, coachId, workspaceId)
    : { coachId: "", workspaceId, global: { level: "copilot" as const, domainOverrides: {} }, clientOverrides: {}, updatedAtIso: "" };

  const setGlobal = useCallback(
    (config: AiAuthorityConfig) => {
      if (!coachId) return;
      dispatchPlatform({ type: "SET_AI_AUTHORITY_GLOBAL", coachId, workspaceId, config, nowIso: new Date().toISOString() });
    },
    [coachId, workspaceId, dispatchPlatform]
  );

  const setClientOverride = useCallback(
    (clientId: ClientProfileId, config: AiAuthorityConfig | null) => {
      if (!coachId) return;
      dispatchPlatform({ type: "SET_AI_AUTHORITY_CLIENT_OVERRIDE", coachId, workspaceId, clientId, config, nowIso: new Date().toISOString() });
    },
    [coachId, workspaceId, dispatchPlatform]
  );

  return { settings, coachId, setGlobal, setClientOverride };
}
