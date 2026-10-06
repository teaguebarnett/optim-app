// Gate 4.0C-2 — the resistance (strength / hypertrophy) DomainPlanner.
//
// Top-down: readiness → goal emphasis → frequency → split → schedule →
// session purposes → exercise selection → volume → prescriptions →
// progression / deload → quality review → provenance. Deterministic, no
// model call, nothing published. Every number is inside the coach's
// method; anything the planner can't decide honestly becomes NEEDS_INPUT.

import { constraintsNeedingStructure, effectiveConstraints, hardConstraints, type Constraint } from "../../constraints.ts";
import { exerciseEligibility, type LoadCondition } from "../../exercise-eligibility.ts";
import { isKnown } from "../../facts.ts";
import type { ExerciseEntry } from "../../knowledge/types.ts";
import type { ApparatusId, MuscleId } from "../../knowledge/taxonomy.ts";
import type { Decided, ExercisePrescription, PlanSpecification, PlanValidation, QualityFinding, ResistanceExercisePlan, ResistanceSessionPlan, ResistanceWeekPlan } from "../../plan-spec.ts";
import type { DomainPlanner } from "../../planner.ts";
import { factRequirement, type MissingInput, type PlanningRequirement } from "../../readiness.ts";
import type { SynthesisInput } from "../../synthesis-input.ts";
import { chooseSchedule, interpretGoal, rankFrequencies, rankSplits, type Quality } from "./architecture.ts";
import { availableApparatus, availableEquipment, resolveEquipmentAccess } from "./equipment-access.ts";
import { experienceKey, readResistanceMethod, type ResistanceMethod } from "./method.ts";
import { chooseDuration, chooseSets, effortFor, progressionRule, repZone, restFor, roleQualities, weekZone, type Role } from "./prescription.ts";
import { rankCandidates } from "./selection.ts";
import { labelSessions, MAJOR_TARGETS, type SessionPurpose } from "./templates.ts";

export const RESISTANCE_PLANNER_ID = "planner.resistance";
export const RESISTANCE_PLANNER_VERSION = "1.0.0";

/** Planner time estimates (internal, recorded as assumptions). */
const SECONDS_PER_REP = 3;
const SETUP_MINUTES_PER_EXERCISE = 1;
const WARMUP_MINUTES: Record<string, number> = { ramped_warmup_sets: 10, general_then_specific: 10, minimal: 5 };

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const coach = (keys: string[]) => keys.map((k) => `coach:${k}`);
const kn = (concept: string, claim: string) => `knowledge:concept.resistance.${concept}#${claim}`;

export function methodFor(input: SynthesisInput) {
  if (!input.coach) return null;
  return readResistanceMethod(input.coach.method, { trainingExperience: isKnown(input.client.training.experience) ? input.client.training.experience.value : undefined });
}

const REQUIREMENTS: PlanningRequirement[] = [
  {
    id: "resistance_method",
    check: (i) => {
      const m = methodFor(i);
      return !m || m.ok ? true : `coach_brain.${m.missing.map((x) => x.key).join("+")}`;
    },
    why: "The coach's canonical resistance method (training days, splits, sets, reps, effort, progression, deloads) governs every programming number.",
    blockedDecision: "Frequency range, split, prescriptions, progression and deloads.",
    providedBy: "coach",
  },
  {
    id: "program_length",
    check: (i) => {
      const m = methodFor(i);
      return !m || !m.ok || m.method.programLengthWeeks ? true : "coach_brain.program_length";
    },
    why: "Program length decides how many weeks of progression to plan.",
    blockedDecision: "Program duration and deload placement.",
    providedBy: "coach",
  },
  factRequirement("training_experience", (i) => i.client.training.experience, {
    why: "Experience sets the coach's experience exceptions, the training-status frequency band and skill limits.",
    blockedDecision: "Frequency and exercise selection.",
    providedBy: "client",
  }),
  factRequirement("training_environment", (i) => i.client.equipment.environments, {
    why: "Exercises can only be chosen from equipment the client can actually use.",
    blockedDecision: "Exercise selection.",
    providedBy: "client",
  }),
  factRequirement("session_length", (i) => i.client.schedule.maxSessionLength, {
    why: "Session length bounds how many exercises and sets fit.",
    blockedDecision: "Exercises per session.",
    providedBy: "client",
  }),
  {
    id: "goal_interpretable",
    check: (i) => {
      const p = i.goal.primary;
      if (!p) return true; // shared requirement reports it
      if (p.class === "other") return "goal_contract.primary.class";
      if (p.class === "sport_performance" && (p.sport.status === "missing" || p.seasonPhase.status === "missing")) return "goal.sport+goal.seasonPhase";
      return true;
    },
    why: "The goal decides the resistance emphasis; a free-text or sport goal needs its class or sport details first.",
    blockedDecision: "Goal emphasis, rep zones, set choices and split preference.",
    providedBy: "either",
  },
  {
    id: "restrictions_structured",
    check: (i) => {
      const open = constraintsNeedingStructure(i.constraints);
      return open.length === 0 ? true : open.map((c) => `constraint.${c.id}.structured_restriction`).join("+");
    },
    why: "A hard restriction written in words (or as literal exercise names) has to be expressed as structured restrictions — patterns, demands, positions — before exercises can be checked against it. OPTIM doesn't interpret free text.",
    blockedDecision: "Exercise selection.",
    providedBy: "coach",
  },
];

