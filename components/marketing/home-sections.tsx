// Homepage sections, in the approved order. Server components: all text
// renders immediately with no client JavaScript. Product visuals are real
// stills from the current beta interface (demonstration data where a
// screen shows data), always captioned as such.

import { OptimWordmark } from "@/components/brand/optim-wordmark";
import { Container, CtaLink, ProductStill, Section, SectionHeading, FOCUS_RING } from "@/components/marketing/primitives";
import { ATTENTION, CLIENT, DEMO, FAQS, FAQ_HEADING, FOOTER, FOUNDER, HERO, METHOD, NAV, PRICING, SETUP, STILLS } from "@/lib/marketing/content";
import { PLANS } from "@/lib/marketing/config";
import Link from "next/link";

const STILL = {
  clientToday: { src: "/marketing/client-today-phone.webp", width: 780, height: 1250 },
  clientEdge: { src: "/marketing/client-edge-phone.webp", width: 780, height: 410 },
  calibrationDesktop: { src: "/marketing/calibration-desktop.webp", width: 1600, height: 699 },
  // Phone crops (<640px) focus on the one detail each section is about, at a
  // size that can actually be read. Versioned filenames: a replaced image
  // must never reuse an old URL (optimized/browser copies are cached by URL).
  clientTodayPhone: { src: "/marketing/client-today-hero-v2-phone.webp", width: 780, height: 870 },
  calibrationPhone: { src: "/marketing/calibration-question-v2-phone.webp", width: 545, height: 600 },
  attentionDesktop: { src: "/marketing/coach-attention-neutral-v2-desktop.webp", width: 1600, height: 311 },
  attentionPhone: { src: "/marketing/coach-attention-neutral-v3-phone.webp", width: 780, height: 690 },
};

export function Hero() {
  const [first, ...rest] = HERO.heading.split(". ");
  return (
    <section aria-labelledby="hero-heading" className="pb-20 pt-10 sm:pb-24 sm:pt-16">
      <Container className="grid items-center gap-14 sm:gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
        <div>
          <p className="text-[0.9375rem] font-semibold text-accent-fg">{HERO.eyebrow}</p>
          <h1 id="hero-heading" className="mt-4 text-[2.625rem] font-bold leading-[1.02] tracking-[-0.04em] text-off-white min-[400px]:text-[3rem] sm:text-[4rem] lg:text-[4.5rem]">
            <span className="block">{first}.</span>
            <span className="block">{rest.join(". ")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-neutral sm:text-lg">{HERO.body}</p>
          <div className="mt-8 flex flex-col gap-3 min-[400px]:flex-row">
            <CtaLink href="#request">{HERO.primary}</CtaLink>
            <CtaLink href="#how-it-works" variant="secondary">
              {HERO.secondary}
            </CtaLink>
          </div>
          <p className="mt-5 text-[0.875rem] text-neutral">{HERO.stageNote}</p>
        </div>
        <ProductStill
          desktop={STILL.clientToday}
          phone={STILL.clientTodayPhone}
          alt="OPTIM client Today screen: a greeting, the day's fuel targets, a prompt to enter training time, a morning weight check-in, and day progress."
          caption={STILLS.clientToday}
          sizes="(min-width: 1024px) 340px, (min-width: 640px) 300px, 100vw"
          priority
          className="w-full max-w-[400px] sm:max-w-[300px] lg:ml-auto lg:max-w-[340px]"
        />
      </Container>
    </section>
  );
}

export function WorkflowDemo() {
  const calibration = {
    desktop: STILL.calibrationDesktop,
    phone: STILL.calibrationPhone,
    alt: "OPTIM coach calibration survey: chapters from your coaching practice through reviewing your coaching model, with the first question, Who do you typically coach?, and options such as general population, strength athletes, and endurance athletes.",
    caption: STILLS.calibration,
  };
  return (
    <Section id="how-it-works" labelledBy="demo-heading" className="border-t border-border bg-charcoal">
      <SectionHeading id="demo-heading" heading={DEMO.heading} body={DEMO.body} />
      <div className="mt-10 grid gap-10 sm:mt-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <ol className="space-y-8 sm:space-y-6">
          {DEMO.steps.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-x-4">
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-[0.875rem] font-semibold text-off-white">
                {i + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold text-off-white sm:text-[1.0625rem]">{step.title}</h3>
                <p className="mt-1 text-base leading-relaxed text-neutral sm:text-[0.9375rem]">{step.body}</p>
              </div>
              {/* Phones: the calibration still sits with the step it's evidence for. */}
              {i === 0 ? <ProductStill {...calibration} sizes="100vw" className="col-span-2 mt-5 lg:hidden" /> : null}
            </li>
          ))}
        </ol>
        <ProductStill {...calibration} sizes="(min-width: 1024px) 680px, 100vw" className="hidden lg:block" />
      </div>
    </Section>
  );
}

