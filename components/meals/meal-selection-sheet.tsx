"use client";

import { useEffect, useState } from "react";
import { Camera, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { ReasonPicker, SKIP_REASON_LABELS } from "@/components/ui/reason-picker";
import { ManualMealForm } from "@/components/meals/manual-meal-form";
import { PhotoMealFlow } from "@/components/nutrition/photo/photo-meal-flow";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { usePlatformState } from "@/hooks/use-platform-state";
import { cn } from "@/lib/cn";
import { findEarliestIncompleteMealBefore } from "@/lib/calculations";
import { mealDisplayName, mealIntentFor, mealOptionHasIngredient, mealProvenanceLabel } from "@/lib/nutrition/view-model";
import { isUncertainMealSelection } from "@/lib/nutrition/vision-estimator";
import {
  BOUNDED_SUBSTITUTION_RULES,
  describeSubstitutionLog,
  resolveSubstitutionDisposition,
  type BoundedSubstitutionRule,
} from "@/lib/nutrition/substitution";
import { nutritionChangeAckReplyText } from "@/lib/chat/assistant";
import { getAiAuthoritySettings } from "@/lib/coach/repository";
import { nextId } from "@/lib/state";
import { MEAL_OPTIONS, MEAL_PERIOD_LABELS } from "@/lib/mock-data";
import type { AiActionDisposition } from "@/lib/coach/ai-authority";
import type { MacroValues, MealEstimateConfidence, MealEstimateItem, MealIntent, MealPeriod, MealSelection, SkipReason } from "@/lib/types";

interface MealSelectionSheetProps {
  period: MealPeriod;
  open: boolean;
  onClose: () => void;
  /** Skips straight to the photo-capture flow on open — used by the
   * "current meal" card's camera shortcut. Defaults to the normal planned-
   * meal view (or, for an already-logged meal, summary) view. The literal
   * value "options" is kept as the external contract (see
   * components/nutrition/meal-card.tsx's callers) even though the internal
   * view it now resolves to is named "plan" — never worth an unrelated-file
   * edit just to rename a prop value that already means "the default
   * entry." */
  initialView?: "options" | "photo";
}

// Correction pass — "options" (three bordered cards + five competing
// top-level actions) is replaced by "plan" (the quiet, object-first primary
// view: one dominant question — which planned meal, or something else) and
// "something-else" (the one secondary branch point, itself revealing four
// outcomes rather than exposing them all as peers). Every other view name
// is unchanged from Gate 3B.
type View = "summary" | "plan" | "something-else" | "manual" | "photo" | "skip" | "sequence-warning" | "ask";

type PendingLog =
  | { kind: "option"; optionId: string }
  // Gate 3B — `mealIntent` is set only when this manual entry is really an
  // accepted bounded substitution (see describeSubstitutionLog); omitted for
  // a true free-text manual entry, which has none to preserve. Correction
  // pass — `unknownMacroFields` names which macro fields a free-text entry
  // was saved without (see ManualMealForm's own doc); always empty for a
  // substitution, which is built from real, fully-known original macros.
  | { kind: "manual"; name: string; macros: MacroValues; mealIntent?: MealIntent; unknownMacroFields?: (keyof MacroValues)[] }
  | { kind: "photo"; items: MealEstimateItem[]; macros: MacroValues; confidence: MealEstimateConfidence };

// Correction pass (Gate 3B human-QA) — a meal skip needs its own concise,
// food-appropriate vocabulary, never the workout set's "equipment
// unavailable"/"excessive fatigue"/"schedule conflict" (see
// components/ui/reason-picker.tsx's default REASON_ORDER, still used
// unchanged by every workout SkipReasonSheet call site and
// cardio-task.tsx). Reuses the shared SkipReason type and SKIP_REASON_LABELS
// map — this is a different SUBSET/order of that same vocabulary, plus the
// two reasons ("not-hungry", "food-unavailable") no workout context would
// ever need.
const MEAL_SKIP_REASONS: SkipReason[] = ["not-hungry", "out-of-time", "food-unavailable", "feeling-sick", "forgot", "other"];

function formatTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function MealSelectionSheet({ period, open, onClose, initialView }: MealSelectionSheetProps) {
  const { state, dispatch, activeContext, dailyPlan } = usePrototypeState();
  const { platform } = usePlatformState();
  const coachName = activeContext.primaryCoach?.displayName ?? "your coach";
  const [view, setView] = useState<View>("plan");
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState<SkipReason | null>(null);
  const [skipNote, setSkipNote] = useState("");
  // Phase 3.1.1 §1 — holds the action to run once the client either
  // confirms past the sequence warning or never triggered one at all.
  const [pendingLog, setPendingLog] = useState<PendingLog | null>(null);
  const [blockingPeriod, setBlockingPeriod] = useState<MealPeriod | null>(null);
  const [viewBeforeWarning, setViewBeforeWarning] = useState<View>("plan");
  // Gate 3B — the "ask about this meal" flow: a registered bounded rule the
  // client is considering, plus the free-text note for the "something else"
  // fallback. Neither is ever applied/sent until the client takes the
  // explicit action shown for whichever disposition the rule resolves to.
  const [pendingSubstitution, setPendingSubstitution] = useState<BoundedSubstitutionRule | null>(null);
  const [askNote, setAskNote] = useState("");
  const [askSent, setAskSent] = useState(false);
  // Correction pass — progressive disclosure within "something-else": "I ate
  // something different" is itself a question, not an action, so tapping it
  // reveals its two real input methods (photo/manual) inline rather than
  // jumping straight into one of them.
  const [differentSubmenuOpen, setDifferentSubmenuOpen] = useState(false);

  const currentSelection = state.meals[period];
  const hasExistingSelection =
    !!currentSelection &&
    (currentSelection.source === "option" || currentSelection.source === "manual" || currentSelection.source === "photo-estimate");
  const options = MEAL_OPTIONS[period];
  const label = MEAL_PERIOD_LABELS[period];

  // Resets to the right starting view every time the sheet opens — never
  // just once on mount, since this same component instance stays mounted
  // (controlled by `open`) across repeated opens for a given meal card. See
  // components/today/training-time-sheet.tsx for the identical pattern,
  // including the setTimeout wrapper — react-hooks' set-state-in-effect rule
  // flags a synchronous setState call directly in an effect body, so the
  // reset is deferred a tick the same way that sheet's already does.
  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      setPendingOptionId(null);
      setPendingLog(null);
      setBlockingPeriod(null);
      setPendingSubstitution(null);
      setAskNote("");
      setAskSent(false);
      setDifferentSubmenuOpen(false);
      if (initialView === "photo") {
        setView("photo");
        return;
      }
      setView(currentSelection ? "summary" : "plan");
    }, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialView]);

  function resetAndClose() {
    setView("plan");
    setPendingOptionId(null);
    setSkipReason(null);
    setSkipNote("");
    setPendingLog(null);
    setBlockingPeriod(null);
    setPendingSubstitution(null);
    setAskNote("");
    setAskSent(false);
    setDifferentSubmenuOpen(false);
    onClose();
  }

  function logNow(log: PendingLog) {
    if (log.kind === "option") {
      dispatch({ type: "SELECT_MEAL_OPTION", period, optionId: log.optionId });
    } else if (log.kind === "manual") {
      dispatch({
        type: "SET_MANUAL_MEAL",
        period,
        manualName: log.name,
        macros: log.macros,
        mealIntent: log.mealIntent,
        unknownMacroFields: log.unknownMacroFields,
      });
    } else {
      dispatch({ type: "LOG_PHOTO_MEAL", period, items: log.items, macros: log.macros, confidence: log.confidence });
    }
    resetAndClose();
  }

  // Warns — but never blocks — logging a meal while an earlier meal in
  // today's actual plan is still incomplete. Generic over any period pair;
  // never fires for a meal that was legitimately skipped or isn't part of
  // today's plan. See lib/calculations.ts's findEarliestIncompleteMealBefore.
  function attemptLog(log: PendingLog) {
    const periodsInPlan = Object.keys(dailyPlan.mealSchedule.entries) as MealPeriod[];
    const blocking = findEarliestIncompleteMealBefore(state.meals, period, periodsInPlan);
    if (blocking) {
      setBlockingPeriod(blocking);
      setPendingLog(log);
      setViewBeforeWarning(view);
      setView("sequence-warning");
      return;
    }
    logNow(log);
  }

  // Correction pass — a tap selects a planned meal; tapping the already-
  // selected one again deselects it (the only way to change your mind
  // without a separate Cancel control, now that the row itself IS the
  // picker). Only one meal may ever be selected at a time.
  function handleSelectOption(optionId: string) {
    setPendingOptionId((prev) => (prev === optionId ? null : optionId));
  }

  function confirmSelection() {
    if (!pendingOptionId) return;
    attemptLog({ kind: "option", optionId: pendingOptionId });
  }

  function handleManualSave(name: string, macros: MacroValues, unknownMacroFields: (keyof MacroValues)[]) {
    attemptLog({ kind: "manual", name, macros, unknownMacroFields: unknownMacroFields.length > 0 ? unknownMacroFields : undefined });
  }

  function handlePhotoConfirm(items: MealEstimateItem[], macros: MacroValues, confidence: MealEstimateConfidence) {
    attemptLog({ kind: "photo", items, macros, confidence });
  }

  function handleSkipConfirm() {
    if (!skipReason) return;
    dispatch({ type: "SKIP_MEAL", period, reason: skipReason, note: skipNote.trim() || undefined });
    resetAndClose();
  }

  function handlePlanLater() {
    dispatch({ type: "PLAN_MEAL_LATER", period });
    resetAndClose();
  }

  function handleClear() {
    dispatch({ type: "UNDO_MEAL_SELECTION", period });
    resetAndClose();
  }

  function startEdit() {
    if (!currentSelection) return;
    if (currentSelection.source === "option") {
      setPendingOptionId(currentSelection.optionId ?? null);
      setView("plan");
    } else if (currentSelection.source === "manual") {
      setView("manual");
    } else if (currentSelection.source === "photo-estimate") {
      setView("photo");
    }
  }

  const pendingOption = pendingOptionId ? options.find((o) => o.id === pendingOptionId) : null;
  const editingPhotoEstimate = currentSelection?.source === "photo-estimate" ? currentSelection.photoEstimate : undefined;

  // Gate 3B — the "ask about this meal" flow: reuses Gate 3A's bounded-
  // substitution contract for a registered swap, and the exact same
  // review-request + chat-message escalation lib/chat/demo-chat-screen.tsx's
  // "Talk to Teague"/pain/program-change paths already use for anything
  // that isn't a registered, sufficiently-confident rule — never a second
  // escalation model.
  const rulesForPeriod = BOUNDED_SUBSTITUTION_RULES.filter((rule) => rule.period === null || rule.period === period);
  // Correction pass — the meal a candidate swap is actually measured
  // against: whichever option the client currently has selected in the
  // primary view, falling back to whichever option is already logged (the
  // "I need help with this meal" entry point is reachable either way). No
  // reference meal at all (nothing selected, nothing logged yet) honestly
  // means no swap can be contextually relevant.
  const loggedOption = currentSelection?.source === "option" ? (options.find((o) => o.id === currentSelection.optionId) ?? null) : null;
  const referenceMealOption = pendingOption ?? loggedOption;
  // Gate 3C — a coach may have deliberately curated which registered rules
  // this client sees for this meal period (see AppState.coachMealPlan);
  // absent means "every ingredient-applicable rule is eligible," Gate 3B's
  // original, unrestricted behavior, preserved exactly.
  const coachEligibleRuleIds = state.coachMealPlan[period]?.eligibleSubstitutionRuleIds;
  const applicableSubstitutionRules = rulesForPeriod.filter(
    (rule) => mealOptionHasIngredient(referenceMealOption, rule.fromLabel) && (coachEligibleRuleIds === undefined || coachEligibleRuleIds.includes(rule.id))
  );
  const authoritySettings = getAiAuthoritySettings(platform, state.primaryCoachId, state.workspaceId);
  const substitutionDisposition: AiActionDisposition | null = pendingSubstitution
    ? resolveSubstitutionDisposition(pendingSubstitution, authoritySettings, state.clientId)
    : null;
  // The real planned macros this swap is measured against — whichever
  // option the client has pending/logged for this meal, falling back to
  // the period's own first catalog option so "keep this close to the
  // original" always has a real, known reference value, never an invented
  // one. See lib/nutrition/substitution.ts's describeSubstitutionLog.
  const substitutionBaseMacros = pendingOption?.macros ?? currentSelection?.macros ?? options[0]?.macros ?? null;

  /** The one place a nutrition ask reaches the coach — mirrors
   * components/chat/demo-chat-screen.tsx's handleTalkToCoach exactly (a
   * client-authored message, the review request itself carrying that same
   * id forward via `id`/`reviewRequestId` per ChatMessage.reviewRequestId's
   * own doc, then OPTIM's acknowledgement and the "sent, awaiting review"
   * system pill) so this shows up in the coach's existing Reviews/Command
   * Center and the client's existing /chat — never a new, parallel
   * notification surface, and never a stale status once resolved. */
  function escalateToCoach(summary: string, nutritionContext?: { period: MealPeriod; ruleId?: string }) {
    const clientMessageId = nextId("msg");
    dispatch({
      type: "ADD_CHAT_MESSAGE",
      message: { id: clientMessageId, createdAtIso: new Date().toISOString(), sender: "client", text: summary, deliveryState: "sent" },
    });
    const reviewRequestId = nextId("review");
    dispatch({
      type: "CREATE_CHAT_REVIEW_REQUEST",
      kind: "program-change-request",
      summary,
      sourceMessageId: clientMessageId,
      id: reviewRequestId,
      nutritionContext,
    });
    dispatch({
      type: "ADD_CHAT_MESSAGE",
      message: { id: nextId("msg"), createdAtIso: new Date().toISOString(), sender: "assistant", text: nutritionChangeAckReplyText(coachName) },
    });
    dispatch({
      type: "ADD_CHAT_MESSAGE",
      message: {
        id: nextId("msg"),
        createdAtIso: new Date().toISOString(),
        sender: "system",
        text: `Sent to ${coachName} — awaiting review`,
        handoffState: "pending_coach_review",
        reviewRequestId,
      },
    });
  }

  function applySubstitution() {
    if (!pendingSubstitution || !substitutionBaseMacros) return;
    const { manualName, macros, mealIntent } = describeSubstitutionLog(pendingSubstitution, substitutionBaseMacros);
    attemptLog({ kind: "manual", name: manualName, macros, mealIntent });
  }

  function escalateSubstitution(rule: BoundedSubstitutionRule) {
    escalateToCoach(
      `Nutrition substitution requested for ${label.toLowerCase()}: ${rule.fromLabel} → ${rule.toLabel}. Needs ${coachName}'s OK before it applies.`,
      { period, ruleId: rule.id }
    );
    setAskSent(true);
  }

  function submitAskNote() {
    const note = askNote.trim();
    if (!note) return;
    escalateToCoach(`Nutrition question about ${label.toLowerCase()}: "${note}"`, { period });
    setAskSent(true);
  }

  return (
    <Sheet
      open={open}
      onClose={resetAndClose}
      title={
        view === "manual"
          ? `${label}: enter manually`
          : view === "photo"
            ? `${label}: photo estimate`
            : view === "skip"
              ? `Skip ${label.toLowerCase()}`
              : view === "sequence-warning"
                ? "Log out of order?"
                : view === "ask"
                  ? `Ask about ${label.toLowerCase()}`
                  : view === "something-else"
                    ? `${label}: something else`
                    : label
      }
      footer={
        view === "plan" && pendingOption ? (
          <Button className="w-full" size="lg" onClick={confirmSelection}>
            Log this meal
          </Button>
        ) : undefined
      }
    >
      {view === "summary" && currentSelection ? (
        <MealSummary
          period={period}
          label={label}
          selection={currentSelection}
          onEdit={hasExistingSelection ? startEdit : undefined}
          onLogNow={!hasExistingSelection && currentSelection.source !== "skipped" ? () => setView("plan") : undefined}
          onClear={handleClear}
        />
      ) : null}

      {/* Correction pass — the primary view is one dominant question: which
       * planned meal (a quiet, selectable list — never three bordered cards
       * each with its own competing "Select" button), or something else (one
       * quiet secondary link, never a peer-level action). Nothing is
       * preselected and nothing logs until the client explicitly taps the
       * one dominant "Log this meal" action in the sheet's footer. */}
      {view === "plan" && (
        <div>
          <div className="divide-y divide-border rounded-[var(--radius-md)] bg-surface-raised px-4">
            {options.map((option) => {
              const isSelected = pendingOptionId === option.id;
              // Gate 3C — a coach's own edited Meal Intent for this
              // client's this period (see AppState.coachMealPlan)
              // supersedes the catalog's own per-option description here,
              // exactly the way SELECT_MEAL_OPTION now snapshots it — so
              // this preview and what actually gets logged can never
              // diverge, regardless of which of the period's options the
              // client ends up picking.
              const effectiveDescription = state.coachMealPlan[period]?.mealIntentOverride ?? option.description;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelectOption(option.id)}
                  className="w-full py-3.5 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn("text-[15px] font-medium", isSelected ? "text-accent-fg" : "text-off-white")}>
                        {option.name}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral">{effectiveDescription}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <div className="whitespace-nowrap text-right text-xs text-neutral">
                        <span className="font-semibold text-off-white">{option.macros.calories}</span> cal ·{" "}
                        {option.macros.proteinG}g P
                      </div>
                      {/* Correction pass — a quiet cue that this row is
                       * selectable (matching the same chevron affordance
                       * "something-else" rows use), which rotates to read
                       * as an open disclosure once selected rather than
                       * adding a second, separate indicator. */}
                      <ChevronRight
                        size={14}
                        className={cn("shrink-0 text-neutral transition-transform", isSelected && "rotate-90")}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  {isSelected ? (
                    <div className="mt-2.5 space-y-1 border-t border-border pt-2.5">
                      <p className="text-xs text-neutral">{option.mainIngredients.join(", ")}</p>
                      <p className="text-xs text-neutral">
                        {option.macros.calories} cal · {option.macros.proteinG}g protein · {option.macros.carbsG}g carbs ·{" "}
                        {option.macros.fatG}g fat
                      </p>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              // Correction pass — a fresh visit to "something else" must
              // never inherit a PRIOR visit's finished ask/substitution
              // state (otherwise re-entering "I need help with this meal"
              // for an unrelated reason could wrongly show "already sent"
              // or a stale swap card from an earlier pass through this
              // same sheet instance).
              setPendingSubstitution(null);
              setAskNote("");
              setAskSent(false);
              setView("something-else");
            }}
            className="mt-4 flex w-full items-center justify-between text-sm text-off-white/80 hover:text-off-white"
          >
            Something else
            <ChevronRight size={14} className="shrink-0 text-neutral" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Correction pass — the one secondary branch point. "I ate something
       * different" is a question, not an action: it reveals its own two
       * input methods (photo/manual) inline rather than exposing them as
       * top-level peers. The other three rows reuse existing, unmodified
       * behavior (help/escalation, plan-for-later, skip) — never a second
       * implementation of any of them. */}
      {view === "something-else" && (
        <div>
          {!differentSubmenuOpen ? (
            <div className="divide-y divide-border rounded-[var(--radius-md)] bg-surface-raised px-4">
              <SomethingElseRow label="I ate something different" onClick={() => setDifferentSubmenuOpen(true)} />
              <SomethingElseRow label="I need help with this meal" onClick={() => setView("ask")} />
              <SomethingElseRow label="I'll eat it later" onClick={handlePlanLater} />
              <SomethingElseRow label="I skipped it" onClick={() => setView("skip")} />
            </div>
          ) : (
            <div className="space-y-2">
              <Button variant="outline" className="w-full" onClick={() => setView("photo")}>
                <Camera size={16} aria-hidden="true" /> Use a photo
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setView("manual")}>
                Enter manually
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (differentSubmenuOpen) {
                setDifferentSubmenuOpen(false);
              } else {
                setView(currentSelection ? "summary" : "plan");
              }
            }}
            className="mt-4 block text-sm text-neutral hover:text-off-white"
          >
            Back
          </button>
        </div>
      )}

      {view === "sequence-warning" && blockingPeriod ? (
        <div className="space-y-4">
          <p className="text-sm text-off-white">
            You haven&apos;t logged {MEAL_PERIOD_LABELS[blockingPeriod].toLowerCase()} yet. Log{" "}
            {label.toLowerCase()} anyway?
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setView(viewBeforeWarning);
                setBlockingPeriod(null);
                setPendingLog(null);
              }}
            >
              Go back
            </Button>
            <Button className="flex-1" onClick={() => pendingLog && logNow(pendingLog)}>
              Log {label.toLowerCase()} anyway
            </Button>
          </div>
        </div>
      ) : null}

      {view === "manual" && (
        <ManualMealForm
          onSave={handleManualSave}
          onCancel={() => setView(currentSelection ? "summary" : "plan")}
          initial={
            currentSelection?.source === "manual" && currentSelection.macros
              ? {
                  name: currentSelection.manualName ?? "",
                  macros: currentSelection.macros,
                  unknownMacroFields: currentSelection.unknownMacroFields,
                }
              : undefined
          }
          submitLabel={currentSelection?.source === "manual" ? "Save changes" : "Save estimate"}
        />
      )}

      {view === "photo" && (
        <PhotoMealFlow
          key={editingPhotoEstimate ? "edit" : "new"}
          period={period}
          initialReview={editingPhotoEstimate}
          onConfirm={handlePhotoConfirm}
          onCancel={() => (currentSelection ? setView("summary") : resetAndClose())}
          onFallbackManual={() => setView("manual")}
          onRequestHelp={() => setView("ask")}
        />
      )}

      {view === "skip" && (
        <div className="space-y-4">
          <p className="text-sm text-neutral">What&apos;s the reason you&apos;re skipping {label.toLowerCase()}?</p>
          <ReasonPicker value={skipReason} onChange={setSkipReason} name={`skip-${period}`} reasons={MEAL_SKIP_REASONS} />
          <TextArea
            id={`skip-note-${period}`}
            label="Optional note"
            value={skipNote}
            onChange={(e) => setSkipNote(e.target.value)}
            placeholder={`Anything ${coachName} should know?`}
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSkipConfirm} disabled={!skipReason}>
              Confirm skip
            </Button>
            <Button variant="ghost" onClick={() => setView(currentSelection ? "summary" : "plan")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Gate 3B — the client loop's Evidence/Bounded-substitution/Proposal
       * stages, reached only from "something-else" → "I need help with this
       * meal" above. A registered rule is ALWAYS presented as one of the
       * fixed cards below — never matched or interpreted from askNote's free
       * text — so an unresolved or out-of-bound request can only ever reach
       * the coach, never be presented as an approved swap. Correction pass —
       * a rule renders here only when it's actually applicable to the meal
       * option in play (see applicableSubstitutionRules above); an
       * inapplicable rule (e.g. a chicken swap for a chicken-free breakfast)
       * never appears at all. */}
      {view === "ask" && (
        <div className="space-y-4">
          {askSent ? (
            <div className="space-y-4">
              <div className="rounded-[var(--radius-md)] bg-surface-raised p-4">
                <p className="text-body text-off-white">Sent to {coachName} — awaiting review.</p>
              </div>
              <Button className="w-full" onClick={() => setView(currentSelection ? "summary" : "plan")}>
                Done
              </Button>
            </div>
          ) : pendingSubstitution ? (
            <div className="space-y-4">
              <div className="rounded-[var(--radius-md)] bg-surface-raised p-4">
                <p className="text-subheading text-off-white">
                  {pendingSubstitution.fromLabel} → {pendingSubstitution.toLabel}
                </p>
                <p className="mt-1 text-meta text-neutral">{pendingSubstitution.constraint}</p>
                <p className="mt-1 text-meta text-neutral">{pendingSubstitution.rationale}</p>
              </div>
              {substitutionDisposition === "auto_execute" || substitutionDisposition === "suggest" ? (
                <div className="space-y-2">
                  <p className="text-meta text-neutral">That swap works with your plan. You can log it now.</p>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={applySubstitution}>
                      Log this substitution
                    </Button>
                    <Button variant="ghost" onClick={() => setPendingSubstitution(null)}>
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-meta text-neutral">
                    This one needs {coachName}&apos;s OK before it applies — logging waits until they review it.
                  </p>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => escalateSubstitution(pendingSubstitution)}>
                      Ask {coachName}
                    </Button>
                    <Button variant="ghost" onClick={() => setPendingSubstitution(null)}>
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {applicableSubstitutionRules.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-label text-neutral">Registered swaps</p>
                  {applicableSubstitutionRules.map((rule) => (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => setPendingSubstitution(rule)}
                      className="w-full rounded-[var(--radius-md)] border border-white/10 bg-surface-raised p-3 text-left transition hover:border-accent/40"
                    >
                      <p className="text-sm text-off-white">
                        {rule.fromLabel} → {rule.toLabel}
                      </p>
                      <p className="mt-0.5 text-meta text-neutral">{rule.constraint}</p>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="space-y-2">
                <TextArea
                  id={`ask-note-${period}`}
                  label={`What do you want to ask ${coachName}?`}
                  value={askNote}
                  onChange={(e) => setAskNote(e.target.value)}
                  placeholder={`Tell ${coachName} what happened with this meal`}
                />
                <Button variant="outline" className="w-full" onClick={submitAskNote} disabled={!askNote.trim()}>
                  Ask {coachName}
                </Button>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => setView(currentSelection ? "summary" : "plan")}>
                Back
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Correction pass — the one quiet row shape "something-else" and (via
 * divide-y/bg-surface-raised) "plan" share: text + a trailing chevron,
 * never a bordered card, never a competing filled button. */
function SomethingElseRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between py-3.5 text-left text-[15px] text-off-white">
      {label}
      <ChevronRight size={16} className="shrink-0 text-neutral" aria-hidden="true" />
    </button>
  );
}

/** The "reopen a logged meal" summary — first thing shown when the sheet
 * opens for a meal that already has a resolved selection (logged, skipped,
 * or planned for later), so reviewing what's already recorded never
 * requires stepping back through the picker. */
function MealSummary({
  period,
  label,
  selection,
  onEdit,
  onLogNow,
  onClear,
}: {
  period: MealPeriod;
  label: string;
  selection: MealSelection;
  onEdit?: () => void;
  onLogNow?: () => void;
  onClear: () => void;
}) {
  const name = mealDisplayName(period, selection);
  const provenance = mealProvenanceLabel(selection);
  const time = formatTime(selection.completedAtIso);
  // Gate 3B — Read stage: the preserved reason this meal exists, shown
  // exactly as snapshotted at logging time (see lib/nutrition/view-model.ts's
  // mealIntentFor) — never re-derived from the current catalog, so it stays
  // true even if the underlying option/rule changes later.
  const intent = mealIntentFor(selection);
  const photoConfidence = selection.source === "photo-estimate" ? selection.photoEstimate?.confidence : undefined;
  const confidenceLabel = photoConfidence === "high" ? "High" : photoConfidence === "medium" ? "Medium" : photoConfidence ? "Lower" : null;
  // A manual entry (including an accepted substitution) is also always an
  // estimate — see lib/state.ts's SET_MANUAL_MEAL, which stamps isEstimate
  // unconditionally — just without a specific confidence tier the way a
  // photo estimate has one; isUncertainMealSelection is the one shared
  // predicate for "isn't a precise, known quantity," reused here instead of
  // re-deriving the same check inline.
  const showsGenericEstimateNote = !confidenceLabel && isUncertainMealSelection(selection);
  // Correction pass — a field the client never entered renders as "—",
  // never as the real 0 stored underneath it (see
  // MealSelection.unknownMacroFields' own doc in lib/types.ts) — this is
  // the one place a manual entry's macro breakdown is shown, so it's the
  // one place that has to keep "genuinely zero" and "never entered" from
  // looking identical.
  const unknownFields = new Set(selection.unknownMacroFields ?? []);
  function macroField(value: number, field: keyof MacroValues, unit: string): string {
    return unknownFields.has(field) ? `—${unit}` : `${Math.round(value)}${unit}`;
  }

  return (
    <div className="space-y-4">
      {selection.source === "skipped" ? (
        <div className="rounded-[var(--radius-md)] bg-surface-raised p-4">
          <p className="text-subheading text-off-white">Skipped</p>
          <p className="mt-1 text-meta text-neutral">{SKIP_REASON_LABELS[selection.skipReason ?? "other"]}</p>
          {selection.skipNote ? <p className="mt-1 text-meta text-neutral">&ldquo;{selection.skipNote}&rdquo;</p> : null}
        </div>
      ) : selection.source === "planned-later" ? (
        <div className="rounded-[var(--radius-md)] bg-surface-raised p-4">
          <p className="text-subheading text-off-white">Planned for later</p>
          <p className="mt-1 text-meta text-neutral">You chose to log {label.toLowerCase()} later today.</p>
        </div>
      ) : (
        <div className="rounded-[var(--radius-md)] bg-surface-raised p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-subheading text-off-white">{name ?? label}</p>
            {provenance ? (
              <span className="shrink-0 rounded-full bg-brass-soft px-2 py-0.5 text-label text-brass-strong">
                {provenance}
              </span>
            ) : null}
          </div>
          {time ? <p className="mt-0.5 text-meta text-neutral">Logged at {time}</p> : null}
          {intent ? <p className="mt-1 text-meta text-neutral">{intent}</p> : null}
          {confidenceLabel ? (
            <p className="mt-1 text-meta text-warning">{confidenceLabel} confidence — this is an estimate, not an exact count.</p>
          ) : showsGenericEstimateNote ? (
            <p className="mt-1 text-meta text-neutral">Estimated macros.</p>
          ) : null}
          {selection.macros ? (
            <p className="mt-2 text-meta text-neutral">
              {macroField(selection.macros.calories, "calories", " cal")} ·{" "}
              {macroField(selection.macros.proteinG, "proteinG", "g P")} ·{" "}
              {macroField(selection.macros.carbsG, "carbsG", "g C")} · {macroField(selection.macros.fatG, "fatG", "g F")}
            </p>
          ) : null}
          {unknownFields.size > 0 ? (
            <p className="mt-1 text-meta text-neutral">Some values weren&apos;t entered.</p>
          ) : null}
          {selection.source === "photo-estimate" && selection.photoEstimate ? (
            <ul className="mt-2 space-y-1">
              {selection.photoEstimate.items.map((item) => (
                <li key={item.id} className="text-meta text-neutral">
                  {item.name} — {item.quantityLabel}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {onEdit ? (
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
        ) : onLogNow ? (
          <Button size="sm" onClick={onLogNow}>
            Log {label.toLowerCase()} now
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
