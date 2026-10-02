"use client";

// Gate 3.1 — Step 0: "Tell OPTIM what you coach."
//
// The coach describes their coaching in their own words; OPTIM suggests the
// areas to calibrate. The suggestion is only a suggestion: nothing becomes
// calibration scope until the coach confirms it (or picks areas manually).

import { useState } from "react";
import { Check, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/textarea";
import { OptionCard } from "@/components/ui/option-card";
import { interpretCoachDescription, type Step0Suggestion } from "@/lib/coach/calibration/step0-interpreter";
import { AREA_OPTIONS, ENDURANCE_SPORT_OPTIONS, SPORT_OPTIONS, STRENGTH_SPECIALTY_OPTIONS } from "@/lib/coach/calibration/questions";
import { STEP0_SUGGESTION_KEY, type AreaId, type CalibrationAnswers, type CalibrationAnswerValue } from "@/lib/coach/calibration/types";

const areaLabel = (a: string) => AREA_OPTIONS.find((o) => o.value === a)?.label ?? a;
const sportLabel = (v: string) => (v.startsWith("other:") ? v.slice(6) : ([...SPORT_OPTIONS, ...ENDURANCE_SPORT_OPTIONS, ...STRENGTH_SPECIALTY_OPTIONS].find((o) => o.value === v)?.label ?? v));

export function Step0Description({ answers, onSave }: { answers: CalibrationAnswers; onSave: (patch: Record<string, CalibrationAnswerValue>, options?: { debounce?: boolean }) => void }) {
  const confirmed = Array.isArray(answers.coaching_areas) ? (answers.coaching_areas as string[]) : [];
  const [description, setDescription] = useState(typeof answers.coach_description === "string" ? answers.coach_description : "");
  const [suggestion, setSuggestion] = useState<Step0Suggestion | null>(null);
  const [selected, setSelected] = useState<AreaId[]>(confirmed as AreaId[]);
  const [mode, setMode] = useState<"describe" | "review" | "manual" | "done">(confirmed.length > 0 ? "done" : "describe");

  const suggest = () => {
    const s = interpretCoachDescription(description);
    setSuggestion(s);
    setSelected(s.areas.filter((a) => a.confidence === "strong").map((a) => a.area));
    setMode(s.uncertain ? "manual" : "review");
  };

  const toggle = (a: AreaId) => setSelected((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  const confirm = () => {
    if (selected.length === 0) return;
    const patch: Record<string, CalibrationAnswerValue> = { coaching_areas: selected, coach_description: description };
    if (suggestion) {
      patch[STEP0_SUGGESTION_KEY] = { areas: suggestion.areas.map((a) => a.area), sports: [...suggestion.sportPerformanceSports, ...suggestion.enduranceSports], uncertain: suggestion.uncertain };
      // Specialties the coach saw on this screen; they can edit them next.
      if (selected.includes("sport_performance") && suggestion.sportPerformanceSports.length && !Array.isArray(answers.sport_performance_sports)) patch.sport_performance_sports = suggestion.sportPerformanceSports;
      if (selected.includes("endurance") && suggestion.enduranceSports.length && !Array.isArray(answers.endurance_sports)) patch.endurance_sports = suggestion.enduranceSports;
      if (selected.includes("strength") && suggestion.strengthSpecialties.length && !Array.isArray(answers.strength_specialties)) patch.strength_specialties = suggestion.strengthSpecialties;
    }
    onSave(patch);
    setMode("done");
  };

  if (mode === "done" && confirmed.length > 0) {
    return (
      <div className="max-w-2xl">
        <p className="text-meta font-medium text-neutral">Your coaching areas</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {confirmed.map((a) => (
            <span key={a} className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent-soft px-3 py-1.5 text-meta font-medium text-accent-fg">
              <Check size={13} aria-hidden="true" /> {areaLabel(a)}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setSelected(confirmed as AreaId[]);
            setMode("manual");
          }}
          className="mt-3 min-h-9 text-meta text-accent-fg underline-offset-2 hover:underline"
        >
          Change areas
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {mode === "describe" ? (
        <>
          <TextArea
            id="coach_description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              onSave({ coach_description: e.target.value }, { debounce: true });
            }}
            rows={4}
            placeholder="e.g. I help soccer players get quicker and more agile, and I do strength training for general athletes."
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={suggest} disabled={description.trim().length < 3}>
              <Sparkles size={15} aria-hidden="true" /> Suggest my areas
            </Button>
            <button type="button" onClick={() => setMode("manual")} className="min-h-11 text-meta text-accent-fg underline-offset-2 hover:underline">
              Choose areas myself instead
            </button>
          </div>
        </>
      ) : null}

      {mode === "review" && suggestion ? (
        <div className="rounded-[var(--radius-lg)] border border-border-strong p-5">
          <p className="text-subheading text-off-white">Does this look right?</p>
          <p className="mt-1 text-meta text-neutral">Suggested from your description. Remove anything that doesn&apos;t fit, add anything missing.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestion.areas.map((s) => {
              const on = selected.includes(s.area);
              return (
                <button
                  key={s.area}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.area)}
                  title={`From “${s.matched.join("”, “")}”`}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 text-meta font-medium ${on ? "border-accent bg-accent-soft text-accent-fg" : "border-dashed border-border-strong text-neutral"}`}
                >
                  {on ? <Check size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
                  {areaLabel(s.area)}
                  {s.confidence === "possible" ? <span className="text-neutral">(possible)</span> : null}
                </button>
              );
            })}
          </div>
          {suggestion.sportPerformanceSports.length > 0 || suggestion.enduranceSports.length > 0 || suggestion.strengthSpecialties.length > 0 ? (
            <p className="mt-4 text-meta text-neutral">
              Specialties noticed:{" "}
              <span className="text-off-white">{[...suggestion.sportPerformanceSports, ...suggestion.enduranceSports, ...suggestion.strengthSpecialties].map(sportLabel).join(", ")}</span> — you can edit these next.
            </p>
          ) : null}
          {suggestion.emphases.includes("speed_agility") || suggestion.emphases.includes("power") ? <p className="mt-1 text-meta text-neutral">Speed, power and agility work is part of Sport performance.</p> : null}
          <div className="mt-5">
            <p className="mb-2 text-meta font-medium text-neutral">Add another area</p>
            <div className="flex flex-wrap gap-2">
              {AREA_OPTIONS.filter((o) => !suggestion.areas.some((s) => s.area === o.value)).map((o) => {
                const on = selected.includes(o.value as AreaId);
                return (
                  <button key={o.value} type="button" aria-pressed={on} onClick={() => toggle(o.value as AreaId)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 text-meta ${on ? "border-accent bg-accent-soft text-accent-fg" : "border-border-strong text-off-white"}`}>
                    {on ? <Check size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />} {o.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={confirm} disabled={selected.length === 0}>
              Looks right
            </Button>
            <button type="button" onClick={() => setMode("describe")} className="min-h-11 text-meta text-accent-fg underline-offset-2 hover:underline">
              Edit my description
            </button>
          </div>
        </div>
      ) : null}

      {mode === "manual" ? (
        <div>
          {suggestion?.uncertain ? <p className="mb-4 rounded-[var(--radius-sm)] bg-surface px-3 py-2 text-meta text-neutral">OPTIM couldn&apos;t tell which areas fit from that description — choose them below.</p> : null}
          <p className="mb-3 text-subheading text-off-white">Which areas do you coach?</p>
          <div className="grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
            {AREA_OPTIONS.map((o) => (
              <OptionCard key={o.value} active={selected.includes(o.value as AreaId)} label={o.label} description={o.description} onClick={() => toggle(o.value as AreaId)} />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={confirm} disabled={selected.length === 0}>
              Confirm areas
            </Button>
            {confirmed.length === 0 ? (
              <button type="button" onClick={() => setMode("describe")} className="min-h-11 text-meta text-accent-fg underline-offset-2 hover:underline">
                Describe my coaching instead
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelected(confirmed as AreaId[]);
                  setMode("done");
                }}
                className="inline-flex min-h-11 items-center gap-1 text-meta text-neutral hover:text-off-white"
              >
                <X size={13} aria-hidden="true" /> Cancel
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
