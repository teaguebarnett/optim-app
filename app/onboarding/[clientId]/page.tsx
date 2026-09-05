"use client";

import { useParams } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default function OnboardingPage() {
  const params = useParams<{ clientId: string }>();
  return <OnboardingWizard clientId={params.clientId} />;
}
