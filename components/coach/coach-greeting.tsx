"use client";

// Gate 2 — the live coach dashboard's greeting and date, computed from the
// coach's own browser clock. The dashboard itself is a Server Component, and
// on the server `new Date().getHours()` is the host's clock (UTC on Vercel),
// which said "Good morning" to a coach in the evening and could show
// tomorrow's date. No durable coach timezone exists yet — capturing and
// storing one belongs to the coach account/onboarding gate (Gate 3); until
// then the browser's own timezone is the honest source.
//
// The server render can't know the coach's time, so nothing time-dependent
// is rendered until the browser has it: the line keeps its space (no layout
// shift) and simply appears once mounted.

import { useSyncExternalStore } from "react";

function greetingForHour(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const subscribe = () => () => {};

export function CoachGreeting({ firstName }: { firstName: string }) {
  // null on the server, the browser's own "now" on the client.
  const now = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 60_000),
    () => null
  );
  const date = now === null ? null : new Date(now * 60_000);

  return (
    <div>
      <p className="text-label text-accent-fg" aria-hidden={date === null}>
        {date ? date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : " "}
      </p>
      <h1 className="mt-1 text-display text-off-white">
        <span className={date ? undefined : "invisible"}>{date ? greetingForHour(date.getHours()) : "Good morning"}</span>, {firstName}.
      </h1>
    </div>
  );
}
