-- DreamBreaker PB - Fix guest_share_id ambiguity in claim-link creation RPC
-- RETURNS TABLE(... guest_share_id ...) creates an OUT parameter that collides with table columns.

create or replace function public.create_personal_match_claim_link(
  p_guest_share_id uuid
)
returns table (
  claim_id uuid,
  guest_share_id uuid,
  token text,
  claim_url text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_share public.personal_guest_shares;
  v_token text;
  v_hash text;
  v_claim public.personal_match_claims;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_share
    from public.personal_guest_shares share
   where share.id = p_guest_share_id;

  if not found then
    raise exception 'guest_share_not_found' using errcode = 'P0001';
  end if;

  if v_share.created_by <> auth.uid() then
    raise exception 'not_guest_share_creator' using errcode = 'P0001';
  end if;

  if v_share.share_status = 'claimed' then
    raise exception 'guest_share_already_claimed' using errcode = 'P0001';
  end if;

  update public.personal_match_claims claim
     set status = 'revoked', revoked_at = coalesce(claim.revoked_at, now())
   where claim.guest_share_id = p_guest_share_id
     and claim.status = 'pending';

  loop
    v_token := public.personal_match_claim_token();
    v_hash := public.personal_match_claim_hash(v_token);
    exit when not exists (select 1 from public.personal_match_claims claim where claim.token_hash = v_hash);
  end loop;

  insert into public.personal_match_claims (
    session_id,
    session_participant_id,
    guest_share_id,
    guest_player_id,
    created_by,
    token_hash,
    expires_at
  ) values (
    v_share.session_id,
    v_share.session_participant_id,
    v_share.id,
    v_share.guest_player_id,
    v_share.created_by,
    v_hash,
    now() + interval '30 days'
  ) returning * into v_claim;

  return query select
    v_claim.id::uuid,
    v_claim.guest_share_id::uuid,
    v_token::text,
    ('dreambreaker://claim/' || v_token)::text,
    v_claim.expires_at;
end;
$$;

grant execute on function public.create_personal_match_claim_link(uuid) to authenticated;