export function MethodSection() {
  return (
    <Section id="product" labelledBy="method-heading">
      <SectionHeading id="method-heading" heading={METHOD.heading} body={METHOD.body} />
      <dl className="mt-10 grid gap-6 sm:mt-12 sm:grid-cols-3 sm:gap-8">
        {METHOD.labels.map((item) => (
          <div key={item.title} className="border-t-2 border-border-strong pt-4">
            <dt className="text-lg font-semibold text-off-white">{item.title}</dt>
            <dd className="mt-1.5 text-base leading-relaxed text-neutral sm:mt-2 sm:text-[0.9375rem]">{item.body}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-10 max-w-2xl rounded-[14px] bg-surface-raised px-5 py-4 text-base leading-relaxed text-off-white sm:mt-12 sm:bg-transparent sm:p-0 sm:text-[1.0625rem]">{METHOD.authority}</p>
    </Section>
  );
}

export function AttentionSection() {
  return (
    <section aria-labelledby="attention-heading" className="bg-navy py-16 sm:py-24">
      <Container>
        <SectionHeading id="attention-heading" heading={ATTENTION.heading} body={ATTENTION.body} tone="navy" />
        <dl className="mt-10 grid gap-5 sm:mt-12 sm:grid-cols-3 sm:gap-8">
          {ATTENTION.zones.map((zone) => (
            <div key={zone.label} className="border-t border-navy-ink/25 pt-4">
              <dt className="text-[0.75rem] font-semibold tracking-[0.08em] text-navy-ink">{zone.label}</dt>
              <dd className="mt-2 text-[0.9375rem] leading-relaxed text-navy-ink-muted">{zone.body}</dd>
            </div>
          ))}
        </dl>
        <ProductStill
          desktop={STILL.attentionDesktop}
          phone={STILL.attentionPhone}
          alt="OPTIM coach Command Center: a greeting with three zones labelled Needs you, Worth knowing, and Handled, shown with demonstration counts."
          caption={STILLS.attention}
          sizes="(min-width: 1152px) 1088px, 100vw"
          tone="navy"
          className="mt-10 sm:mt-12"
        />
      </Container>
    </section>
  );
}

export function ClientSection({ betaLoginHref }: { betaLoginHref: string }) {
  return (
    <Section labelledBy="client-heading">
      <div className="grid items-center gap-10 sm:gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading id="client-heading" heading={CLIENT.heading} body={CLIENT.body} />
          <p className="mt-6 text-[0.9375rem] text-off-white sm:mt-8">
            {CLIENT.entryLine}{" "}
            <Link href={betaLoginHref} className={`inline-flex min-h-11 items-center rounded-[6px] font-semibold text-accent-fg underline underline-offset-4 ${FOCUS_RING}`}>
              {CLIENT.button}
            </Link>
          </p>
        </div>
        <ProductStill
          desktop={STILL.clientEdge}
          alt="OPTIM client daily entrance: Today's edge — Recovery day, no training scheduled. Prioritize sleep and hit your protein target. With an Enter OPTIM button."
          caption={STILLS.clientEdge}
          sizes="(min-width: 1024px) 480px, 100vw"
          className="w-full max-w-md lg:justify-self-end"
        />
      </div>
    </Section>
  );
}

export function SetupSteps() {
  return (
    <Section labelledBy="setup-heading" className="border-t border-border bg-charcoal">
      <SectionHeading id="setup-heading" heading={SETUP.heading} body={SETUP.body} />
      <ol className="mt-10 grid gap-y-7 sm:mt-12 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-10 lg:grid-cols-4">
        {SETUP.steps.map((step, i) => (
          <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-x-4 sm:block">
            <p aria-hidden="true" className="text-[1.5rem] font-semibold leading-8 tracking-[-0.03em] text-accent-fg sm:text-[2rem] sm:leading-none">
              {i + 1}
            </p>
            <div>
              <h3 className="text-lg font-semibold text-off-white sm:mt-4 sm:text-[1.0625rem]">{step.title}</h3>
              <p className="mt-1 text-base leading-relaxed text-neutral sm:mt-2 sm:text-[0.9375rem]">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function PricePreview() {
  return (
    <Section labelledBy="pricing-preview-heading">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading id="pricing-preview-heading" heading={PRICING.heading} body={PRICING.body} />
        {/* Wrapper carries visibility: CtaLink's own display class would win over `hidden`. */}
        <span className="hidden sm:block">
          <CtaLink href="/pricing" variant="secondary">
            {PRICING.previewLink}
          </CtaLink>
        </span>
      </div>
      <ul className="mt-8 grid overflow-hidden rounded-[14px] border border-border-strong sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <li
            key={plan.id}
            className="flex items-center justify-between gap-4 border-border-strong bg-charcoal px-5 py-4 [&:not(:last-child)]:border-b sm:block sm:p-6 sm:[&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-b-0 lg:[&:not(:last-child)]:border-r"
          >
            <div>
              <p className="text-[1.0625rem] font-semibold text-off-white">{plan.name}</p>
              <p className="mt-0.5 text-[0.875rem] text-neutral sm:mt-1">{plan.clients}</p>
            </div>
            <p className="shrink-0 text-right text-off-white sm:mt-5 sm:text-left">
              {plan.priceUsdMonthly === null ? (
                <span className="text-base font-semibold sm:text-xl">{PRICING.customPrice}</span>
              ) : (
                <>
                  <span className="text-[1.5rem] font-semibold tracking-[-0.03em] sm:text-[2rem]">${plan.priceUsdMonthly}</span>
                  <span className="text-[0.875rem] text-neutral sm:text-[0.9375rem]">{PRICING.perMonth}</span>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.875rem] text-neutral">{PRICING.note}</p>
      <CtaLink href="/pricing" variant="secondary" className="mt-6 w-full sm:hidden">
        {PRICING.previewLink}
      </CtaLink>
    </Section>
  );
}

export function FounderNote() {
  return (
    <Section labelledBy="founder-heading" className="border-t border-border bg-charcoal">
      <div className="max-w-3xl">
        <h2 id="founder-heading" className="text-[1.875rem] font-semibold leading-[1.12] tracking-[-0.02em] text-off-white sm:text-[2.5rem]">
          {FOUNDER.heading}
        </h2>
        <figure className="mt-8 border-l-2 border-brass! pl-6">
          <blockquote className="text-[1.0625rem] leading-[1.7] text-off-white sm:text-lg">
            <p>{FOUNDER.body}</p>
          </blockquote>
          <figcaption className="mt-5 text-[0.9375rem] font-semibold text-off-white">{FOUNDER.attribution}</figcaption>
        </figure>
      </div>
    </Section>
  );
}

export function FaqList({ items = FAQS, headingId = "faq-heading" }: { items?: typeof FAQS; headingId?: string }) {
  return (
    <Section labelledBy={headingId}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <h2 id={headingId} className="text-[1.875rem] font-semibold leading-[1.12] tracking-[-0.02em] text-off-white sm:text-[2.5rem]">
          {FAQ_HEADING}
        </h2>
        <div className="divide-y divide-border-strong border-y border-border-strong">
          {items.map((item) => (
            <details key={item.q} className="group">
              <summary className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-[8px] py-4 text-[1.0625rem] font-semibold text-off-white [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}>
                {item.q}
                <span aria-hidden="true" className="relative h-4 w-4 shrink-0 before:absolute before:left-0 before:top-[7px] before:h-0.5 before:w-4 before:bg-current after:absolute after:left-[7px] after:top-0 after:h-4 after:w-0.5 after:bg-current group-open:after:hidden" />
              </summary>
              <p className="max-w-[65ch] pb-5 text-[0.9375rem] leading-relaxed text-neutral">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function PublicFooter({ betaLoginHref }: { betaLoginHref: string }) {
  const links = [
    { href: "/#product", label: NAV.product },
    { href: "/#how-it-works", label: NAV.howItWorks },
    { href: "/pricing", label: NAV.pricing },
    { href: "/privacy", label: NAV.privacy },
    { href: betaLoginHref, label: NAV.betaLogin },
  ];
  return (
    <footer className="border-t border-border bg-charcoal">
      <Container className="grid gap-8 py-12 sm:grid-cols-[1fr_auto]">
        <div>
          <OptimWordmark size={18} className="text-off-white" />
          <p className="mt-3 text-[0.9375rem] text-neutral">{FOOTER.tagline}</p>
          <p className="mt-1 text-[0.875rem] text-neutral">{FOOTER.stage}</p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-1">
            {links.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className={`inline-flex min-h-11 items-center rounded-[8px] text-[0.9375rem] text-neutral hover:text-off-white ${FOCUS_RING}`}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
      <Container className="border-t border-border py-5">
        <p className="text-[0.8125rem] text-neutral">© {new Date().getFullYear()} OPTIM</p>
      </Container>
    </footer>
  );
}
