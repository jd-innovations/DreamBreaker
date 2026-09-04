-- Same class of bug as 20260707000004: "messages: participants read" relied
-- solely on is_conversation_participant(), which doesn't reliably see a row
-- inserted in the same statement, breaking sendMessage()'s
-- `.insert({...}).select('id, ...').single()` (conversationService.ts) for
-- any first-time send into a conversation whose SELECT authorization would
-- otherwise depend purely on the function. Fix: add an inline
-- `sender_id = auth.uid()` clause — a sender can always read their own
-- message regardless of the function's same-statement visibility.

drop policy if exists "messages: participants read" on public.messages;

create policy "messages: participants read"
  on public.messages for select
  using (
    sender_id = (select auth.uid())
    or public.is_conversation_participant(conversation_id, (select auth.uid()))
  );
