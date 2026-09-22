-- Campaign destination lookup — loose end from Phase 5 of
-- PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
--
-- campaign_destination_type() (20260921200000) checks a destination's SHAPE
-- only. A well-formed id that matches nothing passed, so one typo would send
-- every recipient to an error screen. This adds:
--
--   private.campaign_destination_lookup(url)  what the id points at: found?,
--                                             its name, its status, and a
--                                             warning when it is not live
--   admin_campaign_destination_preview(url)   the same, for the composer
--   admin_schedule_campaign                   now REFUSES a destination that
--                                             matches nothing — the server
--                                             guarantee, not just the UI's
--
-- Not-found blocks. A non-live target (cancelled tournament, sold listing,
-- private group, paused offer, …) only warns: sending to it is a judgement
-- call the admin makes, with the warning in front of them.
--
-- Tables are the ones the app's detail screens read:
--   tournament → tournaments        community   → play_events
--   marketplace → marketplace_listings  group   → groups
--   coach_offer → coach_offers

create or replace function private.campaign_destination_lookup(p_url text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text := public.campaign_destination_type(p_url);
  v_id uuid;
  v_label text;
  v_status text;
  v_warning text;
begin
  if v_type is null then
    return jsonb_build_object('type', null, 'found', false, 'reason', 'invalid');
  end if;

  -- The shape is already validated, so the id is the last path segment.
  begin
    v_id := substring(p_url from '([A-Za-z0-9-]{1,64})/?$')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('type', v_type, 'found', false, 'reason', 'not_a_uuid');
  end;

  case v_type
    when 'tournament' then
      select name, status into v_label, v_status from public.tournaments where id = v_id;
      v_warning := case v_status
        when 'draft' then 'This tournament is still a draft.'
        when 'cancelled' then 'This tournament is cancelled.'
        when 'completed' then 'This tournament is over.'
      end;
    when 'community' then
      select name, status into v_label, v_status from public.play_events where id = v_id;
      v_warning := case v_status
        when 'cancelled' then 'This event is cancelled.'
        when 'completed' then 'This event is over.'
        when 'full' then 'This event is full.'
      end;
    when 'marketplace' then
      select title, status into v_label, v_status from public.marketplace_listings where id = v_id;
      v_warning := case when v_status is distinct from 'active' then 'This listing is not active (' || coalesce(v_status, 'unknown') || ').' end;
    when 'group' then
      select name, privacy into v_label, v_status from public.groups where id = v_id;
      v_warning := case when v_status is distinct from 'public' then 'This group is ' || coalesce(v_status, 'not public') || ' — most recipients can''t open it.' end;
    when 'coach_offer' then
      select title, status into v_label, v_status from public.coach_offers where id = v_id;
      v_warning := case when v_status is distinct from 'active' then 'This offer is not active (' || coalesce(v_status, 'unknown') || ').' end;
    else
      return jsonb_build_object('type', v_type, 'found', false, 'reason', 'unsupported');
  end case;

  if not found then
    return jsonb_build_object('type', v_type, 'found', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'type', v_type, 'found', true, 'label', v_label, 'status', v_status, 'warning', v_warning
  );
end;
$$;

revoke all on function private.campaign_destination_lookup(text) from public;

-- Admin preview for the composer. Same is_admin() boundary as every admin_* RPC.
create or replace function public.admin_campaign_destination_preview(p_url text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return private.campaign_destination_lookup(p_url);
end;
$$;

revoke all on function public.admin_campaign_destination_preview(text) from public, anon;
grant execute on function public.admin_campaign_destination_preview(text) to authenticated;

-- ─── admin_schedule_campaign: refuse a destination that matches nothing ─────
--
-- Replaced whole (20260921200000); one addition — the lookup before the
-- status change. Everything else is unchanged.

create or replace function public.admin_schedule_campaign(
  p_campaign_id uuid,
  p_scheduled_at timestamptz default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_at timestamptz := coalesce(p_scheduled_at, now());
  v_key text;
  v_url text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- A minute of slack for clock skew between the admin's browser and here.
  if v_at < now() - interval '1 minute' then
    raise exception 'invalid_schedule' using errcode = '22023', hint = 'Choose a time in the future.';
  end if;
  if v_at > now() + interval '90 days' then
    raise exception 'invalid_schedule' using errcode = '22023', hint = 'Schedule no more than 90 days ahead.';
  end if;

  select destination_url into v_url from public.notification_campaigns where id = p_campaign_id;
  if v_url is not null and not coalesce((private.campaign_destination_lookup(v_url)->>'found')::boolean, false) then
    raise exception 'destination_not_found' using errcode = '22023',
      hint = 'The item this notification opens no longer exists. Edit the draft and choose another.';
  end if;

  update public.notification_campaigns
     set status = 'scheduled',
         scheduled_at = v_at,
         idempotency_key = encode(extensions.gen_random_bytes(16), 'hex')
   where id = p_campaign_id
     and status = 'draft'
  returning idempotency_key into v_key;

  if v_key is null then
    raise exception 'campaign_not_schedulable' using errcode = '55000', hint = 'Only a draft can be scheduled.';
  end if;

  perform private.write_campaign_audit(p_campaign_id, v_actor, 'scheduled', jsonb_build_object('scheduled_at', v_at));
  return v_key;
end;
$$;
