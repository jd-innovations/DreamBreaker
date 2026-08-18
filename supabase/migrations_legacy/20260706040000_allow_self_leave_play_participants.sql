-- Bug: leaving a Quick Game / Round Robin appeared to succeed (no error) but
-- the participant row was never actually deleted, because no RLS policy
-- granted a self-joined player DELETE on their own row — only the organizer
-- ("organizer manage") or an admin could delete. This adds that missing
-- self-leave policy.
create policy "play_participants: self leave"
  on public.play_participants for delete
  using (claimed_by = (select auth.uid()));
