import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local Supabase's site_url/additional_redirect_urls (supabase/config.toml)
  // are pinned to 127.0.0.1 — GoTrue silently drops any invite/magic-link
  // redirectTo that doesn't match, degrading the link (confirmed live). That
  // forces browsing this app via 127.0.0.1:3000 too, once a session cookie
  // is set from an accepted invite link. Without this, Next's dev-only
  // cross-origin asset guard blocks every request from that origin,
  // silently failing client hydration app-wide (every onClick/onSubmit
  // inert, no console error) — confirmed live via PILOT_RUNBOOK.md §13.
  // Dev-only; has no effect on `next build`/`next start`.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
