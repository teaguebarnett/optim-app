import { useId } from "react";

// Phase 13A correction — replaces the earlier approximated ring (a plain
// stroke-dasharray gap, radial-edged) with the canonical mark from
// docs/design/brand/optim-logo-reference.png, the fixed brand asset. This
// is the ONE reusable implementation; every place the mark appears must
// import this component rather than hand-building an approximation.
//
// The reference was measured directly (pixel-sampled outer/inner radius,
// and both edges of each cut at three different radii, fit to lines) —
// not eyeballed — which is how these specific numbers were derived:
//   - ring: outer/inner radius ratio ≈ 25.3/39 (a bold ~35%-of-radius band)
//   - each cut is a straight-edged parallel strip (not a radial wedge) at
//     a ~135°/-45° angle, centered at the 1 o'clock (upper-right) and,
//     by exact 180° point symmetry, 7 o'clock (lower-left) positions
//   - the strip's own width is ~26% of the ring's band width
// Do not "simplify" this back to a stroke-dasharray ring — that produces
// radial-edged gaps, which is a visibly different (and incorrect) shape.
export function OptimMark({ size = 28, className }: { size?: number; className?: string }) {
  const maskId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <circle cx="50" cy="50" r="32.15" stroke="white" strokeWidth="13.7" fill="none" />
        <rect x="-40" y="-1.8" width="80" height="3.6" fill="black" transform="translate(66.075 22.157) rotate(135)" />
        <rect x="-40" y="-1.8" width="80" height="3.6" fill="black" transform="translate(33.925 77.843) rotate(135)" />
      </mask>
      <rect x="0" y="0" width="100" height="100" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}
