-- Campaign API + server-side push recipients — Phase 2 of
-- PUSH_BROADCAST_IMPLEMENTATION_PLAN.md (includes the SQL half of Phase 0b).
--
-- Purely additive and dormant: nothing calls these until the Phase 2 edge
-- functions are deployed, and nothing a user can reach calls those until the
-- Phase 5 admin UI exists. The DM and price-drop triggers are NOT changed here;
-- switching them to the new resolvers is a separate migration, applied only
-- after send-message-push understands the new payload.
--
-- ── Boundaries ──────────────────────────────────────────────────────────────
--
--   admin_* RPCs          run under the caller's own session; is_admin() is
--                         checked inside every one. Executable by authenticated
--                         because the check, not the grant, is the boundary.
--   claim_campaign_send,  service_role only. They touch tokens or take an actor
--   snapshot_*, resolve_* id as a parameter, so a browser must never reach them.
--
-- No function here returns a push token to a browser role. Preview returns
-- counts; everything that yields tokens is service_role only.

-- ─── Destination validation ─────────────────────────────────────────────────
--
-- MIRROR of BROADCAST_DESTINATION_PATTERN in packages/shared/src/deep-link.ts.
-- packages/shared/src/__tests__/deep-link.test.ts reads c_pattern out of THIS
-- FILE and fails if the two differ, so change both together.
--
-- Absolute URLs only; the app scheme (three spellings) or the exact https
-- origin; a root an installed build can open AND that means the same thing to
-- every recipient; an id of URL-safe characters with nothing after it. Rejects
-- javascript:, data:, other hosts, bare roots, personal routes (conversation,
-- booking, claim, review) and anything with a query or fragment.

