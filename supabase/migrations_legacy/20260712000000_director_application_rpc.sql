-- =============================================================================
-- Director application: RPC + RLS lockdown
-- =============================================================================
-- Problem found while building the mobile director-application flow: the
-- "profiles: own update" policy's WITH CHECK only pins `role` to its current
-- value (see 20260617000001). It never constrained `is_director` or
-- `director_status`, so any authenticated user could already run
--   update profiles set is_director = true, director_status = 'approved'
--   where id = auth.uid()
-- and self-approve as a director, bypassing the admin approval queue in
-- web/src/app/admin/page.tsx entirely. This predates this migration.
--
-- Fix: pin both columns in the own-update WITH CHECK (same pattern as
-- `role`), and add a single SECURITY DEFINER RPC that is the only legitimate
-- way for a player to request director status — it always lands on
-- director_status = 'pending', never 'approved', and only fires from a clean
-- (non-director) state so a suspended director can't use it to reinstate
-- themselves.
-- =============================================================================

create or replace function public.current_user_is_director()
returns boolean language sql stable security definer as $$
  select is_director from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_director_status()
returns director_status language sql stable security definer as $$
  select director_status from public.profiles where id = auth.uid();
$$;

drop policy if exists "profiles: own update" on public.profiles;

create policy "profiles: own update"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role            = (select public.current_user_role())
    and is_director      = (select public.current_user_is_director())
    and director_status is not distinct from (select public.current_user_director_status())
  );

-- apply_to_be_director: the only self-service path onto the director
-- approval queue. Idempotent no-op if already applied/approved; blocked for
-- suspended directors (they must be reactivated by an admin, not re-apply).
create or replace function public.apply_to_be_director()
returns director_status language plpgsql security definer set search_path = public as $$
declare
  v_current director_status;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select director_status into v_current from public.profiles where id = auth.uid();

  if v_current = 'suspended' then
    raise exception 'Your director access was suspended. Contact support to be reinstated.';
  end if;

  if v_current is null then
    update public.profiles
       set is_director = true,
           director_status = 'pending',
           updated_at = now()
     where id = auth.uid();
    v_current := 'pending';
  end if;

  return v_current;
end;
$$;

revoke all on function public.apply_to_be_director() from public;
grant execute on function public.apply_to_be_director() to authenticated;
