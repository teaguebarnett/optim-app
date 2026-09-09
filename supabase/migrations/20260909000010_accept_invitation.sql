-- Phase 6.0A — Production Foundation.
--
-- accept_invitation — the one SECURITY DEFINER function an invited person
-- calls, once authenticated, to actually join the workspace they were
-- invited to. Required because at the moment of acceptance the caller has
-- no workspace_memberships row yet, so no ordinary RLS policy (all of which
-- key off an *existing* membership) could ever let them insert their own
-- first one. Deliberately narrow: matches the invitation's email against
-- the caller's own authenticated email (never trusts a client-supplied
-- email/invitation id pairing blindly), only ever touches the exact
-- invitation row and the exact client_profiles row it was issued for, and
-- is the only place other than the handle_new_user trigger that writes a
-- workspace_memberships row for a brand-new member.
--
-- Called from lib/production/invite.ts's acceptInvitation, itself invoked
-- from app/auth/confirm/route.ts right after Supabase verifies the
-- invitation's magic link and establishes a real session — see that file.

create or replace function public.accept_invitation(p_invitation_id uuid)
returns public.workspace_memberships
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invitation public.workspace_invitations;
  v_caller_email text;
  v_membership public.workspace_memberships;
begin
  if auth.uid() is null then
    raise exception 'accept_invitation: no authenticated caller.';
  end if;

  select email into v_caller_email from public.profiles where id = auth.uid();
  if v_caller_email is null then
    raise exception 'accept_invitation: caller has no profile yet.';
  end if;

  select * into v_invitation from public.workspace_invitations where id = p_invitation_id;
  if v_invitation is null then
    raise exception 'accept_invitation: invitation % not found.', p_invitation_id;
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'accept_invitation: invitation % is % (not pending).', p_invitation_id, v_invitation.status;
  end if;

  if v_invitation.expires_at < now() then
    update public.workspace_invitations set status = 'expired' where id = p_invitation_id;
    raise exception 'accept_invitation: invitation % has expired.', p_invitation_id;
  end if;

  if lower(v_invitation.email) <> lower(v_caller_email) then
    raise exception 'accept_invitation: invitation % was issued to a different email address.', p_invitation_id;
  end if;

  insert into public.workspace_memberships (workspace_id, user_id, role, status)
  values (v_invitation.workspace_id, auth.uid(), v_invitation.role, 'active')
  on conflict (workspace_id, user_id) do update set role = excluded.role, status = 'active'
  returning * into v_membership;

  if v_invitation.role = 'client' then
    update public.client_profiles
    set user_id = auth.uid(), updated_at = now()
    where workspace_id = v_invitation.workspace_id
      and user_id is null
      and lower(invited_email) = lower(v_invitation.email);
  end if;

  update public.workspace_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = p_invitation_id;

  return v_membership;
end;
$$;

-- SECURITY DEFINER functions are not automatically executable by
-- authenticated — grant explicitly. Safe to expose broadly: every guard is
-- inside the function body (email match, pending status, not expired).
grant execute on function public.accept_invitation(uuid) to authenticated;
revoke execute on function public.accept_invitation(uuid) from anon;
