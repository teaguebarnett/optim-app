// Public homepage. Two compositions from one page:
// - 768px and up: the approved desktop sections (home-sections.tsx).
// - Below 768px: a phone-first composition (mobile-sections.tsx) — one idea
//   and at most one real still per section, secondary detail behind
//   disclosures. Hero, pricing, FAQ, and the beta form are shared (they're
//   responsive on their own).
// Section anchors (#how-it-works, #product) sit on wrappers so they work at
// every width without duplicate ids.

import type { Metadata } from "next";
import { AttentionSection, ClientSection, FaqList, FounderNote, Hero, MethodSection, PricePreview, SetupSteps, WorkflowDemo } from "@/components/marketing/home-sections";
import { MobileClient, MobileCoachControl, MobileFounder, MobileHowItWorks } from "@/components/marketing/mobile-sections";
import { RequestSection } from "@/components/marketing/pricing-and-request";
import { HOME_META } from "@/lib/marketing/content";
import { publicAuthLinks } from "@/lib/marketing/auth-links";

export const metadata: Metadata = {
  title: HOME_META.title,
  description: HOME_META.description,
};

export default function HomePage() {
  const { betaLoginHref } = publicAuthLinks();
  return (
    <>
      <Hero />
      <div id="how-it-works" className="scroll-mt-6">
        <div className="hidden md:block">
          <WorkflowDemo />
        </div>
        <MobileHowItWorks />
      </div>
      <div id="product" className="scroll-mt-6">
        <div className="hidden md:block">
          <MethodSection />
          <AttentionSection />
        </div>
        <MobileCoachControl />
      </div>
      <div className="hidden md:block">
        <ClientSection betaLoginHref={betaLoginHref} />
        <SetupSteps />
      </div>
      <MobileClient betaLoginHref={betaLoginHref} />
      <PricePreview />
      <div className="hidden md:block">
        <FounderNote />
      </div>
      <MobileFounder />
      <FaqList />
      <RequestSection />
    </>
  );
}
