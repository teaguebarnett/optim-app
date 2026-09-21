"use client";

import { useRouter } from "next/navigation";
import { UserPlus, Upload, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";

interface AddClientEntrySheetProps {
  open: boolean;
  onClose: () => void;
  onStartNewClient: () => void;
}

/**
 * Gate 6A — the canonical "Add client" entry: exactly two choices, never a
 * form pre-filled with assumptions about which one the coach meant. Chosen
 * over a dropdown/menu because both paths are equally real and equally
 * first-class — a menu would visually subordinate one to the other, and
 * "Import" is not a secondary/advanced option, it's the other reason a
 * coach opens this at all.
 *
 * Shared verbatim by both real entry points — components/coach/demo-
 * clients-page.tsx (demo mode) and components/coach/invite-client-
 * trigger.tsx (Supabase mode) — so "Add client" reads as one canonical
 * product decision, never two coincidentally similar screens that could
 * drift apart. `onStartNewClient` is the only seam: each caller passes
 * its own callback to open ITS OWN unchanged single-client form —
 * components/coach/add-client-sheet.tsx (demo, real ClientProfile +
 * invitation link) or components/coach/invite-client-sheet.tsx (Supabase,
 * real client_profiles + coach_client_assignments + client_enrollments row
 * and a real Auth invitation email) — this component never knows or cares
 * which. "Import existing client(s)" navigates to /coach/clients/import,
 * the same one real (never invitation- or activation-triggering) page for
 * both modes — never a per-mode duplicate. Gate 6B built the real,
 * workspace-bound staging flow there (upload, review, correct); review
 * and correction are staging-scoped only — activation is still a later
 * gate's work (see lib/production/imports.ts's own doc). Neither choice
 * here creates, invites, or activates anything by itself — this sheet
 * only routes.
 */
export function AddClientEntrySheet({ open, onClose, onStartNewClient }: AddClientEntrySheetProps) {
  const router = useRouter();

  function chooseNewClient() {
    onClose();
    onStartNewClient();
  }

  function chooseImport() {
    onClose();
    router.push("/coach/clients/import");
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add client" description="Two ways to bring a client into this workspace.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={chooseNewClient}
          className="group flex flex-col items-start gap-3 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-4 text-left transition-colors hover:border-accent/50"
          style={{ transitionDuration: "var(--motion-fast)" }}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
            <UserPlus size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="flex items-center gap-1 text-sm font-semibold text-off-white">
              Start with a new client
              <ChevronRight size={15} className="text-neutral transition-transform group-hover:translate-x-0.5" style={{ transitionDuration: "var(--motion-fast)" }} />
            </span>
            <span className="mt-1 block text-meta text-neutral">Creates a client record and their invitation link.</span>
          </span>
        </button>

        <button
          type="button"
          onClick={chooseImport}
          className="group flex flex-col items-start gap-3 rounded-[var(--radius-md)] border border-border-strong bg-surface-raised p-4 text-left transition-colors hover:border-accent/50"
          style={{ transitionDuration: "var(--motion-fast)" }}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-fg">
            <Upload size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="flex items-center gap-1 text-sm font-semibold text-off-white">
              Import existing client(s)
              <ChevronRight size={15} className="text-neutral transition-transform group-hover:translate-x-0.5" style={{ transitionDuration: "var(--motion-fast)" }} />
            </span>
            <span className="mt-1 block text-meta text-neutral">Bring over clients you&apos;re already coaching elsewhere.</span>
          </span>
        </button>
      </div>
    </Sheet>
  );
}
