// Equipment specificity — the coach's answers about specific apparatus (client_equipment_profiles.apparatus), and how
// the answer control presents them. Three states: "available" / "unavailable" are stored; "unknown" is the ABSENCE of an
// answer (a stored answer returned to unknown is deleted, never saved as a value). Pure — no I/O, no React.

import { APPARATUS } from "./knowledge/taxonomy.ts";

export type ConfirmedApparatus = Record<string, "available" | "unavailable">;
export type EquipmentAnswer = "available" | "unavailable" | "unknown";

/** Validated stored answers (unknown ids / states dropped). */
export function sanitizeApparatus(raw: unknown): ConfirmedApparatus {
  const out: ConfirmedApparatus = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if ((APPARATUS as readonly string[]).includes(k) && (v === "available" || v === "unavailable")) out[k] = v;
  return out;
}

/** The stored answers after the coach's changes ("unknown" removes an answer). Null when an id isn't known equipment. */
export function applyApparatusAnswers(current: ConfirmedApparatus, changes: Record<string, EquipmentAnswer>): ConfirmedApparatus | null {
  if (Object.keys(changes).some((k) => !(APPARATUS as readonly string[]).includes(k))) return null;
  const next: ConfirmedApparatus = { ...current };
  for (const [k, v] of Object.entries(changes)) {
    if (v === "unknown") delete next[k];
    else next[k] = v;
  }
  return next;
}

export const EQUIPMENT_ANSWER_OPTIONS: Array<{ value: EquipmentAnswer; label: string }> = [
  { value: "available", label: "Have it" },
  { value: "unavailable", label: "Don't have it" },
  { value: "unknown", label: "Unknown" },
];

/** What the answer control shows. `shown` is the optimistic answer (the click, before the server confirms). */
export function equipmentAnswerView(p: { shown: EquipmentAnswer; saving: boolean; justSaved: boolean; error: string | null }) {
  return {
    options: EQUIPMENT_ANSWER_OPTIONS.map((o) => ({ ...o, pressed: o.value === p.shown, loading: p.saving && o.value === p.shown })),
    status: p.error ?? (p.saving ? "Saving…" : p.justSaved ? "Saved" : p.shown === "unknown" ? "Not confirmed" : p.shown === "available" ? "Confirmed: they have it" : "Confirmed: they don't have it"),
    tone: (p.error ? "error" : p.saving ? "pending" : p.justSaved ? "success" : p.shown === "unknown" ? "warning" : "neutral") as "error" | "pending" | "success" | "warning" | "neutral",
  };
}
