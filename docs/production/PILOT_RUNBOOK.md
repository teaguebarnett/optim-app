# OPTIM Controlled Pilot Runbook (Phase 6.0D-B)

This is the exact, repeatable local setup for the Phase 6.0D-B pilot: one
synthetic coach, one synthetic client, real Supabase persistence, real RLS,
real (optional) Anthropic calls. **Not run in this environment** — neither
the Supabase CLI nor Docker is installed here (`which supabase` /
`which docker` are both empty in this sandbox). Every command below is
provided so Teague can run it himself on a machine with Docker available.
This mirrors Phase 6.0A's own FOUNDATION.md §9, which documented the exact
same constraint for the original migrations/RLS suite — it was true then,
it's still true in this environment now.

No real client PII anywhere in this runbook. Do not use Tristan or any
other real client's data — every email/name below is a synthetic
`@example.test` fixture.

## 1. One-time local infrastructure setup

```bash
# If not already installed:
brew install supabase/tap/supabase   # or: npm install -g supabase
# Docker Desktop must be running (Applications > Docker, or `open -a Docker`)

cd /Users/teaguebb/Developer/peak-coaching
supabase init      # only if supabase/config.toml doesn't already exist — it does, skip this
supabase start      # starts local Postgres + Auth + Storage + Mailpit/Inbucket in Docker
```

`supabase start` prints a block of local URLs/keys — copy them for the next
sections. It includes a local email-catcher (Mailpit in current CLI
versions, Inbucket in older ones) — every "magic link" / OTP / invitation
email sent by local Supabase Auth lands there instead of a real inbox. Its
URL is printed by `supabase start` (also visible via `supabase status`) —
typically `http://127.0.0.1:54324`.

## 2. Apply migrations and run the automated RLS/contract suite

```bash
supabase db reset     # applies every file in supabase/migrations/ in order, from scratch
supabase test db      # runs every *.test.sql file in supabase/tests/database/ (pgTAP)
```

`supabase db reset` is safe against the **local** Docker Postgres only —
never run it against a remote/production project. Expect all pgTAP suites
to pass, including the two new Phase 6.0D-B files:
`client_lifecycle_and_onboarding.test.sql` (client_onboarding_progress RLS,
client_enrollments.archived_at, and the coach_notes privacy fix) and the
pre-existing `rls_isolation.test.sql` / `storage_isolation.test.sql` /
`program_publication_and_activity.test.sql` / `chat_intelligence.test.sql`.

## 3. Bootstrap the pilot coach workspace

```bash
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status> \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
BOOTSTRAP_OWNER_EMAIL=teaguebarnett@gmail.com \
node --experimental-strip-types scripts/bootstrap-workspace.mts
```

**Deliberately omit `BOOTSTRAP_TEST_CLIENT_EMAIL` here.** That flag creates
an already-active client membership + client_profiles row directly via the
service-role key — useful for isolated RLS/data-shape verification, but it
skips the real invited → onboarding → coach_setup → active lifecycle this
phase's pilot exists to prove. The pilot client is created through the real
in-app "Invite client" flow instead — step 6 below.

This creates:
- Workspace "OPTIM", owned by `teaguebarnett@gmail.com`.
- A `workspace_owner` membership for that account (this is also "the coach"
  for pilot purposes — the pilot does not need a separate plain-`coach`-role
  account; see §7's limitations note).

Idempotent — safe to re-run.

## 4. Start the app in Supabase mode

```bash
APP_MODE=supabase \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status> \
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status> \
NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
ANTHROPIC_API_KEY=<only if you want the real chat/proposal calls in step 10 — see §9> \
npm run dev
```

## 5. Sign in as the pilot coach

1. Open `http://localhost:3000/auth/sign-in`.
2. Enter `teaguebarnett@gmail.com`, request a code.
3. Open the local Mailpit/Inbucket URL from §1, find the OTP email, copy
   the 6-digit code back into the sign-in form.
4. You land on `/coach` — the real Supabase-mode dashboard. `/coach/clients`
   shows an empty roster ("No clients yet").

## 6. Invite the one synthetic pilot client

1. On `/coach/clients`, click **Invite client**.
2. Name: `Pilot Client`. Email: `pilot-client@example.test` (or any
   `@example.test` address — never a real inbox). Goal: anything, e.g.
   "Build strength, 4x/week."
3. Submit. This creates a real `client_profiles` (invited_email set,
   `user_id` still null) + `coach_client_assignments` +
   `client_enrollments` (`status = 'invited'`) row, and sends a real
   Supabase Auth invite through `inviteToWorkspace` — check Mailpit/Inbucket
   for the invitation email.
4. You land on that client's detail page (`/coach/clients/<id>`) — lifecycle
   badge reads "Invited," `hasSignedIn: false`.

## 7. Sign in as the pilot client and complete onboarding

1. In a **different browser profile or private window** (a real second
   session, not the coach's "open as client" — this pilot has no such
   dev-only switch in Supabase mode by design; see §... below), open the
   invitation link from Mailpit/Inbucket. It resolves through
   `/auth/confirm`, which calls `accept_invitation` and establishes a real
   client session.
2. You land on `/onboarding/<clientId>` — the real six-chapter wizard
   (`LiveOnboardingWizard` → the same `OnboardingWizard` component demo
   mode uses, backed by real Server Actions). Progress saves after every
   chapter; refreshing mid-flow resumes at the exact chapter/answers left
   off, from `client_onboarding_progress`.
3. Complete all six chapters and submit the review step. You land on
   `/setup-status/<clientId>` — "Sent to Teague. OPTIM is preparing your
   training and nutrition draft..." — this is the real, honest
   `coach_setup` (awaiting-coach-review) state.

## 8. Review, configure, and activate as the coach

1. Back in the coach's session, open `/coach/clients/<id>` again (or
   refresh — `revalidatePath` keeps it current). The Onboarding answers
   section now shows the client's real height/goal/available days/
   experience.
