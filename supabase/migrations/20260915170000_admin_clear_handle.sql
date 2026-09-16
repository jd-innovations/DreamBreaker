-- Taking an abusive handle away.
--
-- The gap flagged when the handle rules landed: set_my_handle() is the only
-- write path, and it deliberately refuses to touch anyone else's row. So there
-- was no way for an admin to remove an impersonating or abusive handle short
-- of editing the table by hand -- and the BEFORE UPDATE guard blocks even that
-- from any client session, since it runs as `authenticated`.
--
-- Cheap to add now because nobody can hold a handle yet. Awkward to add later,
-- in the moment it is first needed, which is exactly when there is no time.
--
-- This function passes the guard for the same reason set_my_handle() does: it
-- is SECURITY DEFINER owned by postgres, so current_user inside it is postgres,
-- not 'authenticated'.

create or replace function public.admin_clear_handle(
  p_user_id uuid,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prev text;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;

  select handle into v_prev from public.profiles where id = p_user_id for update;

  if v_prev is null then
    return jsonb_build_object('ok', true, 'reason', 'no_handle');
  end if;

  -- THE DECISION WORTH STATING: the cleared handle is RESERVED, not released.
  --
  -- Releasing it immediately hands it straight back to whoever was abusing it,
  -- or to the next person to type it, which in an impersonation case is the
  -- same problem with a different account. Reserving it costs one row and one
  -- name out of an effectively unlimited namespace.
  --
  -- Reserved rather than reassigned to the impersonated party on purpose: we
  -- do not know who that is, and guessing would be its own kind of wrong.
  insert into public.reserved_handles (handle, reason)
  values (v_prev, coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'cleared by admin'))
  on conflict (handle) do nothing;

  -- handle_changed_at is cleared too, so the person is NOT left serving a
  -- 30-day cooldown for a name that was taken away from them. The reservation
  -- above is what prevents a retake; the cooldown is for ordinary churn and
  -- would only stop them choosing something acceptable.
  update public.profiles
     set handle = null, handle_changed_at = null
   where id = p_user_id;

  return jsonb_build_object('ok', true, 'cleared', v_prev);
end;
$function$;

revoke execute on function public.admin_clear_handle(uuid, text) from public, anon;
-- `authenticated`, not service_role: is_admin() reads auth.uid(), which is NULL
-- under a service-role client. Same lesson as admin_grant_wallet_item.
grant  execute on function public.admin_clear_handle(uuid, text) to authenticated;

comment on function public.admin_clear_handle(uuid, text) is
  'Removes a handle and RESERVES it, so an impersonating name cannot be immediately retaken. Clears the cooldown so the user can still choose an acceptable one.';
