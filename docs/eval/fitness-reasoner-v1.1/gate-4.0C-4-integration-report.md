# Gate 4.0C-4 — Fitness Reasoner production integration

The Reasoner is now wired into the real proposal workflow behind a server-side allowlist. Path:

- client state + Coach Brain + GoalContract + confirmed constraints
- → Fitness Reasoner (medium effort, background)
- → deterministic validation
- → persisted DRAFT
- → existing coach review
- → existing approval
- → client

**Off for everyone in production** until migration 031 is applied and the allowlist env var is set (both need Teague's approval).

## Existing workflow (unchanged)
- **Generate:** `createProgramProposalAction` → legacy generator → `training_program_versions` draft (`proposed_for_client_profile_id`).
- **Review/edit:** `ProgramProposalReview`, with edits stored as new draft versions.
- **Approve:** `approveProgramProposalAction`:
  - checks verified `generationInputs`, current prerequisites and method staleness;
  - then publishes and assigns;
  - clients see a version only through their assignment (RLS).

## Architecture chosen
**Persistence:** a new `reasoner_generation_jobs` table (migration 031):
- staff-only RLS;
- a partial unique index allowing **one 'preparing' job per client**;
- the serialized ReasonerRun plus audit columns.

**Generation (`requestReasonerProposalAction`):**
1. Authorize the coach, check the allowlist, check the existing prerequisites, enforce one pending proposal.
2. Insert the job (single-flight).
3. Start the run in `after()` and return immediately.
4. The route's `maxDuration` is 300 s and the provider timeout 240 s.
5. A job still preparing after 8 minutes is closed as `timed_out` the next time it is read.

**Draft and UI:**
- `saveReasonerDraft` re-checks pending proposal, prerequisites and the method version, then converts the validated spec into the existing `UniversalTrainingProgramContent`:
  - the weeks come straight from the validated, phase-computed prescriptions;
  - verified `generationInputs`;
  - a new additive `reasonerProvenance` field.
- It is saved through `createDraftProgramVersion`, so review, edit and approve are untouched.
- The coach UI is `ReasonerProposalPanel`: preparing / needs input / unsupported / failed, polling every 5 s, and only for allowlisted clients. Everyone else gets the legacy form.

**Why this design:** it is the smallest reliable async pattern on Vercel + Supabase. There is no queue service, the existing lifecycle is reused, and the database enforces single-flight.

## Authority boundaries
- The Reasoner path never publishes, assigns, edits Coach Brain or writes constraints (enforced in source tests).
- Approval is still `approveProgramProposalAction`, unchanged.
- Job rows are staff-only; clients can read neither drafts nor jobs (verified with a real client session).
- The local test provider is honored only when the Supabase URL is local.

## Domain routing and failure behavior
- **Unsupported domain:** `unsupported`, explicit message, no model call, no draft, nothing substituted.
- **NEEDS_INPUT:** `needs_input`, listing what is missing and who provides it.
- **Provider failure / no provider / load error:** `failed/provider_failed`.
- **Validator rejection after the one in-run repair:** `failed/rejected_by_validators`.
- **Draft can't be saved:** `draft_not_saved` or `superseded`.
- All messages are fixed text: no provider text, keys or stacks. A failure never falls back to another planner.

## Structured target capture
- Optional intake fields (`targetLift` = a Knowledge exercise id, `targetLiftValue` in lb, `targetLiftReps`), shown only for a primary or secondary strength goal.
- `ClientState` maps them into `GoalContract.performanceTargets`. An explicit `performanceTargets` answer still works, and clients without a target are unchanged.
- No second goal system.

## Review experience
The existing review card gains "Prepared by OPTIM's Fitness Reasoner":
- **Needs you** (open by default), **Worth knowing**, **Handled**;
- **Why OPTIM decided this**, with plain-language evidence labels and a short run/version reference.

Internal codes (constraint aliases, K/U fit codes, coach rule keys) are translated deterministically. No raw JSON is shown.

## Offline evidence
- `verify:reasoner-integration` passes 13/13, new tests covering:
  - the rollout allowlist and single-run job orchestration;
  - unsupported, NEEDS_INPUT and failure paths, with no secrets in outcomes;
  - draft-save races and stale jobs;
  - audit columns;
  - conversion: valid, approvable, prescriptions equal the spec;
  - review grouping, intake target mapping and visibility;
  - authority boundaries in source;
  - plain-language translation.
- `verify:reasoner` passes 24/24 and the eval 25/25.
- 93 of 94 `verify:*` suites pass. The exception, `verify:nutrition-authoring`, is pre-existing (`.tsx` import). `verify:activation-lifecycle` is intermittently flaky (pre-existing `Date.now()` ids).
- tsc, lint (0 errors) and build are clean.
- **Saved-run replay:** the 3C live v1.3 run converts to valid, approvable content (12 weeks × 6 days) with 0 code leaks.
- Guard tests updated deliberately: the onboarding moment limit; the client-entry "last visible screen" check; the synthesis importer allowlist; "legacy generator untouched" narrowed to the generator itself.

## Local end-to-end (real UI, real session, local Supabase)
| | Result |
|---|---|
| Panel only for allowlisted client; legacy form otherwise | ✓ |
| Request returns immediately; "preparing" shown in ~0.5 s | ✓ |
| Rapid triple click + extra click → exactly 1 job | ✓ (client re-entry guard + DB unique index; the DB refuses a second in-flight row, 23505) |
| Refresh while preparing → still preparing, no new job | ✓ |
| Completion → draft appears in existing review, auto-refresh | ✓ |
| Draft is `draft`, no assignment; client can't read draft or jobs | ✓ |
| Audit: run + versions + 4 hashes + tokens + latency persisted; no secrets | ✓ |
| Approve (scripted local draft) → published + assigned; client can read it only then; job unchanged | ✓ |
| Provider failure / invalid output / unsupported domain → safe messages, no draft | ✓ |

## The live generation (1 paid generation, medium effort)
- **Input:** local mirror of the internal test client (production method v6, confirmed limitations, intake; local only).
- **Result:** 1 model call, PLANNED on the first attempt · 9,079 in / 9,901 out tokens · 108 s · `claude-opus-5`.
- **Draft:** saved for review: 6 days / Push-Pull-Legs ×2 / 12 weeks. Needs you lists the blocked bench goal and the uncertain-fit Lat Pulldown.
- **Not done:** no approval (stopped at review-ready).

## Unverified / risks
- **Production is untouched:** migration 031 is not applied; `OPTIM_REASONER_PROPOSAL_CLIENTS` is unset.
- **Vercel `after()` + `maxDuration = 300`** is not exercised in production; dev doesn't enforce limits.
- **Server render of a full 12-week × 6-day draft** took 12–14 s in dev mode (existing review component; production build not measured).
- **The intake target UI** is tested by logic, not rendered end to end in onboarding.
- **Persisted drafts keep the text they were saved with:** the live draft predates the last plain-language fix.
