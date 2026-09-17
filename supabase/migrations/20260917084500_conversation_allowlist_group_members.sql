-- Let two members of the same group message each other.
--
-- get_or_create_direct_conversation gates NEW direct conversations behind an
-- allowlist of real relationships (mutual partner likes, director <->
-- registered player, play-event organiser, approved director, active
-- marketplace listing -- see 20260909235000_marketplace_direct_conversation.sql
-- for that precedent and its own history of this exact class of bug).
-- Group membership was never added to it either. The Members tab's
-- "Message" button (built for GROUPS_WEB_PLAN.md Phase 2, and already
-- present on mobile calling this same RPC via
-- apps/mobile/src/lib/conversationService.ts:getOrCreateConversation) fails
-- with direct_conversation_not_allowed for the ordinary case of two people
-- who only know each other through a shared group -- no prior mutual like,
-- no tournament relationship, nothing else. That's the common case for two
-- brand-new group members meeting for the first time, so without this
-- clause the button does not work for the situation it exists for.
--
-- This is a shared Postgres function, not app code on either platform --
-- fixing it here also silently fixes the same dormant bug in mobile's
-- existing Members-tab Message button (which calls this same RPC), without
-- touching any mobile source file.
--
-- Scoped to active memberships on both sides (status = 'active'), matching
-- the marketplace clause's own status-scoping convention: a pending join
-- request isn't yet a real relationship.
--
-- Body is otherwise byte-for-byte the current definition; only this new
-- clause and its comment are added.

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
    or exists (
      select 1
        from public.marketplace_listings ml
       where ml.seller_id = p_partner_id
         and ml.status = 'active'
    )
    -- NEW: the caller and the partner are both active members of at least
    -- one shared group. Covers the Groups Members-tab "Message" button on
    -- both platforms.
    or exists (
      select 1
        from public.group_members gm1
        join public.group_members gm2
          on gm1.group_id = gm2.group_id
       where gm1.user_id = v_user_id
         and gm1.status = 'active'
         and gm2.user_id = p_partner_id
         and gm2.status = 'active'
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
  'Creates (or returns the existing) direct conversation between the caller and p_partner_id, gated behind an allowlist of real relationships: mutual partner likes, director<->registered player, play-event organiser/participant, approved director with an open tournament, active marketplace listing, or shared active group membership. See 20260909235000_marketplace_direct_conversation.sql and 20260917084500_conversation_allowlist_group_members.sql for the history of clauses added here.';
