"use client";

// Gate 3.1 — the structured "it depends" builder. Coach-readable: ordered
// rules ("If … → do this"), each with "all of these" conditions and an
// optional "at least one of these" group, then a required "Otherwise".
// The draft is only saved once it's complete and valid.

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeDecisionPolicy, opsForFactor, validateDecisionPolicy } from "@/lib/coach/calibration/decision-policy";
import type { ChoiceOption, ConditionOp, DecisionCondition, DecisionPolicy, DecisionRule, FactorDef, ScenarioSpec } from "@/lib/coach/calibration/types";

const OP_LABELS: Record<ConditionOp, string> = { is: "is", is_not: "is not", is_one_of: "is one of", gte: "is at least", lte: "is at most", between: "is between" };

const selectClass = "min-h-11 rounded-[var(--radius-sm)] border border-border-strong bg-surface-input px-2 text-meta text-off-white";

function emptyCondition(factors: FactorDef[]): DecisionCondition {
  const f = factors[0];
  const op = opsForFactor(f)[0];
  return { factor: f.id, op, value: f.type === "enum" ? (f.options?.[0]?.value ?? "unknown") : f.type === "number" ? 1 : true };
}

function ConditionRow({ condition, factors, onChange, onRemove }: { condition: DecisionCondition; factors: FactorDef[]; onChange: (c: DecisionCondition) => void; onRemove: () => void }) {
  const factor = factors.find((f) => f.id === condition.factor) ?? factors[0];
  const ops = opsForFactor(factor);
  const enumOptions: ChoiceOption[] = [...(factor.options ?? []), { value: "unknown", label: "Unknown" }];
  const setFactor = (id: string) => {
    const f = factors.find((x) => x.id === id) ?? factors[0];
    onChange(emptyCondition([f]));
  };
  const setOp = (op: ConditionOp) => {
    if (factor.type === "enum") onChange({ ...condition, op, value: op === "is_one_of" ? [String(Array.isArray(condition.value) ? condition.value[0] : condition.value)] : Array.isArray(condition.value) ? condition.value[0] : condition.value });
    else if (factor.type === "number") onChange({ ...condition, op, value: op === "between" ? [typeof condition.value === "number" ? condition.value : 1, (typeof condition.value === "number" ? condition.value : 1) + 1] : Array.isArray(condition.value) ? (condition.value[0] as number) : condition.value });
    else onChange({ ...condition, op });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-surface px-3 py-2">
      <select aria-label="Condition" value={factor.id} onChange={(e) => setFactor(e.target.value)} className={selectClass}>
        {factors.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <select aria-label="Comparison" value={condition.op} onChange={(e) => setOp(e.target.value as ConditionOp)} className={selectClass}>
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>
      {factor.type === "enum" && condition.op !== "is_one_of" ? (
        <select aria-label="Value" value={String(condition.value)} onChange={(e) => onChange({ ...condition, value: e.target.value })} className={selectClass}>
          {enumOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
      {factor.type === "enum" && condition.op === "is_one_of" ? (
        <span className="flex flex-wrap gap-1.5">
          {enumOptions.map((o) => {
            const list = Array.isArray(condition.value) ? (condition.value as string[]) : [];
            const on = list.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...condition, value: on ? list.filter((v) => v !== o.value) : [...list, o.value] })}
                className={`min-h-9 rounded-[var(--radius-sm)] border px-2 text-meta ${on ? "border-accent bg-accent-soft text-accent-fg" : "border-border-strong text-neutral"}`}
              >
                {o.label}
              </button>
            );
          })}
        </span>
      ) : null}
      {factor.type === "number" && condition.op !== "between" ? (
        <input type="number" aria-label="Value" value={typeof condition.value === "number" ? condition.value : ""} onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })} className={`${selectClass} w-20`} />
      ) : null}
      {factor.type === "number" && condition.op === "between" ? (
        <span className="flex items-center gap-1.5">
          <input type="number" aria-label="From" value={Array.isArray(condition.value) ? (condition.value[0] as number) : ""} onChange={(e) => onChange({ ...condition, value: [Number(e.target.value), Array.isArray(condition.value) ? (condition.value[1] as number) : Number(e.target.value)] })} className={`${selectClass} w-16`} />
          <span className="text-meta text-neutral">and</span>
          <input type="number" aria-label="To" value={Array.isArray(condition.value) ? (condition.value[1] as number) : ""} onChange={(e) => onChange({ ...condition, value: [Array.isArray(condition.value) ? (condition.value[0] as number) : Number(e.target.value), Number(e.target.value)] })} className={`${selectClass} w-16`} />
        </span>
      ) : null}
      {factor.type === "number" && factor.unit ? <span className="text-meta text-neutral">{factor.unit}</span> : null}
      {factor.type === "boolean" ? (
        <select aria-label="Value" value={String(condition.value)} onChange={(e) => onChange({ ...condition, value: e.target.value === "true" })} className={selectClass}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : null}
      <button type="button" aria-label="Remove condition" onClick={onRemove} className="ml-auto rounded-full p-2 text-neutral hover:text-off-white">
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function ActionSelect({ actions, value, onChange, label }: { actions: ChoiceOption[]; value: string | undefined; onChange: (v: string) => void; label: string }) {
  return (
    <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`${selectClass} min-w-[12rem] max-w-full`}>
      <option value="" disabled>
        Choose what happens
      </option>
      {actions.map((a) => (
        <option key={a.value} value={a.value}>
          {a.label}
        </option>
      ))}
    </select>
  );
}

