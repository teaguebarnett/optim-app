// Gate 3.1 — Step 0: "Tell OPTIM what you coach."
//
// Turns a coach's own description into SUGGESTED calibration scope. The
// suggestion is never scope and never methodology: nothing applies until the
// coach confirms, edits or replaces it (coaching_areas). If the description
// is ambiguous or nothing matches, the result says so and the coach picks
// areas manually.
//
// Deterministic and explainable on purpose: every suggestion carries the
// exact phrases that produced it, it runs offline, and the coach's words are
// never sent to a third party to be classified.

import type { AreaId } from "./types.ts";

export interface Step0AreaSuggestion {
  area: AreaId;
  /** "strong" = suggested; "possible" = a weak hint the coach can add. */
  confidence: "strong" | "possible";
  matched: string[];
}

export interface Step0Suggestion {
  areas: Step0AreaSuggestion[];
  strengthSpecialties: string[];
  sportPerformanceSports: string[];
  enduranceSports: string[];
  /** Emphases worth showing the coach (e.g. speed, power and agility). */
  emphases: string[];
  mentionsNutrition: boolean;
  /** True when nothing (or only weak hints) matched — manual selection. */
  uncertain: boolean;
}

interface Term {
  pattern: RegExp;
  weight: 1 | 2;
  label: string;
}

const T = (pattern: string, weight: 1 | 2, label?: string): Term => ({ pattern: new RegExp(`\\b(?:${pattern})\\b`, "i"), weight, label: label ?? pattern.replace(/\\s\*|\(\?:|\)|\?|\\s\+/g, " ").replace(/\|.*/, "").trim() });

const AREA_TERMS: Record<AreaId, Term[]> = {
  strength: [
    T("powerlift(?:ing|ers?)?", 2, "powerlifting"),
    T("weightlift(?:ing|ers?)?|olympic lift(?:ing|s)?", 2, "weightlifting"),
    T("strongman|strongwoman", 2, "strongman"),
    T("strength (?:training|coach(?:ing)?|program(?:s|ming)?|work|athletes?)", 2, "strength training"),
    T("athletic strength|athletic development", 2, "athletic strength"),
    T("get(?:ting)? stronger|stronger", 2, "stronger"),
    T("barbell|squat|bench press|deadlifts?", 1, "barbell lifts"),
    T("strength", 1, "strength"),
  ],
  physique: [
    T("bodybuild(?:ing|ers?)?", 2, "bodybuilding"),
    T("physique", 2, "physique"),
    T("hypertrophy", 2, "hypertrophy"),
    T("build(?:ing)? muscle|muscle (?:gain|building|growth)|gain(?:ing)? muscle", 2, "building muscle"),
    T("aesthetics?|bikini|figure competitors?|contest prep", 2, "aesthetics"),
    T("bulk(?:ing)?|lean bulk", 1, "bulking"),
  ],
  sport_performance: [
    T("sports? performance|athletic performance", 2, "sport performance"),
    T("team sports?|athletes?", 2, "athletes"),
    T("on the (?:field|court|ice|pitch)", 2, "on the field"),
    T("agil(?:e|ity)|quick(?:er|ness)?|speed|explosive(?:ness)?|vertical jump|acceleration", 2, "speed and agility"),
    T("perform better|in-season|off-season|combine", 1, "performance"),
  ],
  endurance: [
    T("marathon(?:ers?)?|half marathon|ultra(?:marathon|s)?|5k|10k", 2, "running events"),
    T("runners?|running|trail running", 2, "running"),
    T("cycl(?:ing|ists?)|cyclists?|road bike|gravel", 2, "cycling"),
    T("triathl(?:on|ons|etes?)|ironman|70\\.3", 2, "triathlon"),
    T("swim(?:ming|mers?)?", 2, "swimming"),
    T("rowing|rowers?", 2, "rowing"),
    T("endurance", 2, "endurance"),
  ],
  general_fitness: [
    T("general fitness|general population|gen pop", 2, "general fitness"),
    T("healthier|healthy|health and fitness|wellness|get(?:ting)? fit", 2, "health"),
    T("functional fitness|everyday (?:people|life)|lifestyle|consistency|stay active|more active", 2, "everyday fitness"),
    T("mobility|fitness|active|health", 1, "fitness"),
  ],
  weight_management: [
    T("weight loss|lose weight|losing weight|weight management|drop (?:weight|pounds)|slim down", 2, "weight loss"),
    T("fat loss|lose fat|losing fat|body fat|burn fat", 2, "fat loss"),
  ],
};

const SPORTS: [RegExp, string][] = [
  [/\bsoccer\b/i, "soccer"],
  [/\b(?:american )?football\b(?! club)/i, "american_football"],
  [/\bbasketball\b/i, "basketball"],
  [/\brugby\b/i, "rugby"],
  [/\b(?:baseball|softball)\b/i, "baseball_softball"],
  [/\b(?:ice )?hockey\b/i, "ice_hockey"],
  [/\btennis\b/i, "tennis"],
  [/\bvolleyball\b/i, "volleyball"],
  [/\blacrosse\b/i, "lacrosse"],
  [/\b(?:mma|boxing|boxers?|wrestl(?:ing|ers?)|jiu[ -]?jitsu|bjj|muay thai|combat sports?)\b/i, "combat_sports"],
  [/\btrack (?:and|&) field|sprinters?\b/i, "track_field"],
];

