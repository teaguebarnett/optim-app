import type { ReactNode } from "react";
import { CoachShell } from "@/components/coach/coach-shell";

export default function CoachLayout({ children }: { children: ReactNode }) {
  return <CoachShell>{children}</CoachShell>;
}
