"use client";

// Settings -> Your Coaching Method: review, edit, and explicitly confirm the
// methodology fields program generation reads (lib/coach/methodology.ts).
// A field the coach has never confirmed starts EMPTY, with OPTIM's default
// shown only as a hint — so confirming means actually choosing each value,
// never approving seeded defaults with one click.

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ConfirmMethodResult } from "@/app/actions/coach-methodology";

export interface MethodFieldView {
  id: string;
  label: string;
  prompt: string;
  type: "single_select" | "multi_select" | "text";
  options: Array<{ value: string; label: string }>;
  /** The coach's own confirmed answer, or null when never confirmed. */
  confirmedValue: string | string[] | null;
  /** OPTIM's current default, shown as a hint only when unconfirmed. */
  defaultHint: string | null;
}

export function CoachingMethodForm({
  fields,
  action,
  formKey,
}: {
  fields: MethodFieldView[];
  action: (prev: ConfirmMethodResult, formData: FormData) => Promise<ConfirmMethodResult>;
  /** Changes after each confirmation so the form re-seeds from saved values. */
  formKey: string;
}) {
  const [result, formAction, pending] = useActionState(action, null);
  const rpeField = fields.find((f) => f.id === "program_rpe_rir");
  const [rpeRir, setRpeRir] = useState(typeof rpeField?.confirmedValue === "string" ? rpeField.confirmedValue : "");

  return (
    <form key={formKey} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          if (field.id === "program_proximity_to_failure" && rpeRir === "neither") return null;
          return (
            <fieldset key={field.id} className={field.type === "multi_select" || field.type === "text" ? "sm:col-span-2" : undefined}>
              <legend className="text-sm font-medium text-off-white">{field.label}</legend>
              <p className="mb-1.5 text-meta text-neutral">{field.prompt}</p>
              {field.type === "multi_select" ? (
                <div className="flex flex-wrap gap-2">
                  {field.options.map((option) => (
                    <label
                      key={option.value}
                      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-1.5 text-sm text-off-white has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                    >
                      <input
                        type="checkbox"
                        name={field.id}
                        value={option.value}
                        defaultChecked={Array.isArray(field.confirmedValue) && field.confirmedValue.includes(option.value)}
                        className="accent-[var(--pc-brass)]"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              ) : field.type === "text" ? (
                <input
                  type="text"
                  name={field.id}
                  defaultValue={typeof field.confirmedValue === "string" ? field.confirmedValue : ""}
                  placeholder="e.g. Behind-the-neck press, upright row"
                  className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-transparent px-3 py-2 text-sm text-off-white"
                />
              ) : (
                <select
                  name={field.id}
                  required
                  defaultValue={typeof field.confirmedValue === "string" ? field.confirmedValue : ""}
                  onChange={field.id === "program_rpe_rir" ? (e) => setRpeRir(e.target.value) : undefined}
                  className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-sm text-off-white"
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {field.confirmedValue === null && field.defaultHint ? (
                <p className="mt-1 text-meta text-neutral">OPTIM default (not confirmed): {field.defaultHint}</p>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="submit" loading={pending}>
          Confirm my coaching method
        </Button>
        <p className="text-meta text-neutral">Saved as a new Playbook version; earlier versions stay in history.</p>
      </div>
      {result ? (
        <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-error"}`}>
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
