# Let OPTIM Build — integration status (local, not deployed)

**Status: LOCALLY VERIFIED with scripted (test-double) models. Not deployed. No paid model calls. Real AI output quality untested.**

## The path

Open client → decisions (health review, confirmed restrictions) → **Let OPTIM Build** → review the coordinated draft →
answer decisions / edit → approve → publish → set start date + activate → client Today.

## What changed (and why)

| Connection | Before | Now |
| --- | --- | --- |
| Resistance source for preparation | Production prepare *required* existing lifting and reused the pending legacy draft (`existing_draft`) | Fitness Reasoner plans lifting (`proposed_program`); an **approved** program is kept as-is; a pending legacy draft is never inherited (archived only when the unified proposal is published) |
| Spending / duration | 4 calls, 150 s, page `maxDuration` 300 | 6 calls (3 domains × one repair), no new call after 560 s, page `maxDuration` 800 (Vercel Pro) |
| Coach confirmation ↔ cardio | A coach-confirmed structured limitation interpreted only the coach's documented text, so the Cardio Reasoner still saw the client's raw report as uninterpreted → NEEDS_INPUT, holding the whole program | The confirmation also interprets the client's reported limitation (one rule for every reasoner) |
| Effort-limit decision | "Keep them with an effort limit" was recorded but never applied — the client saw RPE 9 | Binding: approval/publication blocked while a limited exercise is prescribed under 3 RIR; one-click "Apply the limit" (all weeks) |
| Legacy approval | Approved drafts containing exercises the confirmed restrictions rule out (e.g. Overhead Press, Farmer's Carry) | Refused with the conflicting exercise names |
| Coach UI | Legacy Generate, Reasoner panel, legacy draft review, Prepare card and planner preview all competing | One "Training program" card: decisions first, **Let OPTIM Build**, then the review; earlier tools collapsed under "Other program tools" (allowlisted clients only) |

## Verified locally (scripted models)

iCloud-like fixture (7 days available, 90 min, private gym, strength goal "bench 405", epigastric hernia, the six
restrictions confirmed in production, a 7-day legacy draft with restricted exercises):

- 6 sessions/week from 7 available days (frequency from the deterministic layer, not availability); restricted patterns
  absent; coach set/rep/effort ranges applied.
- Lift-only coach (as production): cardio NOT_COACHED, nutrition coordinated, 2 calls; publishable; legacy draft archived.
- Cardio-enabled coach: cardio coordinated (3 calls) but **publication is held** — Today supports one session per day.
- Decision → effort limit → apply → approve → publish → activate → client Today shows Week 1 of 8, 2,850 kcal, Session A
  with the limited exercise at RPE 7.
- Edit (remove an item) creates a new draft version that persists across reload.
- 390 px width: no horizontal overflow on the client workspace and review.

## Not verified / blockers

1. **Real AI quality** — the scripted resistance model picks exercises alphabetically from the eligible pool.
2. **Today and program cardio** — the client app's cardio prescription comes from mock data; coordinated cardio can't be
   published until Today supports multi-session days and reads program cardio.
3. ~~**Production client data** — goal weight 80 lb~~ — **resolved locally (needs migration 038):** the 80 lb was the
   onboarding wizard's target-weight wheel default (its minimum), saved for a question a "get stronger" client never
   sees. Fixed three ways: the wizard no longer records hidden or opt-out wheel defaults; planning ignores answers to
   questions the client never saw (lib/coach/intake-corrections.ts); and the coach can correct or clear an intake answer
   (migration 038 `correct_client_intake_answer` — the client's answer kept, the correction recorded with original,
   reason, who/when and history). Read-only on production: the client's stored answers escalate; the effective answers
   don't.
4. **Coach restriction choice** — "avoid moderate or hard bracing" rules out barbell bench press (bracing: moderate), the
   client's goal lift.
