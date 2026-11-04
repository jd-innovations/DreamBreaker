-- =============================================================================
-- App Store screenshot: a direct-message thread between Tyler and Mia
-- =============================================================================
-- Written 2026-11-04. Run against PRODUCTION in the Supabase SQL editor.
--
-- Both accounts are demo accounts (AI-generated photos). The thread is dated
-- today, a few hours back, and every message is marked read so no unread badge
-- shows up in the screenshot.
--
-- Pushes are suppressed: session_replication_role = replica skips the
-- trg_notify_new_message push (and every other row trigger) for this
-- transaction only. That includes trg_update_conversation_last_message, so
-- last_message_at is set by hand at the end.
--
-- Message ids are fixed (de300000-…), so a second run is a no-op and the
-- rollback at the bottom removes exactly these rows.
-- =============================================================================

begin;

set local session_replication_role = replica;

do $$
declare
  v_tyler uuid;
  v_mia   uuid;
  v_conv  uuid;
  v_n     int;
begin
  select id into v_tyler from public.profiles where email = 'dhjesus122+tyler@gmail.com';
  if v_tyler is null then raise exception 'Tyler not found'; end if;

  select count(*), min(id::text)::uuid into v_n, v_mia from public.profiles where full_name = 'Mia Carter';
  if v_n <> 1 then raise exception 'Expected exactly one Mia Carter, found %', v_n; end if;

  select id into v_conv
    from public.conversations
   where coalesce(conversation_type, 'direct') = 'direct'
     and ((participant_a = v_tyler and participant_b = v_mia)
       or (participant_a = v_mia and participant_b = v_tyler))
   limit 1;

  if v_conv is null then
    insert into public.conversations (conversation_type, participant_a, participant_b, created_by)
    values ('direct', v_tyler, v_mia, v_tyler)
    returning id into v_conv;
  end if;

  insert into public.messages (id, conversation_id, sender_id, body, created_at, read_at)
  values
    ('de300000-0000-4000-8000-000000000001', v_conv, v_mia,   'Hey Tyler! Are you playing open play at Payne Park tonight?',        now() - interval '3 hours 10 minutes', now()),
    ('de300000-0000-4000-8000-000000000002', v_conv, v_tyler, 'Planning on it! Want to team up for mixed?',                          now() - interval '3 hours 4 minutes',  now()),
    ('de300000-0000-4000-8000-000000000003', v_conv, v_mia,   'Yes! I''ve been working on my third-shot drop all week',              now() - interval '3 hours 1 minute',   now()),
    ('de300000-0000-4000-8000-000000000004', v_conv, v_tyler, 'Perfect, I''ll stay back and you crash the kitchen 😄',               now() - interval '2 hours 55 minutes', now()),
    ('de300000-0000-4000-8000-000000000005', v_conv, v_mia,   'Deal. Courts open at 6. I''ll bring balls 🎾',                         now() - interval '2 hours 50 minutes', now()),
    ('de300000-0000-4000-8000-000000000006', v_conv, v_tyler, 'See you there. Also signed us up for the Futures Classic in December 🏆', now() - interval '2 hours 41 minutes', now()),
    ('de300000-0000-4000-8000-000000000007', v_conv, v_mia,   'Let''s go!! 🙌',                                                       now() - interval '2 hours 40 minutes', now())
  on conflict (id) do nothing;

  update public.conversations
     set last_message_at = (select max(created_at) from public.messages where conversation_id = v_conv)
   where id = v_conv;

  raise notice 'Thread % between Tyler % and Mia %', v_conv, v_tyler, v_mia;
end $$;

commit;

-- ─── Rollback ────────────────────────────────────────────────────────────────
-- delete from public.messages where id::text like 'de300000-0000-4000-8000-%';
-- (If the script created the conversation, it stays, empty. Remove it with:
--  delete from public.conversations c where c.id = '<id from the notice>'
--    and not exists (select 1 from public.messages m where m.conversation_id = c.id);)
