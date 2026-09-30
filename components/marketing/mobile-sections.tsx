// Phone-only composition of the homepage (rendered below 768px; the approved
// desktop/tablet sections in home-sections.tsx are hidden there instead).
//
// Why a separate composition rather than more breakpoints: on a phone the
// desktop sections stacked into one long, dense column. Here each section
// makes ONE point with at most ONE real product still, secondary detail
// sits behind disclosures, and nothing repeats. Same claims and real
// screenshots as desktop — shorter wording only (lib/marketing/content.ts
// MOBILE).

import Link from "next/link";
import { Check } from "lucide-react";
import { Container, ProductStill, FOCUS_RING } from "@/components/marketing/primitives";
import { ATTENTION, CLIENT, FOUNDER, MOBILE } from "@/lib/marketing/content";

// The coach stills are the complete desktop screenshots, scaled down to the
// phone's width at their own aspect ratio — never a cropped phone version, so
// every edge of the real interface stays visible.
const STILL = {
  calibration: { src: "/marketing/calibration-desktop.webp", width: 1600, height: 699 },
  attention: { src: "/marketing/coach-attention-neutral-v2-desktop.webp", width: 1600, height: 311 },
  clientNext: { src: "/marketing/client-today-next-v1-phone.webp", width: 780, height: 585 },
};

function MobileSection({ labelledBy, children, className = "" }: { labelledBy: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={labelledBy} className={`py-20 md:hidden ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

function MobileHeading({ id, children, tone = "light" }: { id: string; children: React.ReactNode; tone?: "light" | "navy" }) {
  return (
    <h2 id={id} className={`text-[2rem] font-semibold leading-[1.1] tracking-[-0.025em] ${tone === "navy" ? "text-navy-ink" : "text-off-white"}`}>
      {children}
    </h2>
  );
}

/** 1 → 2 → 3, each a single idea; only step 1 carries a still. */
export function MobileHowItWorks() {
  return (
    <MobileSection labelledBy="m-how-heading" className="border-t border-border bg-charcoal">
      <MobileHeading id="m-how-heading">{MOBILE.how.heading}</MobileHeading>
      <ol className="mt-12 space-y-14">
        {MOBILE.how.steps.map((step, i) => (
          <li key={step.title}>
            <p aria-hidden="true" className="text-[0.9375rem] font-semibold text-accent-fg">
              Step {i + 1}
            </p>
            <h3 className="mt-2 text-[1.375rem] font-semibold leading-snug tracking-[-0.015em] text-off-white">{step.title}</h3>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-neutral">{step.body}</p>
            {i === 0 ? (
              <ProductStill
                desktop={STILL.calibration}
                alt="OPTIM coach calibration survey: chapters from your coaching practice through reviewing your coaching model, with the first question, Who do you typically coach?, and options such as general population, strength athletes, and endurance athletes."
                caption={MOBILE.stillCaption}
                sizes="100vw"
                className="mt-8"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </MobileSection>
  );
}

/** One point — OPTIM prepares, the coach decides — with the one still that shows it. */
export function MobileCoachControl() {
  return (
    <MobileSection labelledBy="m-control-heading" className="bg-navy">
      <MobileHeading id="m-control-heading" tone="navy">
        {MOBILE.control.heading}
      </MobileHeading>
      <p className="mt-4 text-[1.0625rem] leading-relaxed text-navy-ink-muted">{MOBILE.control.body}</p>
      <ul className="mt-10 space-y-4">
        {ATTENTION.zones.map((zone) => (
          <li key={zone.label} className="border-t border-navy-ink/20 pt-4">
            <p className="text-[0.8125rem] font-semibold tracking-[0.08em] text-navy-ink">{zone.label}</p>
            <p className="mt-1 text-[1rem] text-navy-ink-muted">{zone.body}</p>
          </li>
        ))}
      </ul>
      <ProductStill
        desktop={STILL.attention}
        alt="OPTIM coach Command Center: a greeting with three zones labelled Needs you, Worth knowing, and Handled, shown with demonstration counts."
        caption={MOBILE.stillCaption}
        sizes="100vw"
        tone="navy"
        className="mt-10"
      />
    </MobileSection>
  );
}

/** The client side: three short points and one still of their day. */
export function MobileClient({ betaLoginHref }: { betaLoginHref: string }) {
  return (
    <MobileSection labelledBy="m-client-heading">
      <MobileHeading id="m-client-heading">{MOBILE.client.heading}</MobileHeading>
      <p className="mt-4 text-[1.0625rem] text-neutral">{MOBILE.client.intro}</p>
      <ul className="mt-5 space-y-3">
        {MOBILE.client.points.map((point) => (
          <li key={point} className="flex items-center gap-3 text-[1.0625rem] font-medium text-off-white">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
              <Check size={14} aria-hidden="true" />
            </span>
            {point}
          </li>
        ))}
      </ul>
      <ProductStill
        desktop={STILL.clientNext}
        alt="OPTIM client Today screen: a morning weight check-in marked Recommended now, day progress, and the day's breakfast and rest-day tiles."
        caption={MOBILE.stillCaption}
        sizes="100vw"
        className="mt-10"
      />
      <p className="mt-8 text-[0.9375rem] text-off-white">
        {CLIENT.entryLine}{" "}
        <Link href={betaLoginHref} className={`inline-flex min-h-11 items-center rounded-[6px] font-semibold text-accent-fg underline underline-offset-4 ${FOCUS_RING}`}>
          {CLIENT.button}
        </Link>
      </p>
    </MobileSection>
  );
}

/** Short founder rationale; the full story is one tap away. */
export function MobileFounder() {
  return (
    <MobileSection labelledBy="m-founder-heading" className="border-t border-border bg-charcoal">
      <MobileHeading id="m-founder-heading">{MOBILE.founder.heading}</MobileHeading>
      <figure className="mt-6 border-l-2 border-brass! pl-5">
        <blockquote className="text-[1.0625rem] leading-relaxed text-off-white">
          <p>{MOBILE.founder.short}</p>
        </blockquote>
        <figcaption className="mt-4 text-[0.9375rem] font-semibold text-off-white">{FOUNDER.attribution}</figcaption>
      </figure>
      <details className="group mt-6">
        <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[8px] text-[0.9375rem] font-semibold text-accent-fg [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}>
          {MOBILE.founder.more}
          <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
        </summary>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-neutral">{FOUNDER.body}</p>
      </details>
    </MobileSection>
  );
}
