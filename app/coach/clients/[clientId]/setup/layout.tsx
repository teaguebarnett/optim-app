import type { ReactNode } from "react";
import { DemoOnlyRoute } from "@/components/coach/demo-only-route";

// Demo-only screen — not found in the live product (see DemoOnlyRoute).
export default function DemoOnlyLayout({ children }: { children: ReactNode }) {
  return <DemoOnlyRoute>{children}</DemoOnlyRoute>;
}
