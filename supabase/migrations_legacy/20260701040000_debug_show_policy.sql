-- TEMP DEBUG — return the literal, currently-active policy definitions on
-- public.conversations so we can compare against what we intended to push.
-- security definer so any authenticated caller can read pg_policies regardless
-- of catalog grants. Drop once the issue is confirmed fixed.
create or replace function public.debug_show_conversations_policies()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select jsonb_agg(jsonb_build_object(
    'policyname', polname,
    'cmd', case polcmd
      when 'r' then 'select' when 'a' then 'insert'
      when 'w' then 'update' when 'd' then 'delete' else 'all' end,
    'permissive', polpermissive,
    'roles', (select array_agg(rolname) from pg_roles where oid = any(polroles)),
    'qual', pg_get_expr(polqual, polrelid),
    'with_check', pg_get_expr(polwithcheck, polrelid)
  ))
  from pg_policy
  where polrelid = 'public.conversations'::regclass;
$$;

grant execute on function public.debug_show_conversations_policies to authenticated;
