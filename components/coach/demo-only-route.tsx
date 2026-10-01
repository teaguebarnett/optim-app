// Gate 2 — guards the coach routes that exist only as demo-prototype
// screens (they read the browser-local demo state, with no Supabase
// implementation behind them): /coach/reviews, /coach/messages,
// /coach/library, /coach/meals, /coach/programs, and the demo client
// setup/activate flows. The live coach navigation never links to them; this
// also stops a typed or stale URL from opening a non-real experience in the
// live product. Demo mode is untouched — this renders children unchanged.

import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { resolveAppMode } from "@/lib/production/mode";

export function DemoOnlyRoute({ children }: { children: ReactNode }) {
  if (resolveAppMode() === "supabase") notFound();
  return children;
}
