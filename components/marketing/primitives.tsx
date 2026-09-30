// Shared building blocks for the public website: section container and
// heading, call-to-action links, and a captioned product still. Kept here so
// every section uses one type scale, one spacing rhythm, and one CTA style.

import Link from "next/link";
import { getImageProps } from "next/image";
import type { ReactNode } from "react";

export const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

/** One public-page section. `id` makes it a navigation target. */
export function Section({ id, children, className = "", labelledBy }: { id?: string; children: ReactNode; className?: string; labelledBy: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`scroll-mt-6 py-16 sm:py-24 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeading({ id, heading, body, tone = "light", className = "" }: { id: string; heading: string; body?: string; tone?: "light" | "navy"; className?: string }) {
  return (
    <div className={`max-w-2xl ${className}`}>
      <h2 id={id} className={`text-[1.875rem] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[2.5rem] ${tone === "navy" ? "text-navy-ink" : "text-off-white"}`}>
        {heading}
      </h2>
      {body ? <p className={`mt-4 text-[1.0625rem] leading-relaxed sm:text-lg ${tone === "navy" ? "text-navy-ink-muted" : "text-neutral"}`}>{body}</p> : null}
    </div>
  );
}

const CTA_BASE = `inline-flex min-h-11 items-center justify-center rounded-[12px] px-5 text-[0.9375rem] font-semibold transition-colors ${FOCUS_RING}`;

export function CtaLink({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "quiet"; className?: string }) {
  const style =
    variant === "primary"
      ? "bg-accent text-on-accent hover:bg-accent-strong"
      : variant === "secondary"
        ? "border border-border-strong bg-charcoal text-off-white hover:border-off-white/40"
        : "text-accent-fg underline-offset-4 hover:underline";
  return (
    <Link href={href} className={`${CTA_BASE} ${style} ${className}`}>
      {children}
    </Link>
  );
}

interface StillSource {
  src: string;
  width: number;
  height: number;
}

/** A real still from the current beta interface. Phone widths get a tighter,
 * readable crop instead of a scaled-down desktop view. Always captioned. */
export function ProductStill({
  desktop,
  phone,
  alt,
  caption,
  sizes,
  priority = false,
  tone = "light",
  className = "",
}: {
  desktop: StillSource;
  phone?: StillSource;
  alt: string;
  caption: string;
  sizes: string;
  priority?: boolean;
  tone?: "light" | "navy";
  className?: string;
}) {
  const common = { alt, sizes, priority };
  const { props: desktopProps } = getImageProps({ ...common, ...desktop });
  const phoneSrcSet = phone ? getImageProps({ ...common, ...phone }).props.srcSet : null;
  const { srcSet: desktopSrcSet, ...imgProps } = desktopProps;

  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-[14px] border border-border-strong bg-charcoal shadow-[0_1px_2px_rgba(7,26,52,0.06),0_12px_32px_-12px_rgba(7,26,52,0.18)]">
        <picture>
          {phone && phoneSrcSet ? <source media="(max-width: 639px)" srcSet={phoneSrcSet} /> : null}
          <source media={phone ? "(min-width: 640px)" : "all"} srcSet={desktopSrcSet} />
          {/* eslint-disable-next-line jsx-a11y/alt-text -- alt is in imgProps */}
          <img {...imgProps} className="block h-auto w-full" />
        </picture>
      </div>
      <figcaption className={`mt-3 text-[0.8125rem] leading-snug ${tone === "navy" ? "text-navy-ink-muted" : "text-neutral"}`}>{caption}</figcaption>
    </figure>
  );
}
