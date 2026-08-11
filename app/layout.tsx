import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PrototypeStateProvider } from "@/hooks/use-prototype-state";
import { AppShell } from "@/components/app-shell/shell";
import { COACH_PROFILE_TEAGUE, WORKSPACE_OPTIM } from "@/lib/tenancy/seed";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Static route metadata is resolved at build/module-load time, outside the
// React tree, so it can't go through useActiveContext() — it still reads
// from the same centralized tenancy seed data rather than a separate
// hardcoded string.
export const metadata: Metadata = {
  title: WORKSPACE_OPTIM.branding.businessName,
  description: `Your daily coaching plan from ${COACH_PROFILE_TEAGUE.displayName} — training, nutrition, and progress in one place.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#111111",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-near-black text-off-white antialiased">
        <PrototypeStateProvider>
          <AppShell>{children}</AppShell>
        </PrototypeStateProvider>
      </body>
    </html>
  );
}
