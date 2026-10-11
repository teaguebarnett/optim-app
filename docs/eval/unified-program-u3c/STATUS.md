# Unified Program — Gate U3C checkpoint status: Atomic Publication

**Status: DEVELOPMENT CHECKPOINT — locally verified (real Postgres + RLS + browser on local Supabase), not deployed.**
Branch `unified-program-v1`. Migrations 034–036 are applied to the LOCAL database only (clean `db reset` verified).
No paid model calls. Production untouched.

## What U3C delivers

- **`public.publish_unified_proposal` (migration 036)** — one SECURITY DEFINER function, one transaction: publishes the
  approved training (its client copy) and nutrition (approval time stamped), assigns both through the existing
  `assign_active_program_version` / `assign_active_nutrition_plan_version`, sets the start date for a replacing program,
  archives this proposal's unpublished drafts, supersedes every other open unified proposal for the client (and archives
  their drafts) and any legacy pending program draft, writes the client's in-app notification, records `published`
  publication events and marks the proposal published. Any failure rolls everything back.
- **Safety:** assigned coach / workspace admin only (`can_manage_client`); per-client serialization (client row lock);
  idempotent replay of a published proposal; the approved versions must match the approval exactly (database-side
  fingerprints recorded AT approval — migration 036 extends the U3B trigger); the client's active assignments must be
  exactly what the coach saw; replacing an active program/plan needs explicit confirmation; a continuation of the
  approved program keeps the client's position (start date refused); a new program needs its start date. Direct writes
  can never mark a proposal published or superseded (transaction-local marker set only by the function).
- **App side (`lib/production/unified-publication.ts`):** re-runs the full U3B gate against the CURRENT client
  (decisions, drafts, confirmed restrictions, staleness), checks the app-side approval hashes, refuses programs the
  client's Today can't show, builds the client copy of Reasoner lifting (cardio sessions kept as reviewed), cleans up its
  copy on failure/replay. Coach UI: a publish panel on the approved review (what it replaces, start date, supersession,
  confirmation) and the published summary.
- **Client app correctness (found in this gate's browser QA):** Reasoner lifting (effort as RIR) couldn't be shown on
  Today at all — `universalProgramToTodayProgram` shows it on the RPE scale (RPE = 10 − RIR) while workouts still run
  from the universal program; real clients no longer see the demo StairMaster cardio task, the demo "Previous: 191.4 lb"
  weight, or the demo weekly coach note.

## Verification

`e2e:unified-publication` 40/40 (first publication, client receipt via RLS, idempotent retry, permissions/isolation,
concurrent double publish, replacement with confirmation/start date/conflicting expectations, history byte-identical,
supersession, mid-transaction failure rollback, stale approvals incl. database fingerprint, continuation with position
preserved and nutrition omitted, Today-incompatible program held); pgTAP 178/178 (14 new); `verify:unified-review`
13/13; e2e review 37/37, drafts 39/39, client-ownership 11/11, client-lifecycle 35/35; 105/106 verify suites (unrelated
`verify:nutrition-authoring`); typecheck; lint 0 errors; build. Browser (local): approve → publish → start date →
activate → client Today (Week 1 of 8, published nutrition targets, no demo items) and Plan (training week, nutrition).

## Known limits

1. Today renders one session per training day: programs with cardio sessions/cardio-only days are held at publication
   (clear reason) until Today supports multi-session programs.
2. The client's bell icon doesn't read `notifications` yet (the row is written only on successful publication).
3. No coach UI to *prepare* a unified proposal in production (paid model call) — local QA action only.
4. Decision-evidence records for unified approval/rejection/publication aren't written yet.
