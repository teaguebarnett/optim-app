# Unified Program — Gate U3B checkpoint status: Unified Coach Review and Prepared Decisions

**Status: DEVELOPMENT CHECKPOINT — locally verified (real Postgres + RLS + browser on local Supabase), not deployed.**
Branch `unified-program-v1`. Migration 035 is applied to the LOCAL database only. No paid model calls.

## What U3B delivers

- **One coherent review** of a unified proposal (coach workspace): objective, each domain's status and summary, the
  coordinated week and workload, evidence (each domain's decisions with knowledge sources), prepared decisions,
  OPTIM's checks (errors, findings, documented limitations, assumptions/uncertainties), the editable prescriptions and
  the edit history.
- **Prepared decisions** carry stable keys; answers are recorded with the coach, time and exact question. Program-level
  and restriction decisions are recomputed on every revalidation; a changed question needs a new answer.
- **Edits** (training item: sets / reps / RPE / duration / CR10 effort / intervals / remove; nutrition: prescribed
  targets, meal notes, habits) create NEW draft versions (history kept), are optimistic-concurrency safe, and are
  revalidated: domain validity, fit with the CURRENT confirmed restrictions, documented-limitation review, the coach's
  own method ranges (findings, not errors), U1's week-level rules (`weekChecks`), direction agreement, and whether
  nutrition still fits edited lifting. Cardio sessions stay consistent with their edited prescription.
- **Never forced:** lifting from an approved program can't be edited here; a domain the proposal didn't produce
  (not coached / unsupported / held) can't be added; nutrition edits can only change targets the coach's method
  prescribes (calories+protein never gains carbs/fat).
- **Approve** = the coach's decision bound to the exact draft versions + content hashes, only when nothing blocks it
  (no errors, every decision answered, status reviewable, not stale: coach method, client facts/restrictions, goal, and
  the approved program it was built around). It **publishes, assigns and notifies nothing**; drafts stay drafts.
- **Reject** records the reason and archives every draft version the proposal produced.
- **Migration 035** (`unified_proposal_review`): `approval_state` ∈ proposed/approved/rejected; review columns; checks
  (approved ⇒ bound to linked versions + hashes + reviewable status; proposed ⇒ no review fields); trigger: decided rows
  immutable, only the assigned coach / workspace admin may review, recorded reviewer = caller, approved links must still
  be drafts, drafts can't change in the decision write.

## Verification

`verify:unified-review` 11/11 (offline rules); `e2e:unified-review` 37/37 (local, real sessions + RLS); pgTAP 164/164
(16 new for 035); `e2e:unified-drafts` 39/39; unified 31/31 + 17/17; cardio 86/86; resistance 30/30; 104/106 verify
suites (the unrelated `verify:nutrition-authoring` .tsx import, and the known `verify:activation-lifecycle` Date.now
flake when it occurs); typecheck clean; lint 0 errors; build compiles. Browser QA (local): review renders through the
real server pipeline (not stale), cardio + nutrition edits with live revalidation, decisions answered, approve (DB:
approved, drafts still drafts, no assignments) and reject (drafts archived, health review untouched).
`scripts/qa-seed-unified-review.mts` + `prepareUnifiedProposalLocalQaAction` (local test provider + local Supabase
only) reproduce it.

## Remaining for atomic publication (U3C)

1. A database function that, in ONE transaction, re-verifies an `approved` proposal (approval state, linked versions
   still drafts and byte-identical to `approved_content_hashes`, client/workspace/coach authority, proposal not
   superseded), publishes the approved training + nutrition versions, assigns both (`assign_active_program_version`,
   `assign_active_nutrition_plan_version` semantics), stamps nutrition `approvedAtIso`, and marks the proposal
   published — all or nothing.
2. Client-facing training content: Reasoner-proposed lifting goes through `clientFacingProgramContent` (as the
   existing approve flow does) before publication; unified cardio sessions already carry client copy.
3. Supersession: what happens to a client's legacy pending draft / earlier unified proposals when one is published.
4. Enrollment / start date and the client notification, after publication only.
5. Decision evidence for unified approvals/rejections (the existing evidence projections), and a generation trigger in
   the coach UI (paid model calls — needs a spending decision).
