-- =============================================================================
-- DreamBreaker PB — play_participants: self-claim RLS policy
-- Migration: 20260629000004_play_participants_claim_rls
--
-- Allows an authenticated user to link unclaimed guest participant rows
-- that share their email address after sign-in/sign-up (Slice 6 claim flow).
-- =============================================================================

create policy "play_participants: self claim"
  on public.play_participants for update
  using (
    auth.uid() is not null
    and email = auth.email()
    and claimed_by is null
  )
  with check (
    claimed_by = auth.uid()
  );

comment on policy "play_participants: self claim" on public.play_participants is
  'Lets a signed-in user link unclaimed guest rows that share their email. Cannot overwrite an existing claimed_by or claim rows with a different email.';
