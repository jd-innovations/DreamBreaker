-- Let a buyer open a direct conversation with a marketplace seller.
--
-- get_or_create_direct_conversation gates NEW direct conversations behind an
-- allowlist of real relationships (mutual partner likes, director <-> registered
-- player, play-event organiser, approved director). Marketplace was never added
-- to it, so "Make Offer" / "Message Seller" on a listing from someone the buyer
-- has no prior relationship with fails with direct_conversation_not_allowed,
-- surfacing in the app as "Failed to create conversation".
--
-- This was masked in testing: every existing listing belongs to an account that
-- is both an approved director and a play-event organiser, so two unrelated
-- clauses happened to cover it. The first listing by an ordinary user would have
-- been unreachable -- nobody could make them an offer at all.
--
-- The rule added here is deliberately simple and matches the C2C model: an
-- ACTIVE listing is a public invitation to be contacted, exactly like organising
-- a play event or directing a tournament already are. An offer on this platform
-- is an icebreaker that opens a chat, not a transaction, so the conversation is
-- the whole feature -- without this clause the feature does not exist.
--
-- Scoped to status = 'active' on purpose:
--   * A sold or expired listing is not an invitation, so it does not open a NEW
--     conversation.
--   * It does not strand anyone mid-negotiation. The function returns an
--     existing conversation before it ever reaches these checks, so a chat
--     started while the listing was active keeps working after it sells or
--     expires.
--
-- Note this makes listing an item a way to become messageable. That is intended
-- for a C2C marketplace, and is the same trade the existing play-event clause
-- already makes; blocking still overrides it (fn_block_message_send, see
-- 20260831040000_enforce_blocks.sql), so a blocked user cannot reach a seller
-- through a listing.
--
-- Body is otherwise byte-for-byte the current definition; only the marketplace
-- clause and its comment are new.

create or replace function public.get_or_create_direct_conversation(p_partner_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_created_id uuid;
  v_allowed boolean;
begin
  if v_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001', hint = 'You must be signed in to start a conversation.';
  end if;

  if p_partner_id is null then
    raise exception 'missing_partner'
      using errcode = 'P0002', hint = 'A conversation partner is required.';
  end if;

  if p_partner_id = v_user_id then
    raise exception 'self_conversation_not_allowed'
      using errcode = 'P0003', hint = 'You cannot start a conversation with yourself.';
  end if;

  select c.id into v_existing_id
    from public.conversations c
   where coalesce(c.conversation_type, 'direct') = 'direct'
     and (
       (c.participant_a = v_user_id and c.participant_b = p_partner_id)
       or
       (c.participant_a = p_partner_id and c.participant_b = v_user_id)
     )
   order by c.created_at asc
   limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select (
    exists (
      select 1
        from public.partner_likes l1
        join public.partner_likes l2
          on l1.from_user_id = l2.to_user_id
         and l1.to_user_id   = l2.from_user_id
         and l2.kind         = 'like'
       where l1.kind = 'like'
         and l1.from_user_id in (v_user_id, p_partner_id)
         and l1.to_user_id   in (v_user_id, p_partner_id)
    )
    or exists (
      select 1
        from public.profiles dir
        join public.tournaments t on t.director_id = dir.id
        join public.registrations r on r.tournament_id = t.id
       where dir.id = v_user_id
         and (dir.role = 'director' or dir.is_director = true)
         and dir.director_status = 'approved'
         and r.player_id = p_partner_id
         and r.status in ('held', 'registered', 'checked_in')
    )
    or exists (
      select 1
        from public.registrations r
        join public.tournaments t on t.id = r.tournament_id
       where r.player_id = v_user_id
         and r.status in ('held', 'registered', 'checked_in')
         and t.director_id = p_partner_id
    )
    or exists (
      select 1
        from public.play_events pe
        join public.play_participants pp on pp.event_id = pe.id
       where pe.organizer_id = v_user_id
         and pp.claimed_by = p_partner_id
    )
    or exists (
      select 1
        from public.play_events pe
       where pe.organizer_id = p_partner_id
    )
    or exists (
      select 1
        from public.tournaments t
        join public.profiles dir on dir.id = t.director_id
       where t.director_id = p_partner_id
         and t.status in ('open', 'filling_fast', 'registration_closed', 'in_progress', 'completed')
         and (dir.role = 'director' or dir.is_director = true)
         and dir.director_status = 'approved'
    )
    -- NEW: the partner is selling something right now. Covers both marketplace
    -- entry points (makeOffer and messageSellerAboutListing in
    -- apps/mobile/src/lib/marketplace/offers.ts), which both funnel through
    -- this function.
    or exists (
      select 1
        from public.marketplace_listings ml
       where ml.seller_id = p_partner_id
         and ml.status = 'active'
    )
  ) into v_allowed;

  if not coalesce(v_allowed, false) then
    raise exception 'direct_conversation_not_allowed'
      using errcode = 'P0004', hint = 'No allowed messaging relationship exists.';
  end if;

  insert into public.conversations (
    conversation_type,
    participant_a,
    participant_b,
    created_by
  ) values (
    'direct',
    v_user_id,
    p_partner_id,
    v_user_id
  )
  returning id into v_created_id;

  return v_created_id;
end;
$$;

comment on function public.get_or_create_direct_conversation(uuid) is
  'Returns the existing direct conversation between the caller and p_partner_id, '
  'or creates one when an allowed messaging relationship exists (mutual partner '
  'like, director/player, play-event organiser, approved director, or the '
  'partner having an active marketplace listing).';
