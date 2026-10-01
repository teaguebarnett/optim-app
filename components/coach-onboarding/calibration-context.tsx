"use client";

// Gate 3 — the calibration survey's data source, as one small interface.
//
// The survey UI (wizard, chapter rail, review) is unchanged in content and
// structure; only where its answers live differs:
//   - DemoCalibrationProvider wraps the existing browser-local demo hook
//     (useCoachOperatingModel) exactly as before.
//   - LiveCalibrationProvider is the real, authenticated workflow: every
//     answer is saved to coach_calibration_progress through a server action
//     (identity re-derived server-side), the coach's position is saved so
//     they resume where they left off on any device, and confirmation
//     creates the coach's confirmed Coach Brain method version.
//
// Honesty rule for live saves: a change shows immediately, but the coach
// can't continue past it until the server confirms it was saved. A failed
// save says so and offers a retry — it is never treated as saved.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCoachOperatingModel } from "@/hooks/use-coach-operating-model";
import { applicableChapters, applyCoachAnswersToModel } from "@/lib/coach/coach-onboarding-engine";
import { createDefaultCoachOperatingModel, type CoachOperatingModel } from "@/lib/coach/operating-model";
import { liveCalibrationChapters, calibrationReadiness, conservativeAuthorityConfig, authoritySettings } from "@/lib/coach/coach-brain";
import type { CoachOnboardingAnswers, CoachOnboardingChapterId } from "@/lib/coach/coach-onboarding-questions";
import type { AiAuthorityConfig, CoachAiAuthoritySettings } from "@/lib/coach/ai-authority";
import { confirmCalibrationAction, discardMethodReviewAction, saveCalibrationProgressAction } from "@/app/actions/coach-calibration";
import type { SaveCalibrationInput } from "@/lib/production/coach-brain";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface CalibrationAuthority {
  settings: CoachAiAuthoritySettings;
  setGlobal: (config: AiAuthorityConfig) => void;
  confirmed: boolean;
  /** Records the coach's explicit authority choice; resolves false if it
   * couldn't be saved. */
  confirm: () => Promise<boolean>;
}

export interface CalibrationAdapter {
  mode: "demo" | "live";
  businessName: string;
  answers: CoachOnboardingAnswers;
  saveAnswers: (next: CoachOnboardingAnswers, options?: { debounce?: boolean }) => void;
  saveStatus: SaveStatus;
  saveError: string | null;
  retrySave: () => void;
  /** True once the coach has started (skip the welcome screen on return). */
  hasProgress: boolean;
  initialPosition: { chapterId: CoachOnboardingChapterId; questionIndex: number } | null;
  recordPosition: (chapterId: CoachOnboardingChapterId, questionIndex: number) => void;
  chapters: CoachOnboardingChapterId[];
  buildDraftModel: () => CoachOperatingModel;
  /** The coach's currently active model, when reviewing an existing one. */
  previousActiveModel: CoachOperatingModel | null;
  isRevision: boolean;
  /** Live: every required question + authority must be explicit to confirm. */
  requireExplicitCompletion: boolean;
  authority: CalibrationAuthority | null;
  markReviewReached: () => void;
  confirm: (model: CoachOperatingModel) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Where "Return to dashboard" goes after confirming. */
  afterConfirmHref: string;
  /** Live review mode only: leave the draft without changing anything. */
  discardReview: (() => Promise<{ ok: true } | { ok: false; message: string }>) | null;
}

const CalibrationContext = createContext<CalibrationAdapter | null>(null);

export function useCalibration(): CalibrationAdapter {
  const value = useContext(CalibrationContext);
  if (!value) throw new Error("useCalibration must be used inside a calibration provider");
  return value;
}

// ---------------------------------------------------------------------------
// Demo — the existing browser-local behavior, unchanged
// ---------------------------------------------------------------------------

