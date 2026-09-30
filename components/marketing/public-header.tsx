"use client";

// Public header. Coach login and OPTIM for Clients stay visible at every
// width (a compact second row on phones) and go straight to the existing
// sign-in — never through a marketing detour. Product / How it works /
// Pricing sit in a disclosure menu on small screens. No Admin link: /admin
// is protected by its own server-side layout, not by being unlisted.
// Not sticky, so it can never cover content or a focused control.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { OptimWordmark } from "@/components/brand/optim-wordmark";
import { NAV } from "@/lib/marketing/content";
import { Container, CtaLink, FOCUS_RING } from "@/components/marketing/primitives";

const SECONDARY = [
  { href: "/#product", label: NAV.product },
  { href: "/#how-it-works", label: NAV.howItWorks },
  { href: "/pricing", label: NAV.pricing },
];

export function PublicHeader({ coachLoginHref, clientLoginHref }: { coachLoginHref: string; clientLoginHref: string }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const loginLink = `inline-flex min-h-11 items-center justify-center rounded-[12px] px-3 text-[0.9375rem] font-semibold text-off-white hover:bg-off-white/[0.05] ${FOCUS_RING}`;

  return (
    <header className="border-b border-border bg-charcoal/80">
      <Container className="flex min-h-16 items-center gap-3 py-2">
        <Link href="/" aria-label="OPTIM home" className={`mr-2 inline-flex min-h-11 items-center rounded-[8px] text-off-white ${FOCUS_RING}`}>
          <OptimWordmark size={20} />
        </Link>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {SECONDARY.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={`inline-flex min-h-11 items-center rounded-[10px] px-3 text-[0.9375rem] font-medium text-neutral hover:text-off-white ${FOCUS_RING}`}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <div className="hidden items-center gap-1 sm:flex">
            <Link href={coachLoginHref} className={loginLink}>
              {NAV.coachLogin}
            </Link>
            <Link href={clientLoginHref} className={loginLink}>
              {NAV.clientLogin}
            </Link>
          </div>
          {/* Visibility on a wrapper: CtaLink's own display class would win over a
              competing `hidden` on the link itself. Below 400px it's in the menu. */}
          <span className="ml-1 hidden min-[400px]:block">
            <CtaLink href="/#request" className="whitespace-nowrap">
              {NAV.requestAccess}
            </CtaLink>
          </span>
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls="public-menu"
            onClick={() => setOpen((v) => !v)}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-border-strong text-off-white lg:hidden ${FOCUS_RING}`}
          >
            {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            <span className="sr-only">{NAV.menu}</span>
          </button>
        </div>
      </Container>

      {/* Phone second row: returning coaches and clients reach sign-in in one tap. */}
      <Container className="grid grid-cols-2 gap-2 pb-2 sm:hidden">
        <Link href={coachLoginHref} className={`${loginLink} whitespace-nowrap border border-border-strong px-2! text-[0.875rem] max-[359px]:text-[0.8125rem]`}>
          {NAV.coachLogin}
        </Link>
        <Link href={clientLoginHref} className={`${loginLink} whitespace-nowrap border border-border-strong px-2! text-[0.875rem] max-[359px]:text-[0.8125rem]`}>
          {NAV.clientLogin}
        </Link>
      </Container>

      <nav id="public-menu" aria-label="Site" hidden={!open} className="border-t border-border lg:hidden">
        <Container className="py-2">
          <ul>
            {SECONDARY.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={() => setOpen(false)} className={`flex min-h-11 items-center rounded-[10px] px-2 text-base font-medium text-off-white ${FOCUS_RING}`}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="min-[400px]:hidden">
              <Link href="/#request" onClick={() => setOpen(false)} className={`flex min-h-11 items-center rounded-[10px] px-2 text-base font-semibold text-accent-fg ${FOCUS_RING}`}>
                {NAV.requestAccess}
              </Link>
            </li>
          </ul>
        </Container>
      </nav>
    </header>
  );
}
