"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { DiscreteSlider } from "@/components/ui/discrete-slider";
import { useAiAuthority } from "@/hooks/use-ai-authority";
import {
  AI_AUTHORITY_DOMAINS,
  AI_AUTHORITY_DOMAIN_LABELS,
  AI_AUTHORITY_LEVELS,
  AI_AUTHORITY_LEVEL_DESCRIPTIONS,
  AI_AUTHORITY_LEVEL_LABELS,
  type AiAuthorityConfig,
  type AiAuthorityLevel,
  type CoachAiAuthoritySettings,
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
 *
 * Gate 5B — `confirmChanges` gates the workspace-wide DEFAULT behind an
 * explicit confirm step (current -> proposed -> confirm/cancel, the same
 * inline pattern Gate 4D's program-replacement guard uses), since this is
 * the one control here with the broadest blast radius: it changes the
 * disposition every routine action resolves to for every client that
 * doesn't already have its own override. Domain overrides stay immediate
 * — narrower scope, easily reversible, no confirmation warranted. Defaults
 * to `false` so components/coach-onboarding/ai-authority-chapter.tsx (which
 * reuses this exact component — "literally the same live control") keeps
 * its existing zero-friction behavior: there's no established baseline to
 * protect during initial calibration, only during later, deliberate edits
 * from Settings.
 *
 * Gate 6C — `override` lets a Supabase-mode caller (see
 * components/coach/live-ai-authority-panel.tsx) supply the real,
 * workspace-scoped settings/setGlobal instead of this component's own
 * demo-only useAiAuthority() hook, without duplicating the slider/advanced-
 * overrides UI. useAiAuthority() is still called unconditionally (React's
 * rules of hooks forbid a conditional call); its result is simply unused
 * whenever override is provided.
 */
export function AiAuthorityPanel({
  confirmChanges = false,
  override,
}: {
  confirmChanges?: boolean;
  override?: { settings: CoachAiAuthoritySettings; setGlobal: (config: AiAuthorityConfig) => void };
} = {}) {
  const demo = useAiAuthority();
  const settings = override?.settings ?? demo.settings;
  const setGlobal = override?.setGlobal ?? demo.setGlobal;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Live preview while dragging/keying through the global slider, before
  // the value actually commits — see DiscreteSlider's onPreviewChange doc.
  const [previewLevel, setPreviewLevel] = useState<AiAuthorityLevel | null>(null);
  // Gate 5B — a selected-but-not-yet-confirmed global level, only ever set
  // when confirmChanges is true. Never written to canonical state until the
  // coach explicitly confirms; Cancel (or navigating away) discards it with
  // zero mutation, since setGlobal is never called until then.
  const [pendingLevel, setPendingLevel] = useState<AiAuthorityLevel | null>(null);

  function setLevel(level: AiAuthorityLevel) {
    setGlobal({ level, domainOverrides: settings.global.domainOverrides });
  }

  function setDomainOverride(domain: (typeof AI_AUTHORITY_DOMAINS)[number], level: AiAuthorityLevel | null) {
    const domainOverrides = { ...settings.global.domainOverrides };
    if (level === null) delete domainOverrides[domain];
    else domainOverrides[domain] = level;
    setGlobal({ level: settings.global.level, domainOverrides });
  }

  const displayedLevel = pendingLevel ?? settings.global.level;

  return (
    <Card className="space-y-5">
      <div>
        <p className="text-subheading text-off-white">AI Coaching Authority</p>
        <p className="mt-1 text-meta text-neutral">
          How much OPTIM handles on its own by default, workspace-wide. Changing this never touches an existing per-client override — override an
          individual client from their own page.
        </p>
      </div>

      <DiscreteSlider
        ariaLabel="AI Coaching Authority — workspace default"
        positions={LEVEL_POSITIONS}
        value={displayedLevel}
        onChange={(v) => {
          const next = v as AiAuthorityLevel;
          if (confirmChanges) {
            setPendingLevel(next === settings.global.level ? null : next);
          } else {
            setLevel(next);
          }
          setPreviewLevel(null);
        }}
        onPreviewChange={(v) => setPreviewLevel(v as AiAuthorityLevel)}
      />
      <p className="rounded-[var(--radius-sm)] bg-accent-soft px-3.5 py-2.5 text-sm text-accent-fg">{AI_AUTHORITY_LEVEL_DESCRIPTIONS[previewLevel ?? displayedLevel]}</p>

      {pendingLevel ? (
        <div className="rounded-[var(--radius-sm)] border border-warning/40 bg-warning-soft/40 p-3.5 text-sm">
          <p className="text-off-white">
            Change the workspace default from &ldquo;{AI_AUTHORITY_LEVEL_LABELS[settings.global.level]}&rdquo; to &ldquo;{AI_AUTHORITY_LEVEL_LABELS[pendingLevel]}&rdquo;?
          </p>
          <p className="mt-1.5 text-meta text-neutral">
            This changes what OPTIM may do on its own for every client using the workspace default. Clients with their own explicit override are not
            affected.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setLevel(pendingLevel);
                setPendingLevel(null);
              }}
            >
              Confirm change
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingLevel(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

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
