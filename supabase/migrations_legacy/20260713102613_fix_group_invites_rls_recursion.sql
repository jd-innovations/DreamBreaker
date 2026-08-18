-- Fixes 42P17 "infinite recursion detected in policy for relation group_invites".
-- Root cause: group_invites' insert policy does a raw SELECT on groups, and
-- groups' "read invited" policy did a raw SELECT back on group_invites — a
-- genuine RLS cycle. Break it the same way is_group_member/is_group_admin do:
-- a SECURITY DEFINER function bypasses RLS on the table it queries internally.

create or replace function public.has_pending_group_invite(
  p_group_id uuid,
  p_user_id  uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_invites gi
     where gi.group_id = p_group_id
       and gi.invitee_id = p_user_id
       and gi.status = 'pending'
  );
$$;

drop policy if exists "groups: read invited" on public.groups;

create policy "groups: read invited"
  on public.groups for select
  using (public.has_pending_group_invite(id, (select auth.uid())));
