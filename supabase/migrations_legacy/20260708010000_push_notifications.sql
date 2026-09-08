-- =============================================================================
-- Push notifications: token storage + dispatch on new message
--
-- Server/DB half only (client-side expo-notifications registration is a
-- separate, deliberately deferred piece pending an EAS-linked dev build —
-- see TODO.md Phase 4). This migration makes the backend ready to dispatch
-- the moment push_tokens rows start getting inserted.
--
-- Recipient resolution intentionally re-derives participant_a/participant_b
-- directly rather than trusting conversation_participants to be complete for
-- direct conversations (get_or_create_direct_conversation, 20260701070000,
-- never inserts into that table for new DMs — see the comment in
-- 20260708000000_conversation_participant_settings.sql for the same gap).
-- Muted recipients (conversation_participant_settings.muted_until) are
-- excluded so this respects the mute feature added the same day.
-- =============================================================================

create extension if not exists pg_net;

create table if not exists public.push_tokens (
  user_id          uuid not null references public.profiles(id) on delete cascade,
  expo_push_token  text not null,
  platform         text not null default 'unknown' check (platform in ('ios', 'android', 'unknown')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  primary key (user_id, expo_push_token)
);

comment on table public.push_tokens is 'Expo push tokens registered by a signed-in user''s device(s). Populated by client-side registration (not yet built).';

create index if not exists idx_push_tokens_user on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens: self read" on public.push_tokens;
create policy "push_tokens: self read"
  on public.push_tokens for select
  using (user_id = (select auth.uid()));

drop policy if exists "push_tokens: self insert" on public.push_tokens;
create policy "push_tokens: self insert"
  on public.push_tokens for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "push_tokens: self update" on public.push_tokens;
create policy "push_tokens: self update"
  on public.push_tokens for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "push_tokens: self delete" on public.push_tokens;
create policy "push_tokens: self delete"
  on public.push_tokens for delete
  using (user_id = (select auth.uid()));

-- Fires once per inserted message; resolves recipient tokens in SQL and
-- hands a flat token list to the edge function, which just relays to Expo.
-- Authenticates with the (non-secret) anon key — satisfies the edge
-- function's verify_jwt check without needing any secret material inside
-- this migration file.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_name text;
  v_tokens text[];
  v_title text;
  v_body text;
begin
  select full_name into v_sender_name from public.profiles where id = new.sender_id;

  select array_agg(distinct pt.expo_push_token) into v_tokens
    from public.push_tokens pt
   where pt.user_id in (
     select recips.user_id
       from (
         select participant_a as user_id from public.conversations
          where id = new.conversation_id and participant_a is not null
         union
         select participant_b as user_id from public.conversations
          where id = new.conversation_id and participant_b is not null
         union
         select user_id from public.conversation_participants
          where conversation_id = new.conversation_id
       ) recips
      where recips.user_id != new.sender_id
        and not exists (
          select 1 from public.conversation_participant_settings s
           where s.conversation_id = new.conversation_id
             and s.user_id = recips.user_id
             and s.muted_until is not null
             and s.muted_until > now()
        )
   );

  if v_tokens is null or array_length(v_tokens, 1) is null then
    return new;
  end if;

  v_title := coalesce(v_sender_name, 'New message');
  v_body := left(new.body, 120);

  perform net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo'
    ),
    body := jsonb_build_object(
      'tokens', to_jsonb(v_tokens),
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object('conversationId', new.conversation_id, 'messageId', new.id)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
  after insert on public.messages
  for each row
  execute function public.notify_new_message();
