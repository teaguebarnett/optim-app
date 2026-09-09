# OPTIM Production Foundation (Phase 6.0A)

This document is the handoff for Phase 6.0A — Production Foundation. It
covers what was built, what still requires real credentials Teague must
supply, and the exact commands/checklist to run this foundation for real.

Nothing in this phase touches the existing demo/localStorage prototype's
behavior. Every file described below is new; the only edits to existing
files are `package.json` (new scripts + two new dependency pairs) and
`.gitignore` (one `.env.example` exception).

## 1. Architecture and data modes

Two runtime modes, resolved once, centrally, in `lib/production/mode.ts`:

- **`demo`** — the existing prototype, completely unchanged. Zero backend,
  identity/tenancy resolved from `lib/tenancy/seed.ts` + localStorage (see
  `lib/tenancy/session.ts`, `lib/tenancy/context.ts`). Default everywhere
  except a real Vercel Production deployment.
- **`supabase`** — real Supabase Auth (passwordless email), Postgres (with
  Row Level Security), and private Storage. Identity/tenancy resolved
  *only* from a server-verified Supabase session joined against a real
  `workspace_memberships` row (`lib/production/auth.ts`) — never from
  localStorage, a URL param, or anything the browser merely claims.

`resolveAppMode()` reads `APP_MODE` (deliberately **not** prefixed
`NEXT_PUBLIC_` — it is architecturally unreachable from the browser, not
just conventionally untrusted there) and throws immediately if
`VERCEL_ENV=production` and `APP_MODE` isn't exactly `"supabase"` — this is
the enforcement of "a production build must reject demo mode." Preview
deployments may run either mode.

Nothing has been wired to make the *existing* coach/client pages (the ones
under `app/coach/*`, `app/(client)/*`, etc.) actually read from Supabase —
that conversion is Phase 6.0B. In Supabase mode today, only the new
`/auth/*` routes and the `lib/production` foundation are live; the rest of
the app still assumes demo mode's providers. This is intentional — Part 6
of the spec explicitly forbids "a giant app-wide component conversion" in
this phase.

## 2. Schema and migrations

Ten SQL migrations under `supabase/migrations/`, applied in filename order:

| File | Contents |
|---|---|
| `20260909000001_extensions_and_helpers.sql` | `pgcrypto`, `app_private` schema, `app_role` enum |
| `20260909000002_core_identity.sql` | `profiles`, `workspaces`, `workspace_memberships`, `workspace_invitations`, `handle_new_user` trigger |
| `20260909000003_coaching_relationships.sql` | `client_profiles`, `coach_client_assignments`, `client_enrollments` (program-position anchors) |
| `20260909000004_programs_and_nutrition.sql` | `training_programs(_versions)`, `program_assignments`, `nutrition_plans(_versions)`, `nutrition_plan_assignments`, `publication_events` |
| `20260909000005_communications.sql` | `notifications`, `conversations`, `conversation_messages`, `escalations`, `coach_notes`, `campaigns`, `campaign_recipients` |
| `20260909000006_imports.sql` | `import_batches`, `import_sources`, `staged_clients`, `staged_client_fields`, `import_review_events` |
| `20260909000007_rls_helpers.sql` | `app_private.*` SECURITY DEFINER helper functions |
| `20260909000008_rls_policies.sql` | Every table's RLS policies + grants |
| `20260909000009_storage.sql` | Storage buckets + `storage.objects` policies |
| `20260909000010_accept_invitation.sql` | The one SECURITY DEFINER function an invitee calls to join a workspace |

**Normalization decision** (documented in full at the top of
`20260909000004_programs_and_nutrition.sql`): ownership, versioning,
status, and assignment are real relational columns. The deeply-nested plan
*content* itself (exercises/sets/reps, meal periods/macros) is a single
validated `content jsonb` column per version row — written/read as one
coherent typed payload, never queried column-by-column, changing shape
faster than a migration cadence should gate. Publication is enforced
immutable at the row level by a trigger
(`prevent_published_version_mutation`) — a published/archived version's
content can never change; a real edit creates a new version row.

## 3. Auth and invitation flow

- **Routine sign-in**: `app/auth/sign-in` — six-digit email OTP.
  `signInWithOtp({ email, options: { shouldCreateUser: false } })`. A
  generic sign-in attempt against an email with no account **cannot**
  create one.
- **Invitation acceptance**: `app/auth/confirm/route.ts` — verifies the
  magic-link `token_hash`, establishes a session, then (if the link carries
  our own `?invitation=<id>` param) calls
  `public.accept_invitation(invitation_id)`, a SECURITY DEFINER Postgres
  function that matches the invitation's email against the caller's own
  authenticated email before creating the `workspace_memberships` row —
  see `20260909000010_accept_invitation.sql`.
