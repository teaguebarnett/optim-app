# OPTIM public website (beta)

Routes: `/` (homepage) and `/pricing`, in `app/(marketing)/`. Both render inside
the normal root layout; they add a public header/footer only and grant no
access. `/coach`, `/admin`, and the client app keep their own server-side
layout gates, unchanged.

- Copy: `lib/marketing/content.ts` (the approved safe beta copy — edit here).
- Controls: `lib/marketing/config.ts` — `MARKETING_MODE = "beta"` (there is no
  paid mode, checkout URL, or entitlement), `LEAD_RECEIVER = null`,
  `SCALE_CONTACT_HREF = null`, and the accepted plan prices.
- Components: `components/marketing/`.
- Product stills: `public/marketing/*.webp` — real captures of the current beta
  interface running in demo mode (demonstration data), always captioned so.
  The demo coach's displayed identity is the neutral "Coach" / "C"
  (`lib/tenancy/seed.ts`), so no real person appears as the demo coach.

## Returning coaches and clients

All entry points (both headers, the phone second row, footers, and the
homepage's inline Client login) read one source: `publicAuthLinks()` in
`lib/marketing/auth-links.ts`.

- Real (Supabase) mode: "Coach login" → `/auth/sign-in?next=/coach`; "OPTIM for
  Clients" / "Client login" → `/auth/sign-in?next=/today`. The sign-in page
  forwards an already-signed-in visitor through `lib/auth/post-sign-in.ts`;
  `next` is honored only when the account's own roles allow it, otherwise the
  role's home. A new email sign-in carries `next` to `/auth/confirm`, which
  applies the same rule. Links never grant a role.
- Demo mode: `/demo-entry/coach` and `/demo-entry/client`. Demo identity is a
  stored "dev perspective" read once when the app provider mounts, and
  `RoleRouteBoundary` redirects any route that perspective isn't allowed on —
  so a plain link to `/today` could land on `/coach` (or the reverse). The
  demo-entry route selects the seeded demo coach/client, then opens `/coach` or
  `/today`. In Supabase mode it only forwards to sign-in.

## Blockers before public release

1. **Lead receiver.** No approved destination exists (no leads table, form
   service, or email provider). The beta-request form renders for review with
   submission disabled; `submitBetaRequestAction` returns "closed" and never
   reports success. Set `LEAD_RECEIVER` only to a real, approved, persisted
   receiver.
2. **Privacy notice and Terms.** No approved text exists, so no pages or footer
   links were created. The form must not open without a factual privacy notice.
3. **Canonical domain.** None supplied. No canonical tags; `sitemap.xml` and the
   robots sitemap line use the deployment's `NEXT_PUBLIC_SITE_URL` only when set.
4. **Scale contact.** No sales/contact destination; Scale uses the beta path.
5. **Founding Ten.** Only "Ask about founding-coach access" is shown until the
   allocation ledger and terms are supplied.
6. **Walkthrough video.** No recorded asset; no player is shown.

## Analytics event contract (not collected)

No approved collection system exists. `lib/marketing/events.ts` defines the
contract; `trackPublicEvent` is a no-op until a tracker is approved.

| Event | Properties | Fires when |
|---|---|---|
| `public_page_viewed` | `page: home \| pricing` | A public page is viewed |
| `workflow_demo_viewed` | `step` | A workflow step is viewed |
| `pricing_viewed` | `surface: home_preview \| pricing_page` | Pricing is seen |
| `plan_interest_selected` | `plan` | A plan's beta-request action is chosen |
| `beta_request_succeeded` | `planInterest` | The receiver confirms the request was **stored** — never on click |

Never collect email, names, free text, client or health data, tokens, or any
private-route content. Payment, account, calibration, and activation events
belong to later integration gates.

## Later task: refresh dashboard stills after the coach interface revamp

- [ ] **After the coach interface revamp ships**, recapture and replace every
  public-site image that shows the coach dashboard or coach screens, using the
  finished interface: `coach-attention-neutral-v2-desktop.webp`, `coach-attention-neutral-v2-phone.webp` (give replacements a new versioned filename so old optimized/browser-cached copies can never be reused),
  `calibration-desktop.webp`, `calibration-phone.webp` (and any client stills
  whose screens changed). Keep the neutral demo identity and the
  demonstration-data captions, and update image dimensions in
  `components/marketing/home-sections.tsx`. This is a follow-up to the revamp;
  the current neutral-identity screenshot correction does not start it.

## Known styling quirk (pre-existing, app-wide)

`app/globals.css` has an unlayered `* { border-color: var(--pc-border) }` that
overrides every Tailwind border-colour utility across the app. The public site
uses the important modifier (`border-brass!`, `border-error-strong!`) only where
a border colour carries meaning. Not changed here, because fixing it would
restyle borders app-wide (including Admin).
