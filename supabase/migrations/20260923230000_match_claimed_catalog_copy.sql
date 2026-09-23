-- match_claimed becomes catalog-driven.
--
-- Its notification is written inside claim_personal_match, the function that
-- transfers a guest participant to a real account. Only the notification block
-- changes; everything before it — token hash, claim state machine, participant
-- swap — is reproduced verbatim from the live definition, because that is the
-- part that must not move.
--
-- The link stays '/(tabs)/stats' rather than the catalog's seeded '/stats':
-- the in-app notification list navigates with these paths, and /stats is not a
-- deep-link root either, so changing it would break the in-app tap and fix
-- nothing.
--
-- Verified after applying: the copy renders from the catalog (an edited body
-- came through), and claim_personal_match still returns invalid/invalid_token
-- for a bad token as a signed-in caller.

update public.notification_automations set
  title_template = 'Match claimed',
  body_template  = '{{player_name}} claimed the match you recorded.',
  link_template  = '/(tabs)/stats',
  wired = true
where key = 'match_claimed';

CREATE OR REPLACE FUNCTION public.claim_personal_match(p_token text)
 RETURNS TABLE(status text, reason text, session_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hash text;
  v_claim public.personal_match_claims;
  v_participant public.personal_session_participants;
  v_session public.personal_sessions;
  v_claimer_name text;
  v_copy record;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_token is null or length(btrim(p_token)) < 20 then
    return query select 'invalid'::text, 'invalid_token'::text, null::uuid;
    return;
  end if;

  v_hash := public.personal_match_claim_hash(btrim(p_token));

  select * into v_claim
    from public.personal_match_claims c
   where c.token_hash = v_hash
   for update;

  if not found then
    return query select 'invalid'::text, 'invalid_token'::text, null::uuid;
    return;
  end if;

  if v_claim.status = 'claimed' then
    if v_claim.claimed_by_profile_id = auth.uid() then
      return query select 'claimed'::text, null::text, v_claim.session_id;
    else
      return query select 'already_claimed'::text, 'already_claimed'::text, v_claim.session_id;
    end if;
    return;
  end if;

  if v_claim.status = 'revoked' or v_claim.revoked_at is not null then
    return query select 'invalid'::text, 'revoked'::text, null::uuid;
    return;
  end if;

  if v_claim.expires_at <= now() then
    update public.personal_match_claims set status = 'expired' where id = v_claim.id and status = 'pending';
    update public.personal_guest_shares set share_status = 'expired' where id = v_claim.guest_share_id and share_status <> 'claimed';
    return query select 'expired'::text, 'expired'::text, v_claim.session_id;
    return;
  end if;

  select * into v_participant
    from public.personal_session_participants p
   where p.id = v_claim.session_participant_id
   for update;

  if not found or v_participant.session_id <> v_claim.session_id or v_participant.guest_player_id <> v_claim.guest_player_id then
    return query select 'invalid'::text, 'participant_mismatch'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.personal_session_participants p
     where p.session_id = v_claim.session_id
       and p.profile_id = auth.uid()
       and p.id <> v_claim.session_participant_id
  ) then
    return query select 'invalid'::text, 'already_registered_participant'::text, v_claim.session_id;
    return;
  end if;

  select * into v_session from public.personal_sessions where id = v_claim.session_id;

  update public.personal_session_participants
     set profile_id = auth.uid(),
         guest_player_id = null
   where id = v_claim.session_participant_id;

  update public.personal_match_claims
     set status = 'claimed',
         claimed_by_profile_id = auth.uid(),
         claimed_at = coalesce(claimed_at, now())
   where id = v_claim.id;

  update public.personal_guest_shares
     set share_status = 'claimed'
   where id = v_claim.guest_share_id;

  select full_name into v_claimer_name from public.profiles where id = auth.uid();

  -- Copy from the catalog, so the wording is editable in /admin/notifications.
  -- Falls back to the original literal if the row is ever missing.
  select * into v_copy from private.render_automation('match_claimed', jsonb_build_object(
    'player_name', coalesce(v_claimer_name, v_participant.display_name_snapshot, 'A player')
  ));

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (
    v_session.created_by,
    'match_claimed',
    coalesce(v_copy.title, 'Match claimed'),
    coalesce(v_copy.body,
      coalesce(v_claimer_name, v_participant.display_name_snapshot, 'A player') || ' claimed the match you recorded.'),
    coalesce(v_copy.link, '/(tabs)/stats'),
    'personal-match-claimed:' || v_claim.id::text || ':' || v_session.created_by::text
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return query select 'claimed'::text, null::text, v_claim.session_id;
end;
$function$;
