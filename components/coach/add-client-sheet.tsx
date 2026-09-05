"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { StartDateField } from "@/components/ui/date-picker";
import { Combobox } from "@/components/ui/combobox";
import { usePrototypeState } from "@/hooks/use-prototype-state";
import { usePlatformState } from "@/hooks/use-platform-state";
import { nextPlatformId } from "@/lib/coach/platform-store";
import { ALL_COACH_PROFILES } from "@/lib/tenancy/seed";
import { resolveClientLocalDateIso } from "@/lib/shared/local-date";
import { cn } from "@/lib/cn";
import type { ClientProfile } from "@/lib/tenancy/types";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return resolveClientLocalDateIso(d, Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function FormGroupLabel({ children }: { children: string }) {
  return <p className="text-label text-neutral">{children}</p>;
}

interface AddClientSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The coach's "Add client" flow — creates the canonical ClientProfile, a
 * ClientInvitation, and lifecycle "invited" state all in one dispatch (see
 * lib/coach/platform-store.ts's CREATE_CLIENT), then routes straight into
 * that client's workspace where the coach can copy/open the invitation
 * link. No email is sent automatically — see lib/coach/types.ts's
 * InvitationDeliveryMethod — the coach shares the link directly, exactly
 * like every other honest label in this form describes.
 */
export function AddClientSheet({ open, onClose }: AddClientSheetProps) {
  const { activeContext } = usePrototypeState();
  const { dispatch } = usePlatformState();
  const router = useRouter();

  const workspaceCoaches = ALL_COACH_PROFILES.filter((c) => c.workspaceId === activeContext.workspace.id);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [coachId, setCoachId] = useState(activeContext.coachProfile?.id ?? workspaceCoaches[0]?.id ?? "");
  const [startDate, setStartDate] = useState(tomorrowIso());
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [wantsCheckIn, setWantsCheckIn] = useState(true);

  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && !!coachId && !!startDate;

  function resetForm() {
    setName("");
    setEmail("");
    setCoachId(activeContext.coachProfile?.id ?? workspaceCoaches[0]?.id ?? "");
    setStartDate(tomorrowIso());
    setDurationWeeks(12);
    setWantsCheckIn(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const clientId = nextPlatformId("client");
    const client: ClientProfile = {
      id: clientId,
      workspaceId: activeContext.workspace.id,
      name: name.trim(),
      email: email.trim(),
      goal: "",
      programWeek: 0,
      programTotalWeeks: durationWeeks,
      avatarInitials: initialsFor(name.trim()),
      previousWeightLb: 0,
      primaryCoachId: coachId,
    };

    dispatch({
      type: "CREATE_CLIENT",
      workspaceId: activeContext.workspace.id,
      client,
      intendedStartDateIso: startDate,
      intendedDurationWeeks: durationWeeks,
      intendedWeeklyCheckIn: wantsCheckIn,
      nowIso: new Date().toISOString(),
    });

    resetForm();
    onClose();
    router.push(`/coach/clients/${clientId}`);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add client"
      description="Creates a client record and their invitation link."
      footer={
        <Button form="add-client-form" type="submit" className="w-full" size="lg" disabled={!canSubmit}>
          Create client and invitation link
        </Button>
      }
    >
      <form id="add-client-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <FormGroupLabel>Client identity</FormGroupLabel>
          <TextField id="new-client-name" label="Client name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
          <TextField
            id="new-client-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            required
          />
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <FormGroupLabel>Program timing</FormGroupLabel>
          <div>
            <p className="mb-1.5 text-sm font-medium text-off-white">Assigned coach</p>
            <Combobox ariaLabel="Assigned coach" value={coachId} onChange={setCoachId} options={workspaceCoaches.map((c) => ({ value: c.id, label: c.displayName }))} />
          </div>
          <StartDateField label="Intended start date" value={startDate} onChange={setStartDate} />
          <div>
            <p className="mb-1.5 text-sm font-medium text-off-white">Program duration</p>
            <div className="grid grid-cols-4 gap-2">
              {[8, 12, 16, 20].map((weeks) => (
                <button
                  key={weeks}
                  type="button"
                  onClick={() => setDurationWeeks(weeks)}
                  aria-pressed={durationWeeks === weeks}
                  className={cn(
                    "rounded-[var(--radius-sm)] border-2 px-2 py-2.5 text-sm font-medium transition-colors",
                    durationWeeks === weeks ? "border-accent bg-selected-bg text-accent-strong" : "border-border-strong text-off-white hover:border-accent/40"
                  )}
                  style={{ transitionDuration: "var(--motion-fast)" }}
                >
                  {weeks}w
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <FormGroupLabel>Coaching configuration</FormGroupLabel>
          <div>
            <p className="mb-1.5 text-sm font-medium text-off-white">Weekly check-in</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWantsCheckIn(true)}
                aria-pressed={wantsCheckIn}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  wantsCheckIn ? "border-accent bg-selected-bg text-accent-strong" : "border-border-strong text-off-white"
                )}
                style={{ transitionDuration: "var(--motion-fast)" }}
              >
                {wantsCheckIn ? <Check size={14} /> : null}
                Assign weekly check-in
              </button>
              <button
                type="button"
                onClick={() => setWantsCheckIn(false)}
                aria-pressed={!wantsCheckIn}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  !wantsCheckIn ? "border-accent bg-selected-bg text-accent-strong" : "border-border-strong text-off-white"
                )}
                style={{ transitionDuration: "var(--motion-fast)" }}
              >
                {!wantsCheckIn ? <Check size={14} /> : null}
                None for now
              </button>
            </div>
            <p className="mt-1.5 text-meta text-neutral">
              Configurable per client, never required workspace-wide — the real schedule is finalized once the client is
              activated.
            </p>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
