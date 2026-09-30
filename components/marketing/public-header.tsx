"use client";

// Public header (pre-launch). "Request beta access" is the one primary
// action. Current beta testers keep a quiet "Beta login" that opens the
// existing sign-in; their own account role decides whether they land on
// /coach or /today. On phones the header is just those two actions; from
// 640px to 1024px Product / How it works / Pricing / Beta login sit in a
// disclosure menu. No Admin link: /admin is protected by
// its own server-side layout, not by being unlisted. Not sticky, so it can
// never cover content or a focused control.

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

export function PublicHeader({ betaLoginHref }: { betaLoginHref: string }) {
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

  return (
    <header className="border-b border-border bg-charcoal/80">
      <Container className="flex min-h-16 items-center gap-2 py-2 sm:gap-3">
        <Link href="/" aria-label="OPTIM home" className={`mr-auto inline-flex min-h-11 shrink-0 lg:mr-2 items-center rounded-[8px] text-off-white ${FOCUS_RING}`}>
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

        <div className="flex items-center gap-1.5 sm:gap-2 lg:ml-auto">
          {/* Phones (below 640px) get just the two actions — Beta login and the
              primary request — with no menu; the page itself is the navigation. */}
          <Link href={betaLoginHref} className={`hidden min-h-11 items-center whitespace-nowrap rounded-[10px] px-1.5 text-[0.875rem] font-medium text-neutral hover:text-off-white min-[375px]:inline-flex sm:hidden lg:inline-flex lg:px-3 ${FOCUS_RING}`}>
            {NAV.betaLogin}
          </Link>
          <CtaLink href="/#request" className="whitespace-nowrap px-3! text-[0.8125rem]! sm:px-5! sm:text-[0.9375rem]!">
            {NAV.requestAccess}
          </CtaLink>
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls="public-menu"
            onClick={() => setOpen((v) => !v)}
            className={`hidden h-11 w-11 items-center justify-center rounded-[12px] border border-border-strong text-off-white sm:inline-flex lg:hidden ${FOCUS_RING}`}
          >
            {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            <span className="sr-only">{NAV.menu}</span>
          </button>
        </div>
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
            <li className="mt-1 border-t border-border pt-1">
              <Link href={betaLoginHref} onClick={() => setOpen(false)} className={`flex min-h-11 items-center rounded-[10px] px-2 text-base font-medium text-neutral ${FOCUS_RING}`}>
                {NAV.betaLogin}
              </Link>
            </li>
          </ul>
        </Container>
      </nav>
    </header>
  );
}
