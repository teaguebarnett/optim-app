import { useId } from "react";

// Phase 13A.1 correction — the primary OPTIM brand lockup, traced directly
// from the canonical reference (docs/design/brand/optim-logo-reference.png)
// rather than approximated with a system font. Every coordinate below came
// from sampling that PNG on a canvas (per-column dark/light boundary scans
// for P/T/I/M, and the same ring measurement technique optim-mark.tsx's own
// doc describes for O, rescaled to this instance's actual size/position) —
// not eyeballed. This is the one canonical full-wordmark implementation;
// every place "OPTIM" appears as a lockup should use this component rather
// than typing the word in a UI font. For compact/icon-only contexts, use
// the separate OptimMark (the O alone) from optim-mark.tsx instead.
//
// Color always comes from the wrapping element's `color` (via `className`,
// e.g. text-off-white on a Midnight Navy shell) — every shape below fills
// with currentColor, so the mark and letters are always one solid color,
// never an accent-tinted icon next to plain text.
//
// Coordinate space: the raw pixel coordinates measured on the source PNG,
// used directly as the viewBox — this preserves the reference's real
// proportions and inter-letter spacing exactly, with no re-kerning.
export function OptimWordmark({ size = 22, className }: { size?: number; className?: string }) {
  const maskId = useId();
  const oMaskId = `${maskId}-o`;
  const pMaskId = `${maskId}-p`;
  // Measured cap-height is 196 (y 189-385); viewBox height 270 scales a
  // 196-tall cap to `size`.
  const scale = size / 270;
  return (
    <svg
      width={1160 * scale}
      height={size}
      viewBox="270 160 1160 270"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* O — same ring geometry as OptimMark (r/R ≈ 0.649, two straight
          parallel-edged cuts at ~135°, 1 o'clock / 7 o'clock), rescaled to
          this instance's measured center (408.5, 293.5) and radius 127.5. */}
      <mask id={oMaskId} maskUnits="userSpaceOnUse" x="270" y="160" width="285" height="270">
        <circle cx="408.5" cy="293.5" r="105.1" stroke="white" strokeWidth="44.75" fill="none" />
        <rect x="311" y="196.6" width="300" height="11.8" fill="black" transform="translate(461.05 202.48) rotate(135)" />
        <rect x="311" y="196.6" width="300" height="11.8" fill="black" transform="translate(355.95 384.52) rotate(135)" />
      </mask>
      <rect x="270" y="160" width="285" height="270" fill="currentColor" mask={`url(#${oMaskId})`} />

      {/* P — stem + bowl (mask-cut counter), measured from x:[569,805]. */}
      <mask id={pMaskId} maskUnits="userSpaceOnUse" x="560" y="180" width="260" height="215">
        <path
          d="M569,189 L749,189 A56,65.5 0 0 1 749,320 L619,320 L619,385 L569,385 Z M617,189 L617,385 L569,385 L569,189 Z"
          fill="white"
          fillRule="evenodd"
        />
        <rect x="619" y="234" width="128" height="44" rx="10" fill="black" />
      </mask>
      <rect x="560" y="180" width="260" height="215" fill="currentColor" mask={`url(#${pMaskId})`} />

      {/* T — chamfered crossbar (tapered, not a plain rectangle) + stem. */}
      <path d="M814,190 L1041,190 L952,234 L844,234 Z" fill="currentColor" />
      <rect x="904" y="234" width="44" height="151" fill="currentColor" />

      {/* I */}
      <rect x="1061" y="189" width="48" height="196" rx="8" fill="currentColor" />

      {/* M — two stems joined by an open chevron band (not a solid
          triangle) — the reference's M never reaches the baseline in the
          middle. */}
      <path
        d="M1138,189 L1190,189 L1279,282 L1366,189 L1417,189 L1417,385 L1366,385 L1366,264 L1279,342 L1190,264 L1190,385 L1138,385 Z"
        fill="currentColor"
      />
    </svg>
  );
}
