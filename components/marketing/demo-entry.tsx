"use client";

// Demo mode only (see app/demo-entry/[area]/page.tsx). Waits for the demo
// stores to hydrate — so the provider's own bootstrap can't overwrite the
// choice afterwards — then selects the seeded demo coach or demo client
// through the provider's existing switches and replaces the URL.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { usePlatformState } from "@/hooks/use-platform-state";
import { CLIENT_PROFILE_DEMO } from "@/lib/tenancy/seed";
import { DEV_DEFAULT_COACH_USER_ID } from "@/lib/coach/dev-actions";

export function DemoEntry({ area }: { area: "coach" | "client" }) {
  const { isHydrated, setActiveClientId, setActiveCoachUserId } = usePrototypeState();
  const { isPlatformHydrated } = usePlatformState();
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !isHydrated || !isPlatformHydrated) return;
    done.current = true;
    if (area === "coach") {
      setActiveCoachUserId(DEV_DEFAULT_COACH_USER_ID);
      router.replace("/coach");
    } else {
      setActiveClientId(CLIENT_PROFILE_DEMO.id);
      router.replace("/today");
    }
  }, [area, isHydrated, isPlatformHydrated, setActiveClientId, setActiveCoachUserId, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <p className="text-sm text-neutral" role="status">
        Opening the {area === "coach" ? "coach" : "client"} demo…
      </p>
    </main>
  );
}
