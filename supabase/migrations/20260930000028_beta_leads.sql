-- Pre-launch beta waitlist ("lead bank") for the public website.
--
-- A lead is NOT an account: nothing here creates an auth user, profile,
-- workspace membership, or coach/client record, and nothing triggers
-- onboarding. Leads are stored for a later "OPTIM is now live" email.
--
-- Security model (least privilege):
-- - RLS is on and there is NO insert/update/delete policy; anon and
--   authenticated have no table privileges at all. Nobody can write rows
--   directly through the Data API.
-- - The ONLY write path is public.submit_beta_lead(), a SECURITY DEFINER
--   function that validates every field and only ever INSERTs (it never
--   updates or reveals an existing row). The public website calls it from a
--   server action with the anon key; the service-role key is not needed.
-- - Only platform owners/admins may read leads (for later launch email).
-- - Duplicate emails are detected case-insensitively via a unique index on
--   the normalized email; a duplicate submission changes nothing.

create type public.beta_lead_status as enum ('waitlist', 'invited', 'converted');

create table public.beta_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text check (last_name is null or char_length(last_name) between 1 and 80),
  email text not null check (char_length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  email_normalized text generated always as (lower(btrim(email))) stored,
  active_client_count text not null check (active_client_count in ('0', '1-5', '6-20', '21-50', '51+')),
  instagram_or_website text check (instagram_or_website is null or char_length(instagram_or_website) between 1 and 200),
  source text not null default 'website_beta' check (char_length(source) between 1 and 40),
  status public.beta_lead_status not null default 'waitlist',
  launch_email_consent boolean not null,
  consent_at timestamptz,
  consent_text text check (consent_text is null or char_length(consent_text) <= 500),
  constraint beta_leads_consent_recorded check (not launch_email_consent or (consent_at is not null and consent_text is not null))
);

create unique index beta_leads_email_normalized_key on public.beta_leads (email_normalized);
create index beta_leads_status_created_idx on public.beta_leads (status, created_at desc);

alter table public.beta_leads enable row level security;

revoke all on public.beta_leads from anon;
revoke all on public.beta_leads from authenticated;
grant select on public.beta_leads to authenticated;
grant select, insert, update, delete on public.beta_leads to service_role;

create policy beta_leads_select_platform_admin on public.beta_leads for select to authenticated
  using (app_private.is_platform_admin(auth.uid()));

-- The one public write path. Returns 'created' or 'duplicate'. Raises a
-- check_violation for invalid input (the website validates first, so this
-- is a backstop against direct calls with the public anon key).
create or replace function public.submit_beta_lead(
  p_first_name text,
  p_email text,
  p_active_client_count text,
  p_instagram_or_website text,
  p_consent_text text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_first_name text := btrim(coalesce(p_first_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_link text := nullif(btrim(coalesce(p_instagram_or_website, '')), '');
  v_consent text := nullif(btrim(coalesce(p_consent_text, '')), '');
  v_id uuid;
begin
  if char_length(v_first_name) not between 1 and 80 then
    raise exception 'invalid first name' using errcode = 'check_violation';
  end if;
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email' using errcode = 'check_violation';
  end if;
  if p_active_client_count is null or p_active_client_count not in ('0', '1-5', '6-20', '21-50', '51+') then
    raise exception 'invalid client count' using errcode = 'check_violation';
  end if;
  if v_link is not null and char_length(v_link) > 200 then
    raise exception 'invalid link' using errcode = 'check_violation';
  end if;
  if v_consent is null or char_length(v_consent) > 500 then
    raise exception 'consent notice required' using errcode = 'check_violation';
  end if;

  insert into public.beta_leads (first_name, email, active_client_count, instagram_or_website, source, status, launch_email_consent, consent_at, consent_text)
  values (v_first_name, v_email, p_active_client_count, v_link, 'website_beta', 'waitlist', true, now(), v_consent)
  on conflict (email_normalized) do nothing
  returning id into v_id;

  return case when v_id is null then 'duplicate' else 'created' end;
end;
$$;

revoke all on function public.submit_beta_lead(text, text, text, text, text) from public;
grant execute on function public.submit_beta_lead(text, text, text, text, text) to anon, authenticated;
