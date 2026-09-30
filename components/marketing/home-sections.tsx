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
  calibrationPhone: { src: "/marketing/calibration-phone.webp", width: 545, height: 600 },
  attentionDesktop: { src: "/marketing/coach-attention-neutral-v2-desktop.webp", width: 1600, height: 311 },
  attentionPhone: { src: "/marketing/coach-attention-neutral-v2-phone.webp", width: 780, height: 880 },
};

export function Hero() {
  const [first, ...rest] = HERO.heading.split(". ");
  return (
    <section aria-labelledby="hero-heading" className="pb-16 pt-10 sm:pb-24 sm:pt-16">
      <Container className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
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
          alt="OPTIM client Today screen: a greeting, the day's fuel targets, a prompt to enter training time, a morning weight check-in, and day progress."
          caption={STILLS.clientToday}
          sizes="(min-width: 1024px) 340px, 300px"
          priority
          className="w-full max-w-[300px] lg:ml-auto lg:max-w-[340px]"
        />
      </Container>
    </section>
  );
}

export function WorkflowDemo() {
  return (
    <Section id="how-it-works" labelledBy="demo-heading" className="border-t border-border bg-charcoal">
      <SectionHeading id="demo-heading" heading={DEMO.heading} body={DEMO.body} />
      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <ol className="space-y-6">
          {DEMO.steps.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-4">
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-[0.875rem] font-semibold text-off-white">
                {i + 1}
              </span>
              <div>
                <h3 className="text-[1.0625rem] font-semibold text-off-white">{step.title}</h3>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-neutral">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <ProductStill
          desktop={STILL.calibrationDesktop}
          phone={STILL.calibrationPhone}
          alt="OPTIM coach calibration survey: chapters from your coaching practice through reviewing your coaching model, with the first question, Who do you typically coach?, and options such as general population, strength athletes, and endurance athletes."
          caption={STILLS.calibration}
          sizes="(min-width: 1024px) 680px, 100vw"
        />
      </div>
    </Section>
  );
}

export function MethodSection() {
  return (
    <Section id="product" labelledBy="method-heading">
      <SectionHeading id="method-heading" heading={METHOD.heading} body={METHOD.body} />
      <dl className="mt-12 grid gap-8 sm:grid-cols-3">
        {METHOD.labels.map((item) => (
          <div key={item.title} className="border-t-2 border-border-strong pt-4">
            <dt className="text-lg font-semibold text-off-white">{item.title}</dt>
            <dd className="mt-2 text-[0.9375rem] leading-relaxed text-neutral">{item.body}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-12 max-w-2xl text-[1.0625rem] leading-relaxed text-off-white">{METHOD.authority}</p>
    </Section>
  );
}

export function AttentionSection() {
  return (
    <section aria-labelledby="attention-heading" className="bg-navy py-16 sm:py-24">
      <Container>
        <SectionHeading id="attention-heading" heading={ATTENTION.heading} body={ATTENTION.body} tone="navy" />
        <dl className="mt-12 grid gap-8 sm:grid-cols-3">
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
          className="mt-12"
        />
      </Container>
    </section>
  );
}

export function ClientSection({ betaLoginHref }: { betaLoginHref: string }) {
  return (
    <Section labelledBy="client-heading">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading id="client-heading" heading={CLIENT.heading} body={CLIENT.body} />
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <p className="text-[0.9375rem] text-off-white">{CLIENT.entryLine}</p>
            <CtaLink href={betaLoginHref} variant="quiet" className="px-0">
              {CLIENT.button}
            </CtaLink>
          </div>
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
      <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {SETUP.steps.map((step, i) => (
          <li key={step.title}>
            <p aria-hidden="true" className="text-[2rem] font-semibold leading-none tracking-[-0.03em] text-accent-fg">
              {i + 1}
            </p>
            <h3 className="mt-4 text-[1.0625rem] font-semibold text-off-white">{step.title}</h3>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-neutral">{step.body}</p>
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
        <CtaLink href="/pricing" variant="secondary">
          {PRICING.previewLink}
        </CtaLink>
      </div>
      <ul className="mt-12 grid overflow-hidden rounded-[14px] border border-border-strong sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <li key={plan.id} className="border-border-strong bg-charcoal p-6 [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-b-0 lg:[&:not(:last-child)]:border-r">
            <p className="text-[1.0625rem] font-semibold text-off-white">{plan.name}</p>
            <p className="mt-1 text-[0.875rem] text-neutral">{plan.clients}</p>
            <p className="mt-5 text-off-white">
              {plan.priceUsdMonthly === null ? (
                <span className="text-xl font-semibold">{PRICING.customPrice}</span>
              ) : (
                <>
                  <span className="text-[2rem] font-semibold tracking-[-0.03em]">${plan.priceUsdMonthly}</span>
                  <span className="text-[0.9375rem] text-neutral">{PRICING.perMonth}</span>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.875rem] text-neutral">{PRICING.note}</p>
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
