"use client";

// Gate 4.0C-2A — "Is this what you mean?" The coach's documented training
// limitation, OPTIM's PROPOSED structured reading of it, and the coach's
// confirmation. Nothing becomes planning truth until the coach presses
// Confirm limitations; the original words always stay visible.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { confirmStructuredLimitationsAction, proposeStructuredLimitationsAction, revokeExerciseFitDecisionAction } from "@/app/actions/structured-limitations";
import { effectiveExerciseDecisions } from "@/lib/synthesis/limitations/exercise-decisions";
import type { InterpretationProposal } from "@/lib/synthesis/limitations/interpret";
import type { LimitationsState } from "@/lib/production/structured-limitations";

export interface LimitationOptionView {
  id: string;
  group: "movements" | "demands" | "positions" | "equipment" | "exercises" | "limbs";
  label: string;
  help: string;
  /** Gate 4.0C-4 — options sharing a dimension are alternatives (single select); others are independent facts. */
  dimension: { key: string; label: string };
}

const GROUP_LABEL: Record<LimitationOptionView["group"], string> = { movements: "Movements", demands: "Exercise demands", positions: "Positions", equipment: "Equipment", exercises: "A specific exercise", limbs: "One side / limb" };

export function StructuredLimitationsCard({ workspaceId, clientProfileId, state, options }: { workspaceId: string; clientProfileId: string; state: LimitationsState; options: LimitationOptionView[] }) {
  const router = useRouter();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const [proposal, setProposal] = useState<InterpretationProposal | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // quote → selected option ids, or ["none"]. Independent facts are separate checkboxes;
  // only alternative levels of ONE dimension are single-select (clarificationDimensions).
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [noRestrictions, setNoRestrictions] = useState(false);
  const [addGroup, setAddGroup] = useState<LimitationOptionView["group"]>("movements");
  const [addId, setAddId] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  if (state.status === "no_limitation") return null;

  const label = (id: string) => byId.get(id)?.label ?? id;
  /** A clarification's choices grouped by dimension: >1 option in a dimension = pick one; otherwise an independent fact. */
  const dimensionsFor = (choices: string[]) => {
    const dims = new Map<string, { key: string; label: string; options: string[]; exclusive: boolean }>();
    for (const id of choices) {
      const d = byId.get(id)?.dimension ?? { key: `option:${id}`, label: label(id) };
      const cur = dims.get(d.key) ?? { key: d.key, label: d.label, options: [], exclusive: false };
      if (!cur.options.includes(id)) cur.options.push(id);
      cur.exclusive = cur.options.length > 1;
      dims.set(d.key, cur);
    }
    return [...dims.values()];
  };

  function interpret() {
    setErrors([]);
    startTransition(async () => {
      const res = await proposeStructuredLimitationsAction({ workspaceId, clientProfileId });
      if (!res.ok) return setErrors([res.message]);
      setProposal(res.proposal);
      setSelected(res.proposal.restrictions.map((r) => r.optionId));
      setAnswers({});
      setNoRestrictions(false);
      setEditing(true);
    });
  }

  function confirm() {
    if (!state.documentedText || !state.escalationId) return;
    setErrors([]);
    startTransition(async () => {
      const res = await confirmStructuredLimitationsAction({ workspaceId, clientProfileId, escalationId: state.escalationId!, sourceText: state.documentedText!, proposal, selectedOptionIds: selected, clarificationAnswers: answers, noExerciseRestrictions: noRestrictions });
      if (!res.ok) return setErrors(res.errors);
      setEditing(false);
      setProposal(null);
      // Gate 4.0C-5 — a material change supersedes the pending draft; OPTIM prepares ONE revision (never sent or approved).
      setNotice(res.revision === "queued" ? "Saved. These facts change the plan's assumptions, so OPTIM is preparing a revised proposal from them. Nothing is sent to the client — you'll review it in Training program." : null);
      router.refresh();
    });
  }

  function revoke(exerciseId: string) {
    setErrors([]);
    setNotice(null);
    startTransition(async () => {
      const res = await revokeExerciseFitDecisionAction({ workspaceId, clientProfileId, exerciseId });
      if (!res.ok) return setErrors(res.errors);
      setNotice(res.revision === "queued" ? "Removed. That changes the plan's assumptions, so OPTIM is preparing a revised proposal. Nothing is sent to the client." : null);
      router.refresh();
    });
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const quoteFor = (id: string) => proposal?.restrictions.find((r) => r.optionId === id)?.quote;
  const addable = options.filter((o) => o.group === addGroup && !selected.includes(o.id));

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-off-white">Training limitations</h3>
          <p className="mt-0.5 text-meta text-neutral">What the planner must respect for this client. Only what you confirm here is enforced.</p>
        </div>
        <StatusPill status={state.status} />
      </div>

      {state.status === "review_open" ? (
        <p className="text-sm text-neutral">A health review is still open. Decide it from Escalations first; planning waits for that decision.</p>
      ) : (
        <blockquote className="rounded-[var(--radius-sm)] border-l-2 border-accent bg-surface-raised px-3 py-2 text-sm text-off-white">
          <span className="mb-1 block text-label text-neutral">Your documented limitation</span>
          {state.documentedText}
        </blockquote>
      )}

      {state.status === "confirmed" && state.confirmed && !editing ? (
        <div className="space-y-2">
          <p className="text-label text-neutral">Confirmed for planning</p>
          {state.confirmed.noExerciseRestrictions ? (
            <p className="text-sm text-off-white">No exercise restrictions.</p>
          ) : (
            <ul className="space-y-1">
              {state.confirmed.restrictions.map((r) => (
                <li key={r.optionId} className="text-sm text-off-white">✓ {r.label}</li>
              ))}
            </ul>
          )}
          <p className="text-meta text-neutral">Confirmed {new Date(state.confirmed.confirmedAtIso).toLocaleString()}.</p>
          {effectiveExerciseDecisions(state.confirmed.exerciseDecisions).length ? (
            <div className="space-y-1 pt-1">
              <p className="text-label text-neutral">Your exercise decisions</p>
              <ul className="space-y-1">
                {effectiveExerciseDecisions(state.confirmed.exerciseDecisions).map((d) => (
                  <li key={d.exerciseId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-off-white">
                    <span>
                      {d.verdict === "excluded" ? `✕ Not ${d.exerciseName}` : `✓ ${d.exerciseName} — fits only with ${d.conditions.join("; ")}`}
                      <span className="ml-1 text-meta text-neutral">({new Date(d.decidedAtIso).toLocaleDateString()})</span>
                    </span>
                    <Button variant="secondary" size="sm" disabled={pending} onClick={() => revoke(d.exerciseId)}>
                      Undo
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-meta text-neutral">These apply to this client only and are kept when you review the limitation again.</p>
            </div>
          ) : null}
          <Button variant="secondary" size="sm" onClick={interpret} loading={pending}>Review again</Button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-raised px-3 py-2 text-sm text-off-white">
          {notice}
        </p>
      ) : null}

      {(state.status === "needs_confirmation" || state.status === "stale") && !editing ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral">
            {state.status === "stale" ? "You changed this limitation after confirming it, so the old confirmation no longer applies." : "The new planner can't use written limitations until you confirm what they mean."}
          </p>
          <Button size="sm" onClick={interpret} loading={pending}>Review OPTIM&apos;s interpretation</Button>
        </div>
      ) : null}

      {editing && proposal ? (
        <div className="space-y-4">
          {proposal.interpreter.kind === "manual" ? (
            <p className="rounded-[var(--radius-sm)] bg-surface-raised px-3 py-2 text-sm text-neutral">{proposal.interpreter.reason} Choose the restrictions yourself below.</p>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-label text-neutral">{proposal.interpreter.kind === "model" ? "OPTIM understood this as" : "Restrictions"}</legend>
            {selected.length === 0 ? <p className="text-sm text-neutral">Nothing selected yet.</p> : null}
            {[...new Set([...proposal.restrictions.map((r) => r.optionId), ...selected])].map((id) => (
              <label key={id} className="flex items-start gap-2.5 text-sm text-off-white">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--pc-accent)]" checked={selected.includes(id)} onChange={() => toggle(id)} />
                <span>
                  {label(id)}
                  <span className="block text-meta text-neutral">{quoteFor(id) ? `From “${quoteFor(id)}”` : byId.get(id)?.help}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {proposal.clarifications.map((c) => (
            <fieldset key={c.quote} className="space-y-2 rounded-[var(--radius-sm)] border border-warning-strong/50 px-3 py-2.5">
              <legend className="px-1 text-label text-warning-strong">Needs clarification</legend>
              <p className="text-sm text-off-white">“{c.quote}”</p>
              {c.why ? <p className="text-meta text-neutral">{c.why}</p> : null}
              <p className="text-sm text-off-white">{c.question}</p>
              <p className="text-meta text-neutral">Confirm everything that&apos;s true — these can be separate facts.</p>
              {dimensionsFor(c.choices).map((d) => {
                const picked = (answers[c.quote] ?? []).filter((x) => x !== "none");
                const set = (next: string[]) => setAnswers((a) => ({ ...a, [c.quote]: next }));
                return d.exclusive ? (
                  <div key={d.key} role="radiogroup" aria-label={d.label} className="space-y-1.5 rounded-[var(--radius-sm)] bg-surface-raised px-2.5 py-2">
                    <p className="text-meta text-neutral">{d.label} — pick one</p>
                    {[...d.options, ""].map((choice) => (
                      <label key={choice || "none"} className="flex items-center gap-2.5 text-sm text-off-white">
                        <input type="radio" name={`clarify-${c.quote}-${d.key}`} className="h-4 w-4 accent-[var(--pc-accent)]" checked={choice ? picked.includes(choice) : !d.options.some((o) => picked.includes(o))} onChange={() => set([...picked.filter((x) => !d.options.includes(x)), ...(choice ? [choice] : [])])} />
                        {choice ? label(choice) : "None of these"}
                      </label>
                    ))}
                  </div>
                ) : (
                  <label key={d.key} className="flex items-center gap-2.5 text-sm text-off-white">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--pc-accent)]" checked={picked.includes(d.options[0])} onChange={() => set(picked.includes(d.options[0]) ? picked.filter((x) => x !== d.options[0]) : [...picked, d.options[0]])} />
                    {label(d.options[0])}
                  </label>
                );
              })}
              <label className="flex items-center gap-2.5 text-sm text-off-white">
                <input type="checkbox" className="h-4 w-4 accent-[var(--pc-accent)]" checked={(answers[c.quote] ?? []).includes("none")} onChange={(e) => setAnswers((a) => ({ ...a, [c.quote]: e.target.checked ? ["none"] : [] }))} />
                Not an exercise restriction
              </label>
            </fieldset>
          ))}

          {proposal.unsupported.length ? (
            <div className="space-y-1">
              <p className="text-label text-neutral">Not enforced by the planner</p>
              {proposal.unsupported.map((u) => (
                <p key={u.quote} className="text-meta text-neutral">“{u.quote}”{u.why ? ` — ${u.why}` : ""}</p>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-label text-neutral">Add a restriction</p>
            <div className="flex flex-wrap gap-2">
              <SelectMenu ariaLabel="Restriction type" value={addGroup} onChange={(g) => { setAddGroup(g); setAddId(""); }} options={(Object.keys(GROUP_LABEL) as LimitationOptionView["group"][]).map((g) => ({ value: g, label: GROUP_LABEL[g] }))} className="w-48" />
              <SelectMenu ariaLabel="Restriction" value={addId} onChange={setAddId} options={addable.map((o) => ({ value: o.id, label: o.label }))} placeholder="Choose…" className="min-w-56 flex-1" />
              <Button variant="secondary" size="sm" disabled={!addId} onClick={() => { setSelected((s) => [...s, addId]); setAddId(""); setNoRestrictions(false); }}>Add</Button>
            </div>
          </div>

          {selected.length === 0 ? (
            <label className="flex items-center gap-2.5 text-sm text-off-white">
              <input type="checkbox" className="h-4 w-4 accent-[var(--pc-accent)]" checked={noRestrictions} onChange={(e) => setNoRestrictions(e.target.checked)} />
              This limitation doesn&apos;t restrict any exercises
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={confirm} loading={pending}>Confirm limitations</Button>
            <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setProposal(null); setErrors([]); }}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {errors.length ? (
        <ul role="alert" className="space-y-1">
          {errors.map((e) => (
            <li key={e} className="text-sm text-error">{e}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function StatusPill({ status }: { status: LimitationsState["status"] }) {
  const text = { confirmed: "Confirmed", needs_confirmation: "Needs your confirmation", stale: "Needs re-confirmation", review_open: "Review open", no_limitation: "" }[status];
  const tone = status === "confirmed" ? "text-success" : "text-warning-strong";
  return <span className={`text-label ${tone}`}>{text}</span>;
}
