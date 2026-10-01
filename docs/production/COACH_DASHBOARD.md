# Coach dashboard (Gate 2 — launch pass)

The live coach dashboard at `/coach` (Supabase mode) is the coach's daily
briefing: what's happening, who needs them and why, what to do next, and what
has already been taken care of. Demo mode keeps its own separate dashboard
(`components/coach/demo-coach-dashboard.tsx`), unchanged.

## Where things live

| Concern | File |
|---|---|
| What belongs in each zone, all copy, ordering (pure, unit-tested) | `lib/coach/dashboard-zones.ts` |
| Tests for every required state | `lib/coach/verify-dashboard-zones.mts` (`npm run verify:dashboard-zones`) |
| Deterministic fixtures (fictional people) | `lib/coach/dashboard-fixtures.ts` |
| Real reads → dashboard input (coach's own session, RLS applies) | `lib/production/coach-dashboard.ts` |
| Rendering only | `components/coach/coach-dashboard-view.tsx`, `app/coach/page.tsx` |
| Browser-local greeting/date | `components/coach/coach-greeting.tsx` |
| Visual preview of every state (dev builds only) | `/dev/coach-dashboard?scenario=mixed` |

The UI never decides zone membership. Change a rule in `dashboard-zones.ts`
and add a check to its verify script.

## The three zones

- **Needs you** — unresolved items that need the coach's authority:
  - open escalations (pain/safety always first);
  - a client who replied in an open personal thread;
  - pending adjustment proposals;
  - first-program drafts awaiting approval;
  - clients who finished onboarding and need setup or activation;
  - an unconfirmed coaching method.
- **Worth knowing** — awareness, no action needed:
  - an open thread where the coach spoke last (waiting on the client);
  - invited or onboarding clients (grouped above three);
  - activated clients whose program hasn't started;
  - one optional pattern suggestion.
- **Handled** — the last 7 days:
  - replies OPTIM sent on its own (decision "answer", not escalated, not a coach-approved draft);
  - escalations resolved in the window, labelled with what the coach did. Every escalation is resolved by the coach, never by OPTIM alone.

"Clients on track" is never counted as handled. It appears only in the quiet
roster line under the briefing.

If a supporting read fails, the dashboard says so and never shows
"Everything's under control" (`unavailable` in the input).

## Deferred to later gates

- **Coach timezone (Gate 3):** there is no stored coach timezone. The greeting
  and date use the browser's clock. Capturing and storing a durable coach
  timezone belongs to the coach account/onboarding gate.
- **Calibration (Gate 3):** the dashboard only reports the truth.
  - Confirmation is read through `getMethodologyConfirmation`, never the
    playbook row's bootstrapped "approved" status. An unconfirmed method is a
    NEEDS YOU item linking to `/coach/settings#coaching-method`.
  - A first-program draft says it can't be approved until the method is
    confirmed.
  - The full calibration flow, and making a new coach's first run start
    there, belong to Gate 3.
- **Per-client findings (Gate 5):** the Phase 9D client-state findings shown on
  each client page are computed on demand, per client. They are deliberately
  not aggregated onto the dashboard. Doing so would mean N analyses per page
  load. They should be materialized asynchronously as part of the real coach ↔
  client loop, then read here.
- **Nav badge:** the "Escalations" badge still counts every open inbox item,
  including adjustments and threads waiting on the client. It was left as-is
  this gate.
