-- One push registration per device: the most recently signed-in account wins.
--
-- push_tokens is keyed (user_id, expo_push_token), so one phone's token could
-- sit under several accounts at once. Sign-out is the only path that deletes a
-- row, so switching accounts without signing out — or a handed-down phone —
-- left the device receiving another account's message previews. Observed
-- 2026-10-02 (Mia's message to Tyler shown on a phone signed in as Mia).
-- Owner approved the fix for App Store submission 2026-10-28.
--
-- The app re-registers on every sign-in (hooks/usePushNotifications.ts upserts
-- whenever the session user changes), so "latest write wins" is exactly "the
-- account signed in on this device now". No app change and no rebuild.
--
-- Security: a caller can only write rows under their own user_id (RLS), and
-- tokens are readable only by their owner, so claiming someone else's token
-- needs that token value first. That was already enough to point one's own
-- notifications at another device; the trigger adds only that the victim's
-- row is dropped, which a fresh sign-in on the victim's device restores.

create or replace function public.fn_push_token_claim_device()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_tokens
   where expo_push_token = new.expo_push_token
     and user_id <> new.user_id;
  return new;
end;
$$;

revoke all on function public.fn_push_token_claim_device() from public, anon, authenticated;

drop trigger if exists trg_push_token_claim_device on public.push_tokens;
create trigger trg_push_token_claim_device
  after insert or update of expo_push_token, user_id on public.push_tokens
  for each row execute function public.fn_push_token_claim_device();

-- One-time cleanup: for each token held by more than one account, keep the
-- most recently written row.
delete from public.push_tokens pt
 using public.push_tokens newer
 where newer.expo_push_token = pt.expo_push_token
   and newer.user_id <> pt.user_id
   and (newer.updated_at, newer.user_id) > (pt.updated_at, pt.user_id);
