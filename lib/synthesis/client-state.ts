// Gate 4.0C-1 — ClientState: what is true about this client right now, for
// planning. A thin, typed, in-memory derivation over the canonical records
// that already exist (client_onboarding_progress answers + the health
// review). No second onboarding schema, no persistence.
//
// Every field is a Fact: known (with basis + source) or missing. An
// optional intake question the client skipped is missing — never a
// default. (lib/client-state/ is a different thing: behavioral findings
// such as adherence and recovery trends computed from logged evidence. It
// can feed this state later; it doesn't replace it.)

import { equipmentForClient } from "../coach/activation-generation.ts";
import { RESOLVED_HEALTH_REVIEW_STATUSES, type HealthReviewRecord, type HealthReviewStatus, type OnboardingProgress } from "../coach/types.ts";
import type { DayOfWeek } from "../types.ts";
import { known, missing, type Fact, type FactBasis } from "./facts.ts";
import { parsePerformanceTargets, type PerformanceTargetValue } from "./goal-contract.ts";
import { FOUNDATION_KNOWLEDGE } from "./knowledge/registry.ts";
import { isCurrentFor, parseStoredLimitations, type StoredStructuredLimitations } from "./limitations/confirm.ts";

export const DAY_ORDER: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_KEYS: Record<string, DayOfWeek> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export interface SessionLength {
  minutes: number;
  /** "90+" — the client can go longer than `minutes`. */
  openEnded: boolean;
}

export interface ClientState {
  clientProfileId: string;
  workspaceId: string;
  onboarding: "not_started" | "in_progress" | "complete";
  body: {
    age: Fact<number>;
    sex: Fact<"female" | "male" | "prefer_not_to_say">;
    heightInches: Fact<number>;
    weightLb: Fact<number>;
    weightTrend: Fact<"stable" | "trending_up" | "trending_down" | "unsure">;
  };
  schedule: {
    /** Days the client CAN train — availability, never a prescription. Sorted Monday→Sunday. */
    availableDays: Fact<DayOfWeek[]>;
    maxSessionLength: Fact<SessionLength>;
    preferredTimes: Fact<string[]>;
    predictability: Fact<string>;
    dailyActivity: Fact<string>;
    notes: Fact<string>;
  };
  training: {
    experience: Fact<string>;
    recentConsistency: Fact<string>;
    /** How often they actually train now (not how often they could). */
    currentSessionsPerWeek: Fact<number>;
    notes: Fact<string>;
  };
  equipment: {
    environments: Fact<string[]>;
    available: Fact<string[]>;
  };
  recovery: {
    sleep: Fact<string>;
    obstacles: Fact<string[]>;
  };
  nutrition: {
    approach: Fact<string>;
    dietaryRestrictions: Fact<{ has: boolean; detail: string | null }>;
  };
  goals: {
    primary: Fact<string>;
    primaryOther: Fact<string>;
    secondary: Fact<string[]>;
    targetWeightLb: Fact<number>;
    successDefinition: Fact<string>;
    /** Gate 4.0C-3C — structured performance targets, when the intake provides them (optional, backward-compatible). */
    performanceTargets: Fact<PerformanceTargetValue[]>;
  };
  health: {
    reportsCurrentLimitation: Fact<boolean>;
    bodyAreas: Fact<string[]>;
    bodyAreaOther: Fact<string>;
    aggravatingFactors: Fact<string>;
    restrictions: Fact<string>;
    workingWithProfessional: Fact<boolean>;
    safetyScreen: Fact<string[]>;
    review: {
      status: "none" | "open" | "resolved";
      outcome: HealthReviewStatus | null;
      /** The coach's own documented boundary from the review. */
      coachDocumentedLimitation: Fact<string>;
      /** The coach-confirmed structured form of that boundary — known only
       * while it matches the current documented text. */
      coachStructuredLimitations: Fact<StoredStructuredLimitations>;
      /** none: nothing confirmed; current: applies; stale: confirmed against older text. */
      structuredStatus: "none" | "current" | "stale";
    };
  };
}

export interface ClientStateSources {
  clientProfileId: string;
  workspaceId: string;
  onboarding: OnboardingProgress | null;
  healthReview: HealthReviewRecord | null;
}

