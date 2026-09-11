-- Record HOW a guest was invited to claim their match.
--
-- personal_guest_shares.share_channel has been CHECK (share_channel = 'sms')
-- since the table was created, because SMS was the only way to invite anyone.
-- A QR path shipped on 2026-09-11 (ClaimInviteSheet) and is now the default
-- offer -- you hold up your screen instead of asking a stranger for their phone
-- number. Every one of those invites is still stamped 'sms', so the data cannot
-- answer the one question the QR path was built to settle: does removing the
-- phone-number ask actually convert better?
--
-- Two changes, and they must land together: widening the constraint is useless
-- without a way to pass the channel in, and mark_personal_guest_share_initiated
-- takes only the share id.

alter table public.personal_guest_shares
  drop constraint if exists personal_guest_shares_share_channel_check;

alter table public.personal_guest_shares
  add constraint personal_guest_shares_share_channel_check
  check (share_channel in ('sms', 'qr'));

-- p_channel defaults to 'sms', so the existing single-argument call sites keep
-- working unchanged and this can be applied before the client ships. Postgres
-- resolves mark_personal_guest_share_initiated(uuid) to this function once the
-- old one is dropped, which the DEFAULT makes safe.
drop function if exists public.mark_personal_guest_share_initiated(uuid);

create or replace function public.mark_personal_guest_share_initiated(
  p_guest_share_id uuid,
  p_channel text default 'sms'
)
returns personal_guest_shares
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_share public.personal_guest_shares;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_channel not in ('sms', 'qr') then
    raise exception 'invalid_share_channel' using errcode = 'P0001';
  end if;

  select * into v_share
    from public.personal_guest_shares
   where id = p_guest_share_id;

  if not found then
    raise exception 'guest_share_not_found' using errcode = 'P0001';
  end if;

  if v_share.created_by <> auth.uid() then
    raise exception 'not_guest_share_creator' using errcode = 'P0001';
  end if;

  -- share_initiated_at keeps its coalesce: it marks the FIRST invite, and
  -- re-inviting a guest should not rewrite when they were first reached.
  -- share_channel is overwritten, so it always names the most recent path --
  -- the one whose outcome is being measured.
  update public.personal_guest_shares
     set share_status = 'share_initiated',
         share_initiated_at = coalesce(share_initiated_at, now()),
         share_channel = p_channel
   where id = p_guest_share_id
   returning * into v_share;

  return v_share;
end;
$function$;

grant execute on function public.mark_personal_guest_share_initiated(uuid, text) to authenticated;
