-- =============================================================================
-- RPC: get_or_create_direct_conversation
--
-- Starts a direct conversation after validating the same app-level contact
-- rules as the conversations insert policy. This avoids client-side direct
-- inserts getting blocked by RLS while preserving the allowed relationship
-- checks in one database-owned operation.
-- =============================================================================

create or replace function public.get_or_create_direct_conversation(p_partner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
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
  'Validated direct-message creator for authenticated users. Returns an existing direct conversation or creates one when the contact relationship is allowed.';

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
