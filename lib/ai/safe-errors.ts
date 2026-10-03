// Gate 4.0C-2A fix — secret-safe provider errors and credential validation.
//
// Nothing that crosses this boundary toward a coach, client, or log may
// contain a credential, an auth header, an environment value, or raw
// provider exception text. Errors are reduced to a category plus safe
// metadata (provider, HTTP status class, request id, timestamp); any text
// that must be shown is passed through redactSecrets first as a second
// line of defense. Pure (no "server-only"), so it can be tested directly.

export type ProviderErrorCategory =
  | "config_invalid"
  | "timeout"
  | "rate_limited"
  | "auth_rejected"
  | "bad_request"
  | "provider_error"
  | "connection"
  | "request_construction"
  | "invalid_output"
  | "unknown";

export interface ProviderDiagnostic {
  provider: string;
  category: ProviderErrorCategory;
  /** e.g. "4xx", "5xx" — never a body. */
  statusClass?: string;
  status?: number;
  requestId?: string;
  atIso: string;
}

/** What a coach sees when interpretation fails, whatever the cause. */
export const INTERPRETER_UNAVAILABLE_MESSAGE = "OPTIM couldn't interpret this automatically. You can select the restrictions manually or try again.";

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_\-]{4,}/g,
  /\bsk-[A-Za-z0-9_\-]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._\-~+/=]+/gi,
  /(authorization|x-api-key|api[-_]?key|anthropic[-_]api[-_]key)\s*[:=]\s*["']?(?:Bearer\s+)?[^\s"',;]+/gi,
];

/** Removes anything credential-shaped (and any explicitly known secret) from text. */
export function redactSecrets(text: string, knownSecrets: Array<string | undefined> = []): string {
  let out = text;
  for (const s of knownSecrets) {
    if (!s) continue;
    for (const part of [s, s.trim(), ...s.split(/\s+/)].filter((p) => p.length >= 8)) out = out.split(part).join("[redacted]");
  }
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

export type CredentialProblem = "missing" | "multiple_tokens" | "whitespace" | "invalid_characters" | "length";

/**
 * Checks a provider API key's SHAPE without ever returning or describing its
 * value. Surrounding whitespace (a trailing newline from a paste) is
 * trimmed; anything else unusual — inner whitespace or line breaks, the key
 * repeated/concatenated, non-printable characters, implausible length —
 * fails, so a malformed credential is never sent.
 */
export function validateApiKey(raw: string | undefined | null): { ok: true; key: string } | { ok: false; problem: CredentialProblem } {
  if (raw == null || raw.trim() === "") return { ok: false, problem: "missing" };
  const key = raw.trim();
  if (/\s/.test(key)) return { ok: false, problem: key.split(/\s+/).length > 1 && (key.match(/sk-ant-/g) ?? []).length > 1 ? "multiple_tokens" : "whitespace" };
  if ((key.match(/sk-ant-/g) ?? []).length > 1) return { ok: false, problem: "multiple_tokens" };
  if (!/^[\x21-\x7e]+$/.test(key)) return { ok: false, problem: "invalid_characters" };
  if (key.length < 20 || key.length > 400) return { ok: false, problem: "length" };
  return { ok: true, key };
}

export const CREDENTIAL_PROBLEM_TEXT: Record<CredentialProblem, string> = {
  missing: "is not set",
  multiple_tokens: "contains more than one key (repeated or concatenated)",
  whitespace: "contains spaces or line breaks",
  invalid_characters: "contains non-printable characters",
  length: "has an implausible length",
};

/** Reduces any provider/SDK/runtime error to safe metadata. Never reads or returns the message text. */
export function classifyProviderError(err: unknown, provider: string): ProviderDiagnostic {
  const atIso = new Date().toISOString();
  const e = err as { name?: string; status?: unknown; requestID?: unknown; request_id?: unknown; headers?: { get?: (k: string) => string | null } };
  const status = typeof e?.status === "number" ? e.status : undefined;
  const rawId = typeof e?.requestID === "string" ? e.requestID : typeof e?.request_id === "string" ? e.request_id : undefined;
  const requestId = rawId && /^[A-Za-z0-9_\-]{6,80}$/.test(rawId) ? rawId : undefined;
  const name = typeof e?.name === "string" ? e.name : "";
  let category: ProviderErrorCategory = "unknown";
  if (/Timeout/i.test(name)) category = "timeout";
  else if (status === 429 || /RateLimit/i.test(name)) category = "rate_limited";
  else if (status === 401 || status === 403 || /Authentication|PermissionDenied/i.test(name)) category = "auth_rejected";
  else if (status !== undefined && status >= 400 && status < 500) category = "bad_request";
  else if (status !== undefined && status >= 500) category = "provider_error";
  else if (/Connection/i.test(name)) category = "connection";
  else if (err instanceof TypeError) category = "request_construction"; // e.g. Headers.append rejecting a header value
  return { provider, category, ...(status !== undefined ? { status, statusClass: `${Math.floor(status / 100)}xx` } : {}), ...(requestId ? { requestId } : {}), atIso };
}
