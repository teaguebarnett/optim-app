"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Gate 4.0B — the first screen a real client sees after accepting their
 * coach's invitation (never an appearance picker, never the daily app).
 * One action. The coach's name is the real assigned coach's display name;
 * "your coach" when none can be resolved — never a hardcoded person.
 */
export function OnboardingWelcome({ coachName, onStart }: { coachName: string; onStart: () => void }) {
  const named = coachName && coachName !== "your coach";
  return (
    <div className="flex min-h-[70vh] flex-col justify-center">
      <p className="text-label text-brass-strong pc-animate-in">Welcome to OPTIM</p>
      <h1 className="mt-3 text-display text-off-white pc-animate-in" style={{ animationDelay: "40ms" }}>
        You’re in.
      </h1>
      <p className="mt-4 text-body text-off-white pc-animate-in" style={{ animationDelay: "80ms" }}>
        {named ? coachName : "Your coach"} invited you to OPTIM.
      </p>
      <p className="mt-3 text-body text-neutral pc-animate-in" style={{ animationDelay: "120ms" }}>
        We’ll ask a few questions about your goals, training, nutrition, schedule, and preferences so your coach starts with the right context.
      </p>
      <Button className="mt-8 w-full pc-animate-in" size="lg" onClick={onStart} style={{ animationDelay: "180ms" }}>
        Start setup
        <ArrowRight size={17} aria-hidden="true" />
      </Button>
      <p className="mt-3 text-center text-meta text-neutral pc-animate-in" style={{ animationDelay: "220ms" }}>
        Takes about 6–10 minutes · Your progress saves automatically
      </p>
    </div>
  );
}
