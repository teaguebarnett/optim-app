"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DiscreteSlider } from "@/components/ui/discrete-slider";
import { AI_AUTHORITY_LEVELS, AI_AUTHORITY_LEVEL_DESCRIPTIONS, AI_AUTHORITY_LEVEL_LABELS, type AiAuthorityLevel } from "@/lib/coach/ai-authority";

const POSITIONS = AI_AUTHORITY_LEVELS.map((level) => ({ value: level, label: AI_AUTHORITY_LEVEL_LABELS[level] }));

/** The command center's real, tactile AI Coaching Authority control — not
 * a status card that merely displays the level, an actual four-position
 * slider that changes the workspace default in place. Links to Playbook
 * only for the advanced per-domain overrides. */
export function AiAuthorityRailCard({ level, onChange }: { level: AiAuthorityLevel; onChange: (level: AiAuthorityLevel) => void }) {
  // Live preview while dragging/keying, before the value actually commits.
  const [previewLevel, setPreviewLevel] = useState<AiAuthorityLevel | null>(null);

  return (
    <Card>
      <p className="text-meta text-neutral">{AI_AUTHORITY_LEVEL_DESCRIPTIONS[previewLevel ?? level]}</p>
      <div className="mt-4">
        <DiscreteSlider
          ariaLabel="AI Coaching Authority level"
          positions={POSITIONS}
          value={level}
          onChange={(v) => {
            onChange(v as AiAuthorityLevel);
            setPreviewLevel(null);
          }}
          onPreviewChange={(v) => setPreviewLevel(v as AiAuthorityLevel)}
        />
      </div>
      <Link href="/coach/settings" className="mt-4 inline-block text-action text-accent-strong hover:underline">
        Configure domain overrides
      </Link>
    </Card>
  );
}
