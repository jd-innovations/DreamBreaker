-- Companion migration: re-attach the profile-creation trigger to auth.users.
--
-- Found 2026-08-18 while rehearsing item 1.3 on a preview branch built from this
-- repo: inserting an auth.users row created NO profile, because
-- trg_on_auth_user_created exists in production but was absent from every
-- database rebuilt from these migrations.
--
-- Cause: the 2026-07-25 baseline was captured with `supabase db dump --schema
-- public`. That flag excludes objects that live ON tables in other schemas, and
-- this trigger sits on auth.users. The FUNCTION it calls, public.fn_handle_new_user(),
-- is in the public schema and did come through the baseline — so the repo had the
-- behaviour but nothing wired to fire it.
--
-- Impact of the gap: a database built from this repo accepts signups and silently
-- produces no profile row. Every downstream read (the auth gate, profile screens,
-- registrations) then sees a user with no profile. Production was never affected;
-- only reproductions were, which is precisely the class of defect item 2.1 exists
-- to eliminate.
--
-- DB_REBASELINE_PLAN.md's step 1 lists the dump's known blind spots — storage
-- buckets/policies, extensions, realtime publication, cron. Triggers on auth
-- tables belong on that list and were not there.
--
-- Idempotent: safe to re-run, and a no-op in production, where the trigger
-- already exists with this exact definition.

drop trigger if exists trg_on_auth_user_created on auth.users;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();
