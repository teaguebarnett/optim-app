// Phase 13A.1 second correction — the wordmark is now a source-derived
// asset, not hand-drawn SVG paths. The earlier per-glyph SVG
// reconstruction (measuring a handful of feature points per letter and
// approximating with arcs/polygons) produced a P that read as flattened
// and an O that lost its cuts at real header size — an approximation is
// still an approximation no matter how carefully measured.
//
// public/brand/optim-wordmark-mask.png is instead a literal pixel
// extraction from the canonical reference
// (docs/design/brand/optim-logo-reference.png, left untouched on disk):
// every pixel in the wordmark's tight bounding box was converted to an
// alpha value by a linear ramp between the reference's own measured
// background luminance and ink luminance (so antialiased edges stay
// antialiased, not hard-thresholded), producing a transparent PNG whose
// alpha channel IS the source silhouette — same aspect ratio (1145:262,
// this component's own `aspectRatio` below), same proportions, same
// inter-glyph spacing as the source, because it IS the source's own
// pixels, not a redrawing of them.
//
// That mask drives a CSS mask-image (+ -webkit-mask-image for Safari)
// over a currentColor fill, exactly like optim-mark.tsx's SVG mask
// technique — one silhouette, recolored per surface by the caller's
// className (text-off-white on dark, a navy-ink class on light), never
// baked into the asset itself. For compact/icon-only contexts, use the
// separate OptimMark (the O alone, still SVG-based — untouched by this
// change) from optim-mark.tsx instead.
const ASPECT_RATIO = 1145 / 262;

export function OptimWordmark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="OPTIM"
      className={className}
      style={{
        display: "inline-block",
        width: size * ASPECT_RATIO,
        height: size,
        backgroundColor: "currentColor",
        WebkitMaskImage: "url(/brand/optim-wordmark-mask.png)",
        maskImage: "url(/brand/optim-wordmark-mask.png)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}