export interface PoolResult {
  pool: ExerciseEntry[];
  excluded: Array<{ exerciseId: string; reasons: string[] }>;
  unknownApparatus: Map<ApparatusId, string[]>;
  byConstraint: Map<string, string[]>;
  /** Gate 4.0C-3B — eligible exercises that must stay submaximal under a hard demand restriction. */
  loadConditions: Map<string, LoadCondition[]>;
  /** Laterality — unilateral exercises that fit only with the unaffected side (exercise id → that side). */
  sideOnly: Map<string, "left" | "right">;
}

export function buildPool(input: SynthesisInput, method: ResistanceMethod): PoolResult | null {
  const access = resolveEquipmentAccess(input.client);
  if (!access) return null;
  const equipment = new Set(availableEquipment(access));
  const apparatus = new Set(availableApparatus(access));
  const avoided = method.exercisesAvoided.value.map(words).filter(Boolean);
  const pool: ExerciseEntry[] = [];
  const excluded: PoolResult["excluded"] = [];
  const unknownApparatus = new Map<ApparatusId, string[]>();
  const byConstraint = new Map<string, string[]>();
  const loadConditions = new Map<string, LoadCondition[]>();
  const sideOnly = new Map<string, "left" | "right">();
  for (const e of input.knowledge.exercises()) {
    const reasons: string[] = [];
    if (!equipment.has(e.equipment)) reasons.push(`needs ${e.equipment}`);
    for (const a of e.apparatus) {
      if (apparatus.has(a)) continue;
      reasons.push(`needs ${a} (${access.apparatus[a]})`);
      if (access.apparatus[a] === "unknown") unknownApparatus.set(a, [...(unknownApparatus.get(a) ?? []), e.id]);
    }
    const elig = exerciseEligibility(e, input.constraints);
    for (const v of elig.violations.filter((x) => x.enforcement === "hard")) {
      reasons.push(`${v.constraintId}: ${v.reason}`);
      const list = byConstraint.get(v.constraintId) ?? [];
      if (!list.includes(e.id)) byConstraint.set(v.constraintId, [...list, e.id]);
    }
    if ([e.name, ...e.aliases].some((n) => avoided.includes(words(n)))) reasons.push("coach avoids this exercise (t_exercises_avoided)");
    if (!e.prescription.includes("reps")) reasons.push(`prescribed by ${e.prescription.join("/")}, which the coach's method doesn't define`);
    if (reasons.length) excluded.push({ exerciseId: e.id, reasons });
    else {
      pool.push(e);
      const conds = elig.loadConditions.filter((x) => x.enforcement === "hard");
      if (conds.length) loadConditions.set(e.id, conds);
      if (elig.sideOnly) sideOnly.set(e.id, elig.sideOnly.side);
    }
  }
  return { pool, excluded, unknownApparatus, byConstraint, loadConditions, sideOnly };
}

