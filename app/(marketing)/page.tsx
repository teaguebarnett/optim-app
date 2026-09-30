// Public homepage. Replaces the old bare redirect to /today; the client app
// itself is unchanged and still reached through OPTIM for Clients.

import type { Metadata } from "next";
import { AttentionSection, ClientSection, FaqList, FounderNote, Hero, MethodSection, PricePreview, SetupSteps, WorkflowDemo } from "@/components/marketing/home-sections";
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
      <WorkflowDemo />
      <MethodSection />
      <AttentionSection />
      <ClientSection betaLoginHref={betaLoginHref} />
      <SetupSteps />
      <PricePreview />
      <FounderNote />
      <FaqList />
      <RequestSection />
    </>
  );
}
