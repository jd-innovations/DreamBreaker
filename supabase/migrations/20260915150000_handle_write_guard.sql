-- Make set_my_handle() the only client path to profiles.handle.
--
-- The intended guard in 20260915140000 was:
--
--     revoke update (handle) on public.profiles from authenticated;
--
-- It silently did nothing. UPDATE is granted to authenticated at the TABLE
-- level -- relacl reads `authenticated=arwdDxtm/postgres` -- and a
-- column-level revoke cannot subtract from a table-level grant. Postgres
-- raises no error; it simply has no effect. Caught only because
-- has_column_privilege() was checked afterwards, which is the lesson worth
-- keeping: a revoke that reports success is not evidence of a revoked
-- privilege.
--
-- Doing it properly with grants would mean revoking table UPDATE and
-- re-granting 55 columns by name, which then breaks quietly every time a
-- column is added and nobody remembers to grant it. A trigger states the rule
-- once, in one place, and keeps stating it.
--
-- NOT security definer, deliberately. A definer trigger would execute as
-- postgres, so current_user could never be 'authenticated' and the check could
-- never fire -- the guard would be decorative. set_my_handle() IS security
-- definer and owned by postgres, so its own write passes this guard while a
-- direct client PATCH does not.

create or replace function public.fn_guard_handle_write()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (new.handle is distinct from old.handle)
     or (new.handle_changed_at is distinct from old.handle_changed_at) then
    if current_user in ('authenticated', 'anon') then
      raise exception 'handle_direct_write_denied' using errcode = 'P0001',
        hint = 'Set a handle with set_my_handle(), which applies the format, reserved-name and cooldown rules.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_handle_write on public.profiles;
create trigger trg_guard_handle_write
  before update on public.profiles
  for each row execute function public.fn_guard_handle_write();

comment on function public.fn_guard_handle_write() is
  'Makes set_my_handle() the only client path to profiles.handle. A column-level revoke cannot do this because UPDATE on profiles is granted table-wide.';