function plan(input: SynthesisInput, ctx: { nowIso: string }): PlanSpecification | { status: "NEEDS_INPUT"; missing: MissingInput[] } {
  const read = methodFor(input)!;
  if (!read.ok) return { status: "NEEDS_INPUT", missing: read.missing.map((m) => ({ fact: `coach_brain.${m.key}`, why: m.why, blockedDecision: "Resistance programming.", providedBy: "coach" })) };
  const method = read.method;
  const client = input.client;
  const emphasis = interpretGoal(input.goal)!;
  const exp = experienceKey(isKnown(client.training.experience) ? client.training.experience.value : undefined);
  const access = resolveEquipmentAccess(client)!;
  const poolResult = buildPool(input, method)!;
  const { pool } = poolResult;
  const rules: string[] = [];
  const knowledgeUsed = new Set<string>();
  const assumptions: PlanSpecification["assumptions"] = [];
  const unresolved: PlanSpecification["unresolved"] = [];
  const quality: QualityFinding[] = [];

  const needsInput = (missing: MissingInput[]) => ({ status: "NEEDS_INPUT" as const, missing });
  const apparatusAsks = (): MissingInput[] =>
    [...poolResult.unknownApparatus.entries()].map(([a, ids]) => ({ fact: `client.apparatus.${a}`, why: `Whether the client has a ${a.replace(/_/g, " ")} is unknown; ${ids.length} exercise(s) need one.`, blockedDecision: "Exercise selection for sessions that can't be filled otherwise.", providedBy: "client" as const }));

  // --- 1. Frequency ---------------------------------------------------------
  const bounds = input.bounds.frequency;
  const availableDays = isKnown(client.schedule.availableDays) ? client.schedule.availableDays.value : [];
  const current = isKnown(client.training.currentSessionsPerWeek) ? client.training.currentSessionsPerWeek.value : null;
  const consistency = isKnown(client.training.recentConsistency) ? client.training.recentConsistency.value : null;
  const consistent = consistency === null ? null : consistency === "fairly_consistent" || consistency === "very_consistent";
  const freq = rankFrequencies({ bounds: { min: bounds.min!, max: bounds.max! }, knowledge: input.knowledge, experience: exp, currentSessionsPerWeek: current, consistent, coachPreferred: method.days.value.preferred ?? null });
  if (freq.statusBand) knowledgeUsed.add("concept.resistance.training_frequency");
  rules.push("resistance.frequency.score_within_bounds");

  // --- 2. Split (first feasible frequency in rank order) ---------------------
  const trainable = new Set<string>(pool.flatMap((e) => e.primaryMuscles));
  const sessionFeasible = (p: SessionPurpose) => {
    const covering = pool.filter((e) => e.primaryMuscles.some((m) => p.targets.includes(m)));
    return covering.length >= 2 && new Set(covering.flatMap((e) => e.primaryMuscles.filter((m) => p.targets.includes(m)))).size >= 2;
  };
  let chosen: { days: number; split: ReturnType<typeof rankSplits>["ranked"][number]; splitKeys: string[]; skipped: string[] } | null = null;
  const skipped: string[] = [];
  for (const c of freq.candidates) {
    const coachSplits = method.splitsFor(c.days);
    const { ranked, rejected } = rankSplits({ coachSplits: coachSplits.value, days: c.days, emphasis, trainableTargets: trainable, sessionFeasible, schedulePenalty: (sessions) => chooseSchedule(availableDays, sessions).penalty });
    if (ranked.length) {
      chosen = { days: c.days, split: ranked[0], splitKeys: coachSplits.keys, skipped: [...skipped] };
      if (ranked.length > 1) rules.push("resistance.split.rank");
      break;
    }
    skipped.push(`${c.days} days: ${rejected.map((r) => `${r.split} ${r.reason}`).join("; ") || "coach lists no split"}`);
  }
  if (!chosen) {
    return needsInput([
      { fact: "coach_decision.split_for_constraints", why: `None of the coach's splits fits an allowed frequency with the exercises this client can do (${skipped.join(" | ")}).`, blockedDecision: "Weekly structure.", providedBy: "coach" },
      ...apparatusAsks(),
    ]);
  }
  if (emphasis.primary === "hypertrophy" || emphasis.secondary === "hypertrophy") knowledgeUsed.add("concept.resistance.training_frequency");
  rules.push("resistance.split.coach_list_fit_and_feasibility");
  const freqPick = freq.candidates.find((c) => c.days === chosen!.days)!;

  // --- 3. Schedule -----------------------------------------------------------
  const schedule = chooseSchedule(availableDays, chosen.split.sessions);
  rules.push("resistance.schedule.spread_overlap_penalty");
  const labels = labelSessions(chosen.split.sessions);

  // --- 4. Session budget ----------------------------------------------------
  const clientLen = isKnown(client.schedule.maxSessionLength) ? client.schedule.maxSessionLength.value : null;
  const coachLen = method.sessionLength?.value ?? null;
  if (clientLen && coachLen && !clientLen.openEnded && clientLen.minutes < coachLen.min) {
    return needsInput([{ fact: "coach_decision.session_length_below_minimum", why: `The client has ${clientLen.minutes} min per session; the coach's sessions run ${coachLen.min}–${coachLen.max} min.`, blockedDecision: "Session contents.", providedBy: "coach" }]);
  }
  const cap = clientLen ? (clientLen.openEnded ? (coachLen?.max ?? clientLen.minutes) : Math.min(clientLen.minutes, coachLen?.max ?? Infinity)) : coachLen!.max;
  const warmup = method.warmup ? (WARMUP_MINUTES[method.warmup.value] ?? 10) : 10;
  assumptions.push({ statement: `Session time is estimated at ~${SECONDS_PER_REP} s per rep, ${SETUP_MINUTES_PER_EXERCISE} min setup per exercise and ${warmup} min warm-up${method.warmup ? ` (coach warm-up: ${method.warmup.value})` : ""}.`, basis: "planner_rule" });
  for (const b of access.baselineAssumptions) assumptions.push({ statement: `A ${b.apparatus.replace(/_/g, " ")} is assumed available because the client trains at a ${b.environment.replace(/_/g, " ")}.`, basis: "planner_rule" });
  for (const [a] of poolResult.unknownApparatus) unresolved.push({ fact: `client.apparatus.${a}`, why: `Not asked at intake; exercises needing a ${a.replace(/_/g, " ")} were left out rather than assumed.`, providedBy: "client" });

  // --- 5. Prescription bases --------------------------------------------------
  const undulating = method.longTermStructure?.value === "undulating";
  const variationMode: "undulating" | "phase" | "none" = undulating ? "undulating" : method.reps.variesByPhase || ["linear_phases", "block"].includes(method.longTermStructure?.value ?? "") ? "phase" : "none";
  const rq = roleQualities(emphasis, undulating);
  const zones = new Map<string, ReturnType<typeof repZone>>();
  const zoneFor = (role: Role, q: Quality) => {
    const k = `${role}:${q}`;
    if (!zones.has(k)) {
      const z = repZone({ knowledge: input.knowledge, coach: method.reps[role].value, quality: q, experience: exp });
      if (q !== "general") knowledgeUsed.add("concept.resistance.repetition_range");
      zones.set(k, z);
    }
    return zones.get(k)!;
  };
  const setsBase = { main: chooseSets(method.sets.main.value, "main", emphasis), accessory: chooseSets(method.sets.accessory.value, "accessory", emphasis) };
  const minutesFor = (role: Role) => {
    const z = zoneFor(role, role === "main" ? rq.main : rq.accessory).range;
    const rest = restFor(method, input.knowledge, role, role === "main" ? rq.main : rq.accessory).range;
    const restMid = rest ? (rest.min + rest.max) / 2 : 2;
    return (setsBase[role].sets * (((z.min + z.max) / 2) * SECONDS_PER_REP + restMid * 60)) / 60 + SETUP_MINUTES_PER_EXERCISE;
  };

  // --- 6. Sessions & exercise selection --------------------------------------
  const strengthGoal = emphasis.primary === "strength" || emphasis.secondary === "strength";
  const mainSlots = strengthGoal ? 2 : 1;
  const usedThisWeek = new Map<string, string[]>();
  const mainPatternUses = new Map<string, number>();
  const weekExposure = new Map<MuscleId, number>();
  const sessions: ResistanceSessionPlan[] = [];
  const uncovered: string[] = [];
  chosen.split.sessions.forEach((purpose, si) => {
    const picked: Array<{ e: ExerciseEntry; plan: ResistanceExercisePlan }> = [];
    let minutes = warmup;
    const pick = (role: Role, targets: MuscleId[], compoundOnly: boolean): boolean => {
      let best: { r: ReturnType<typeof rankCandidates>[number]; target: MuscleId; alts: string[]; unusedAlt: ReturnType<typeof rankCandidates>[number] | undefined } | null = null;
      for (const target of targets) {
        const ranked = rankCandidates(compoundOnly ? pool.filter((e) => e.mechanics === "compound") : pool, { role, target, sessionPurpose: purpose.id, sessionTargets: purpose.targets, leadPatterns: purpose.leadPatterns, quality: role === "main" ? rq.main : rq.accessory }, { experience: exp, usedThisWeek, inSession: picked.map((p) => p.e), mainPatternUses });
        if (ranked.length && (!best || ranked[0].score > best.r.score)) best = { r: ranked[0], target, alts: ranked.slice(1, 4).map((x) => x.exercise.id), unusedAlt: ranked.find((x) => !usedThisWeek.has(x.exercise.id)) };
        if (role === "accessory") break; // accessories fill targets in priority order
      }
      if (!best) return false;
      const cost = minutesFor(role);
      if (minutes + cost > cap) return false;
      minutes += cost;
      const b = best as NonNullable<typeof best>;
      // A repeat is either intentional (selection gave a reason), forced (no unused candidate), or it outscored unused ones despite the penalty — said plainly.
      const repeated =
        b.r.repeatedReason ??
        (usedThisWeek.has(b.r.exercise.id)
          ? b.unusedAlt
            ? `kept despite the repetition penalty: the best unused option (${b.unusedAlt.exercise.id}) scores ${Math.round((b.r.score - b.unusedAlt.score) * 100) / 100} lower`
            : `every eligible exercise for ${b.target} is already used this week`
          : undefined);
      picked.push({ e: b.r.exercise, plan: { exerciseId: b.r.exercise.id, role, target: b.target, selection: { score: Math.round(b.r.score * 100) / 100, factors: b.r.factors, alternatives: b.alts, ...(repeated ? { repeatedReason: repeated } : {}) } } });
      return true;
    };
    for (let k = 0; k < mainSlots; k++) {
      const open = purpose.targets.filter((t) => !picked.some((p) => p.e.primaryMuscles.includes(t)));
      if (!pick("main", open, true)) break;
    }
    // Accessory targets in order of least direct exposure so far this week
    // (template priority breaks ties), so a time-limited session rotates
    // targets across the week instead of always filling the same one.
    const exposure = (m: MuscleId) => weekExposure.get(m) ?? 0;
    const accessoryOrder = [...purpose.targets].sort((a, b) => exposure(a) - exposure(b) || purpose.targets.indexOf(a) - purpose.targets.indexOf(b));
    for (const target of accessoryOrder) {
      if (picked.some((p) => p.e.primaryMuscles.includes(target))) continue;
      if (!trainable.has(target)) {
        uncovered.push(`${labels[si]}: ${target} (no eligible exercise)`);
        continue;
      }
      if (!pick("accessory", [target], false)) uncovered.push(`${labels[si]}: ${target} (${minutes + minutesFor("accessory") > cap ? "session time" : "no eligible exercise left"})`);
    }
    const orderRank = { early: 0, flexible: 1, late: 2 } as const;
    picked.sort((a, b) => (a.plan.role === b.plan.role ? 0 : a.plan.role === "main" ? -1 : 1) || orderRank[a.e.ordering] - orderRank[b.e.ordering] || (a.e.mechanics === b.e.mechanics ? 0 : a.e.mechanics === "compound" ? -1 : 1));
    for (const p of picked) {
      for (const m of p.e.primaryMuscles) weekExposure.set(m, (weekExposure.get(m) ?? 0) + 1);
      usedThisWeek.set(p.e.id, [...(usedThisWeek.get(p.e.id) ?? []), purpose.id]);
      if (p.plan.role === "main") mainPatternUses.set(p.e.patterns[0], (mainPatternUses.get(p.e.patterns[0]) ?? 0) + 1);
    }
    sessions.push({ day: schedule.days[si], purpose: labels[si], targets: purpose.targets, exercises: picked.map((p) => p.plan), estimatedMinutes: Math.round(minutes) });
  });
  rules.push("resistance.selection.score_v1", "resistance.selection.rotate_accessory_targets_by_exposure", "resistance.order.main_then_ordering_hint");
  knowledgeUsed.add("concept.resistance.exercise_order");
  const thin = sessions.find((s) => s.exercises.length < 2);
  if (thin) return needsInput([{ fact: "coach_decision.session_content", why: `${thin.purpose} can't hold two eligible exercises within ${cap} min.`, blockedDecision: "Session contents.", providedBy: "coach" }, ...apparatusAsks()]);

  // --- 7. Duration, progression, deload ---------------------------------------
  const duration = chooseDuration(method)!;
  rules.push("resistance.duration.coach_program_length");
  if (method.deload.value.approach === "fixed" && duration.deloadWeeks.length) {
    assumptions.push({ statement: "Deload weeks use the coach's minimum sets and the easiest end of the coach's effort range; the method doesn't define a deload size.", basis: "coach_method" });
    unresolved.push({ fact: "coach_brain.deload_magnitude", why: "The coach's method schedules deloads but doesn't say how much to reduce.", providedBy: "coach" });
  }
  if (method.effort.metrics.includes("percent_1rm")) unresolved.push({ fact: "client.one_rep_max_baselines", why: "The coach also programs by %1RM; there are no 1RM baselines, so effort is prescribed by RPE/RIR.", providedBy: "either" });
  const exById = new Map(pool.map((e) => [e.id, e]));
  const buildWeeks = duration.weeks - duration.deloadWeeks.length;
  let buildIndex = 0;
  let sinceDeload = 0;
  const weeks: ResistanceWeekPlan[] = [];
  for (let w = 1; w <= duration.weeks; w++) {
    const deload = duration.deloadWeeks.includes(w);
    if (!deload) {
      buildIndex++;
      sinceDeload++;
    }
    const weekSessions: ExercisePrescription[][] = sessions.map((s) =>
      s.exercises.map((x) => {
        const role = x.role;
        const q: Quality = role === "main" ? (rq.mainAlternates ? rq.mainAlternates[(buildIndex - 1) % 2] : rq.main) : rq.accessory;
        const z = zoneFor(role, q).range;
        const wz = deload ? { range: z } : weekZone(z, rq.mainAlternates && role === "main" ? 1 : buildIndex, buildWeeks, rq.mainAlternates && role === "main" ? "none" : variationMode);
        const range = method.sets[role].value;
        const firstMethod = method.progression[role].value[0];
        let sets = deload ? range.min : setsBase[role].sets;
        if (!deload && firstMethod === "add_reps_or_sets") sets = Math.min(range.max, range.min + (sinceDeload - 1));
        const effort = effortFor(method, role, q, deload);
        return { sets, reps: wz.range, effort: { metric: effort.metric, target: effort.target, rirRange: effort.rirRange }, restMinutes: restFor(method, input.knowledge, role, q).range };
      })
    );
    if (deload) sinceDeload = 0;
    const prev = weeks[weeks.length - 1];
    const same = prev && JSON.stringify(prev.sessions) === JSON.stringify(weekSessions);
    const note = deload
      ? "Deload week (coach-scheduled)."
      : !prev
        ? "First week."
        : same
          ? `Targets unchanged by design: progression comes from the coach's rule (${method.progression.main.value[0]}).`
          : rq.mainAlternates
            ? `Main lifts alternate ${rq.mainAlternates.join("/")} zones (undulating); accessories ${variationMode === "undulating" ? "alternate rep halves" : "progress by rule"}.`
            : variationMode === "undulating"
              ? "Rep targets alternate between the lighter and heavier half of the zone (coach: undulating)."
              : variationMode === "phase"
                ? "Rep targets shift with the program phase (coach: rep range varies by phase)."
                : "Set targets build within the coach's range.";
    weeks.push({ week: w, kind: deload ? "deload" : "build", note, sessions: weekSessions });
  }
  rules.push(`resistance.progression.${variationMode}`, "resistance.prescription.coach_ranges_knowledge_zones");
  knowledgeUsed.add("concept.resistance.progression");
  if (emphasis.primary !== "general") knowledgeUsed.add("concept.resistance.effort");
  if (!method.rest) knowledgeUsed.add("concept.resistance.rest_intervals");
  if (setsBase.accessory.why.includes("knowledge")) knowledgeUsed.add("concept.resistance.volume");

  // --- 8. Volume accounting & quality review ---------------------------------
  const weeklyMuscleSets: Record<string, { direct: number; indirect: number }> = {};
  sessions.forEach((s, si) =>
    s.exercises.forEach((x, xi) => {
      const e = exById.get(x.exerciseId)!;
      const sets = weeks[0].sessions[si][xi].sets;
      for (const m of e.primaryMuscles) (weeklyMuscleSets[m] ??= { direct: 0, indirect: 0 }).direct += sets;
      for (const m of e.secondaryMuscles) (weeklyMuscleSets[m] ??= { direct: 0, indirect: 0 }).indirect += sets;
    })
  );
  for (const m of MAJOR_TARGETS) {
    if ((weeklyMuscleSets[m]?.direct ?? 0) > 0) continue;
    if (!trainable.has(m)) quality.push({ code: "target_excluded", severity: "info", message: `${m} gets no direct work: no eligible exercise trains it (constraints/equipment).` });
    else quality.push({ code: "target_omitted", severity: "warning", message: `${m} gets no direct work this week although eligible exercises exist.` });
  }
  const directs = Object.values(weeklyMuscleSets).map((v) => v.direct).filter((n) => n > 0).sort((a, b) => a - b);
  const median = directs.length ? directs[Math.floor(directs.length / 2)] : 0;
  for (const [m, v] of Object.entries(weeklyMuscleSets)) if (median && v.direct > median * 2.5) quality.push({ code: "redundant_exposure", severity: "warning", message: `${m} has ${v.direct} direct sets/week, more than 2.5× the median (${median}).` });
  const patternSets = (patterns: string[]) => sessions.reduce((sum, s, si) => sum + s.exercises.reduce((t, x, xi) => t + (exById.get(x.exerciseId)!.patterns.some((p) => patterns.includes(p)) ? weeks[0].sessions[si][xi].sets : 0), 0), 0);
  const push = patternSets(["horizontal_push", "vertical_push"]);
  const pull = patternSets(["horizontal_pull", "vertical_pull"]);
  if (push + pull > 0 && (pull === 0 || push / Math.max(pull, 1) > 1.5 || pull / Math.max(push, 1) > 1.5)) quality.push({ code: "push_pull_balance", severity: "warning", message: `Weekly pushing sets ${push} vs pulling sets ${pull}.` });
  for (let i = 0; i + 1 < sessions.length; i++) {
    const [a, b] = [sessions[i], sessions[i + 1]];
    const ia = (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const).indexOf(a.day);
    const ib = (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const).indexOf(b.day);
    const heavy = (s: ResistanceSessionPlan) => s.exercises.map((x) => exById.get(x.exerciseId)!).filter((e) => e.demands.systemic_fatigue === "high");
    const shared = heavy(a).flatMap((e) => e.primaryMuscles).filter((m) => heavy(b).some((e) => e.primaryMuscles.includes(m)));
    if (ib - ia === 1 && shared.length) quality.push({ code: "consecutive_high_fatigue", severity: "warning", message: `${a.day} and ${b.day} both load ${[...new Set(shared)].join(", ")} with high-fatigue exercises.` });
  }
  for (const s of sessions) if (s.estimatedMinutes > cap) quality.push({ code: "session_duration", severity: "warning", message: `${s.purpose} is estimated at ${s.estimatedMinutes} min (cap ${cap}).` });
  for (const u of uncovered) quality.push({ code: "session_target_uncovered", severity: "info", message: `Not covered — ${u}.` });
  for (const s of sessions) for (const x of s.exercises) if (x.selection.repeatedReason) quality.push({ code: "exercise_repeated", severity: "info", message: `${x.exerciseId} repeats in ${s.purpose}: ${x.selection.repeatedReason}.` });
  if (current !== null && chosen.days < current) quality.push({ code: "frequency_below_habit", severity: "info", message: `Planned ${chosen.days} days/week; the client currently trains ${current}.` });
  if (weeks.filter((w) => w.kind === "build").every((w, _, all) => JSON.stringify(w.sessions) === JSON.stringify(all[0].sessions))) quality.push({ code: "weeks_identical_by_design", severity: "info", message: `Build weeks share targets; progression is carried by the coach's rule: ${progressionRule(method.progression.main.value)}` });

  // --- 9. Constraints accounted for -------------------------------------------
  const constraintsApplied = hardConstraints(input.constraints).map((c) => ({ constraintId: c.id, how: howApplied(c, { days: schedule.days.length, available: availableDays.length, cap, excluded: poolResult.byConstraint.get(c.id) ?? [] }) }));
  for (const c of effectiveConstraints(input.constraints)) if (c.interpretedBy && !constraintsApplied.some((x) => x.constraintId === c.id) && c.enforcement === "hard") constraintsApplied.push({ constraintId: c.id, how: `expressed by ${c.interpretedBy}` });

  // --- 10. Spec ----------------------------------------------------------------
  const clientRef = (f: { status: string; source?: { ref: string } }) => (f.status === "known" && f.source ? [`client:${f.source.ref}`] : []);
  const decided = <T>(value: T, rationale: string, rule: string, basis: Decided<T>["basis"], inputs: string[]): Decided<T> => ({ value, rationale, rule, basis, inputs });
  const freqFactors = freqPick.factors.map((f) => `${f.factor} (${f.points > 0 ? "+" : ""}${f.points})`).join("; ") || "no scoring factors applied";
  const knowledgeRefs = [...knowledgeUsed, ...new Set(sessions.flatMap((s) => s.exercises.map((x) => x.exerciseId)))].map((id) => input.knowledge.ref(id)).filter((r): r is NonNullable<typeof r> => !!r);

  return {
    clientProfileId: client.clientProfileId,
    domain: "resistance",
    goalClass: input.goal.primary!.class,
    frequency: decided(
      chosen.days,
      `${chosen.days} days/week from the allowed ${bounds.min}–${bounds.max} (availability ${availableDays.length} days is the ceiling, coach range ${method.days.value.min}–${method.days.value.max}). Factors: ${freqFactors}.${chosen.skipped.length ? ` Higher-ranked counts skipped: ${chosen.skipped.join(" | ")}.` : ""}`,
      "resistance.frequency.score_within_bounds",
      "planner_rule",
      [...coach(method.days.keys), ...clientRef(client.schedule.availableDays), ...clientRef(client.training.currentSessionsPerWeek), ...clientRef(client.training.experience), ...clientRef(client.training.recentConsistency), ...(freq.statusBand ? [kn("training_frequency", "frequency.acsm_by_status")] : [])]
    ),
    schedule: decided(schedule.days, `Sessions placed on ${schedule.days.join(", ")} to avoid training overlapping muscles on consecutive days${schedule.notes.length ? ` (remaining: ${schedule.notes.join("; ")})` : ""}.`, "resistance.schedule.spread_overlap_penalty", "planner_rule", clientRef(client.schedule.availableDays)),
    weeklyStructure: decided(
      { name: chosen.split.split, sessions: schedule.days.map((day, i) => ({ day, purpose: labels[i], domain: "resistance" as const })) },
      `${chosen.split.split.replace(/_/g, " ")} from the coach's splits for ${chosen.days} days (${chosen.split.factors.map((f) => f.factor).join("; ")}).`,
      "resistance.split.coach_list_fit_and_feasibility",
      "coach_method",
      [...coach(chosen.splitKeys), ...(emphasis.primary === "hypertrophy" || emphasis.secondary === "hypertrophy" ? [kn("training_frequency", "frequency.per_muscle_hypertrophy")] : [])]
    ),
    durationWeeks: decided(duration.weeks, duration.why, "resistance.duration.coach_program_length", "coach_method", coach([...(method.programLengthWeeks?.keys ?? []), ...method.deload.keys])),
    volume: decided(
      { unit: "sets_per_muscle_per_week", byTarget: Object.fromEntries(Object.entries(weeklyMuscleSets).map(([m, v]) => [m, { min: v.direct, max: v.direct }])) },
      `Weekly direct sets follow from the exercises chosen and the coach's set ranges — main lifts: ${setsBase.main.why}; accessories: ${setsBase.accessory.why}. No universal weekly-set target is imposed.`,
      "resistance.volume.coach_sets_x_selection",
      "coach_method",
      coach([...method.sets.main.keys, ...method.sets.accessory.keys])
    ),
    intensity: decided(
      { method: method.effort.rir ? (method.effort.metrics.includes("rpe") ? "rpe" : "rir") : "plain_language", range: method.effort.rir ? { min: method.effort.rir.main.value.min, max: method.effort.rir.main.value.max } : null, note: rq.mainAlternates
          ? `Main lifts alternate by week (coach: undulating) between ${rq.mainAlternates.map((q) => `${q} — ${zoneFor("main", q).source}`).join(" and ")}. Accessories: ${zoneFor("accessory", rq.accessory).source}.`
          : `Main: ${zoneFor("main", rq.main).source}. Accessories: ${zoneFor("accessory", rq.accessory).source}.` },
      `Effort stays inside the coach's range; reps come from the coach's range narrowed by the goal where sourced knowledge supports it.`,
      "resistance.prescription.coach_ranges_knowledge_zones",
      "coach_method",
      [...coach([...(method.effort.rir?.main.keys ?? method.effort.plain?.keys ?? []), ...method.reps.main.keys, ...method.reps.accessory.keys, "t_effort_metric"]), ...[...zones.keys()].filter((k) => !k.endsWith(":general")).map((k) => kn("repetition_range", k.endsWith(":strength") ? "reps.acsm_strength" : "reps.acsm_hypertrophy")).filter((v, i, a) => a.indexOf(v) === i)]
    ),
    progression: decided({ model: variationMode, rule: progressionRule(method.progression.main.value) }, `Coach's progression order: ${method.progression.main.value.join(" → ")}${method.longTermStructure ? `; long-term structure ${method.longTermStructure.value}` : ""}.`, `resistance.progression.${variationMode}`, "coach_method", coach([...method.progression.main.keys, ...(method.longTermStructure?.keys ?? []), ...(method.reps.variesByPhase ? ["t_reps.varies"] : [])])),
    recovery: decided({ deloadEveryWeeks: duration.deloadWeeks.length ? duration.deloadWeeks[0] : null, approach: method.deload.value.approach === "as_needed" ? `as needed — triggers: ${method.deload.value.triggers.join(", ") || "not listed"}` : method.deload.value.approach }, duration.why, "resistance.deload.coach_method", "coach_method", coach(method.deload.keys)),
    monitoring: decided({ metrics: ["session RPE/RIR vs target", "reps achieved vs target", ...(method.deload.value.approach === "as_needed" ? method.deload.value.triggers.map((t) => `deload trigger: ${t}`) : [])], cadence: "every session" }, "Monitoring follows what the coach's progression and deload rules need.", "resistance.monitoring.from_method", "coach_method", coach([...method.progression.main.keys, ...method.deload.keys])),
    resistance: decided(
      { emphasis: { primary: emphasis.primary, secondary: emphasis.secondary }, sessions, weeks, weeklyMuscleSets, progressionRules: (["main", "accessory"] as const).map((role) => ({ role, methods: method.progression[role].value, rule: progressionRule(method.progression[role].value) })) },
      emphasis.rationale,
      "resistance.program.v1",
      "planner_rule",
      [...clientRef(client.goals.primary), ...clientRef(client.goals.secondary)]
    ),
    quality,
    constraintsApplied,
    assumptions,
    unresolved,
    provenance: {
      knowledge: { version: input.knowledge.version, entries: knowledgeRefs },
      coachBrain: input.coach ? { versionId: input.coach.versionId, version: input.coach.version } : null,
      clientInputs: [client.schedule.availableDays, client.schedule.maxSessionLength, client.training.experience, client.training.currentSessionsPerWeek, client.training.recentConsistency, client.equipment.environments, client.goals.primary, client.goals.secondary].flatMap((f) => (f.status === "known" ? [f.source.ref] : [])),
      goalInputs: [`goal.primary.${input.goal.primary!.class}`, ...input.goal.secondary.map((g) => `goal.secondary.${g.class}`)],
      constraints: hardConstraints(input.constraints).map((c) => ({ id: c.id, confirmation: c.confirmation })),
      rules,
      planner: { id: RESISTANCE_PLANNER_ID, version: RESISTANCE_PLANNER_VERSION },
      generatedAtIso: ctx.nowIso,
      model: null,
    },
  };
}

