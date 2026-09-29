import { Compass } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CoachingMethodForm, type MethodFieldView } from "@/components/coach/coaching-method-form";
import { confirmCoachMethodologyAction } from "@/app/actions/coach-methodology";
import {
  GENERATION_METHOD_QUESTION_IDS,
  describeMethodField,
  fieldLabel,
  getMethodologyConfirmation,
  methodAnswersFromModel,
  methodQuestion,
} from "@/lib/coach/methodology";
import type { CoachPlaybook } from "@/lib/coach/playbook";

/**
 * The real Supabase-mode "Your Coaching Method" card: review, edit, and
 * explicitly confirm the methodology fields OPTIM's program generation
 * reads (see lib/coach/methodology.ts).
 *
 * Honesty rule: this workspace's Playbook row may be "approved" only
 * because it was bootstrapped from OPTIM's defaults so chat/AI authority
 * have something to read (lib/production/playbooks.ts). Confirmation is
 * therefore judged from the operating model itself — status, activation,
 * and per-field coach provenance — never from the row status. Unconfirmed
 * fields are labelled as OPTIM defaults and start empty in the form.
 */
export function LiveCoachPlaybookSummary({ playbook }: { playbook: CoachPlaybook }) {
  const model = playbook.content.operatingModel;
  const confirmation = getMethodologyConfirmation(model);
  const answers = methodAnswersFromModel(model);

  const fields: MethodFieldView[] = GENERATION_METHOD_QUESTION_IDS.map((id) => {
    const q = methodQuestion(id);
    const p = model.provenance[id];
    const isCoachChosen = !!p && (p.source === "coach_selected" || p.source === "coach_confirmed");
    return {
      id,
      label: fieldLabel(id),
      prompt: q.prompt,
      type: q.type === "multi_select" ? "multi_select" : q.type === "text" ? "text" : "single_select",
      options: (q.options ?? []).map((o) => ({ value: o.value, label: o.label })),
      confirmedValue: isCoachChosen ? answers[id] : null,
      defaultHint: isCoachChosen ? null : describeMethodField(model, id),
    };
  });

  const confirmedLabel = confirmation.confirmedAtIso
    ? new Date(confirmation.confirmedAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <Card className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
          <Compass size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-subheading text-off-white">Your Coaching Method</p>
          <p className="mt-1 text-meta text-neutral">What OPTIM builds every new client program from. Nothing here is used until you confirm it.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-meta text-neutral">Status</p>
          {confirmation.confirmed ? (
            <p className="font-medium text-success">Confirmed</p>
          ) : (
            <p className="font-medium text-warning-strong">Not confirmed — OPTIM defaults</p>
          )}
        </div>
        <div>
          <p className="text-meta text-neutral">Playbook version</p>
          <p className="font-medium text-off-white">v{playbook.version}</p>
        </div>
        <div>
          <p className="text-meta text-neutral">Confirmed on</p>
          <p className="font-medium text-off-white">{confirmedLabel ?? "Never"}</p>
        </div>
      </div>

      {!confirmation.confirmed ? (
        <p className="rounded-[var(--radius-sm)] border border-warning bg-warning-soft/40 px-3.5 py-2.5 text-meta text-warning-strong">
          New program proposals are paused until you confirm these fields
          {confirmation.unconfirmedFields.length > 0 ? `: ${confirmation.unconfirmedFields.join(", ")}` : ""}.
        </p>
      ) : null}

      <CoachingMethodForm fields={fields} action={confirmCoachMethodologyAction} formKey={`${playbook.id}-${playbook.version}`} />
    </Card>
  );
}