/** Less common sports become custom "Other" entries the coach can edit. */
const CUSTOM_SPORTS: [RegExp, string][] = [
  [/\bultimate(?: frisbee)?\b/i, "Ultimate frisbee"],
  [/\bpickleball\b/i, "Pickleball"],
  [/\bsquash\b/i, "Squash"],
  [/\bcricket\b/i, "Cricket"],
  [/\bwater polo\b/i, "Water polo"],
  [/\bfield hockey\b/i, "Field hockey"],
  [/\bhandball\b/i, "Handball"],
  [/\bnetball\b/i, "Netball"],
  [/\bfencing\b/i, "Fencing"],
  [/\b(?:climbing|climbers?|bouldering)\b/i, "Climbing"],
  [/\bgolf(?:ers?)?\b/i, "Golf"],
  [/\b(?:skiing|skiers?|snowboard(?:ing|ers?)?)\b/i, "Skiing / snowboarding"],
  [/\b(?:surfing|surfers?)\b/i, "Surfing"],
  [/\bdanc(?:e|ers?|ing)\b/i, "Dance"],
];

const ENDURANCE_SPORTS: [RegExp, string][] = [
  [/\b(?:runners?|running|marathon(?:ers?)?|half marathon|ultra(?:marathon|s)?|5k|10k|trail running)\b/i, "running"],
  [/\b(?:cycl(?:ing|ists?)|cyclists?|road bike|gravel)\b/i, "cycling"],
  [/\b(?:triathl(?:on|ons|etes?)|ironman|70\.3)\b/i, "triathlon"],
  [/\bswim(?:ming|mers?)?\b/i, "swimming"],
  [/\b(?:rowing|rowers?)\b/i, "rowing"],
];

const NEGATION = /\b(?:not|no|don't|dont|never|without|except|aren't|isn't|won't)\b[^.,;]{0,24}$/i;

function matches(text: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (const m of text.matchAll(global)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0);
    if (NEGATION.test(before)) continue;
    out.push(m[0]);
  }
  return out;
}

export function interpretCoachDescription(raw: string): Step0Suggestion {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  const empty: Step0Suggestion = { areas: [], strengthSpecialties: [], sportPerformanceSports: [], enduranceSports: [], emphases: [], mentionsNutrition: false, uncertain: true };
  if (text.length < 3) return empty;

  const sports = new Set<string>();
  for (const [re, value] of SPORTS) if (matches(text, re).length > 0) sports.add(value);
  const custom = new Set<string>();
  for (const [re, label] of CUSTOM_SPORTS) if (matches(text, re).length > 0) custom.add(label);
  // "field hockey" is a custom sport, not ice hockey.
  if (custom.has("Field hockey")) sports.delete("ice_hockey");
  const enduranceSports = new Set<string>();
  for (const [re, value] of ENDURANCE_SPORTS) if (matches(text, re).length > 0) enduranceSports.add(value);

  const scored: Step0AreaSuggestion[] = [];
  for (const area of Object.keys(AREA_TERMS) as AreaId[]) {
    let score = 0;
    const matched: string[] = [];
    for (const term of AREA_TERMS[area]) {
      const found = matches(text, term.pattern);
      if (found.length === 0) continue;
      score = Math.max(score, term.weight);
      matched.push(found[0]);
    }
    if (area === "sport_performance" && (sports.size > 0 || custom.size > 0)) {
      score = 2;
      matched.push(...[...sports].map((s) => s.replace(/_/g, " ")), ...custom);
    }
    if (score > 0) scored.push({ area, confidence: score >= 2 ? "strong" : "possible", matched: [...new Set(matched)] });
  }

  // A sport-performance description that says "strength training" is
  // athletic strength, not a separate physique goal.
  const strengthSpecialties = new Set<string>();
  if (matches(text, /\bpowerlift(?:ing|ers?)?\b/i).length) strengthSpecialties.add("powerlifting");
  if (matches(text, /\b(?:weightlift(?:ing|ers?)?|olympic lift(?:ing|s)?)\b/i).length) strengthSpecialties.add("weightlifting");
  if (matches(text, /\bstrong(?:man|woman)\b/i).length) strengthSpecialties.add("strongman");
  const strength = scored.find((s) => s.area === "strength");
  const athletes = matches(text, /\bathlet(?:es?|ic)\b/i).length > 0;
  if (strength && (athletes || matches(text, /\bathletic (?:strength|development)\b/i).length)) strengthSpecialties.add("athletic_strength");

  const emphases: string[] = [];
  if (matches(text, /\b(?:agil(?:e|ity)|quick(?:er|ness)?|speed|acceleration)\b/i).length) emphases.push("speed_agility");
  if (matches(text, /\b(?:explosive(?:ness)?|vertical jump|power)\b/i).length) emphases.push("power");

  const strong = scored.filter((s) => s.confidence === "strong");
  return {
    areas: [...strong, ...scored.filter((s) => s.confidence === "possible")],
    strengthSpecialties: [...strengthSpecialties],
    sportPerformanceSports: [...[...sports], ...[...custom].map((c) => `other:${c}`)],
    enduranceSports: [...enduranceSports],
    emphases,
    mentionsNutrition: matches(text, /\b(?:nutrition|diet(?:s|ing)?|meal(?:s| plans?)?|macros?|calories|eating)\b/i).length > 0,
    uncertain: strong.length === 0,
  };
}

/** The areas a confirmation would start from: strong suggestions only. */
export function suggestedAreas(s: Step0Suggestion): AreaId[] {
  return s.areas.filter((a) => a.confidence === "strong").map((a) => a.area);
}
