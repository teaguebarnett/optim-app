import { DemoCoachOnboardingPage } from "@/components/coach-onboarding/demo-coach-onboarding-page";
import { LiveCoachOnboarding } from "@/components/coach-onboarding/live-coach-onboarding";
import { resolveAppMode } from "@/lib/production/mode";
import { getOwnCoachBrainState } from "@/lib/production/coach-brain";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ALL_CHAPTER_IDS_IN_ORDER, type CoachOnboardingChapterId } from "@/lib/coach/coach-onboarding-questions";

/**
 * The Coach Calibration survey. Sits outside /coach/* so it never renders
 * inside CoachShell (see lib/coach/routing.ts's carve-out).
 *
 * Gate 3 — in live (Supabase) mode this is the canonical first-run step of
 * every coach's account: app/coach/layout.tsx sends any coach without a
 * confirmed Coach Brain here, and the survey seeds their Brain. Progress is
 * loaded server-side for the signed-in coach only (lib/production/
 * coach-brain.ts), so they resume where they left off on any device. A
 * calibrated coach reaches the same survey only through an explicit "Review
 * or update your method" draft. Demo mode keeps the browser-local prototype.
 *
 * ?chapter= deep-links to one chapter (e.g. from a method summary's Edit).
 */
export default async function CoachOnboardingPage({ searchParams }: { searchParams: Promise<{ chapter?: string }> }) {
  if (resolveAppMode() !== "supabase") return <DemoCoachOnboardingPage />;

  const { chapter } = await searchParams;
  const initialChapterId = ALL_CHAPTER_IDS_IN_ORDER.find((id) => id === chapter) as CoachOnboardingChapterId | undefined;
  const state = await getOwnCoachBrainState();
  const progress = state.progress;
  const openProgress = progress && !progress.completedAtIso ? progress : null;

  // A calibrated coach with no open review sees the explicit review entry.
  // Passed to the same client component (not returned as a different one) so
  // the post-confirmation refresh can't unmount the wizard's completion screen.
  const reviewEntry =
    state.calibration.state === "calibrated" && !(openProgress && openProgress.mode === "review") ? { versionLabel: `version ${state.activeMethod?.version ?? 1}` } : null;

  const supabase = await getSupabaseServerClient();
  const { data: workspace } = await supabase.from("workspaces").select("business_name").eq("id", state.workspaceId).maybeSingle();

  return (
    <LiveCoachOnboarding
      reviewEntry={reviewEntry}
      initialChapterId={initialChapterId}
      initial={{
        coachUserId: state.coachUserId,
        workspaceId: state.workspaceId,
        businessName: (workspace?.business_name as string | undefined) ?? "OPTIM",
        mode: openProgress?.mode ?? "initial",
        answers: openProgress?.answers ?? {},
        aiAuthority: openProgress?.aiAuthority ?? null,
        aiAuthorityConfirmed: !!openProgress?.aiAuthorityConfirmedAtIso,
        position: openProgress?.currentChapterId ? { chapterId: openProgress.currentChapterId, questionIndex: openProgress.currentQuestionIndex } : null,
        hasProgress: !!openProgress && (Object.keys(openProgress.answers).length > 0 || !!openProgress.currentChapterId),
        activeModel: state.activeMethod?.operatingModel ?? null,
      }}
    />
  );
}
