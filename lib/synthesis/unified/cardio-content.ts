// Gate U2 — validated Cardio Reasoner output → EXECUTABLE program content (the universal training grammar). Steady
// sessions become `continuous` prescriptions, interval sessions `interval` prescriptions, with CR10 effort
// (PrescriptionEffort — never a fake resistance RPE), the talk-test anchor, heart rate only when the run offered zones,
// placement and optional status. Cardio is merged into the lifting program as additional sessions on each day; lifting
// sessions are never touched. Weeks after the cardio plan's horizon carry no cardio (nothing invented) — a note says
// the coach reviews it then.

import type { DayOfWeek } from "../../types.ts";
import type { Block, Prescription, PrescriptionEffort, Session, TrainingItemInstance, UniversalProgramDay, UniversalTrainingProgramContent } from "../../training/types.ts";
import { DAY_ORDER } from "../client-state.ts";
import { cardioModality } from "../knowledge/cardio/modalities.ts";
import type { CardioReasonerResult } from "../reasoner/cardio/reasoner.ts";
import type { CardioSession, CardioWeekSession } from "../reasoner/cardio/contract.ts";
import { HR_BANDS } from "../reasoner/cardio/input.ts";
import { EFFORT_BANDS } from "../reasoner/cardio/validate.ts";

type PlannedCardio = Extract<CardioReasonerResult, { status: "PLANNED" }>;
const TALK_FOR = { easy: "full_conversation", moderate: "short_sentences", vigorous: "few_words" } as const;
const PLACEMENT_NOTE: Record<string, string> = { after_resistance: "Do this right after your lifting session, in the same visit.", separate_session: "Do this as a separate session, at least 3 hours apart from lifting.", separate_day: "" };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export interface CardioConversion {
  /** week → day → executable session. */
  byWeek: Map<number, Map<DayOfWeek, Session>>;
  weeks: number;
}

/** Converts a PLANNED, warranted cardio proposal. Week 1 uses the model's exact effort/talk/HR; later weeks (compact
 * sessions) use the intensity label's CR10 band (EFFORT_BANDS — internal curation, validated in week 1). */
