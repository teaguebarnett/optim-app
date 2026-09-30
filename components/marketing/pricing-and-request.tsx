// Full pricing cards and the beta-request section. Every plan action requests
// beta access; the selected plan travels only as interest (?plan=…), never
// as a reservation or entitlement. No checkout link exists anywhere here —
// MARKETING_MODE has no paid mode (lib/marketing/config.ts).

import { Suspense } from "react";
import Link from "next/link";
import { LeadForm } from "@/components/marketing/lead-form";
import { Section, SectionHeading, FOCUS_RING } from "@/components/marketing/primitives";
import { PLANS, SCALE_CONTACT_HREF } from "@/lib/marketing/config";
import { PRICING, REQUEST } from "@/lib/marketing/content";

export function PricingCards({ requestPath }: { requestPath: string }) {
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isScale = plan.priceUsdMonthly === null;
          const href = isScale && SCALE_CONTACT_HREF ? SCALE_CONTACT_HREF : `${requestPath}?plan=${plan.id}#request`;
          return (
            <li key={plan.id} className="flex flex-col rounded-[14px] border border-border-strong bg-charcoal p-5 sm:p-6">
              {/* Phones: name + range beside the price, so each card scans in one line. */}
              <div className="flex items-start justify-between gap-4 sm:block">
                <div>
                  <h3 className="text-lg font-semibold text-off-white">{plan.name}</h3>
                  <p className="mt-0.5 text-[0.9375rem] text-neutral sm:mt-1">{plan.clients}</p>
                </div>
                <p className="shrink-0 text-right text-off-white sm:mt-6 sm:text-left">
                  {isScale ? (
                    <span className="text-lg font-semibold tracking-[-0.02em] sm:text-[1.75rem]">{PRICING.customPrice}</span>
                  ) : (
                    <>
                      <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] sm:text-[2.5rem]">${plan.priceUsdMonthly}</span>
                      <span className="text-[0.875rem] text-neutral sm:text-[0.9375rem]">{PRICING.perMonth}</span>
                    </>
                  )}
                </p>
              </div>
              <p className="mt-3 flex-1 text-[0.9375rem] leading-relaxed text-neutral sm:mt-4">{plan.summary}</p>
              <Link
                href={href}
                className={`mt-4 inline-flex min-h-11 items-center justify-center sm:mt-6 rounded-[12px] border border-border-strong px-4 text-[0.9375rem] font-semibold text-off-white hover:bg-off-white/[0.04] ${FOCUS_RING}`}
              >
                {isScale && SCALE_CONTACT_HREF ? PRICING.scaleCta : PRICING.cardCta}
                <span className="sr-only"> — {plan.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-[0.875rem] text-neutral">{PRICING.note}</p>
    </>
  );
}

export function FoundingInterest({ requestPath }: { requestPath: string }) {
  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-border-strong bg-surface-raised px-6 py-5">
      <p className="max-w-2xl text-[1.0625rem] text-off-white">{PRICING.founding}</p>
      <Link href={`${requestPath}#request`} className={`inline-flex min-h-11 items-center rounded-[12px] px-2 text-[0.9375rem] font-semibold text-accent-fg underline underline-offset-4 ${FOCUS_RING}`}>
        {PRICING.foundingCta}
      </Link>
    </div>
  );
}

export function RequestSection() {
  return (
    <Section id="request" labelledBy="request-heading" className="border-t border-border bg-charcoal">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <SectionHeading id="request-heading" heading={REQUEST.heading} body={REQUEST.body} />
        {/* useSearchParams (plan interest) needs a Suspense boundary; the
            fallback is the same form without a preselected plan. */}
        <Suspense fallback={null}>
          <LeadForm />
        </Suspense>
      </div>
    </Section>
  );
}
