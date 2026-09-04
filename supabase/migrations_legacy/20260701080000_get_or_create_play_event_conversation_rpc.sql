-- =============================================================================
-- RPC: get_or_create_play_event_conversation
--
-- Lets the app open the Community Play Chat tab without client-side RLS races.
-- The function finds or creates the event conversation, then adds the current
-- signed-in user as a conversation participant so normal message RLS applies.
-- =============================================================================

create or replace function public.get_or_create_play_event_conversation(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_event play_events;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001', hint = 'You must be signed in to open event chat.';
  end if;

  select * into v_event
    from public.play_events
   where id = p_event_id;

  if not found then
    raise exception 'event_not_found'
      using errcode = 'P0002', hint = 'No play_event with that id.';
  end if;

  if v_event.status = 'cancelled'::play_event_status then
    raise exception 'event_chat_unavailable'
      using errcode = 'P0003', hint = 'Chat is not available for cancelled events.';
  end if;

  select id into v_conversation_id
    from public.conversations
   where conversation_type = 'play_event'
     and related_play_event_id = p_event_id
   order by created_at asc
   limit 1;

  if v_conversation_id is null then
    insert into public.conversations (
      conversation_type,
      related_play_event_id,
      title,
      created_by
    ) values (
      'play_event',
      p_event_id,
      coalesce(v_event.name, 'Community Play Chat'),
      v_user_id
    )
    on conflict (related_play_event_id)
    where conversation_type = 'play_event' and related_play_event_id is not null
    do update set title = excluded.title
    returning id into v_conversation_id;
  end if;

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    role
  ) values (
    v_conversation_id,
    v_user_id,
    case when v_event.organizer_id = v_user_id then 'owner' else 'member' end
  )
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

comment on function public.get_or_create_play_event_conversation(uuid) is
  'Finds or creates a Community Play event conversation and adds the authenticated caller as a conversation participant.';

revoke all on function public.get_or_create_play_event_conversation(uuid) from public;
grant execute on function public.get_or_create_play_event_conversation(uuid) to authenticated;
