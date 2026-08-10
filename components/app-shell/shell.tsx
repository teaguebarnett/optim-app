import type { ReactNode } from "react";
import { Header } from "@/components/app-shell/header";
import { BottomNav } from "@/components/app-shell/bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-near-black">
      <Header />
      <main className="mx-auto w-full max-w-lg flex-1 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
