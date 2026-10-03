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
import { confirmStructuredLimitationsAction, proposeStructuredLimitationsAction } from "@/app/actions/structured-limitations";
import type { InterpretationProposal } from "@/lib/synthesis/limitations/interpret";
import type { LimitationsState } from "@/lib/production/structured-limitations";

export interface LimitationOptionView {
  id: string;
  group: "movements" | "demands" | "positions" | "equipment" | "exercises";
  label: string;
  help: string;
}

const GROUP_LABEL: Record<LimitationOptionView["group"], string> = { movements: "Movements", demands: "Exercise demands", positions: "Positions", equipment: "Equipment", exercises: "A specific exercise" };

export function StructuredLimitationsCard({ workspaceId, clientProfileId, state, options }: { workspaceId: string; clientProfileId: string; state: LimitationsState; options: LimitationOptionView[] }) {
  const router = useRouter();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const [proposal, setProposal] = useState<InterpretationProposal | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [noRestrictions, setNoRestrictions] = useState(false);
  const [addGroup, setAddGroup] = useState<LimitationOptionView["group"]>("movements");
  const [addId, setAddId] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  if (state.status === "no_limitation") return null;

  const label = (id: string) => byId.get(id)?.label ?? id;

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
          <Button variant="secondary" size="sm" onClick={interpret} loading={pending}>Review again</Button>
        </div>
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
              {[...c.choices, "none"].map((choice) => (
                <label key={choice} className="flex items-center gap-2.5 text-sm text-off-white">
                  <input type="radio" name={`clarify-${c.quote}`} className="h-4 w-4 accent-[var(--pc-accent)]" checked={answers[c.quote] === choice} onChange={() => setAnswers((a) => ({ ...a, [c.quote]: choice }))} />
                  {choice === "none" ? "Not an exercise restriction" : label(choice)}
                </label>
              ))}
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
