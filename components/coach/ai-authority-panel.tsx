"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapse } from "@/components/ui/collapse";
import { DiscreteSlider } from "@/components/ui/discrete-slider";
import { useAiAuthority } from "@/hooks/use-ai-authority";
import {
  AI_AUTHORITY_DOMAINS,
  AI_AUTHORITY_DOMAIN_LABELS,
  AI_AUTHORITY_LEVELS,
  AI_AUTHORITY_LEVEL_DESCRIPTIONS,
  AI_AUTHORITY_LEVEL_LABELS,
  type AiAuthorityLevel,
} from "@/lib/coach/ai-authority";
import { cn } from "@/lib/cn";

const LEVEL_POSITIONS = AI_AUTHORITY_LEVELS.map((level) => ({ value: level, label: AI_AUTHORITY_LEVEL_LABELS[level] }));

/**
 * The Playbook's AI Coaching Authority section — a real tactile four-
 * position slider for the workspace-wide default, plus a compact per-
 * domain override control that reveals the detailed explanation only for
 * the currently-selected value (never four repeated paragraphs at once).
 * No generative AI service exists in this repository; this only controls
 * what a future automation layer would be ALLOWED to do.
 */
export function AiAuthorityPanel() {
  const { settings, setGlobal } = useAiAuthority();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Live preview while dragging/keying through the global slider, before
  // the value actually commits — see DiscreteSlider's onPreviewChange doc.
  const [previewLevel, setPreviewLevel] = useState<AiAuthorityLevel | null>(null);

  function setLevel(level: AiAuthorityLevel) {
    setGlobal({ level, domainOverrides: settings.global.domainOverrides });
  }

  function setDomainOverride(domain: (typeof AI_AUTHORITY_DOMAINS)[number], level: AiAuthorityLevel | null) {
    const domainOverrides = { ...settings.global.domainOverrides };
    if (level === null) delete domainOverrides[domain];
    else domainOverrides[domain] = level;
    setGlobal({ level: settings.global.level, domainOverrides });
  }

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-subheading text-off-white">AI Coaching Authority</p>
        <p className="mt-1 text-meta text-neutral">How much OPTIM handles on its own by default, workspace-wide. Override an individual client from their own page.</p>
      </div>

      <DiscreteSlider
        ariaLabel="AI Coaching Authority — workspace default"
        positions={LEVEL_POSITIONS}
        value={settings.global.level}
        onChange={(v) => {
          setLevel(v as AiAuthorityLevel);
          setPreviewLevel(null);
        }}
        onPreviewChange={(v) => setPreviewLevel(v as AiAuthorityLevel)}
      />
      <p className="rounded-[var(--radius-sm)] bg-accent-soft px-3.5 py-2.5 text-sm text-accent-strong">{AI_AUTHORITY_LEVEL_DESCRIPTIONS[previewLevel ?? settings.global.level]}</p>

      <div className="border-t border-border pt-4">
        <button type="button" onClick={() => setAdvancedOpen((v) => !v)} aria-expanded={advancedOpen} className="flex w-full items-center justify-between gap-2 text-left">
          <span className="flex items-center gap-2 text-sm font-medium text-off-white">
            <SlidersHorizontal size={15} className="text-neutral" aria-hidden="true" />
            Advanced — domain-specific overrides
          </span>
          <ChevronDown size={16} className={cn("text-neutral transition-transform", advancedOpen && "rotate-180")} style={{ transitionDuration: "var(--motion-fast)" }} />
        </button>
        <Collapse open={advancedOpen}>
          <div className="mt-4 space-y-5 pt-1">
            {AI_AUTHORITY_DOMAINS.map((domain) => {
              const override = settings.global.domainOverrides[domain];
              return (
                <div key={domain}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-off-white">{AI_AUTHORITY_DOMAIN_LABELS[domain]}</p>
                    <div role="group" aria-label={`${AI_AUTHORITY_DOMAIN_LABELS[domain]} override mode`} className="inline-flex rounded-[var(--radius-sm)] border border-border-strong bg-surface-input p-0.5">
                      <button
                        type="button"
                        aria-pressed={!override}
                        onClick={() => setDomainOverride(domain, null)}
                        className={cn("rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-1 text-xs font-medium transition-colors", !override ? "bg-accent text-on-accent" : "text-neutral hover:text-off-white")}
                        style={{ transitionDuration: "var(--motion-fast)" }}
                      >
                        Use default
                      </button>
                      <button
                        type="button"
                        aria-pressed={!!override}
                        onClick={() => setDomainOverride(domain, settings.global.level)}
                        className={cn("rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-1 text-xs font-medium transition-colors", override ? "bg-accent text-on-accent" : "text-neutral hover:text-off-white")}
                        style={{ transitionDuration: "var(--motion-fast)" }}
                      >
                        Override
                      </button>
                    </div>
                  </div>
                  {override ? (
                    <div className="mt-3">
                      <DiscreteSlider
                        ariaLabel={`${AI_AUTHORITY_DOMAIN_LABELS[domain]} authority level`}
                        positions={LEVEL_POSITIONS}
                        value={override}
                        onChange={(v) => setDomainOverride(domain, v as AiAuthorityLevel)}
                      />
                    </div>
                  ) : (
                    <p className="mt-1.5 text-meta text-neutral">Using default: {AI_AUTHORITY_LEVEL_LABELS[settings.global.level]}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Collapse>
      </div>
    </Card>
  );
}