function howApplied(c: Constraint, ctx: { days: number; available: number; cap: number; excluded: string[] }): string {
  switch (c.category) {
    case "availability":
      return `scheduled ${ctx.days} of ${ctx.available} available days`;
    case "session_length":
      return `sessions sized to fit ${ctx.cap} min`;
    case "equipment":
      return `only exercises using available equipment (${ctx.excluded.length} excluded by this constraint's check)`;
    case "movement_restriction":
      if (c.interpretedBy) return `expressed by ${c.interpretedBy}`;
      return ctx.excluded.length ? `excluded before selection by metadata: ${ctx.excluded.join(", ")}` : "checked against every candidate; no candidate violated it";
    case "injury_or_pain":
      return c.interpretedBy ? `expressed by ${c.interpretedBy}` : c.review.status === "resolved" ? "reviewed by the coach; the coach's documented boundaries apply" : "open — planning is blocked until the coach reviews it";
    case "medical_review":
      return c.review.status === "resolved" ? "coach review resolved; coach-confirmed boundaries apply" : "open — planning is blocked until reviewed";
    default:
      return "respected";
  }
}

function validate(spec: PlanSpecification, input: SynthesisInput): PlanValidation {
  const errors: string[] = [];
  const r = spec.resistance?.value;
  if (!r) return { ok: false, errors: ["Resistance detail missing."] };
  const read = methodFor(input);
  if (!read?.ok) return { ok: false, errors: ["Coach method unreadable during validation."] };
  const m = read.method;
  const access = resolveEquipmentAccess(input.client);
  const equipment = new Set(access ? availableEquipment(access) : []);
  const apparatus = new Set(access ? availableApparatus(access) : []);
  if (r.sessions.length !== spec.frequency.value) errors.push("Session count doesn't match frequency.");
  r.sessions.forEach((s, i) => {
    if (s.day !== spec.schedule.value[i]) errors.push(`Session ${i + 1} day doesn't match the schedule.`);
    for (const x of s.exercises) {
      const e = input.knowledge.getExercise(x.exerciseId);
      if (!e) {
        errors.push(`Unknown exercise id ${x.exerciseId}.`);
        continue;
      }
      const elig = exerciseEligibility(e, input.constraints);
      if (!elig.eligible) errors.push(`${e.id} violates a hard constraint: ${elig.violations.map((v) => v.reason).join("; ")}`);
      if (elig.violations.some((v) => v.basis === "name_search")) errors.push(`${e.id} was screened by name, not metadata.`);
      if (!equipment.has(e.equipment)) errors.push(`${e.id} needs unavailable equipment ${e.equipment}.`);
      for (const a of e.apparatus) if (!apparatus.has(a)) errors.push(`${e.id} needs ${a}, which isn't known available.`);
    }
  });
  if (r.weeks.length !== spec.durationWeeks?.value) errors.push("Week count doesn't match duration.");
  for (const w of r.weeks) {
    if (w.sessions.length !== r.sessions.length) errors.push(`Week ${w.week} has the wrong number of sessions.`);
    w.sessions.forEach((ps, si) =>
      ps.forEach((p, xi) => {
        const role = r.sessions[si]?.exercises[xi]?.role;
        if (!role) return errors.push(`Week ${w.week} session ${si + 1} has an extra prescription.`);
        const sets = m.sets[role].value;
        const reps = m.reps[role].value;
        if (!Number.isInteger(p.sets) || p.sets < 1 || p.sets > sets.max || (w.kind === "build" && p.sets < sets.min)) errors.push(`Week ${w.week}: ${p.sets} sets outside the coach's ${sets.min}–${sets.max}.`);
        if (p.reps.min > p.reps.max || p.reps.min < reps.min || p.reps.max > reps.max) errors.push(`Week ${w.week}: reps ${p.reps.min}–${p.reps.max} outside the coach's ${reps.min}–${reps.max}.`);
        if (p.effort.metric !== "plain" && m.effort.rir) {
          const rr = m.effort.rir[role].value;
          const rir = p.effort.metric === "rpe" ? 10 - (p.effort.target as number) : (p.effort.target as number);
          if (rir < rr.min || rir > rr.max) errors.push(`Week ${w.week}: effort outside the coach's RIR ${rr.min}–${rr.max}.`);
        }
      })
    );
  }
  for (const k of ["frequency", "schedule", "weeklyStructure", "durationWeeks", "intensity", "progression", "recovery"] as const) {
    const d = spec[k] as Decided<unknown> | undefined;
    if (!d || !d.rule || !d.rationale || d.inputs.length === 0) errors.push(`Decision ${k} lacks provenance.`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export const RESISTANCE_PLANNER: DomainPlanner = {
  id: RESISTANCE_PLANNER_ID,
  version: RESISTANCE_PLANNER_VERSION,
  domain: "resistance",
  requirements: REQUIREMENTS,
  plan,
  validate,
};