create or replace function public.campaign_destination_type(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_pattern constant text := '^(?:pickleballapp://(?:app/|/)?|https://pickleballapp\.app/)(groups|tournament|community|marketplace|coach/offers)/([A-Za-z0-9-]{1,64})/?$';
  m text[];
begin
  if p_url is null or char_length(p_url) > 500 then
    return null;
  end if;
  m := regexp_match(p_url, c_pattern);
  if m is null then
    return null;
  end if;
  -- Same vocabulary as DeepLinkType in the shared module.
  return case m[1]
    when 'groups' then 'group'
    when 'coach/offers' then 'coach_offer'
    else m[1]
  end;
end;
$$;

revoke all on function public.campaign_destination_type(text) from public, anon;
grant execute on function public.campaign_destination_type(text) to authenticated;

-- ─── Private helpers ────────────────────────────────────────────────────────
--
-- In the `private` schema (20260921180000): no API role has USAGE, so these are
-- unreachable over PostgREST whatever their grants. Called only from the
-- definer functions below, which run as their owner.

create or replace function private.write_campaign_audit(
  p_campaign_id uuid,
  p_actor_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
volatile
set search_path = ''
as $$
  insert into public.campaign_audit_log (campaign_id, actor_id, action, metadata)
  values (p_campaign_id, p_actor_id, p_action, coalesce(p_metadata, '{}'::jsonb));
$$;

-- THE eligibility rule. Preview counts it and the snapshot inserts it, so the
-- number an admin confirms is the number that gets queued — by construction,
-- not by two queries agreeing.
--
-- One DEVICE can appear under several users: push_tokens is keyed on
-- (user_id, expo_push_token), so a phone that has signed into two accounts is
-- registered twice (seen in production 2026-09-22: 8 rows, 2 devices). A
-- device must get a broadcast once, so everything below counts devices as
-- DISTINCT tokens and the snapshot's unique (campaign_id, expo_push_token)
-- keeps one delivery per device.
--
--   notif_announcements is not false   matches notify_new_message: a null (bad
--                                      backfill) means notify, as the default does
--   deleted_at is null                 belt and braces — delete-account already
--                                      deletes push_tokens (verified), and the
--                                      tombstone profile has none
--   platform = p_platform              on a platform campaign, naturally excludes
--                                      'unknown' devices (decision 10)
create or replace function private.campaign_eligible_devices(p_audience_type text, p_platform text)
returns table (user_id uuid, expo_push_token text, app_version text, tap_capable boolean)
language sql
stable
set search_path = ''
as $$
  select pt.user_id, pt.expo_push_token, pt.app_version, coalesce(pt.tap_events_supported, false)
    from public.push_tokens pt
    join public.profiles p on p.id = pt.user_id
   where p.notif_announcements is not false
     and p.deleted_at is null
     and (p_audience_type = 'all' or pt.platform = p_platform);
$$;

-- Devices a platform campaign leaves out only because their platform is
-- unknown. Shown at confirmation so "iOS: 40 devices" does not silently mean
-- "and 6 we could not classify".
create or replace function private.campaign_excluded_unknown(p_audience_type text)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when p_audience_type = 'all' then 0 else (
    select count(distinct pt.expo_push_token)::integer
      from public.push_tokens pt
      join public.profiles p on p.id = pt.user_id
     where p.notif_announcements is not false
       and p.deleted_at is null
       and pt.platform = 'unknown'
  ) end;
$$;

-- Per-admin, per-minute limit, counted from the audit log itself (the same
-- count-existing-rows approach as start_direct_conversation's daily cap).
create or replace function private.assert_campaign_rate_limit(p_actor_id uuid, p_action text, p_per_minute integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select count(*) from public.campaign_audit_log
       where actor_id = p_actor_id
         and action = p_action
         and created_at > now() - interval '1 minute') >= p_per_minute then
    raise exception 'rate_limited'
      using errcode = 'P0005', hint = 'Too many requests. Wait a minute and try again.';
  end if;
end;
$$;

revoke all on function private.write_campaign_audit(uuid, uuid, text, jsonb) from public;
revoke all on function private.campaign_eligible_devices(text, text) from public;
revoke all on function private.campaign_excluded_unknown(text) from public;
revoke all on function private.assert_campaign_rate_limit(uuid, text, integer) from public;

-- ─── admin_upsert_campaign ──────────────────────────────────────────────────
--
-- Create or edit a DRAFT. Editing anything past draft is refused: scheduling
-- freezes content and audience. Every field is validated here with a readable
-- error, ahead of the table's own check constraints.

create or replace function public.admin_upsert_campaign(
  p_internal_name text,
  p_title text,
  p_body text,
  p_audience_type text,
  p_destination_url text,
  p_audience_platform text default null,
  p_campaign_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := btrim(coalesce(p_internal_name, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_url text := btrim(coalesce(p_destination_url, ''));
  v_platform text;
  v_type text;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if char_length(v_name) not between 1 and 120 then
    raise exception 'invalid_internal_name' using errcode = '22023', hint = 'Internal name must be 1 to 120 characters.';
  end if;
  if char_length(v_title) not between 1 and 100 then
    raise exception 'invalid_title' using errcode = '22023', hint = 'Title must be 1 to 100 characters.';
  end if;
  if char_length(v_body) not between 1 and 240 then
    raise exception 'invalid_body' using errcode = '22023', hint = 'Message must be 1 to 240 characters.';
  end if;

  if p_audience_type = 'all' then
    v_platform := null;
  elsif p_audience_type = 'platform' and p_audience_platform in ('ios', 'android') then
    v_platform := p_audience_platform;
  else
    raise exception 'invalid_audience' using errcode = '22023', hint = 'Choose all users, or iOS or Android.';
  end if;

  v_type := public.campaign_destination_type(v_url);
  if v_type is null then
    raise exception 'invalid_destination' using errcode = '22023',
      hint = 'Link to a tournament, community event, marketplace listing, group or coach offer.';
  end if;

  if p_campaign_id is null then
    insert into public.notification_campaigns (
      internal_name, title, body, audience_type, audience_platform,
      destination_url, destination_type, created_by
    ) values (
      v_name, v_title, v_body, p_audience_type, v_platform, v_url, v_type, v_actor
    )
    returning id into v_id;
  else
    update public.notification_campaigns
       set internal_name = v_name, title = v_title, body = v_body,
           audience_type = p_audience_type, audience_platform = v_platform,
           destination_url = v_url, destination_type = v_type
     where id = p_campaign_id
       and status = 'draft'
    returning id into v_id;

    if v_id is null then
      raise exception 'campaign_not_editable' using errcode = '55000',
        hint = 'Only a draft can be edited.';
    end if;
  end if;

  perform private.write_campaign_audit(
    v_id, v_actor,
    case when p_campaign_id is null then 'created' else 'updated' end,
    jsonb_build_object(
      'internal_name', v_name, 'title', v_title, 'body', v_body,
      'audience_type', p_audience_type, 'audience_platform', v_platform,
      'destination_url', v_url
    )
  );

  return v_id;
end;
$$;

-- ─── admin_preview_campaign_audience ────────────────────────────────────────
--
-- COUNTS ONLY. Same eligibility function the snapshot uses. Rate-limited, and
-- audited — both so the limit has something to count and so "who looked at
-- audience sizes, when" is on record.

create or replace function public.admin_preview_campaign_audience(
  p_audience_type text,
  p_audience_platform text default null
)
returns table (user_count integer, device_count integer, excluded_unknown_platform integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_platform text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_audience_type = 'all' then
    v_platform := null;
  elsif p_audience_type = 'platform' and p_audience_platform in ('ios', 'android') then
    v_platform := p_audience_platform;
  else
    raise exception 'invalid_audience' using errcode = '22023', hint = 'Choose all users, or iOS or Android.';
  end if;

  perform private.assert_campaign_rate_limit(v_actor, 'audience_previewed', 20);
  perform private.write_campaign_audit(
    null, v_actor, 'audience_previewed',
    jsonb_build_object('audience_type', p_audience_type, 'audience_platform', v_platform)
  );

  return query
  select count(distinct e.user_id)::integer,
         count(distinct e.expo_push_token)::integer,
         private.campaign_excluded_unknown(p_audience_type)
    from private.campaign_eligible_devices(p_audience_type, v_platform) e;
end;
$$;

-- ─── admin_schedule_campaign ────────────────────────────────────────────────
--
-- draft → scheduled. Freezes content and audience (admin_upsert refuses
-- anything past draft) and mints the idempotency key server-side. "Send now"
-- is scheduling for now, then calling admin-campaign-send with the key this
-- returns — so every send, immediate or not, goes through the same frozen state.

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

-- ─── admin_cancel_campaign ──────────────────────────────────────────────────
--
-- draft or scheduled → cancelled, only while nothing has been queued. (Drafts
-- are included so a draft can be discarded; there is no delete.) Once queued,
-- the only way to stop a campaign is abort.

create or replace function public.admin_cancel_campaign(p_campaign_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.notification_campaigns
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor
   where id = p_campaign_id
     and status in ('draft', 'scheduled')
     and queued_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'campaign_not_cancellable' using errcode = '55000',
      hint = 'Only a draft or a scheduled campaign that has not started can be cancelled.';
  end if;

  perform private.write_campaign_audit(p_campaign_id, v_actor, 'cancelled');
end;
$$;

-- ─── admin_abort_campaign ───────────────────────────────────────────────────
--
-- queuing or sending → aborting (decision 11). The Phase 3 worker stops
-- claiming batches and moves the campaign to aborted. Messages already handed
-- to Expo cannot be recalled; abort stops what has not gone yet.

create or replace function public.admin_abort_campaign(p_campaign_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.notification_campaigns
     set status = 'aborting', aborted_by = v_actor
   where id = p_campaign_id
     and status in ('queuing', 'sending')
  returning id into v_id;

  if v_id is null then
    raise exception 'campaign_not_abortable' using errcode = '55000',
      hint = 'Only a campaign that is queuing or sending can be aborted.';
  end if;

  perform private.write_campaign_audit(p_campaign_id, v_actor, 'abort_requested');
end;
$$;

-- ─── snapshot_campaign_recipients (service_role) ────────────────────────────
--
-- Freezes the recipient list into campaign_deliveries. Idempotent: ON CONFLICT
-- DO NOTHING on (campaign_id, expo_push_token), and the stored counts are
-- recomputed from the table, so running it twice changes nothing.

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

  insert into public.campaign_deliveries (campaign_id, user_id, expo_push_token, app_version, tap_capable)
  select p_campaign_id, e.user_id, e.expo_push_token, e.app_version, e.tap_capable
    from private.campaign_eligible_devices(v_type, v_platform) e
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

-- ─── claim_campaign_send (service_role) ─────────────────────────────────────
--
-- Called by admin-campaign-send AFTER it has verified the caller's own JWT is
-- an admin (two-step trust). service_role has no auth.uid(), so the verified
-- admin id arrives as a parameter — and is re-checked here anyway.
--
-- The claim is one conditional UPDATE: of two concurrent sends, or a send and
-- a double-fired scheduler, exactly one gets a row back. Claim and snapshot
-- share this transaction, so a failed snapshot leaves the campaign scheduled
-- rather than stranded in `queuing` with no recipients.
--
-- Returns jsonb { result, ... }:
--   claimed          this call queued it
--   already_claimed  same key, already past scheduled — a retry; not an error
--   key_mismatch     wrong or stale idempotency key
--   not_due          scheduled for later; the Phase 3 scheduler will claim it
--   not_sendable     draft, cancelled, …
--   not_found

create or replace function public.claim_campaign_send(
  p_campaign_id uuid,
  p_idempotency_key text,
  p_admin_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_key text;
  v_at timestamptz;
  v_devices integer;
begin
  if p_admin_id is null or not exists (
    select 1 from public.profiles where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.notification_campaigns
     set status = 'queuing', queued_at = now(), sent_by = p_admin_id
   where id = p_campaign_id
     and status = 'scheduled'
     and idempotency_key = p_idempotency_key
     and scheduled_at <= now() + interval '1 minute'
  returning id into v_id;

  if v_id is null then
    select status, idempotency_key, scheduled_at into v_status, v_key, v_at
      from public.notification_campaigns where id = p_campaign_id;

    if not found then
      return jsonb_build_object('result', 'not_found');
    elsif v_key is distinct from p_idempotency_key then
      return jsonb_build_object('result', 'key_mismatch');
    elsif v_status = 'scheduled' then
      return jsonb_build_object('result', 'not_due', 'scheduled_at', v_at);
    elsif v_status in ('queuing', 'sending', 'aborting', 'aborted', 'sent', 'partially_failed', 'failed') then
      return jsonb_build_object('result', 'already_claimed', 'status', v_status);
    else
      return jsonb_build_object('result', 'not_sendable', 'status', v_status);
    end if;
  end if;

  v_devices := public.snapshot_campaign_recipients(v_id);

  perform private.write_campaign_audit(
    v_id, p_admin_id, 'send_claimed', jsonb_build_object('recipient_device_count', v_devices)
  );

  return (
    select jsonb_build_object(
      'result', 'claimed',
      'recipient_user_count', recipient_user_count,
      'recipient_device_count', recipient_device_count,
      'excluded_unknown_platform_count', excluded_unknown_platform_count
    )
    from public.notification_campaigns where id = v_id
  );
end;
$$;

-- ─── Phase 0b: server-side recipients for send-message-push ─────────────────
--
-- send-message-push used to be handed a token list. These let it take an id
-- instead and look the recipients up itself, so even a caller holding the
-- dispatch secret can only re-send a REAL, RECENT notification to its REAL
-- recipients — never choose the text or the audience.
--
-- The 10-minute window bounds replay: the edge function is called within
-- seconds of commit, and nothing legitimate asks about an older row.

-- DMs. The recipient query is notify_new_message's (20260921180000), lifted
-- verbatim: participants minus the sender, minus muted, minus notif_messages
-- off, minus blocked. Title and body are built exactly as the trigger builds
-- them, and a null body still yields a null body (the function then skips,
-- as it does today for attachment-only messages).
create or replace function public.resolve_message_push_recipients(p_message_id uuid)
returns table (tokens text[], title text, body text, data jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_sender_id uuid;
  v_body text;
  v_created_at timestamptz;
  v_sender_name text;
  v_tokens text[];
begin
  select m.conversation_id, m.sender_id, m.body, m.created_at
    into v_conversation_id, v_sender_id, v_body, v_created_at
    from public.messages m
   where m.id = p_message_id;

  if not found or v_created_at < now() - interval '10 minutes' then
    return;
  end if;

  select full_name into v_sender_name from public.profiles where id = v_sender_id;

  select array_agg(distinct pt.expo_push_token) into v_tokens
    from public.push_tokens pt
   where pt.user_id in (
     select recips.user_id
       from (
         select participant_a as user_id from public.conversations
          where id = v_conversation_id and participant_a is not null
         union
         select participant_b as user_id from public.conversations
          where id = v_conversation_id and participant_b is not null
         union
         select cp.user_id from public.conversation_participants cp
          where cp.conversation_id = v_conversation_id
       ) recips
      where recips.user_id != v_sender_id
        and not exists (
          select 1 from public.conversation_participant_settings s
           where s.conversation_id = v_conversation_id
             and s.user_id = recips.user_id
             and s.muted_until is not null
             and s.muted_until > now()
        )
        and exists (
          select 1 from public.profiles p
           where p.id = recips.user_id
             and p.notif_messages is not false
        )
        and not public.is_blocked_between(v_sender_id, recips.user_id)
   );

  if v_tokens is null or array_length(v_tokens, 1) is null then
    return;
  end if;

  return query select
    v_tokens,
    coalesce(v_sender_name, 'New message'),
    left(v_body, 120),
    jsonb_build_object('conversationId', v_conversation_id, 'messageId', p_message_id);
end;
$$;

-- Price drops. Recipients are fn_notify_price_drop's (20260921180000):
-- savers of the listing, not the seller, with notif_marketplace on.
--
-- The TEXT comes from the in-app notification the same trigger has just
-- written, not from the request. So the request carries only the listing id —
-- there is no price or amount for a caller to invent — and a drop must have
-- actually happened in the last 10 minutes for anything to be sent.
create or replace function public.resolve_price_drop_push_recipients(p_listing_id uuid)
returns table (tokens text[], title text, body text, data jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_seller_id uuid;
  v_status text;
  v_title text;
  v_body text;
  v_tokens text[];
begin
  select l.seller_id, l.status into v_seller_id, v_status
    from public.marketplace_listings l
   where l.id = p_listing_id;

  if not found or v_status <> 'active' then
    return;
  end if;

  select n.title, n.body into v_title, v_body
    from public.notifications n
   where n.type = 'marketplace_price_drop'
     and n.link = '/marketplace/' || p_listing_id
     and n.created_at > now() - interval '10 minutes'
   order by n.created_at desc
   limit 1;

  if v_title is null then
    return;
  end if;

  select array_agg(distinct pt.expo_push_token) into v_tokens
    from public.push_tokens pt
    join public.marketplace_saved_listings s on s.user_id = pt.user_id
    join public.profiles p on p.id = s.user_id
   where s.listing_id = p_listing_id
     and s.user_id <> v_seller_id
     and p.notif_marketplace is not false;

  if v_tokens is null or array_length(v_tokens, 1) is null then
    return;
  end if;

  return query select
    v_tokens,
    v_title,
    v_body,
    jsonb_build_object('listingId', p_listing_id, 'type', 'marketplace_price_drop');
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
--
-- REVOKE FROM PUBLIC does not remove what Supabase's default privileges gave
-- anon and authenticated directly, so both are always named.

revoke all on function public.admin_upsert_campaign(text, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.admin_preview_campaign_audience(text, text) from public, anon;
revoke all on function public.admin_schedule_campaign(uuid, timestamptz) from public, anon;
revoke all on function public.admin_cancel_campaign(uuid) from public, anon;
revoke all on function public.admin_abort_campaign(uuid) from public, anon;
grant execute on function public.admin_upsert_campaign(text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.admin_preview_campaign_audience(text, text) to authenticated;
grant execute on function public.admin_schedule_campaign(uuid, timestamptz) to authenticated;
grant execute on function public.admin_cancel_campaign(uuid) to authenticated;
grant execute on function public.admin_abort_campaign(uuid) to authenticated;

revoke all on function public.snapshot_campaign_recipients(uuid) from public, anon, authenticated;
revoke all on function public.claim_campaign_send(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.resolve_message_push_recipients(uuid) from public, anon, authenticated;
revoke all on function public.resolve_price_drop_push_recipients(uuid) from public, anon, authenticated;
grant execute on function public.snapshot_campaign_recipients(uuid) to service_role;
grant execute on function public.claim_campaign_send(uuid, text, uuid) to service_role;
grant execute on function public.resolve_message_push_recipients(uuid) to service_role;
grant execute on function public.resolve_price_drop_push_recipients(uuid) to service_role;
