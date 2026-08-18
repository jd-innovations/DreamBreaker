-- Bug fix, discovered while smoke-testing group creation: INSERT ... RETURNING
-- on conversations fails RLS whenever the SELECT policy depends entirely on
-- the is_conversation_participant() SECURITY DEFINER function — that function
-- does not reliably see the row being inserted in the same statement/command,
-- even though a plain follow-up SELECT of the same row succeeds immediately
-- after. Reproduced directly in SQL (bypassing PostgREST) to rule out a
-- schema-cache issue: INSERT ... RETURNING fails, but a bare INSERT (no
-- RETURNING) followed by a separate SELECT both succeed.
--
-- Fix: add an inline `created_by = auth.uid()` clause so the creator's own
-- row is authorized without needing the function during the RETURNING check.
-- This also fixes the same latent bug in the existing
-- getOrCreateTournamentConversation() flow (conversationService.ts), which
-- does `.insert({...}).select('id').single()` and was equally exposed.

drop policy if exists "conversations: participants read" on public.conversations;

create policy "conversations: participants read"
  on public.conversations for select
  using (
    created_by = (select auth.uid())
    or public.is_conversation_participant(id, (select auth.uid()))
  );
