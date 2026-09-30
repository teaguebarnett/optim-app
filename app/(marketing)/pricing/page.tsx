import type { Metadata } from "next";
import { Container } from "@/components/marketing/primitives";
import { FaqList } from "@/components/marketing/home-sections";
import { FoundingInterest, PricingCards, RequestSection } from "@/components/marketing/pricing-and-request";
import { FAQS, PRICING, PRICING_META } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: PRICING_META.title,
  description: PRICING_META.description,
};

// The pricing questions from the homepage FAQ: paying now, and trials.
const PRICING_FAQS = FAQS.filter((f) => f.q.startsWith("Can I sign up") || f.q.startsWith("Is there a free trial"));

export default function PricingPage() {
  return (
    <>
      <section aria-labelledby="pricing-heading" className="pb-16 pt-12 sm:pb-24 sm:pt-16">
        <Container>
          <div className="max-w-2xl">
            <h1 id="pricing-heading" className="text-[2.25rem] font-bold leading-[1.06] tracking-[-0.035em] text-off-white sm:text-[3.25rem]">
              {PRICING.heading}
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-neutral sm:text-lg">{PRICING.body}</p>
          </div>
          <div className="mt-12">
            <PricingCards requestPath="/pricing" />
          </div>
          <FoundingInterest requestPath="/pricing" />
        </Container>
      </section>
      <FaqList items={PRICING_FAQS} headingId="pricing-faq-heading" />
      <RequestSection />
    </>
  );
}
