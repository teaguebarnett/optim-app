"use client";

// Phase 6.0D-A — a graceful, on-brand fallback for /coach and its children
// (including a form action defined inside app/coach/page.tsx or
// app/coach/escalations/page.tsx — error.js DOES wrap a segment's own
// page.js, just not that segment's layout.js; see app/coach/layout.tsx's
// own doc for that distinction). Without this, an authorization failure
// mid-session (a session that got revoked or switched between page load and
// a button click, for example) crashed to Next's raw generic error page —
// "no data exposure" was still true (the crash page shows nothing real
// either way), but this replaces it with an honest, recoverable state
// instead, matching "provide intentional loading, empty, error, and success
// states." In production, `error.message` is redacted to a generic string
// by Next.js itself (see the error.js file-convention doc's own "avoid
// leaking potentially sensitive details" note), so this never tries to
// distinguish error types from the message — it just offers a safe retry
// and a way back to a known-good page.

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function CoachError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-charcoal p-8 text-center shadow-[var(--shadow-subtle)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-neutral">
          <AlertTriangle size={20} aria-hidden="true" />
        </span>
        <p className="text-subheading text-off-white">Something went wrong</p>
        <p className="text-meta text-neutral">This page couldn&apos;t complete that action. Your data is safe — nothing was shown that shouldn&apos;t be.</p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => reset()}
            className="inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-strong"
          >
            Try again
          </button>
          <Link
            href="/coach"
            className="inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] border border-border-strong px-4 text-sm font-medium text-off-white transition-colors hover:border-accent/50"
          >
            Back to Command Center
          </Link>
        </div>
      </div>
    </div>
  );
}
