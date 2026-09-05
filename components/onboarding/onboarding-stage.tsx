import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { PhoneCanvas } from "@/components/app-shell/phone-canvas";
import { cn } from "@/lib/cn";

export interface OnboardingProgressInfo {
  sectionName: string;
  stepNumber: number;
  totalSteps: number;
  percentComplete: number;
}

/** A chapter's own internal pacing position (see lib/coach/onboarding-
 * steps.ts's OnboardingStepDef.moments) — rendered as small restrained
 * dots, never a second numeric counter that could be mistaken for real
 * top-level progress. */
export interface OnboardingMomentInfo {
  index: number;
  total: number;
}

export interface OnboardingRecapFact {
  label: string;
  value: string;
}

/**
 * The one unified onboarding composition every onboarding-adjacent screen
 * (coach welcome, the OPTIM introduction, each wizard chapter, the
 * post-submission status screen) shares.
 *
 * Phase 5.4A corrective pass: this used to open a genuine two-column
 * desktop scene at `lg` — a real desktop sidebar living OUTSIDE any phone
 * presentation, which manual review correctly flagged as a client-lifecycle
 * screen "escaping" the phone-only product decision. It's now always the
 * same compact, phone-native single-column composition (coach identity +
 * progress folded into one compact header, no separate rail) at every
 * width, wrapped in the shared PhoneCanvas — real full-bleed on an actual
 * phone, a deliberate ~420px phone canvas at desktop widths.
 */
export function OnboardingStage({
  children,
  coachName,
  coachInitials,
  progress,
  moment,
  recap,
  footer,
}: {
  children: ReactNode;
  coachName?: string;
  coachInitials?: string;
  /** Present only for the wizard's actual chapter screens — the invite/
   * setup-status screens omit it and get just the compact coach line. */
  progress?: OnboardingProgressInfo;
  moment?: OnboardingMomentInfo;
  recap?: OnboardingRecapFact[];
  /** Bottom action bar — pinned to the real viewport bottom on an actual
   * phone, and to the phone canvas's own bottom (never the browser
   * window's) at desktop widths. */
  footer?: ReactNode;
}) {
  const showMomentDots = !!moment && moment.total > 1;

  return (
    <PhoneCanvas>
      <div className="flex min-h-screen flex-1 flex-col lg:min-h-0 lg:overflow-y-auto">
        <header className="border-b border-border px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-4">
          <div className="flex items-center gap-2.5">
            <p className="text-label text-brass-strong">OPTIM</p>
            {coachName ? (
              <>
                <span className="text-neutral">·</span>
                <Avatar initials={coachInitials ?? coachName.slice(0, 2).toUpperCase()} variant="accent" size="sm" />
                <p className="min-w-0 truncate text-meta text-neutral">{coachName} is building this around you</p>
              </>
            ) : null}
          </div>

          {progress ? (
            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-off-white">{progress.sectionName}</p>
                <p className="text-meta text-neutral">
                  {progress.stepNumber} of {progress.totalSteps}
                </p>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-off-white/10">
                <div
                  className="h-full rounded-full bg-brass transition-[width]"
                  style={{ width: `${progress.percentComplete}%`, transitionDuration: "var(--motion-base)" }}
                />
              </div>
              {showMomentDots ? (
                <div className="mt-2.5 flex gap-1.5" aria-hidden="true">
                  {Array.from({ length: moment!.total }).map((_, i) => (
                    <span
                      key={i}
                      className={cn("h-1 flex-1 rounded-full transition-colors", i <= moment!.index ? "bg-brass-strong" : "bg-off-white/10")}
                      style={{ transitionDuration: "var(--motion-base)" }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {recap && recap.length > 0 ? (
            <div className="mt-4 space-y-1.5 border-t border-border pt-3">
              {recap.map((fact) => (
                <div key={fact.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-neutral">{fact.label}</span>
                  <span className="min-w-0 truncate text-right font-medium text-off-white">{fact.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </header>

        <main className={cn("w-full flex-1 px-5 py-6", footer ? "pb-28" : null)}>{children}</main>
      </div>

      {footer ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-near-black/95 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm lg:absolute">
          {footer}
        </div>
      ) : null}
    </PhoneCanvas>
  );
}