export function DemoCalibrationProvider({ businessName, children }: { businessName: string; children: ReactNode }) {
  const com = useCoachOperatingModel();
  const previousActive = com.versions.find((v) => v.status === "active") ?? null;
  const adapter: CalibrationAdapter = {
    mode: "demo",
    businessName,
    answers: com.answers,
    saveAnswers: (next) => com.saveAnswers(next),
    saveStatus: "idle",
    saveError: null,
    retrySave: () => {},
    hasProgress: !!com.progress?.updatedAtIso,
    initialPosition: null,
    recordPosition: () => {},
    chapters: applicableChapters(com.answers),
    buildDraftModel: com.buildDraftModel,
    previousActiveModel: previousActive,
    isRevision: !!previousActive,
    requireExplicitCompletion: false,
    authority: null,
    markReviewReached: () => {},
    confirm: async (model) => {
      com.confirmAndActivate(model);
      return { ok: true };
    },
    afterConfirmHref: "/coach",
    discardReview: null,
  };
  return <CalibrationContext.Provider value={adapter}>{children}</CalibrationContext.Provider>;
}

// ---------------------------------------------------------------------------
// Live — the real authenticated coach workflow
// ---------------------------------------------------------------------------

export interface LiveCalibrationInitial {
  coachUserId: string;
  workspaceId: string;
  businessName: string;
  mode: "initial" | "review";
  answers: CoachOnboardingAnswers;
  aiAuthority: AiAuthorityConfig | null;
  aiAuthorityConfirmed: boolean;
  position: { chapterId: CoachOnboardingChapterId; questionIndex: number } | null;
  hasProgress: boolean;
  activeModel: CoachOperatingModel | null;
}

const TEXT_DEBOUNCE_MS = 600;

