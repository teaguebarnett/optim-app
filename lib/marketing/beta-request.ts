// Validation and sanitization for the public beta-request (waitlist) form,
// shared by the browser (inline errors) and the server action (the real
// check). The database function public.submit_beta_lead re-validates the
// same rules as a final backstop. Pure.

import { isPlanId, type PlanId } from "./config.ts";

export const CLIENT_COUNT_OPTIONS = [
  { value: "0", label: "None yet" },
  { value: "1-5", label: "1–5 clients" },
  { value: "6-20", label: "6–20 clients" },
  { value: "21-50", label: "21–50 clients" },
  { value: "51+", label: "51 or more clients" },
] as const;

export type BetaRequestField = "firstName" | "email" | "clientCount" | "instagramOrWebsite";
export type BetaRequestErrors = Partial<Record<BetaRequestField, string>>;

export interface BetaRequest {
  firstName: string;
  email: string;
  clientCount: string;
  instagramOrWebsite: string | null;
  planInterest: PlanId | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trims, collapses internal whitespace, and removes control characters. */
export function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export function parseBetaRequest(raw: Record<string, unknown>): { ok: true; request: BetaRequest } | { ok: false; errors: BetaRequestErrors } {
  const firstName = sanitizeText(raw.firstName);
  const email = sanitizeText(raw.email).toLowerCase();
  const clientCount = sanitizeText(raw.clientCount);
  const link = sanitizeText(raw.instagramOrWebsite);
  const errors: BetaRequestErrors = {};

  if (!firstName) errors.firstName = "Enter your first name.";
  else if (firstName.length > 80) errors.firstName = "Use 80 characters or fewer.";
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL.test(email) || email.length > 254) errors.email = "Enter a valid email address, like name@example.com.";
  if (!CLIENT_COUNT_OPTIONS.some((o) => o.value === clientCount)) errors.clientCount = "Choose how many active clients you coach.";
  if (link.length > 200) errors.instagramOrWebsite = "Use 200 characters or fewer.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const plan = sanitizeText(raw.planInterest);
  return { ok: true, request: { firstName, email, clientCount, instagramOrWebsite: link || null, planInterest: isPlanId(plan) ? plan : null } };
}
