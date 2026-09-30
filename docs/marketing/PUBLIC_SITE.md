# OPTIM public website (beta)

Routes: `/` (homepage) and `/pricing`, in `app/(marketing)/`. Both render inside
the normal root layout; they add a public header/footer only and grant no
access. `/coach`, `/admin`, and the client app keep their own server-side
layout gates, unchanged.

- Copy: `lib/marketing/content.ts` (the approved safe beta copy — edit here).
- Controls: `lib/marketing/config.ts` — `MARKETING_MODE = "beta"` (there is no
  paid mode, checkout URL, or entitlement), `SCALE_CONTACT_HREF = null`, and the
  accepted plan prices.
- Beta waitlist ("lead bank"): the form saves to `public.beta_leads` in
  optim-beta (migration `20260930000028_beta_leads.sql`) through the one public
  write path `public.submit_beta_lead()`, called server-side with the anon key
  (`lib/marketing/lead-store.ts`). RLS on, no table privileges for anon /
  authenticated, reads for platform owners/admins only. Duplicates (case-
  insensitive email) change nothing and show "You’re already on the list." A
  lead never creates an auth user, profile, membership, or access. Statuses:
  `waitlist` (default), `invited`, `converted`. The consent notice shown is
  stored with each lead (`BETA_CONSENT_TEXT`).
- Privacy: `/privacy` (contact privacy@useoptim.ai), linked from the footer and
  the form.
- Components: `components/marketing/`.
- Product stills: `public/marketing/*.webp` — real captures of the current beta
  interface running in demo mode (demonstration data), always captioned so.
  The demo coach's displayed identity is the neutral "Coach" / "C"
  (`lib/tenancy/seed.ts`), so no real person appears as the demo coach.

## Returning beta users

The public site's only login entry is a quiet "Beta login" (header, mobile
menu, footer, and the client section), from `publicAuthLinks()` in
`lib/marketing/auth-links.ts`.

- Real (Supabase) mode: `/auth/sign-in` with no destination hint, so the
  account's own role decides — coach → `/coach`, client → `/today`
  (`lib/auth/post-sign-in.ts`). An already-signed-in visitor is forwarded
  straight there. Links never grant a role.
- Demo mode: `/demo-entry/coach` (demo mode has no sign-in; the demo-entry
  route selects the demo identity explicitly, then opens `/coach`).

## Still open before wider launch

1. **Terms.** No approved Terms text exists; no Terms page was created.
2. **Canonical domain.** None supplied. `sitemap.xml` and the robots sitemap
   line use the deployment's `NEXT_PUBLIC_SITE_URL`.
3. **Scale contact.** No sales/contact destination; Scale uses the beta path.
4. **Founding Ten.** Only "Ask about founding-coach access" is shown until the
   allocation ledger and terms are supplied.
5. **Walkthrough video.** No recorded asset; no player is shown.
6. **Spam.** Submissions have a honeypot and database validation, but no rate
   limit; revisit if the lead bank sees abuse.

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