export function LiveCalibrationProvider({ initial, children }: { initial: LiveCalibrationInitial; children: ReactNode }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<CoachOnboardingAnswers>(initial.answers);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [authorityConfig, setAuthorityConfig] = useState<AiAuthorityConfig>(initial.aiAuthority ?? conservativeAuthorityConfig());
  const [authorityConfirmed, setAuthorityConfirmed] = useState(initial.aiAuthorityConfirmed);

  // Saves are serialized and coalesced: the newest pending patch wins, and
  // only one request is in flight at a time, so answers never land out of
  // order.
  const pending = useRef<SaveCalibrationInput | null>(null);
  const failed = useRef<SaveCalibrationInput | null>(null);
  const draining = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Sends every pending change, in order, one request at a time. Resolves
   * true only when everything the coach entered is confirmed saved. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (draining.current) await draining.current;
    if (!pending.current) return !failed.current;
    const run = (async () => {
      while (pending.current) {
        const patch = pending.current;
        pending.current = null;
        setSaveStatus("saving");
        const result = await saveCalibrationProgressAction(patch).catch(() => ({ ok: false as const, message: "Couldn't reach OPTIM. Check your connection and try again." }));
        if (!result.ok) {
          failed.current = { ...patch, ...(pending.current ?? {}) };
          pending.current = null;
          setSaveError(result.message);
          setSaveStatus("error");
          return false;
        }
        failed.current = null;
        setSaveError(null);
      }
      setSaveStatus("saved");
      return true;
    })();
    draining.current = run;
    try {
      return await run;
    } finally {
      draining.current = null;
    }
  }, []);

  const enqueue = useCallback(
    (patch: SaveCalibrationInput, debounce: boolean) => {
      pending.current = { ...(failed.current ?? {}), ...(pending.current ?? {}), ...patch };
      failed.current = null;
      setSaveStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      if (debounce) timer.current = setTimeout(() => void flush(), TEXT_DEBOUNCE_MS);
      else void flush();
    },
    [flush]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const saveAnswers = useCallback(
    (next: CoachOnboardingAnswers, options?: { debounce?: boolean }) => {
      setAnswers(next);
      enqueue({ answers: next }, !!options?.debounce);
    },
    [enqueue]
  );

  const retrySave = useCallback(() => {
    if (!failed.current) return;
    pending.current = { ...failed.current, ...(pending.current ?? {}) };
    failed.current = null;
    void flush();
  }, [flush]);

  // Position is saved with every navigation so a coach resumes exactly where
  // they were, on any device.
  // Seeded with where the coach resumed, so simply reopening the survey
  // doesn't re-save (and briefly block Continue on) a position the server
  // already has.
  const lastPosition = useRef<string>(initial.position ? `${initial.position.chapterId}:${initial.position.questionIndex}` : "");
  const recordPosition = useCallback(
    (chapterId: CoachOnboardingChapterId, questionIndex: number) => {
      const key = `${chapterId}:${questionIndex}`;
      if (key === lastPosition.current) return;
      lastPosition.current = key;
      enqueue({ position: { chapterId, questionIndex } }, true);
    },
    [enqueue]
  );

  const markReviewReached = useCallback(() => enqueue({ reviewReached: true }, false), [enqueue]);

  const authority: CalibrationAuthority = useMemo(
    () => ({
      settings: authoritySettings({ coachUserId: initial.coachUserId, workspaceId: initial.workspaceId, global: authorityConfig, nowIso: new Date(0).toISOString() }),
      setGlobal: (config) => {
        setAuthorityConfig(config);
        enqueue({ aiAuthority: config }, false);
      },
      confirmed: authorityConfirmed,
      confirm: async () => {
        enqueue({ aiAuthority: authorityConfig, aiAuthorityConfirmed: true }, false);
        const ok = await flush();
        if (ok) setAuthorityConfirmed(true);
        return ok;
      },
    }),
    [authorityConfig, authorityConfirmed, enqueue, flush, initial.coachUserId, initial.workspaceId]
  );

  const buildDraftModel = useCallback((): CoachOperatingModel => {
    // A preview of what confirmation would create — never persisted from
    // here; the server rebuilds and validates it on confirm.
    const nowIso = new Date().toISOString();
    const base = createDefaultCoachOperatingModel({ coachId: initial.coachUserId, workspaceId: initial.workspaceId, nowIso, businessName: initial.businessName });
    return applyCoachAnswersToModel(base, answers, nowIso);
  }, [answers, initial.coachUserId, initial.workspaceId, initial.businessName]);

  const adapter: CalibrationAdapter = {
    mode: "live",
    businessName: initial.businessName,
    answers,
    saveAnswers,
    saveStatus,
    saveError,
    retrySave,
    hasProgress: initial.hasProgress,
    initialPosition: initial.position,
    recordPosition,
    chapters: liveCalibrationChapters(answers),
    buildDraftModel,
    previousActiveModel: initial.mode === "review" ? initial.activeModel : null,
    isRevision: initial.mode === "review",
    requireExplicitCompletion: true,
    authority,
    markReviewReached,
    confirm: async () => {
      const saved = await flush();
      if (!saved) return { ok: false, message: "Your latest answers aren't saved yet. Retry saving, then confirm." };
      const readiness = calibrationReadiness({ answers, aiAuthorityConfirmed: authorityConfirmed });
      if (!readiness.ready) return { ok: false, message: "Some required answers are still missing." };
      const result = await confirmCalibrationAction().catch(() => ({ ok: false as const, message: "Couldn't reach OPTIM. Nothing was changed — try again." }));
      if (!result.ok) return result;
      router.refresh();
      return { ok: true };
    },
    afterConfirmHref: initial.mode === "review" ? "/coach/settings" : "/coach",
    discardReview:
      initial.mode === "review"
        ? async () => {
            const result = await discardMethodReviewAction().catch(() => ({ ok: false as const, message: "Couldn't reach OPTIM." }));
            if (result.ok) router.push("/coach/settings");
            return result;
          }
        : null,
  };

  return <CalibrationContext.Provider value={adapter}>{children}</CalibrationContext.Provider>;
}
