-- Gate 4.0C-4 follow-up — tighten table grants on public.reasoner_generation_jobs
-- to OPTIM's established per-table convention (20260909000008's blanket
-- anon revoke + DELETE revoke, re-stated explicitly for every later table:
-- 20260909000011 daily_records, 20260911000013 client_onboarding_progress).
-- Migration 031 inherited Supabase's broad default privileges instead
-- (anon: REFERENCES/TRIGGER/TRUNCATE; authenticated: DELETE/TRUNCATE/...).
--
-- After this migration:
--   anon           — nothing.
--   authenticated  — SELECT, INSERT, UPDATE only: exactly what the RLS
--                    policies (select/insert/update for workspace staff) and
--                    the production workflow (the coach's session inserts the
--                    'preparing' job and records its outcome) use. No DELETE
--                    (job rows are audit history; there is no delete policy),
--                    and none of TRUNCATE (bypasses RLS), REFERENCES or
--                    TRIGGER, which nothing needs.
--   service_role   — unchanged (Supabase default, same as every table).
-- RLS and policies are unchanged. No other table is touched.

revoke all on public.reasoner_generation_jobs from anon;
revoke all on public.reasoner_generation_jobs from authenticated;
grant select, insert, update on public.reasoner_generation_jobs to authenticated;
