-- =============================================================================
-- Fix: infinite recursion (42P17) in the profiles UPDATE policy
-- Migration: 20260617000001_fix_profiles_update_policy_recursion
--
-- The "profiles: own update" policy's WITH CHECK contained a subquery against
-- `profiles` itself:
--     role = (select role from profiles where id = auth.uid())
-- Evaluating that subquery re-triggered the profiles policies, causing
-- "infinite recursion detected in policy for relation profiles" (42P17) and a
-- 500 on EVERY authenticated profile update (location, avatar_url, cover, etc.).
-- Reads were unaffected (SELECT policy is `using (true)`), so profiles loaded
-- but no edit ever saved.
--
-- Fix: use the existing SECURITY DEFINER helper current_user_role(), which
-- reads the role bypassing RLS (no recursion) while preserving the intent that
-- a user cannot change their own role.
-- =============================================================================

drop policy if exists "profiles: own update" on public.profiles;

create policy "profiles: own update"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role = (select public.current_user_role())
  );
