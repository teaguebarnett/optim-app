import type { ReactNode } from "react";

/**
 * Phase 5.4A corrective pass — the one shared phone-presentation primitive
 * for the ENTIRE client lifecycle (invite, appearance selection, coach
 * welcome, every onboarding chapter, review, submission, setup-status, and
 * the daily Today/Training/Nutrition/Progress/Chat app — see
 * components/app-shell/shell.tsx's AppShell, which wraps this exact same
 * component). Manual review found the daily-app phone frame built earlier
 * this phase never got applied to the surrounding lifecycle screens, which
 * kept rendering as wide desktop pages — this is the fix, extracted once
 * so nothing duplicates the frame logic.
 *
 * Below `lg`, this is a no-op passthrough — a real phone always gets the
 * full, real viewport, never a decorative border drawn inside itself (see
 * this phase's corrective-pass brief §3: "Do not render a fake phone
 * border inside the actual phone"). At `lg` and up, the whole experience
 * is presented inside a fixed, real-phone-width canvas (390–430px)
 * centered on a neutral surface — a deliberate phone presentation, never a
 * stretched desktop layout (docs/design/OPTIM_VISUAL_CONSTITUTION.md §19).
 *
 * Callers own their own internal scroll region and any fixed/sticky
 * bottom bar — see AppShell and onboarding-stage.tsx for the established
 * pattern: an inner `lg:overflow-y-auto` wrapper around the scrolling
 * content, and `fixed inset-x-0 bottom-0 lg:absolute` on anything meant to
 * stay pinned to the bottom of the canvas rather than the real viewport.
 */
export function PhoneCanvas({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-near-black lg:flex lg:min-h-screen lg:items-center lg:justify-center lg:bg-stone-950 lg:py-10">
      <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-near-black lg:h-[min(920px,calc(100vh-5rem))] lg:min-h-0 lg:w-[420px] lg:rounded-[2.75rem] lg:border lg:border-border-strong lg:shadow-2xl">
        {children}
      </div>
    </div>
  );
}
