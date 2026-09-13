import { notFound } from "next/navigation";
import { ClientStateDevPanel } from "@/components/dev/client-state-dev-panel";

/**
 * Phase 9D — the internal/QA surface spec section 32 asks for: "no full
 * product UI is required, a developer/test-accessible shadow output is
 * sufficient." Never rendered in a production build (same gate as
 * app/dev/page.tsx) — this check runs on the server before
 * ClientStateDevPanel's client bundle is ever reached.
 *
 * Even here, calling the underlying analyzeClientStateAction still
 * requires a real, authenticated, assigned coach session
 * (requireAssignedCoachAuthority) — this page is a QA convenience for
 * finding the client id and viewing the output, never an authorization
 * bypass.
 */
export default function ClientStateDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ClientStateDevPanel />;
}
