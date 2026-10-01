# Coach Brain (Gate 3 foundation)

OPTIM is one shared intelligence. Each coach also has an isolated **Coach
Brain** describing how *they* coach. Together, these let OPTIM operate like
that specific coach.

## Three kinds of knowledge — never confused

| Kind | Where it lives | Authority |
|---|---|---|
| **Confirmed methodology** — what the coach told OPTIM or explicitly confirmed | `coach_method_versions` (immutable) | Authoritative |
| **Inferred tendencies** — patterns OPTIM observes | `coach_decision_evidence` → pattern candidates → `coach_learned_rules` (+ a future tendencies store, Gate 6) | Never methodology on its own |
| **Temporary context** — client/situation exceptions | Not written into the method | — |

System defaults (OPTIM's starting values) carry `optim_default` provenance.
They never count toward calibration and are never presented as coach truth.

## Tables

Migration: `supabase/migrations/20261001000029_coach_brain.sql`.

- **`coach_brains`**
  - One per (workspace, coach).
  - Holds the active method version and the calibration state.
- **`coach_method_versions`**
  - Immutable confirmed snapshots, made of:
    - the operating model with per-field provenance;
    - explicit AI authority;
    - the source calibration answers;
    - source (`calibration` / `method_review` / `authority_update`);
    - who confirmed it.
  - Insert-only: updates are blocked by a trigger, even for the service role.
- **`coach_calibration_progress`**
  - The coach's in-progress explicit answers and position, either initial or a review draft.
  - Never read as methodology.

RLS requires `coach_user_id = auth.uid()` **and** workspace staff membership on
every row. Two coaches in one workspace can never read or change each other's
Brain.

`confirm_coach_method()` is the **only** way a method version is created. It
runs as one transaction:
1. inserts the version;
2. activates it on the brain;
3. closes the progress row.

It refuses a stale draft.

`coach_playbooks` stays as legacy scaffolding:
- **Teach OPTIM drafts:** still written there.
- **Cleanup:** to be retired once nothing else writes to it.
- **Calibration:** it never counts as calibration.

## Canonical read path

`lib/production/coach-brain.ts` (pure rules in `lib/coach/coach-brain.ts`):

- **`getOwnCoachBrainState()` / `getOwnCoachIntelligence()`** — the signed-in
  coach's own Brain, read under their own RLS. Used by the dashboard, Settings,
  calibration, pattern analysis and learned rules.
- **`resolveCoachIntelligenceForClient()`** — the client's **primary assigned
  coach's** Brain, whoever is acting. It's read via the service role, after the
  caller has authorized access to the client. A client with no primary coach
  gets conservative "no Brain" intelligence, never a guessed coach. Used by:
  - program generation;
  - proposal review and approval;
  - adjustments;
  - chat;
  - learned-rule application.

## Rules enforced

- **Calibrated** means:
  - every required, live-supported question is explicitly answered;
  - AI authority is explicitly confirmed;
  - the coach confirmed at the final review;
  - a version was created and activated.

  Defaults, auto-created playbooks and the legacy 12-field form never count.
- **Guard:** `app/coach/layout.tsx` sends any coach without a confirmed Brain to
  `/coach-onboarding`, failing closed if the Brain can't be read.
- **Authority** starts at Advisor and is never assumed broader.
- **No confirmed Brain** — chat uses system defaults for plumbing only. The
  prompt tells OPTIM it has no coach method, to stick to logistics and escalate
  anything methodology-dependent. Generation and adjustments refuse.
- **Method changes:** "Review or update your method" opens a draft prefilled
  from the active version. Nothing changes until the coach confirms, which
  creates a new version.
- **Stale drafts:** program and adjustment drafts record `methodVersionId`. One
  prepared under another version (or before Gate 3) can't be approved; the
  coach rejects and regenerates.

## Deferred

- **Gate 6 — adaptive learning:**
  - producing `CoachTendency` records;
  - surfacing "you've handled this differently — update your method?";
  - promoting coach-approved proposals and Teach OPTIM examples into a method
    review.
- **Imports:** the survey's "Learn from your existing work" chapter is hidden in
  live mode. It needs coach program templates and meal recommendations, which
  exist only in demo mode.
- **Chat classification:** the no-Brain chat restriction relies on prompt
  instructions for "coaching vs logistics". The deterministic guarantees are:
  - Advisor authority;
  - no plan changes from chat;
  - escalation of every proposed action.
- **Retirement:** `coach_playbooks` and the legacy method form/action
  (`live-coach-playbook-summary.tsx`, `app/actions/coach-methodology.ts`), once
  nothing depends on them.
