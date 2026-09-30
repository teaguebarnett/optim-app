// Public-website analytics contract. No approved collection system exists in
// this project, so trackPublicEvent is a no-op: nothing is sent anywhere.
// When a tracker is approved, implement it here — and only here.
//
// Rules for any future implementation:
// - Only these sanitized events, with only these properties.
// - Never an email, name, free text, client/health data, token, or any
//   private-route content.
// - "beta_request_succeeded" fires only after the receiver confirms the
//   request was durably stored — never on a button click.
// - Payment, account, calibration, and activation events belong to later
//   integration gates, not this contract.

export type PublicEvent =
  | { name: "public_page_viewed"; page: "home" | "pricing" }
  | { name: "workflow_demo_viewed"; step: "method" | "client_information" | "review_decisions" }
  | { name: "pricing_viewed"; surface: "home_preview" | "pricing_page" }
  | { name: "plan_interest_selected"; plan: "starter" | "growth" | "pro" | "scale" }
  | { name: "beta_request_succeeded"; planInterest: "starter" | "growth" | "pro" | "scale" | null };

export function trackPublicEvent(event: PublicEvent): void {
  void event; // intentionally not collected — see header
}