export function ConditionBuilder({ spec, actions, value, onChange }: { spec: ScenarioSpec; actions: ChoiceOption[]; value: DecisionPolicy | null; onChange: (p: DecisionPolicy) => void }) {
  const initial: DecisionPolicy =
    value && value.mode === "conditional" ? value : { mode: "conditional", rules: [{ when: { all: [emptyCondition(spec.factors)] }, then: [] }], otherwise: [] };
  const [draft, setDraft] = useState<DecisionPolicy>(initial);
  const result = validateDecisionPolicy(draft, spec, actions);

  const update = (next: DecisionPolicy) => {
    setDraft(next);
    const r = validateDecisionPolicy(next, spec, actions);
    if (r.ok) onChange(r.policy);
  };
  const rules = draft.rules ?? [];
  const setRule = (i: number, rule: DecisionRule) => update({ ...draft, rules: rules.map((r, j) => (j === i ? rule : r)) });

  return (
    <div className="space-y-4">
      {rules.map((rule, i) => (
        <div key={i} className="rounded-[var(--radius-md)] border border-border-strong p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-meta font-semibold text-off-white">{i === 0 ? "If all of these are true" : "Else, if all of these are true"}</p>
            {rules.length > 1 ? (
              <button type="button" onClick={() => update({ ...draft, rules: rules.filter((_, j) => j !== i) })} className="min-h-9 text-meta text-neutral hover:text-off-white">
                Remove rule
              </button>
            ) : null}
          </div>
          <div className="space-y-2">
            {(rule.when.all ?? []).map((c, k) => (
              <ConditionRow key={k} condition={c} factors={spec.factors} onChange={(nc) => setRule(i, { ...rule, when: { ...rule.when, all: (rule.when.all ?? []).map((x, m) => (m === k ? nc : x)) } })} onRemove={() => setRule(i, { ...rule, when: { ...rule.when, all: (rule.when.all ?? []).filter((_, m) => m !== k) } })} />
            ))}
            <button type="button" onClick={() => setRule(i, { ...rule, when: { ...rule.when, all: [...(rule.when.all ?? []), emptyCondition(spec.factors)] } })} className="inline-flex min-h-9 items-center gap-1 text-meta text-accent-fg">
              <Plus size={13} aria-hidden="true" /> Add condition
            </button>
          </div>
          {rule.when.any && rule.when.any.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-meta font-semibold text-off-white">…and at least one of these</p>
              {rule.when.any.map((c, k) => (
                <ConditionRow key={k} condition={c} factors={spec.factors} onChange={(nc) => setRule(i, { ...rule, when: { ...rule.when, any: (rule.when.any ?? []).map((x, m) => (m === k ? nc : x)) } })} onRemove={() => setRule(i, { ...rule, when: { ...rule.when, any: (rule.when.any ?? []).filter((_, m) => m !== k) } })} />
              ))}
              <button type="button" onClick={() => setRule(i, { ...rule, when: { ...rule.when, any: [...(rule.when.any ?? []), emptyCondition(spec.factors)] } })} className="inline-flex min-h-9 items-center gap-1 text-meta text-accent-fg">
                <Plus size={13} aria-hidden="true" /> Add alternative
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setRule(i, { ...rule, when: { ...rule.when, any: [emptyCondition(spec.factors)] } })} className="mt-2 inline-flex min-h-9 items-center gap-1 text-meta text-neutral hover:text-accent-fg">
              <Plus size={13} aria-hidden="true" /> Add “at least one of these”
            </button>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-meta font-semibold text-off-white">Then</span>
            <ActionSelect label={`Rule ${i + 1} action`} actions={actions} value={rule.then[0]} onChange={(v) => setRule(i, { ...rule, then: [v] })} />
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => update({ ...draft, rules: [...rules, { when: { all: [emptyCondition(spec.factors)] }, then: [] }] })}>
        <Plus size={14} aria-hidden="true" /> Add another rule
      </Button>
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-surface px-4 py-3">
        <span className="text-meta font-semibold text-off-white">Otherwise</span>
        <ActionSelect label="Otherwise action" actions={actions} value={draft.otherwise?.[0]} onChange={(v) => update({ ...draft, otherwise: [v] })} />
      </div>
      <textarea
        aria-label="Note (optional)"
        value={draft.note ?? ""}
        onChange={(e) => update({ ...draft, note: e.target.value })}
        placeholder="Anything else OPTIM should know about how you decide (optional)"
        rows={2}
        className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface-input px-3 py-2 text-body text-off-white placeholder:text-neutral/70"
      />
      {result.ok ? (
        <p className="rounded-[var(--radius-sm)] bg-accent-soft px-3 py-2 text-meta text-accent-fg">{describeDecisionPolicy(result.policy, spec, actions)}</p>
      ) : (
        <p className="text-meta text-neutral">{result.message} Your rules save once they&apos;re complete.</p>
      )}
    </div>
  );
}
