-- Gate 6F — distinguishes a real, known timezone source (the client's own
-- detected IANA zone, or an explicit coach override) from
-- client_enrollments.timezone's raw schema default ('UTC'), which every
-- enrollment row already starts with the moment inviteClient creates it and
-- which means nothing until someone actually sets it on purpose. Without
-- this column there is no way to tell "a real UTC client" apart from
-- "nobody has set this yet" — which is exactly how a prior client's
-- activity got silently filed under the wrong calendar day. See
-- lib/production/roster.ts's activateClientEnrollment, which now refuses
-- activation until this is non-null, and
-- supabase/migrations/20260928000026_set_client_detected_timezone.sql for
-- the one write path a client is ever allowed to make here.
alter table public.client_enrollments
  add column timezone_source text check (timezone_source in ('client_detected', 'coach_override'));

comment on column public.client_enrollments.timezone_source is
  'Null until either the client''s own onboarding-detected IANA timezone or an explicit coach override has been recorded. activateClientEnrollment requires this to be non-null.';
