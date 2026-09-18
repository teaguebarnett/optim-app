"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowRight, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function IntroPoint({ icon: Icon, children, delay }: { icon: LucideIcon; children: string; delay: string }) {
  return (
    <Card className="flex items-start gap-3 pc-animate-in" style={{ animationDelay: delay }}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
        <Icon size={17} aria-hidden="true" />
      </span>
      <p className="text-sm text-off-white">{children}</p>
    </Card>
  );
}

/**
 * The brief, concise bridge between the coach's personal welcome and the
 * actual questions — sets honest expectations before the client is asked
 * for anything. Never a wall of text: three short, iconed facts a client
 * can scan in seconds. Shown once per fresh onboarding attempt (see
 * onboarding-wizard.tsx — skipped entirely when resuming existing
 * progress, so a returning client is never made to re-read it).
 */
export function OptimIntro({ coachName, onContinue }: { coachName: string; onContinue: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col justify-center">
      <div className="text-center">
        <p className="text-label text-brass-strong pc-animate-in">Before we start</p>
        <h1 className="mt-2 text-display text-off-white pc-animate-in" style={{ animationDelay: "40ms" }}>
          Quick and worth doing well
        </h1>
      </div>

      <div className="mt-8 space-y-3">
        <IntroPoint icon={ShieldCheck} delay="80ms">
          {`${coachName} remains your coach and makes every real decision. OPTIM only organizes what you share and helps within the boundaries ${coachName} sets.`}
        </IntroPoint>
        <IntroPoint icon={Clock3} delay="140ms">
          {"About 10–12 minutes. Your progress saves after every step, and you can always go back without losing an answer."}
        </IntroPoint>
        <IntroPoint icon={Sparkles} delay="200ms">
          {`The more accurate your answers, the more precisely ${coachName} can build your first weeks.`}
        </IntroPoint>
      </div>

      <Button className="mt-8 w-full pc-animate-in" size="lg" onClick={onContinue} style={{ animationDelay: "260ms" }}>
        Start
        <ArrowRight size={17} aria-hidden="true" />
      </Button>
    </div>
  );
}
