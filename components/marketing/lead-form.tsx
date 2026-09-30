"use client";

// Beta-request (waitlist) form. Four fields, validated inline and again on
// the server. Success appears only after the server confirms the lead was
// saved; a duplicate email gets its own clear message; a server or network
// failure keeps everything typed and says so. A request never creates an
// account, grants access, or takes payment.

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { submitBetaRequestAction, type BetaRequestResult } from "@/app/actions/marketing";
import { CLIENT_COUNT_OPTIONS, parseBetaRequest, type BetaRequestErrors, type BetaRequestField } from "@/lib/marketing/beta-request";
import { PLANS, isPlanId } from "@/lib/marketing/config";
import { REQUEST } from "@/lib/marketing/content";
import { trackPublicEvent } from "@/lib/marketing/events";
import { FOCUS_RING } from "@/components/marketing/primitives";

const FIELD_ORDER: BetaRequestField[] = ["firstName", "email", "clientCount", "instagramOrWebsite"];
const INPUT = `w-full min-h-11 rounded-[12px] border bg-surface px-3.5 py-2.5 text-base text-off-white placeholder:text-neutral ${FOCUS_RING}`;

// A request that never reaches the server (offline, dropped connection)
// rejects instead of returning; turn that into the same visible error.
async function submitSafely(prev: BetaRequestResult, formData: FormData): Promise<BetaRequestResult> {
  try {
    return await submitBetaRequestAction(prev, formData);
  } catch {
    return { status: "error" };
  }
}

export function LeadForm() {
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const [planInterest, setPlanInterest] = useState(isPlanId(planParam) ? planParam : null);
  const [result, formAction, pending] = useActionState<BetaRequestResult, FormData>(submitSafely, { status: "idle" });
  const [clientErrors, setClientErrors] = useState<BetaRequestErrors>({});
  const [touched, setTouched] = useState<Set<BetaRequestField>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const errors = result.status === "invalid" ? { ...result.errors, ...clientErrors } : clientErrors;

  useEffect(() => {
    if (result.status === "success") trackPublicEvent({ name: "beta_request_succeeded", planInterest: isPlanId(result.planInterest) ? result.planInterest : null });
    if (result.status === "success" || result.status === "duplicate") statusRef.current?.focus();
  }, [result]);

  function onBlurCapture(e: React.FocusEvent<HTMLFormElement>) {
    const name = (e.target as unknown as { name?: string }).name as BetaRequestField;
    if (!FIELD_ORDER.includes(name)) return;
    const nextTouched = new Set(touched).add(name);
    setTouched(nextTouched);
    const parsed = parseBetaRequest(Object.fromEntries(new FormData(e.currentTarget).entries()));
    const all = parsed.ok ? {} : parsed.errors;
    setClientErrors(Object.fromEntries(FIELD_ORDER.filter((f) => nextTouched.has(f) && all[f]).map((f) => [f, all[f]])));
  }

  // Submitted from onSubmit inside a transition rather than via
  // <form action>: React 19 auto-resets a form after its action finishes —
  // even on an error — which would wipe what the person typed.
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const parsed = parseBetaRequest(Object.fromEntries(formData.entries()));
    if (!parsed.ok) {
      setClientErrors(parsed.errors);
      const first = FIELD_ORDER.find((f) => parsed.errors[f]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setClientErrors({});
    startTransition(() => formAction(formData));
  }

  if (result.status === "success" || result.status === "duplicate") {
    const success = result.status === "success";
    return (
      <div ref={statusRef} tabIndex={-1} role="status" className="rounded-[14px] border border-border-strong bg-surface px-6 py-6 outline-none">
        <p className="text-[1.375rem] font-semibold tracking-[-0.01em] text-off-white">{success ? REQUEST.successHeading : REQUEST.duplicateHeading}</p>
        <p className="mt-2 text-[1.0625rem] leading-relaxed text-neutral">{success ? REQUEST.successBody : REQUEST.duplicateBody(result.email)}</p>
      </div>
    );
  }

  const plan = PLANS.find((p) => p.id === planInterest);
  const describe = (f: BetaRequestField) => (errors[f] ? `${f}-error` : undefined);
  const border = (f: BetaRequestField) => (errors[f] ? "border-error-strong!" : "border-border-strong");

  return (
    <form ref={formRef} onSubmit={submit} onBlurCapture={onBlurCapture} noValidate className="relative grid gap-5 sm:grid-cols-2">
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

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-0 h-px w-px overflow-hidden">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Field id="firstName" label={REQUEST.labels.firstName} error={errors.firstName}>
        <input id="firstName" name="firstName" autoComplete="given-name" required maxLength={80} aria-invalid={!!errors.firstName} aria-describedby={describe("firstName")} className={`${INPUT} ${border("firstName")}`} />
      </Field>
      <Field id="email" label={REQUEST.labels.email} error={errors.email}>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} aria-invalid={!!errors.email} aria-describedby={describe("email")} className={`${INPUT} ${border("email")}`} />
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
      <Field id="instagramOrWebsite" label={REQUEST.labels.link} error={errors.instagramOrWebsite}>
        <input id="instagramOrWebsite" name="instagramOrWebsite" autoComplete="url" maxLength={200} placeholder="@yourhandle or yoursite.com" aria-invalid={!!errors.instagramOrWebsite} aria-describedby={describe("instagramOrWebsite")} className={`${INPUT} ${border("instagramOrWebsite")}`} />
      </Field>

      <div className="space-y-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className={`inline-flex min-h-11 w-full items-center justify-center rounded-[12px] bg-accent px-6 text-[0.9375rem] font-semibold text-on-accent hover:bg-accent-strong disabled:cursor-wait disabled:opacity-70 sm:w-auto ${FOCUS_RING}`}
        >
          {pending ? REQUEST.sending : REQUEST.submit}
        </button>
        <p className="text-[0.875rem] text-neutral">
          {REQUEST.notice}{" "}
          <Link href="/privacy" className={`font-semibold text-accent-fg underline underline-offset-4 ${FOCUS_RING}`}>
            {REQUEST.noticeLink}
          </Link>
        </p>
        <div aria-live="polite">{result.status === "error" ? <p className="text-[0.9375rem] text-error-strong">{REQUEST.error}</p> : null}</div>
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
