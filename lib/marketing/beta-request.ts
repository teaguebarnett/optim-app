// Validation for the public beta-request form, shared by the browser (inline
// errors) and the server action (the real check). Pure.

import { isPlanId, type BetaRequest } from "./config.ts";

export const CLIENT_COUNT_OPTIONS = [
  { value: "0", label: "I'm not coaching clients yet" },
  { value: "1-5", label: "1–5 clients" },
  { value: "6-20", label: "6–20 clients" },
  { value: "21-50", label: "21–50 clients" },
  { value: "51+", label: "51 or more clients" },
] as const;

export type BetaRequestField = "name" | "email" | "clientCount" | "currentPlatform";
export type BetaRequestErrors = Partial<Record<BetaRequestField, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseBetaRequest(raw: Record<string, unknown>): { ok: true; request: BetaRequest } | { ok: false; errors: BetaRequestErrors } {
  const text = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const name = text("name");
  const email = text("email");
  const clientCount = text("clientCount");
  const currentPlatform = text("currentPlatform");
  const errors: BetaRequestErrors = {};

  if (!name) errors.name = "Enter your name.";
  else if (name.length > 120) errors.name = "Use 120 characters or fewer.";
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL.test(email) || email.length > 254) errors.email = "Enter an email address like name@example.com.";
  if (!CLIENT_COUNT_OPTIONS.some((o) => o.value === clientCount)) errors.clientCount = "Choose how many clients you coach.";
  if (currentPlatform.length > 120) errors.currentPlatform = "Use 120 characters or fewer.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const plan = text("planInterest");
  return { ok: true, request: { name, email, clientCount, currentPlatform, planInterest: isPlanId(plan) ? plan : null } };
}
