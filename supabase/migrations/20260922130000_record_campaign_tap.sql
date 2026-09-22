-- Campaign tap recording — Phase 6 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
--
-- ── record_campaign_tap(p_campaign_id) ──────────────────────────────────────
--
-- Called fire-and-forget by the app when a campaign notification is tapped.
-- Identity comes from auth.uid() ONLY — there is no user parameter, so a
-- forged payload cannot attribute a tap to someone else.
--
-- Deliberately narrower than the plan's "insert on conflict do nothing": a
-- tap is recorded only if this user was actually sent this campaign on a
-- tap-capable build — an ACCEPTED, tap_capable delivery that belongs to them,
-- either by user_id or through one of their own push tokens (one phone signed
-- into several accounts gets ONE delivery, keyed to whichever account the
-- snapshot kept, but whoever is signed in when it is tapped is the one who
-- tapped). That keeps every counted tap inside the tap-rate denominator
-- (decision 8), and it means an admin's test send — which creates no delivery
-- rows — or an arbitrary campaign id records nothing.
--
-- Returns true when a tap is on record for this user and campaign (new or
-- already there), false when nothing qualified. The unique (campaign_id,
-- user_id) key is the deduplication.
--
-- ── snapshot_campaign_recipients: one row per device, capable row preferred ─
--
-- A device appears once per account signed in on it. The snapshot keeps one
-- row per token, and ON CONFLICT DO NOTHING kept an arbitrary one — so a phone
-- running a tap-capable build could be recorded as incapable because the
-- account the snapshot happened to keep last registered from an older build.
-- A token identifies one app install, so if ANY of its rows reports
-- tap_events_supported the install is capable. DISTINCT ON now prefers that
-- row. Everything else in the function is unchanged.

create or replace function public.record_campaign_tap(p_campaign_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_campaign_id is null then
    return false;
  end if;

  if not exists (
    select 1
      from public.campaign_deliveries d
     where d.campaign_id = p_campaign_id
       and d.status = 'accepted'
       and d.tap_capable
       and (
         d.user_id = v_uid
         or exists (
           select 1 from public.push_tokens pt
            where pt.user_id = v_uid
              and pt.expo_push_token = d.expo_push_token
         )
       )
  ) then
    return false;
  end if;

  insert into public.campaign_taps (campaign_id, user_id)
  values (p_campaign_id, v_uid)
  on conflict (campaign_id, user_id) do nothing;

  return true;
end;
$$;

revoke all on function public.record_campaign_tap(uuid) from public, anon;
grant execute on function public.record_campaign_tap(uuid) to authenticated;

create or replace function public.snapshot_campaign_recipients(p_campaign_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_platform text;
  v_status text;
  v_devices integer;
begin
  select audience_type, audience_platform, status
    into v_type, v_platform, v_status
    from public.notification_campaigns
   where id = p_campaign_id
   for update;

  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'queuing' then
    raise exception 'campaign_not_queuing' using errcode = '55000';
  end if;

  -- One row per device; the tap-capable row wins (see header).
  insert into public.campaign_deliveries (campaign_id, user_id, expo_push_token, app_version, tap_capable)
  select distinct on (e.expo_push_token)
         p_campaign_id, e.user_id, e.expo_push_token, e.app_version, e.tap_capable
    from private.campaign_eligible_devices(v_type, v_platform) e
   order by e.expo_push_token, e.tap_capable desc, e.app_version desc nulls last, e.user_id
  on conflict (campaign_id, expo_push_token) do nothing;

  select count(*)::integer into v_devices from public.campaign_deliveries where campaign_id = p_campaign_id;

  -- Users are counted from the eligibility function, not from the delivery
  -- rows: a shared device keeps only one user_id in campaign_deliveries, so
  -- counting there would undercount people and disagree with the preview.
  update public.notification_campaigns
     set recipient_device_count = v_devices,
         recipient_user_count = (select count(distinct e.user_id)::integer
                                   from private.campaign_eligible_devices(v_type, v_platform) e),
         excluded_unknown_platform_count = private.campaign_excluded_unknown(v_type)
   where id = p_campaign_id;

  return v_devices;
end;
$$;
