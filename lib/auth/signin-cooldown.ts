// Phase 6.0A — Production Foundation.
//
// GoTrue keeps exactly one pending magic-link challenge per email — proven
// live: requesting a second signInWithOtp for the same address a few
// seconds after a first, still-unclicked one gets its own request rejected
// with a 429 ("For security purposes, you can only request this after N
// seconds"), yet the FIRST email's link then fails at /auth/confirm with
// GoTrue's own "code challenge does not match previously saved code
// verifier" — confirmed by reading the exact verifier straight out of
// storage and exchanging it directly against GoTrue, bypassing this app's
// code entirely, and having GoTrue reject that too. The second request's
// mere arrival at the server is what invalidates the first, regardless of
// whether that second request's own response succeeds. There is no
// client-side correlation fix for this — the only real mitigation is to
// stop this app from ever sending that second request while a
// still-usable one is outstanding, which is what this cooldown does.
//
// Pulled out of app/auth/sign-in/page.tsx as plain, storage-agnostic logic
// so it can be unit-tested without a browser — see
// lib/auth/verify-signin-cooldown.mts.

export const COOLDOWN_STORAGE_KEY = "optim-signin-cooldown";
export const DEFAULT_COOLDOWN_SECONDS = 60;

export interface CooldownStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface CooldownRecord {
  email: string;
  until: number;
}

export function readCooldownMs(storage: CooldownStorage, email: string, now: number = Date.now()): number {
  try {
    const raw = storage.getItem(COOLDOWN_STORAGE_KEY);
    if (!raw) return 0;
    const record = JSON.parse(raw) as CooldownRecord;
    if (record.email !== email) return 0;
    return Math.max(0, record.until - now);
  } catch {
    return 0;
  }
}

export function writeCooldown(storage: CooldownStorage, email: string, seconds: number, now: number = Date.now()): void {
  const record: CooldownRecord = { email, until: now + seconds * 1000 };
  storage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(record));
}

export function parseRetryAfterSeconds(message: string): number {
  const match = message.match(/after (\d+) seconds/i);
  return match ? Number(match[1]) : DEFAULT_COOLDOWN_SECONDS;
}