2. Under Program setup: set a **Start date** a few days out (this proves
   the pre-start honesty requirement in step 9). Create/publish/assign a
   Training program and a Nutrition plan (the minimal, real
   create→publish→assign forms — Part 7's deliberately narrow authoring
   scope, not a full program composer).
3. Once start date + program + nutrition all exist, an **Activate client**
   button appears. Click it. Lifecycle flips to "Active" —
   `activateClientEnrollment` refuses this until all three preconditions
   are real.

## 9. Verify start-date honesty as the client

1. Back in the client's session, refresh (or sign out and back in via
   Mailpit/Inbucket OTP — see §5, same flow, client's own email).
2. `/today` (and `/training`, `/nutrition`, `/progress`) show the real
   **pre-start** experience — "Your program starts in N days" — never a
   fabricated Day 1. This is `resolveProgramTiming`'s "pre_program" phase,
   driven by the real `client_enrollments.original_program_start_date` you
   set in step 8.
3. Advance your local system date past the start date (or set a start date
   of today/yesterday in step 8 instead, for a faster loop) and refresh —
   the real Today experience (readiness, training session, nutrition,
   RPE/pain/skip logging, etc.) appears, backed by
   `hooks/use-prototype-state.tsx`'s Supabase bootstrap/autosave.

## 10. Chat, escalation, and coach-thread walkthrough

1. As the client, open `/chat` and send a message that should escalate
   (e.g. mentions sharp pain). This is the one point in this walkthrough
   that calls the real Anthropic provider — see §... cost note below.
2. As the coach, the escalation appears on `/coach` and `/coach/escalations`
   — respond personally (opens a temporary coach thread) or approve the
   proposed response.
3. As the client, confirm the coach's reply appears in `/chat`.
4. As the coach, resolve the thread from `/coach/escalations`.
5. On the coach's `/coach/clients/<id>` page, confirm the full conversation
   transcript (including the escalation and resolution) is visible under
   "Conversation," and add a Personal Coach Note. As the client, confirm it
   appears as a "Note from Teague" card at the top of `/chat` (a one-way,
   coach-attributed message, not a DM thread — see
   `components/chat/live-chat-screen.tsx`) and persists on refresh.

## 11. Isolation checks

1. Run `scripts/bootstrap-workspace.mts` again with a *second*
   `BOOTSTRAP_OWNER_EMAIL` (a different `@example.test` address) to create
   an unrelated second workspace/coach.
2. Sign in as that second coach. Confirm `/coach/clients` shows zero
   clients and the pilot client's direct URL
   (`/coach/clients/<pilot-client-id>`) 404s / access-denies.
3. Sign out entirely (or use an incognito window) and confirm every
   `/coach/*` route redirects to sign-in rather than rendering anything
   (see `app/coach/layout.tsx`'s fail-closed `CoachAccessDenied` state).
4. While signed in as the pilot **client**, confirm every `/coach/*` route
   also fails closed (same layout gate — a `client` role membership never
   satisfies `resolveOwnStaffWorkspace`'s staff-role check).

## 12. Reset between runs

```bash
supabase db reset   # wipes and re-applies migrations — the deterministic reset point
```

Then repeat from §3. `scripts/bootstrap-workspace.mts` and the invite flow
are both idempotent/safe to re-run against a freshly reset database.

## Limitations honestly carried into this runbook

- **No dev-only "open as client" switch in Supabase mode.** Demo mode's
  `/dev` console and coach-side "open as client" convenience are
  deliberately demo-only (localStorage-backed) — a real pilot must use two
  genuinely separate authenticated sessions (two browser profiles, or one
  regular + one private window), which is more friction than demo mode but
  is the actually-correct model for a real multi-tenant product.
- **One coach only, and that coach is the workspace owner.** `inviteClient`
  and `inviteToWorkspace` both require `workspace_owner`/`platform_admin` —
  a plain `coach`-role account cannot invite a client in this phase (see
  `coach_client_assignments_insert_admin`'s own admin-only RLS policy).
  Fine for this pilot (Teague is the coach), a real limitation for a
  future multi-coach workspace — out of this phase's scope.
- **No live server-push.** `/setup-status` and the "waiting on your coach"
  screens poll on focus/visibility, not a real-time channel — refresh or
  switch tabs back to see a state change made in the other session.
