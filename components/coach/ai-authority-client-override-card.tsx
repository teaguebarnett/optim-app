"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DiscreteSlider } from "@/components/ui/discrete-slider";
import { useAiAuthority } from "@/hooks/use-ai-authority";
import { AI_AUTHORITY_LEVELS, AI_AUTHORITY_LEVEL_DESCRIPTIONS, AI_AUTHORITY_LEVEL_LABELS, type AiAuthorityLevel } from "@/lib/coach/ai-authority";
import type { ClientProfileId } from "@/lib/tenancy/types";

const POSITIONS = AI_AUTHORITY_LEVELS.map((level) => ({ value: level, label: AI_AUTHORITY_LEVEL_LABELS[level] }));

/**
 * A single client's AI Coaching Authority — inherits the workspace default
 * (see AiAuthorityPanel on the Playbook page) until this coach explicitly
 * overrides it for this one client. Moving the slider while inheriting the
 * default creates a real override starting from that same value — there's
 * no ambiguous "half set" state. "Use workspace default" removes the
 * override entirely, so a later change to the global default is
 * immediately reflected here again.
 */
export function AiAuthorityClientOverrideCard({ clientId }: { clientId: ClientProfileId }) {
  const { settings, setClientOverride } = useAiAuthority();
  const override = settings.clientOverrides[clientId];
  const effectiveLevel = override?.level ?? settings.global.level;
  const isOverridden = !!override;
  // Live preview while dragging/keying, before the value actually commits.
  const [previewLevel, setPreviewLevel] = useState<AiAuthorityLevel | null>(null);

  function choose(level: AiAuthorityLevel) {
    setClientOverride(clientId, { level, domainOverrides: override?.domainOverrides ?? {} });
  }

  function resetToGlobal() {
    setClientOverride(clientId, null);
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-subheading text-off-white">AI Coaching Authority</p>
          <p className="mt-0.5 text-meta text-neutral">{isOverridden ? "Overridden for this client" : "Using workspace default"}</p>
        </div>
        {isOverridden ? (
          <Button variant="ghost" size="sm" onClick={resetToGlobal}>
            <RotateCcw size={13} aria-hidden="true" />
            Use default
          </Button>
        ) : null}
      </div>

      <DiscreteSlider
        ariaLabel={`AI Coaching Authority for this client`}
        positions={POSITIONS}
        value={effectiveLevel}
        onChange={(v) => {
          choose(v as AiAuthorityLevel);
          setPreviewLevel(null);
        }}
        onPreviewChange={(v) => setPreviewLevel(v as AiAuthorityLevel)}
      />
      <p className="text-meta text-neutral">{AI_AUTHORITY_LEVEL_DESCRIPTIONS[previewLevel ?? effectiveLevel]}</p>
    </Card>
  );
}
