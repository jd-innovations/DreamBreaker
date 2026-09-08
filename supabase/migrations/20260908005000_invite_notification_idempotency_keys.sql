-- Give the two invite-origin notifications (play_event_invite, group_invite)
-- a stable idempotency_key tied to the invite row that created them, so the
-- client can mark the notification read the moment the invite itself is
-- accepted or declined from the Received tab.
--
-- Without this, accepting/declining an invite from Received left its
-- duplicate row in the generic notifications feed (and its unread badge)
-- stuck forever -- only opening it from the Activity tab directly cleared it.
-- idempotency_key is already the mechanism every other notification insert
-- uses for exactly this kind of "this is the row for entity X" lookup (see
-- match_claimed, wallet_item_added), just unused here until now.

CREATE OR REPLACE FUNCTION "public"."notify_group_invite"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_group_name text;
  v_inviter_name text;
begin
  select name into v_group_name from public.groups where id = new.group_id;
  select full_name into v_inviter_name from public.profiles where id = new.inviter_id;

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (
    new.invitee_id,
    'group_invite',
    'New group invite',
    coalesce(v_inviter_name, 'Someone') || ' invited you to join ' || coalesce(v_group_name, 'a group'),
    '/groups/' || new.group_id,
    'group-invite/' || new.id::text
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION "public"."notify_play_event_invite"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_event_name text;
  v_inviter_name text;
begin
  select name into v_event_name from public.play_events where id = new.play_event_id;
  select full_name into v_inviter_name from public.profiles where id = new.inviter_id;

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (
    new.invitee_id,
    'play_event_invite',
    'New game invite',
    coalesce(v_inviter_name, 'Someone') || ' invited you to ' || coalesce(v_event_name, 'a game'),
    '/community/' || new.play_event_id,
    'play-event-invite/' || new.id::text
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$function$;