export function cardioToSessions(c: PlannedCardio): CardioConversion {
  const method = c.plan.intensityMethod.primary;
  const hrMax = c.run.input?.zones?.hrMaxEstimate ?? null;
  const byWeek = new Map<number, Map<DayOfWeek, Session>>();
  const effortOf = (label: CardioSession["intensity"], exact?: { min: number; max: number }, talk?: CardioSession["talk"]): PrescriptionEffort => ({ scale: "cr10", low: exact?.min ?? EFFORT_BANDS[label][0], high: exact?.max ?? EFFORT_BANDS[label][1], label, ...(talk ? { talkTest: talk } : method === "talk_test" && label !== "vigorous" ? { talkTest: TALK_FOR[label] } : {}) });
  const hrOf = (label: CardioSession["intensity"], pct?: { min: number; max: number } | null) => {
    if (!hrMax || (method !== "heart_rate" && !pct)) return undefined;
    const [lo, hi] = pct ? [pct.min, pct.max] : HR_BANDS[label];
    return { low: Math.round((hrMax * lo) / 100), high: Math.round((hrMax * hi) / 100), zoneLabel: `${label[0].toUpperCase()}${label.slice(1)} (${lo}–${hi}% of est. max HR ${hrMax})` };
  };
  const build = (week: number, s: CardioWeekSession, detail: CardioSession | null): Session => {
    const name = cardioModality(s.modality)?.name ?? s.modality;
    const id = `cardio-w${week}-${slug(s.day)}`;
    let prescription: Prescription;
    if (s.type === "intervals") {
      const iv = detail?.intervals ?? s.intervals;
      if (!iv) throw new Error(`week ${week} ${s.day}: interval session without structure (not executable)`);
      prescription = {
        family: "interval",
        rounds: iv.rounds,
        workInterval: { seconds: iv.workSeconds },
        recoveryInterval: { seconds: iv.recoverySeconds },
        effort: effortOf("vigorous", detail?.intervals?.workEffort),
        recoveryEffort: effortOf("easy", detail?.intervals?.recoveryEffort, null),
        ...(hrOf("vigorous", detail?.hrPct) ? { heartRate: hrOf("vigorous", detail?.hrPct)! } : {}),
      };
      // The talk test isn't used for intervals.
      delete prescription.effort!.talkTest;
      delete prescription.recoveryEffort!.talkTest;
    } else {
      prescription = { family: "continuous", duration: { seconds: s.minutes * 60 }, effort: effortOf(s.intensity, detail?.effort, detail?.talk), ...(hrOf(s.intensity, detail?.hrPct) ? { heartRate: hrOf(s.intensity, detail?.hrPct)! } : {}) };
    }
    const item: TrainingItemInstance = { id: `${id}-item`, order: 1, name, category: prescription.family, coachCue: [detail?.purpose, detail?.note].filter(Boolean).join(" ") || undefined, prescription };
    const block: Block = { id: `${id}-block`, kind: s.type === "intervals" ? "interval" : "straight", order: 1, items: [item] } as Block;
    const note = [PLACEMENT_NOTE[s.placement], s.optional ? "Optional — do it if you have the time and energy." : ""].filter(Boolean).join(" ");
    return { id, name: `${name} — ${s.type === "intervals" ? "intervals" : s.intensity}`, focus: detail?.purpose ?? (s.type === "intervals" ? "Intervals" : `${s.intensity[0].toUpperCase()}${s.intensity.slice(1)} aerobic work`), estimatedDurationMin: s.minutes, ...(note ? { coachNote: note } : {}), ...(s.optional ? { optional: true } : {}), blocks: [block] };
  };
  const w1 = new Map<DayOfWeek, Session>();
  for (const s of c.plan.sessions) w1.set(s.day, build(1, s, s));
  byWeek.set(1, w1);
  for (const w of c.plan.progression) {
    const m = new Map<DayOfWeek, Session>();
    for (const s of w.sessions) m.set(s.day, build(w.week, s, null));
    byWeek.set(w.week, m);
  }
  return { byWeek, weeks: 1 + c.plan.progression.length };
}

/** Lifting content + cardio → one program. Lifting sessions and days are copied unchanged; cardio is appended as an
 * extra session on its day (a rest day becomes a training day holding only cardio). Weeks beyond the cardio plan carry
 * no cardio. Pure: the input content is never mutated. */
export function mergeCardioIntoProgram(base: UniversalTrainingProgramContent, cardio: CardioConversion): UniversalTrainingProgramContent {
  const out = structuredClone(base);
  for (const week of out.weeks) {
    const cw = cardio.byWeek.get(week.weekNumber);
    if (!cw) continue;
    week.days = week.days.map((d): UniversalProgramDay => {
      const s = cw.get(d.dayOfWeek as DayOfWeek);
      if (!s) return d;
      return d.type === "training" ? { ...d, sessions: [...(d.sessions ?? []), s] } : { dayOfWeek: d.dayOfWeek, type: "training", sessions: [s] };
    });
  }
  return out;
}

/** A cardio-only program (no lifting in the coordinated program): one week per cardio week. */
export function cardioOnlyProgram(params: { cardio: CardioConversion; id: string; workspaceId: string; clientId: string; coachId: string; name: string }): UniversalTrainingProgramContent {
  const weeks = Array.from({ length: params.cardio.weeks }, (_, k) => ({ weekNumber: k + 1, days: DAY_ORDER.map((day): UniversalProgramDay => (params.cardio.byWeek.get(k + 1)?.get(day) ? { dayOfWeek: day, type: "training", sessions: [params.cardio.byWeek.get(k + 1)!.get(day)!] } : { dayOfWeek: day, type: "rest" })) }));
  return { schemaVersion: 2, id: params.id, workspaceId: params.workspaceId, clientId: params.clientId, coachId: params.coachId, name: params.name, durationWeeks: params.cardio.weeks, weeks } as UniversalTrainingProgramContent;
}
