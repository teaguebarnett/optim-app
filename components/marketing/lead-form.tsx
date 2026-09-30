"use client";

// Beta-request form. While no approved receiver exists (`accepting` false)
// the fields stay reviewable but submission is disabled and the page points
// to the working product walkthrough instead. Success appears only after the
// server confirms the request was stored, and shows the visitor's own email
// only to them. Entered details are never cleared on an error.

import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { submitBetaRequestAction, type BetaRequestResult } from "@/app/actions/marketing";
import { CLIENT_COUNT_OPTIONS, parseBetaRequest, type BetaRequestErrors, type BetaRequestField } from "@/lib/marketing/beta-request";
import { PLANS, isPlanId } from "@/lib/marketing/config";
import { REQUEST } from "@/lib/marketing/content";
import { trackPublicEvent } from "@/lib/marketing/events";
import { FOCUS_RING } from "@/components/marketing/primitives";

const FIELD_ORDER: BetaRequestField[] = ["name", "email", "clientCount", "currentPlatform"];
const INPUT = `w-full min-h-11 rounded-[12px] border bg-surface px-3.5 py-2.5 text-base text-off-white placeholder:text-neutral ${FOCUS_RING}`;

export function LeadForm({ accepting }: { accepting: boolean }) {
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const [planInterest, setPlanInterest] = useState(isPlanId(planParam) ? planParam : null);
  const [result, formAction, pending] = useActionState<BetaRequestResult, FormData>(submitBetaRequestAction, { status: "idle" });
  const [clientErrors, setClientErrors] = useState<BetaRequestErrors>({});
  const [touched, setTouched] = useState<Set<BetaRequestField>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const errors = result.status === "invalid" ? { ...result.errors, ...clientErrors } : clientErrors;

  useEffect(() => {
    if (result.status === "success") trackPublicEvent({ name: "beta_request_succeeded", planInterest: isPlanId(result.planInterest) ? result.planInterest : null });
  }, [result]);

  // Inline validation once a field has been visited — so errors are visible
  // and useful even before submitting.
  function onBlurCapture(e: React.FocusEvent<HTMLFormElement>) {
    const name = (e.target as unknown as { name?: string }).name as BetaRequestField;
    if (!FIELD_ORDER.includes(name)) return;
    const nextTouched = new Set(touched).add(name);
    setTouched(nextTouched);
    const parsed = parseBetaRequest(Object.fromEntries(new FormData(e.currentTarget).entries()));
    const all = parsed.ok ? {} : parsed.errors;
    setClientErrors(Object.fromEntries(FIELD_ORDER.filter((f) => nextTouched.has(f) && all[f]).map((f) => [f, all[f]])));
  }

  function validate(e: React.FormEvent<HTMLFormElement>) {
    const parsed = parseBetaRequest(Object.fromEntries(new FormData(e.currentTarget).entries()));
    if (!parsed.ok) {
      e.preventDefault();
      setClientErrors(parsed.errors);
      const first = FIELD_ORDER.find((f) => parsed.errors[f]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setClientErrors({});
  }

  if (result.status === "success") {
    return (
      <p role="status" className="rounded-[14px] border border-success/40 bg-success-soft px-5 py-4 text-[1.0625rem] text-off-white">
        {REQUEST.success(result.email)}
      </p>
    );
  }

  const plan = PLANS.find((p) => p.id === planInterest);
  const describe = (f: BetaRequestField) => (errors[f] ? `${f}-error` : undefined);
  const border = (f: BetaRequestField) => (errors[f] ? "border-error-strong!" : "border-border-strong");

  return (
    <form ref={formRef} action={formAction} onSubmit={validate} onBlurCapture={onBlurCapture} noValidate className="grid gap-5 sm:grid-cols-2">
      {plan ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-border-strong bg-surface px-4 py-3 sm:col-span-2">
          <p className="text-[0.9375rem] text-off-white">
            {REQUEST.interestPrefix} <span className="font-semibold">{plan.name}</span>
          </p>
          <p className="text-[0.8125rem] text-neutral">{REQUEST.interestNote}</p>
          <button type="button" onClick={() => setPlanInterest(null)} className={`ml-auto min-h-11 rounded-[10px] px-2 text-[0.875rem] font-semibold text-accent-fg ${FOCUS_RING}`}>
            Remove
          </button>
          <input type="hidden" name="planInterest" value={plan.id} />
        </div>
      ) : null}

      <Field id="name" label={REQUEST.labels.name} error={errors.name}>
        <input id="name" name="name" autoComplete="name" required aria-invalid={!!errors.name} aria-describedby={describe("name")} className={`${INPUT} ${border("name")}`} />
      </Field>
      <Field id="email" label={REQUEST.labels.email} error={errors.email}>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required aria-invalid={!!errors.email} aria-describedby={describe("email")} className={`${INPUT} ${border("email")}`} />
      </Field>
      <Field id="clientCount" label={REQUEST.labels.clientCount} error={errors.clientCount}>
        <select id="clientCount" name="clientCount" required defaultValue="" aria-invalid={!!errors.clientCount} aria-describedby={describe("clientCount")} className={`${INPUT} ${border("clientCount")}`}>
          <option value="" disabled>
            Choose one
          </option>
          {CLIENT_COUNT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field id="currentPlatform" label={REQUEST.labels.platform} error={errors.currentPlatform}>
        <input id="currentPlatform" name="currentPlatform" autoComplete="off" aria-invalid={!!errors.currentPlatform} aria-describedby={describe("currentPlatform")} className={`${INPUT} ${border("currentPlatform")}`} />
      </Field>

      <div className="space-y-3 sm:col-span-2">
        <p className="text-[0.875rem] text-neutral">{REQUEST.purpose}</p>
        <button
          type="submit"
          disabled={!accepting || pending}
          className={`inline-flex min-h-11 w-full items-center justify-center rounded-[12px] bg-accent px-6 text-[0.9375rem] font-semibold text-on-accent hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${FOCUS_RING}`}
        >
          {pending ? REQUEST.sending : REQUEST.submit}
        </button>
        <div aria-live="polite">
          {!accepting || result.status === "closed" ? (
            <p className="text-[0.9375rem] text-off-white">
              {REQUEST.closed}{" "}
              <Link href="/#how-it-works" className={`font-semibold text-accent-fg underline underline-offset-4 ${FOCUS_RING}`}>
                {REQUEST.closedLink}
              </Link>
            </p>
          ) : null}
          {result.status === "error" ? <p className="text-[0.9375rem] text-error-strong">{REQUEST.error}</p> : null}
        </div>
      </div>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[0.9375rem] font-semibold text-off-white">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[0.875rem] text-error-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