type Answers = Record<string, Record<string, unknown> | undefined>;

export function deriveClientState(src: ClientStateSources): ClientState {
  const answers = (src.onboarding?.answers ?? {}) as Answers;
  const read = (step: string, key: string): unknown => answers[step]?.[key];
  const ref = (step: string, key: string) => `onboarding.${step}.${key}`;
  const reported = <T>(step: string, key: string, value: T): Fact<T> => known(value, "client_reported", { kind: "onboarding", ref: ref(step, key) });

  const str = (step: string, key: string): Fact<string> => {
    const v = read(step, key);
    return typeof v === "string" && v.trim() !== "" ? reported(step, key, v.trim()) : missing(ref(step, key));
  };
  const num = (step: string, key: string): Fact<number> => {
    const v = read(step, key);
    return typeof v === "number" && Number.isFinite(v) ? reported(step, key, v) : missing(ref(step, key));
  };
  const list = (step: string, key: string): Fact<string[]> => {
    const v = read(step, key);
    return Array.isArray(v) ? reported(step, key, v.filter((x): x is string => typeof x === "string")) : missing(ref(step, key));
  };
  const bool = (step: string, key: string): Fact<boolean> => {
    const v = read(step, key);
    return typeof v === "boolean" ? reported(step, key, v) : missing(ref(step, key));
  };
  const oneOf = <T extends string>(step: string, key: string, allowed: readonly T[]): Fact<T> => {
    const v = read(step, key);
    return typeof v === "string" && (allowed as readonly string[]).includes(v) ? reported(step, key, v as T) : missing(ref(step, key));
  };

  // Gate 4.0C-4 — structured performance targets: an explicit array answer, else the intake's
  // optional lift-target fields (exercise id + load + optional reps). Never derived from free text.
  function performanceTargetsFact(): Fact<PerformanceTargetValue[]> {
    const explicit = parsePerformanceTargets(read("what_you_want", "performanceTargets"));
    if (explicit.length) return reported("what_you_want", "performanceTargets", explicit);
    const lift = read("what_you_want", "targetLift");
    const value = read("what_you_want", "targetLiftValue");
    const reps = read("what_you_want", "targetLiftReps");
    const fromFields = typeof lift === "string" && lift !== "none" ? parsePerformanceTargets([{ exercise: lift, metric: "load", value, unit: "lb", atReps: reps, timeframe: null }]) : [];
    return fromFields.length ? reported("what_you_want", "targetLift", fromFields) : missing(ref("what_you_want", "performanceTargets"));
  }

  // Height: both parts or nothing.
  const feet = read("about_you", "heightFeet");
  const inches = read("about_you", "heightInchesRemainder");
  const heightInches: Fact<number> =
    typeof feet === "number" && typeof inches === "number"
      ? known(feet * 12 + inches, "client_reported", { kind: "onboarding", ref: "onboarding.about_you.heightFeetInches" })
      : missing("onboarding.about_you.heightFeetInches");

  // Available days: as days, sorted by the week — never the tap order.
  const rawDays = read("your_week", "availableDays");
  const availableDays: Fact<DayOfWeek[]> = Array.isArray(rawDays)
    ? reported("your_week", "availableDays", DAY_ORDER.filter((d) => rawDays.some((k) => DAY_KEYS[String(k)] === d)))
    : missing(ref("your_week", "availableDays"));

  const rawSession = read("your_week", "maxSessionLength");
  const maxSessionLength: Fact<SessionLength> =
    rawSession === "90_plus"
      ? reported("your_week", "maxSessionLength", { minutes: 90, openEnded: true })
      : typeof rawSession === "string" && Number.isFinite(Number(rawSession)) && Number(rawSession) > 0
        ? reported("your_week", "maxSessionLength", { minutes: Number(rawSession), openEnded: false })
        : missing(ref("your_week", "maxSessionLength"));

  const environments = list("your_week", "trainingEnvironment");
  const available: Fact<string[]> =
    environments.status === "known"
      ? known(equipmentForClient({ trainingEnvironment: environments.value } as never), "derived", { kind: "derivation", ref: "equipment.available", derivedFrom: [environments.source.ref] })
      : missing("equipment.available", "Derived from training environment, which is missing.");

  const restrictionsAnswer = read("fuel_recovery", "hasDietaryRestrictions");
  const dietaryRestrictions: Fact<{ has: boolean; detail: string | null }> =
    restrictionsAnswer === "yes" || restrictionsAnswer === "none"
      ? reported("fuel_recovery", "hasDietaryRestrictions", {
          has: restrictionsAnswer === "yes",
          detail: typeof read("fuel_recovery", "dietaryRestrictionsDetail") === "string" ? String(read("fuel_recovery", "dietaryRestrictionsDetail")).trim() || null : null,
        })
      : missing(ref("fuel_recovery", "hasDietaryRestrictions"));

  const review = src.healthReview;
  const reviewStatus: ClientState["health"]["review"]["status"] = !review ? "none" : RESOLVED_HEALTH_REVIEW_STATUSES.has(review.status) ? "resolved" : "open";
  const documented = review?.documentedLimitations?.trim();
  const coachBasis: FactBasis = "coach_confirmed";
  const structured = review ? parseStoredLimitations(review.structuredLimitations, FOUNDATION_KNOWLEDGE) : null;
  const structuredCurrent = !!structured && reviewStatus === "resolved" && isCurrentFor(structured, documented);

  return {
    clientProfileId: src.clientProfileId,
    workspaceId: src.workspaceId,
    onboarding: !src.onboarding ? "not_started" : src.onboarding.completedAtIso ? "complete" : "in_progress",
    body: {
      age: num("about_you", "age"),
      sex: oneOf("about_you", "sex", ["female", "male", "prefer_not_to_say"] as const),
      heightInches,
      weightLb: num("about_you", "weightLb"),
      weightTrend: oneOf("about_you", "weightDirection", ["stable", "trending_up", "trending_down", "unsure"] as const),
    },
    schedule: {
      availableDays,
      maxSessionLength,
      preferredTimes: list("your_week", "preferredTrainingTime"),
      predictability: str("your_week", "schedulePredictability"),
      dailyActivity: str("your_week", "dailyActivityLevel"),
      notes: str("your_week", "scheduleContext"),
    },
    training: {
      experience: str("starting_point", "trainingExperience"),
      recentConsistency: str("starting_point", "recentConsistency"),
      currentSessionsPerWeek: num("starting_point", "weeklyFrequency"),
      notes: str("starting_point", "trainingNotes"),
    },
    equipment: { environments, available },
    recovery: {
      sleep: str("fuel_recovery", "typicalSleep"),
      obstacles: list("fuel_recovery", "consistencyObstacles"),
    },
    nutrition: {
      approach: str("fuel_recovery", "nutritionApproach"),
      dietaryRestrictions,
    },
    goals: {
      primary: str("what_you_want", "primaryGoal"),
      primaryOther: str("what_you_want", "primaryGoalOther"),
      secondary: list("what_you_want", "secondaryGoals"),
      targetWeightLb: num("what_you_want", "targetWeight"),
      successDefinition: str("what_you_want", "successDefinition"),
      performanceTargets: performanceTargetsFact(),
    },
    health: {
      reportsCurrentLimitation: bool("health_finish", "hasInjuryHistory"),
      bodyAreas: list("health_finish", "injuryBodyAreas"),
      bodyAreaOther: str("health_finish", "injuryBodyAreaOther"),
      aggravatingFactors: str("health_finish", "injuryAggravatingFactors"),
      restrictions: str("health_finish", "injuryRestrictions"),
      workingWithProfessional: bool("health_finish", "injuryWorkingWithProfessional"),
      safetyScreen: list("health_finish", "safetyScreen"),
      review: {
        status: reviewStatus,
        outcome: review?.status ?? null,
        coachDocumentedLimitation: documented ? known(documented, coachBasis, { kind: "health_review", ref: "health_review.documentedLimitations" }) : missing("health_review.documentedLimitations"),
        coachStructuredLimitations: structuredCurrent ? known(structured!, coachBasis, { kind: "health_review", ref: "health_review.structuredLimitations" }) : missing("health_review.structuredLimitations"),
        structuredStatus: !structured ? "none" : structuredCurrent ? "current" : "stale",
      },
    },
  };
}
