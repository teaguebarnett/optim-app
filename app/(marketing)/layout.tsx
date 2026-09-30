// Public website layout (/ and /pricing). Renders inside the root layout like
// every other route; adds only the public header and footer. It grants no
// access: /coach, /admin, and the client app keep their own server-side
// layout gates, unchanged.
//
// Returning coaches and clients go straight to the one existing sign-in page
// with a destination hint; that page sends an already-signed-in visitor to
// their own authorized destination (app/auth/sign-in/page.tsx). Demo mode
// has no sign-in, so there the links open the demo coach/client views.

import type { ReactNode } from "react";
import { PublicHeader } from "@/components/marketing/public-header";
import { PublicFooter } from "@/components/marketing/home-sections";
import { publicAuthLinks } from "@/lib/marketing/auth-links";

export default function PublicLayout({ children }: { children: ReactNode }) {
  const links = publicAuthLinks();
  return (
    <div className="flex min-h-screen flex-col bg-near-black text-off-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[10px] focus:bg-charcoal focus:px-4 focus:py-3 focus:text-off-white">
        Skip to content
      </a>
      <PublicHeader {...links} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <PublicFooter {...links} />
    </div>
  );
}