- **The only two code paths that can create a new Supabase Auth user**:
  1. `lib/production/invite.ts`'s `inviteToWorkspace` — requires the caller
     to already hold `workspace_owner`/`platform_admin` in the target
     workspace (`requireWorkspaceRole`), then uses the service-role admin
     client (`lib/supabase/admin.ts`) for exactly one call:
     `admin.auth.admin.inviteUserByEmail`.
  2. `scripts/bootstrap-workspace.mts` — a manual, one-time script Teague
     runs himself with his own service-role key, to create the very first
     workspace/owner (and, for the pilot, one separate test-client
     account). Never invoked by the running app.
- **Session refresh**: `proxy.ts` (Next.js 16 renamed `middleware.ts` →
  `proxy.ts` — see that file's header comment for how this was confirmed
  against this repo's own `node_modules/next/dist/docs/`). A complete
  no-op unless `APP_MODE=supabase`.
- **Sign-out**: a Server Action inline in `app/auth/account/page.tsx`.

## 4. Role, tenancy, and RLS model

Four roles, matching `lib/tenancy/types.ts`'s existing `Role` union exactly
(`platform_admin`, `workspace_owner`, `coach`, `client`) — the DB's
`app_role` enum and `lib/production/auth.ts`'s `ProductionRole` type both
mirror it, so there is one shared vocabulary end to end.

- **`workspace_owner`/`platform_admin`** ("workspace-wide admin
  authority" — `app_private.is_workspace_admin`): full access to every
  client/program/conversation/import in their own workspace(s) only.
- **`coach`**: access is scoped through `coach_client_assignments`, **not**
  workspace membership alone (`app_private.is_assigned_coach`) — a plain
  coach sees only their own assigned clients, even inside their own
  workspace. This mirrors the demo prototype's existing Teague/Alex
  isolation fixture (`lib/tenancy/seed.ts`'s `COACH_PROFILE_ALEX`).
- **`client`**: access to their own records only
  (`app_private.is_client_self`).

Every protected table has RLS enabled the instant it's created (fail-closed
default: a table with RLS on and zero policies denies everything except the
service-role key) and explicit, operation-specific policies added once the
full schema exists (`20260909000008_rls_policies.sql`). `anon` receives
zero table grants anywhere. Several genuinely-immutable tables
(`conversation_messages`, `publication_events`, `import_review_events`,
`coach_notes`, `escalations`, both `*_versions` tables) have their `DELETE`
grant revoked outright, as defense-in-depth beyond "no policy exists."

**RLS test coverage** (`supabase/tests/database/rls_isolation.test.sql`,
`storage_isolation.test.sql`, pgTAP, 23 + 8 assertions): anonymous, Client
A, Client B, Coach A (workspace owner), Coach B (unrelated workspace), and
the `accept_invitation` server-only op — the exact minimum matrix Part 4
requires. **Status: written, not yet executed** — see §9.

## 5. Storage buckets and path model

Three private buckets (`supabase/migrations/20260909000009_storage.sql`),
none public:

- `progress-media`, `chat-attachments` — path
  `{workspace_id}/{client_profile_id}/{filename}`. Readable/writable by the
  client themselves, their assigned coach, or a workspace admin
  (`app_private.can_access_client`) — the same predicate every
  client-owned table's SELECT policy uses. The path's own workspace segment
  is independently re-validated against the client's *real* workspace at
  the database layer (never trusts the path string alone).
- `import-sources` — path `{workspace_id}/{batch_id}/{filename}`.
  Staff-only (`app_private.is_workspace_staff`) — never visible to any
  client by default, including one a staged row eventually matches.

## 6. Required environment variables

See `.env.example` for the authoritative, commented list. Summary by
environment:

| Variable | Local dev | Vercel Preview | Vercel Production |
|---|---|---|---|
| `APP_MODE` | `demo` (or `supabase` to test against a staging project) | either | **must be `supabase`** |
| `NEXT_PUBLIC_SUPABASE_URL` | required if `APP_MODE=supabase` | required if `APP_MODE=supabase` | required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | required if `APP_MODE=supabase` | required if `APP_MODE=supabase` | required |
| `SUPABASE_SERVICE_ROLE_KEY` | required if `APP_MODE=supabase` | required if `APP_MODE=supabase` | required |
| `NEXT_PUBLIC_SITE_URL` | required if `APP_MODE=supabase` | required if `APP_MODE=supabase` | required |

`VERCEL_ENV` is set automatically by Vercel — never set it by hand.

## 7. Local Supabase setup, migrations, and tests — exact commands

**Not run in this environment** — neither the Supabase CLI nor Docker is
installed here (`which supabase` / `which docker` both empty). Run these
yourself once both are available:

```bash
# One-time
brew install supabase/tap/supabase   # or npm/other install method
supabase init                        # if this repo has no supabase/config.toml yet — it doesn't
supabase start                       # starts local Postgres + Auth + Storage in Docker

# Apply every migration in supabase/migrations/ to the local DB
supabase db reset

# Run the pgTAP test suites (rls_isolation.test.sql, storage_isolation.test.sql)
supabase test db
```

`supabase db reset` is safe against the **local** Docker Postgres only —
never run it against a remote/production project (it drops and recreates
the database from migrations). To apply these migrations to a real hosted
project instead: `supabase link --project-ref <ref>` then
`supabase db push`.

After the local stack is running, also run the one-time bootstrap (creates
Teague's own workspace/owner account and, optionally, one separate
test-client account for the pilot E2E check):

```bash
SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`> \
NEXT_PUBLIC_SUPABASE_URL=<from `supabase status`> \
BOOTSTRAP_OWNER_EMAIL=teaguebarnett@gmail.com \
BOOTSTRAP_TEST_CLIENT_EMAIL=<a real inbox you control> \
node --experimental-strip-types scripts/bootstrap-workspace.mts
```

## 8. Vercel deployment checklist (config only — nothing deployed)

Nothing in this phase created a Vercel project, linked one, or deployed
anything — this is guidance for when Teague does that himself.

1. Create the Vercel project from this repo (or connect the existing one).
2. In **Preview** environment variables: set `APP_MODE` to either value
   depending on what that Preview build should demonstrate; set the four
   Supabase variables if testing against a staging Supabase project.
3. In **Production** environment variables: set `APP_MODE=supabase` and
   all four Supabase variables pointed at the real production Supabase
   project. Do **not** deploy to Production with `APP_MODE` unset or
   `demo` — the app will refuse to start (§1).
4. **Custom SMTP is required before any real invitation email can send.**
   Supabase's default email sending is rate-limited and intended for
   testing only — see Supabase Dashboard → Project Settings → Auth →
   SMTP Settings. This must be configured before running
   `scripts/bootstrap-workspace.mts` or `inviteToWorkspace` against the
   real project, or invitation emails will not reliably arrive.
5. Confirm in the Supabase Dashboard (Project Settings → API) that the
   **exposed schemas** for the Data API list only `public` (and `storage`)
   — never `app_private`. The migrations revoke all grants on that schema
   from every API-facing role, but this is worth a manual confirmation
   too.

## 9. What's completed vs. what requires real credentials

**Completed in this environment** (see the final report's §7 for exact
commands/results): all TypeScript compiles and lints clean; `next build`
succeeds with the new auth routes included; every pure-logic verify suite
passes, including the two new contract suites and the new runtime-mode
suite; every pre-existing demo-mode verify suite still passes unchanged
(regression check).

**Requires real credentials/local infra — not run here**:

- Applying the migrations to any real Postgres (local via Docker, or a
  hosted Supabase project) — §7's exact commands.
- Running `supabase test db` (the pgTAP RLS/Storage isolation suites) —
  same prerequisite.
- Running `scripts/bootstrap-workspace.mts` against a real project.
- Signing in through `/auth/sign-in` against a real Supabase project and
  confirming `/auth/account` renders real identity/membership data.
- Sending a real invitation email (also requires custom SMTP, §8.4).

**Never treat this document, or the existence of the migration/test files,
as proof any of the above passed.** They have not been executed.

## 10. Phase 6.0B seam — replacing PUSH_WORKOUT for real

`lib/production/repository.ts`'s `FoundationRepository` interface is the
seam: `getFoundationRepository()` returns either the demo adapter
(unchanged `lib/tenancy/seed.ts` data) or the Supabase adapter (real RLS-governed
queries), and callers never branch on mode themselves. Phase 6.0B's actual
work:

1. Extend `FoundationRepository` (or add a sibling interface following the
   same pattern) with the program/nutrition assignment queries the live
   workout engine (`lib/workout/verify-assigned-program-engine.mts` and its
   surrounding resolution logic) actually needs — `program_assignments` →
   `training_program_versions.content` is already schema-ready for this.
2. Write the Supabase adapter's implementation against that `content jsonb`
   payload, validating it into the same `Workout`-shaped TypeScript the
   demo engine already produces (see `lib/types.ts`).
3. Swap the live workout session's data source behind that seam, in
   Supabase mode only — demo mode continues reading `lib/tenancy/seed.ts`
   exactly as it does today.

## 11. Deferred: Phase 6.0C (intelligent chat/escalation) and import execution

- **Communications** (`lib/communications/types.ts`): persistence and
  state-machine contracts only. No logic decides when a client message
  should escalate — that trigger logic, the actual AI response generation,
  and campaign personalization are Phase 6.0C.
- **Imports** (`lib/imports/types.ts`,
  `supabase/migrations/20260909000006_imports.sql`): staging schema and
  provenance/approval contracts only. No OCR, spreadsheet, PDF, or
  screenshot parser exists yet — those write *into* this schema in a later
  phase. No real client's data has been imported; the schema exists so a
  future import pipeline has somewhere correct to write.
