"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2, CheckCircle2, AlertTriangle, History, Eraser, LineChart } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DevPerspectiveSwitcher } from "@/components/app-shell/dev-perspective-switcher";
import { AppearanceSettingsCard } from "@/components/app-shell/appearance-settings-card";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { clearState } from "@/lib/storage";
import { buildDemoHistoryFixture } from "@/lib/history/demo-fixture";
import { getFixtureHistoryStore } from "@/lib/history/local-storage-history-store";

// Phase 4.2 — the demo-progress preview is a real development-time-only
// mechanism: outside a production build, the ?demo=1 query param it
// navigates to is honored by app/progress/page.tsx; in a production build
// it's ignored outright (see hooks/use-progress-dashboard.ts), so this
// control has no effect for a real client even if somehow reached.
const DEMO_PROGRESS_AVAILABLE = process.env.NODE_ENV !== "production";

// Phase 5.5B — DevPerspectiveSwitcher includes a one-tap "Coach view"
// control. This sheet is shown to every client session alike (the seeded
// demo client, a coach previewing a client, and any real activated
// coach-created client), so without this gate a genuinely real client could
// self-escalate straight into the coach workspace. app/coach/settings/page.tsx
// already gates its own copy of this switcher the same way — this mirrors
// that exact precedent rather than inventing a new one.
const DEV_PERSPECTIVE_SWITCHER_AVAILABLE = process.env.NODE_ENV !== "production";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const { state, resetToday, loadPreset, activeContext } = usePrototypeState();
  const router = useRouter();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [confirmClear, setConfirmClear] = useState(false);

  function handlePreviewDemoProgress() {
    router.push("/progress?demo=1");
    onClose();
  }

  function handleResetToday() {
    resetToday();
    onClose();
  }

  // Phase 4.1 — loads/clears the isolated demo-history fixture (its own
  // storage key; see lib/history/local-storage-history-store.ts). This can
  // never touch real archived history, only the separate fixture store.
  function handleLoadDemoHistory() {
    const fixture = buildDemoHistoryFixture(state.dateIso, state.programEnrollment);
    const store = getFixtureHistoryStore();
    for (const record of fixture.dailyRecords) store.putDailyRecordIdempotent(record);
    for (const correction of fixture.corrections) store.appendCorrection(correction);
    for (const review of fixture.weeklyReviews) store.putWeeklyReview(review);
    onClose();
  }

  function handleClearDemoHistory() {
    getFixtureHistoryStore().clearScope({
      workspaceId: state.workspaceId,
      clientId: state.clientId,
      enrollmentId: state.programEnrollment.id,
    });
    onClose();
  }

  function handleClearAll() {
    clearState();
    resetToday();
    setConfirmClear(false);
    onClose();
  }

  function handleLoadPreset(preset: "completed-day" | "awaiting-review") {
    loadPreset(preset);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Prototype settings"
      description="These controls exist only to demo different app states — they won't appear in the production experience."
    >
      <div className="space-y-2">
        <AppearanceSettingsCard />
        {DEV_PERSPECTIVE_SWITCHER_AVAILABLE ? <DevPerspectiveSwitcher /> : null}

        <button
          onClick={handleResetToday}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
        >
          <RotateCcw size={18} className="shrink-0 text-neutral" />
          <span>
            <span className="block text-sm font-medium text-off-white">Reset today</span>
            <span className="block text-xs text-neutral">Clear all of today&apos;s progress and start over.</span>
          </span>
        </button>

        <button
          onClick={() => handleLoadPreset("completed-day")}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
        >
          <CheckCircle2 size={18} className="shrink-0 text-neutral" />
          <span>
            <span className="block text-sm font-medium text-off-white">Load completed-day example</span>
            <span className="block text-xs text-neutral">See what a fully finished Monday looks like.</span>
          </span>
        </button>

        <button
          onClick={() => handleLoadPreset("awaiting-review")}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
        >
          <AlertTriangle size={18} className="shrink-0 text-neutral" />
          <span>
            <span className="block text-sm font-medium text-off-white">Load awaiting-review example</span>
            <span className="block text-xs text-neutral">See a day with a pain report flagged for {coachName}.</span>
          </span>
        </button>

        <button
          onClick={handleLoadDemoHistory}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
        >
          <History size={18} className="shrink-0 text-neutral" />
          <span>
            <span className="block text-sm font-medium text-off-white">Load demo history</span>
            <span className="block text-xs text-neutral">
              Seeds six isolated example past days (complete, partial, missed, rest, pain report, cardio
              alternative) plus a correction and a weekly review. Never affects today or real history.
            </span>
          </span>
        </button>

        <button
          onClick={handleClearDemoHistory}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
        >
          <Eraser size={18} className="shrink-0 text-neutral" />
          <span>
            <span className="block text-sm font-medium text-off-white">Clear demo history</span>
            <span className="block text-xs text-neutral">Removes only the seeded example history above.</span>
          </span>
        </button>

        {DEMO_PROGRESS_AVAILABLE ? (
          <button
            onClick={handlePreviewDemoProgress}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border-strong px-4 py-3.5 text-left hover:border-accent/40"
          >
            <LineChart size={18} className="shrink-0 text-neutral" />
            <span>
              <span className="block text-sm font-medium text-off-white">Preview demo progress</span>
              <span className="block text-xs text-neutral">
                Opens Progress in demo mode (load demo history first to see it populated). Never affects your
                real Progress data — production builds ignore this entirely.
              </span>
            </span>
          </button>
        ) : null}

        <div className="pt-2">
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-error/30 bg-error-soft px-4 py-3.5 text-left"
            >
              <Trash2 size={18} className="shrink-0 text-error" />
              <span className="text-sm font-medium text-off-white">Clear all prototype data</span>
            </button>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-error/30 bg-error-soft p-4">
              <p className="text-sm text-off-white">
                This will permanently erase all local prototype data. Continue?
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" size="sm" onClick={handleClearAll}>
                  Yes, clear everything
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
