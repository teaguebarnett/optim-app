// Public privacy notice for the pre-launch website and beta list. Factual
// and limited to what this site actually does — keep it in step with
// lib/marketing/lead-store.ts (BETA_CONSENT_TEXT) and the beta form.

import type { Metadata } from "next";
import { Container } from "@/components/marketing/primitives";

export const metadata: Metadata = {
  title: "Privacy | OPTIM",
  description: "How OPTIM handles the information you share when you join the beta list.",
};

const CONTACT = "privacy@useoptim.ai";

function Block({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-[-0.01em] text-off-white">{heading}</h2>
      <div className="mt-3 space-y-3 text-[1.0625rem] leading-relaxed text-neutral">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <section aria-labelledby="privacy-heading" className="pb-20 pt-12 sm:pt-16">
      <Container>
        <div className="max-w-2xl">
          <h1 id="privacy-heading" className="text-[2.25rem] font-bold leading-[1.06] tracking-[-0.035em] text-off-white sm:text-[3rem]">
            Privacy
          </h1>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-neutral">
            This notice covers the public OPTIM website and the OPTIM beta list. Last updated September 30, 2026.
          </p>

          <Block heading="What we collect">
            <p>When you request beta access, we collect your first name, your email address, roughly how many active clients you coach, and, if you choose to share it, your Instagram handle or website. We also record when you sent the request and the notice shown on the form.</p>
            <p>Requesting beta access does not create an OPTIM account, and no payment information is collected.</p>
          </Block>

          <Block heading="How we use it">
            <p>We use your email to contact you about OPTIM beta access and OPTIM’s launch. Your client count and link help us understand whether OPTIM fits your coaching practice.</p>
            <p>We don’t sell your information, and we don’t share it for advertising.</p>
          </Block>

          <Block heading="Where it’s stored">
            <p>Beta requests are stored in OPTIM’s database, hosted by Supabase. The website is hosted by Vercel.</p>
          </Block>

          <Block heading="Cookies and tracking">
            <p>The public website does not use advertising or analytics tracking. If you’re already in the beta and sign in, OPTIM uses essential cookies to keep you signed in.</p>
          </Block>

          <Block heading="How long we keep it">
            <p>We keep your beta request until you ask us to remove it, or until it’s no longer needed to contact you about OPTIM’s beta and launch.</p>
          </Block>

          <Block heading="Your choices">
            <p>
              To see, correct, or delete your information, or to stop hearing from us, email{" "}
              <a href={`mailto:${CONTACT}`} className="font-semibold text-accent-fg underline underline-offset-4">
                {CONTACT}
              </a>
              .
            </p>
          </Block>
        </div>
      </Container>
    </section>
  );
}
