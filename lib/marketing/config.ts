// Public website controls. Everything that decides what a public visitor can
// DO lives here, so an unverified action can never appear by accident.
//
// - MARKETING_MODE is "beta": every plan and call to action requests beta
//   access. There is deliberately no "paid" mode, checkout URL, or
//   entitlement here — the paid journey (plan -> Stripe checkout -> setup
//   email -> account -> calibration) belongs to later, separately verified
//   gates.
// - LEAD_RECEIVER is null: no approved destination for beta requests exists
//   in this project yet (no leads table, form service, or email provider).
//   While it is null the request form renders for review with submission
//   disabled. It must only be set to a real, approved, persisted receiver,
//   together with a published privacy notice.

export type MarketingMode = "beta";
export const MARKETING_MODE: MarketingMode = "beta";

export interface BetaRequest {
  name: string;
  email: string;
  clientCount: string;
  currentPlatform: string;
  /** A plan the visitor showed interest in — interest only, never an entitlement. */
  planInterest: PlanId | null;
}

export interface LeadReceiver {
  /** Resolves only once the request is durably stored by the receiver. */
  submit(request: BetaRequest): Promise<{ ok: true } | { ok: false }>;
}

export const LEAD_RECEIVER: LeadReceiver | null = null;

/** No approved Scale/sales contact destination exists; Scale uses the beta
 * request path until one is supplied. */
export const SCALE_CONTACT_HREF: string | null = null;

export type PlanId = "starter" | "growth" | "pro" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  clients: string;
  /** Monthly USD price, or null for custom pricing. */
  priceUsdMonthly: number | null;
  summary: string;
}

/** Accepted pricing. Shared feature scope — no tier entitlements have been
 * approved, so none are shown. */
export const PLANS: Plan[] = [
  { id: "starter", name: "Starter", clients: "1–5 clients", priceUsdMonthly: 49, summary: "For a smaller client roster." },
  { id: "growth", name: "Growth", clients: "6–20 clients", priceUsdMonthly: 149, summary: "For an established coaching practice." },
  { id: "pro", name: "Pro", clients: "21–50 clients", priceUsdMonthly: 299, summary: "For a larger individual client roster." },
  { id: "scale", name: "Scale", clients: "51+ clients / teams", priceUsdMonthly: null, summary: "Talk with us about your roster, team, and requirements." },
];

export function isPlanId(value: unknown): value is PlanId {
  return value === "starter" || value === "growth" || value === "pro" || value === "scale";
}
