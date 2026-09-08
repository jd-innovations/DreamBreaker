-- Push delivery receipts and invalid-token cleanup (TODO1.1 item 5.1).
--
-- Until now send-message-push was a dumb relay: it forwarded a token list to
-- Expo and threw the response away. That response is the only place Expo tells
-- you a token is dead, so every uninstall, every OS reinstall and every
-- restored-from-backup device left a token in push_tokens forever. Those tokens
-- are not harmless — Expo rate-limits and eventually penalises senders whose
-- traffic is mostly DeviceNotRegistered, so dead tokens degrade delivery for
-- the users who ARE reachable.
--
-- Expo reports a dead token in two places and they are not interchangeable:
--
--   1. The ticket, returned synchronously by /push/send. Catches tokens already
--      known to be bad. Cheap, but incomplete.
--   2. The receipt, fetched later from /push/getReceipts using the ticket id.
--      This is the authoritative delivery result and is where DeviceNotRegistered
--      usually appears, because Expo only learns it after APNs/FCM answers.
--
-- Handling only (1) is the common mistake and it cleans almost nothing. This
-- table exists to make (2) possible: it holds the ticket ids long enough for a
-- sweeper to ask about them.

create table if not exists public.push_tickets (
  -- Expo's ticket id, which is also the receipt id. Not a uuid — treat as text.
  ticket_id text primary key,

  -- The token this ticket was for. Kept denormalised on purpose: by the time a
  -- receipt says DeviceNotRegistered the row in push_tokens may be the only
  -- other trace, and joining back through user_id would not survive the delete.
  expo_push_token text not null,

  created_at timestamptz not null default now(),

  -- Null until the sweeper has asked Expo about it. The partial index below
  -- makes "what is still unchecked" the only query this table serves.
  checked_at timestamptz,

  -- Expo's receipt status ('ok' | 'error') and, on error, details.error —
  -- DeviceNotRegistered, MessageTooBig, MessageRateExceeded, InvalidCredentials.
  -- Kept after checking so a delivery problem that is NOT a dead token (rate
  -- limiting, a bad credential) is visible rather than silently swallowed.
  status text,
  error_code text
);

comment on table public.push_tickets is
  'Expo push ticket ids awaiting a delivery receipt (TODO1.1 5.1). Rows are '
  'created by send-message-push and resolved by push-receipt-sweeper, which '
  'deletes push_tokens rows whose receipt reports DeviceNotRegistered.';

-- The sweeper's only access path. Partial, because checked rows are history and
-- there will be far more of them than pending ones.
create index if not exists push_tickets_unchecked_idx
  on public.push_tickets (created_at)
  where checked_at is null;

-- Expo keeps receipts for 24 hours; a ticket older than that will never resolve.
create index if not exists push_tickets_created_at_idx
  on public.push_tickets (created_at);

alter table public.push_tickets enable row level security;

-- No policies, deliberately. This table is written by an edge function using the
-- service role, which bypasses RLS, and there is no reason for a client to read
-- it. RLS on with zero policies is deny-all, which is the intended posture —
-- see 2.2's notes on tables that are secured by having no way in rather than by
-- a policy nobody reads.

grant select, insert, update, delete on public.push_tickets to service_role;

-- ── Cleanup of the table itself ─────────────────────────────────────────────
--
-- Without this the table grows forever: one row per push per device. Anything
-- older than 24 hours is past Expo's receipt retention, so it is either already
-- checked or permanently unresolvable.

create or replace function public.prune_push_tickets()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_deleted integer;
begin
  delete from public.push_tickets
   where created_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_push_tickets() from public;
grant execute on function public.prune_push_tickets() to service_role;

comment on function public.prune_push_tickets() is
  'Deletes push_tickets past Expo''s 24-hour receipt retention. Called by '
  'push-receipt-sweeper on each run.';
