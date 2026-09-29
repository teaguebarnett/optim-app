"use client";

// Client setup -> Start date. Uses the shared StartDateField and
// TimeZonePicker. The time zone is pre-selected ONLY when it's genuinely
// the client's: detected from their own device, or already set by the
// coach. Otherwise it starts empty and must be chosen — never the schema's
// 'UTC' default and never the coach's own device zone. The server
// re-validates it (lib/production/programs.ts setClientProgramStartDate).

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { StartDateField } from "@/components/ui/date-picker";
import { TimeZonePicker } from "@/components/ui/timezone-picker";

export type SaveResult = { ok: true; message: string } | { ok: false; message: string } | null;

const SOURCE_TEXT: Record<"client_detected" | "coach_override", string> = {
  client_detected: "Detected from the client's device",
  coach_override: "Set by you",
};

export function LiveStartDateForm({
  action,
  initialDateIso,
  timezone,
  timezoneSource,
}: {
  action: (prev: SaveResult, formData: FormData) => Promise<SaveResult>;
  initialDateIso: string | null;
  timezone: string;
  timezoneSource: "client_detected" | "coach_override" | null;
}) {
  const [result, formAction, pending] = useActionState(action, null);
  const [dateIso, setDateIso] = useState(initialDateIso ?? "");
  const [timeZone, setTimeZone] = useState(timezoneSource ? timezone : "");

  const unchanged = !!initialDateIso && dateIso === initialDateIso && !!timezoneSource && timeZone === timezone;
  const sourceText = !timeZone
    ? "Not set — choose the client's time zone. Their day, reminders, and history are calculated in it."
    : timezoneSource && timeZone === timezone
      ? SOURCE_TEXT[timezoneSource]
      : "Will be saved as set by you";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="startDateIso" value={dateIso} />
      <input type="hidden" name="timeZone" value={timeZone} />
      <div className="grid gap-4 md:grid-cols-2">
        <StartDateField label="Start date" value={dateIso} onChange={setDateIso} />
        <div>
          <TimeZonePicker label="Client's time zone" value={timeZone} onChange={setTimeZone} />
          <p className="mt-1.5 text-meta text-neutral">{sourceText}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" loading={pending} disabled={!dateIso || !timeZone || unchanged}>
          {initialDateIso ? "Update start date" : "Set start date"}
        </Button>
        {unchanged && !result ? <p className="text-meta text-neutral">Saved.</p> : null}
        {result ? (
          <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-error"}`}>
            {result.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
