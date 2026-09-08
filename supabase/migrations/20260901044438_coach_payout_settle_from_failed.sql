-- settle_coach_payout_batch only accepted batches still in 'pending', which
-- made a retried 'failed' batch unsettleable: the runner could transfer the
-- money successfully and then fail to record it, leaving a paid batch marked
-- failed and a transfer nobody could trace back.
--
-- Both transitions are now allowed. Still never re-settles a 'paid' batch —
-- that guard is what stops a double record of money that already moved.
create or replace function public.settle_coach_payout_batch(
  p_batch_id uuid,
  p_transfer_id text,
  p_failure text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if p_failure is not null then
    update public.coach_payout_batches
       set status = 'failed', failure_reason = p_failure, failed_at = now()
     where id = p_batch_id and status in ('pending', 'failed');
    return;
  end if;

  update public.coach_payout_batches
     set status = 'paid',
         stripe_transfer_id = p_transfer_id,
         paid_at = now(),
         failure_reason = null
   where id = p_batch_id and status in ('pending', 'failed');
end;
$fn$;

revoke all on function public.settle_coach_payout_batch(uuid, text, text) from public;
grant execute on function public.settle_coach_payout_batch(uuid, text, text) to service_role;
