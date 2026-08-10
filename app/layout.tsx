import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PrototypeStateProvider } from "@/hooks/use-prototype-state";
import { AppShell } from "@/components/app-shell/shell";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OPTIM",
  description: "Your daily coaching plan from Teague — training, nutrition, and progress in one place.",
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
