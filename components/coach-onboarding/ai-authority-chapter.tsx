"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiAuthorityPanel } from "@/components/coach/ai-authority-panel";

/**
 * Reuses the exact same AiAuthorityPanel the Playbook uses (this phase's
 * brief §III.4 Chapter 8: "Use the existing interactive authority
 * system.") — a coach configuring authority here and later in Settings is
 * looking at literally the same live control, not two things that could
 * drift apart.
 */
export function AiAuthorityChapter({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-display text-off-white">How much should OPTIM do on its own?</h2>
      <p className="mt-2 text-body text-neutral">
        This sets your workspace-wide default — you can still override it for any individual client later, and change it any time in Settings.
      </p>
      <div className="mt-6">
        <AiAuthorityPanel />
      </div>
      <div className="mt-8">
        <Button size="lg" onClick={onContinue}>
          Continue <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
