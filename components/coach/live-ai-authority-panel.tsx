"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AiAuthorityPanel } from "@/components/coach/ai-authority-panel";
import { updateMyCoachAuthorityAction } from "@/app/actions/coach-calibration";
import type { AiAuthorityConfig, CoachAiAuthoritySettings } from "@/lib/coach/ai-authority";

/**
 * Gate 3 — saves to the coach's OWN Coach Brain (a new confirmed method
 * version with the new authority) via updateMyCoachAuthorityAction — never
 * the shared workspace playbook, so one coach's authority can't change
 * another's.
 *
 * Gate 6C — the real Supabase-mode AI Coaching Authority control: renders
 * the exact same AiAuthorityPanel demo mode uses (see that component's own
 * "override" doc), but backed by the real, workspace-scoped
 * coach_playbooks row via updateMyWorkspaceAiAuthorityGlobalAction. Updates
 * optimistically, then reconciles with (or reverts to, on failure) the
 * server's own response — never leaves the slider showing a value that
 * silently failed to persist.
 */
export function LiveAiAuthorityPanel({ initialSettings }: { initialSettings: CoachAiAuthoritySettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setGlobal(config: AiAuthorityConfig) {
    const previous = settings;
    setSettings((s) => ({ ...s, global: config }));
    setError(null);
    setSaving(true);
    updateMyCoachAuthorityAction(config)
      .then((next) => setSettings(next))
      .catch((err) => {
        setSettings(previous);
        setError(err instanceof Error ? err.message : "Couldn't save AI Coaching Authority.");
      })
      .finally(() => setSaving(false));
  }

  return (
    <div className="space-y-2">
      <AiAuthorityPanel live confirmChanges override={{ settings, setGlobal }} />
      {saving ? <p className="text-meta text-neutral">Saving…</p> : null}
      {error ? (
        <p className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-error/40 bg-error-soft/40 px-3 py-2 text-sm text-off-white">
          <AlertTriangle size={14} className="shrink-0 text-error" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
