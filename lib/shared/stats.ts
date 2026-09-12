// Phase 6.1A — Secure Founder Command Center.
//
// One tiny, framework-independent numeric helper — pulled out of
// lib/production/platform-operations.ts (which is "server-only" end to end
// and cannot be unit-tested directly outside a Next.js request context, per
// lib/production/repository.ts's own established precedent) so the one
// genuinely pure piece of math the AI-operations latency metric depends on
// is independently testable. See lib/shared/verify-stats.mts.

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
