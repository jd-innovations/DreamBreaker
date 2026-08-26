-- =============================================================================
-- TODO 1.1 item 6.1 — clear the phantom revenue left by the seed data
-- =============================================================================
-- Written 2026-08-25. Run against PRODUCTION (fbzetvkbhneptvfruilw) in the
-- Supabase SQL editor. Companion to scripts/gate-seed-data-6-1.sql, which hid
-- the seed profiles from discovery but deliberately left their money rows.
--
-- The rows below are invisible to the tooling built to catch exactly this:
-- `admin_payment_reconciliation()` has three categories
-- (succeeded_not_fulfilled, stuck_pending, duplicate_payment) and all three key
-- off the `payments` table. A registration marked paid with **no payment row at
-- all** matches none of them, so nothing surfaces it and nothing can clear it.
--
-- Why this and not "delete the seed accounts": `delete-account` anonymizes the
-- profile to a tombstone and never touches registrations or reservations, and
-- it derives its target from the caller's JWT so it cannot be pointed at these
-- accounts anyway. Deleting them would leave every figure below exactly as it
-- is, attached to opaque identities. The money is the problem, not the names.
--
-- Trigger behaviour, all verified against production before writing:
--   * fn_notify_registration      AFTER **INSERT** only — no emails, no
--                                 notifications fire from these updates.
--   * fn_enforce_registration_close  BEFORE **INSERT** only — updates pass even
--                                 though these tournaments are past-dated.
--   * fn_protect_registration_payment_fields  BEFORE INSERT OR UPDATE, and it
--                                 rejects any change to entry_fee_paid_cents
--                                 unless auth.role() = 'service_role'. The SQL
--                                 editor has no JWT, hence the set_config in
--                                 step 1. **Without it, step 1 raises.**
--   * fn_sync_spots_filled        AFTER INSERT OR DELETE OR UPDATE **OF status**
--                                 — so step 1 alone cannot disturb any count,
--                                 while step 2 intentionally does.
-- =============================================================================


-- ─── 1. Zero the fabricated entry fees ───────────────────────────────────────
--
-- Four registrations on "Lakewood Ranch Classic" by the seed players
-- 11111111-…-1111111101..04, each entry_fee_paid_cents = 7500, none with a
-- stripe_entry_intent_id and none with a payments row. $300.00 of revenue that
-- was never charged to anyone.
--
-- The set_config must share a transaction with the UPDATE — `true` scopes it to
-- the transaction, so if the two ran as separate statements the role assertion
-- would be gone by the time the UPDATE ran and the trigger would reject it.
--
-- Both live inside one DO block on purpose. A DO block is a single statement
-- and therefore a single transaction, which makes this correct whether the file
-- is pasted into the SQL editor, piped through `supabase db query --file`, or
-- sent to the Management API — none of which agree on how loose statements are
-- batched. It raises rather than silently updating 0 rows.

do $$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  update public.registrations
     set entry_fee_paid_cents = 0
   where player_id::text ~ '^11111111'
     and coalesce(entry_fee_paid_cents, 0) > 0
     and stripe_entry_intent_id is null;

  get diagnostics n = row_count;
  raise notice 'step 1: zeroed entry_fee_paid_cents on % registration(s)', n;

  if n <> 4 then
    raise exception 'step 1 expected 4 rows, got % — stopping before anything else changes', n;
  end if;
end $$;


-- ─── 2. Withdraw the fabricated registrations ────────────────────────────────
--
-- With the fees zeroed they are no longer phantom revenue, but they are still
-- four fake players occupying a roster on a publicly listed tournament.
-- Withdrawing them fires fn_sync_spots_filled, which decrements
-- tournaments.spots_filled from 5 to 1 — that is intended, and step 4 verifies
-- the result rather than trusting it.

update public.registrations
   set status = 'withdrawn'
 where player_id::text ~ '^11111111'
   and status::text in ('held', 'registered', 'checked_in', 'substitute');
-- expected: UPDATE 4


-- ─── 3. Cancel the seed court reservations ───────────────────────────────────
--
-- Five confirmed bookings by the same seed players at a real facility, priced
-- $32.00 / $14.40 / $15.00 / $30.00 / $32.00 — $123.40 total, with zero rows in
-- `payments`. All are in the past (2026-08-10 and 2026-08-13), so no live court
-- inventory is affected either way; the point is that they inflate booking
-- revenue and facility utilisation.

update public.reservations
   set status = 'cancelled',
       cancelled_at = coalesce(cancelled_at, now())
 where organizer_id::text ~ '^(11111111|c0ac0000)'
   and status::text <> 'cancelled';
-- expected: UPDATE 5


-- ─── 4. Recompute spots_filled from the registrations that actually exist ────
--
-- `tournaments.spots_filled` is a stored counter kept in step by
-- fn_sync_spots_filled, so it can drift from reality and nothing notices. Two
-- rows currently disagree:
--
--   Summer Slam Showdown   stored 82, actual 0   <- fabricated scarcity, and
--                                                   the tournament is `open`
--                                                   and publicly browsable
--   Test payments          stored  5, actual 6   <- ordinary drift; cancelled,
--                                                   so not user-visible
--
-- 82 of 112 "filled" with no registrations at all is the same class of problem
-- as the rest of 6.1: a number a real user would read as demand. Recomputed
-- from the source of truth rather than hand-set, so this also absorbs whatever
-- step 2 just changed.

update public.tournaments t
   set spots_filled = sub.actual
  from (
    select t2.id,
           (select count(*)
              from public.registrations r
             where r.tournament_id = t2.id
               and r.status::text in ('held', 'registered', 'checked_in', 'substitute')
           )::int as actual
      from public.tournaments t2
  ) sub
 where sub.id = t.id
   and t.spots_filled is distinct from sub.actual;
-- expected: UPDATE 3  (Summer Slam 82->0, Test payments 5->6,
--                      Lakewood Ranch Classic 5->1 after step 2)


-- ─── Verification ────────────────────────────────────────────────────────────

-- All four must be 0.
select
  (select count(*) from public.registrations
    where player_id::text ~ '^11111111' and coalesce(entry_fee_paid_cents,0) > 0)  as phantom_paid_registrations,
  (select count(*) from public.registrations
    where player_id::text ~ '^11111111'
      and status::text in ('held','registered','checked_in','substitute'))         as active_seed_registrations,
  (select count(*) from public.reservations
    where organizer_id::text ~ '^(11111111|c0ac0000)' and status::text <> 'cancelled') as active_seed_reservations,
  (select count(*) from public.tournaments t
    where t.spots_filled is distinct from
          (select count(*) from public.registrations r
            where r.tournament_id = t.id
              and r.status::text in ('held','registered','checked_in','substitute'))) as tournaments_with_drift;

-- Nothing real should have been touched: these must be unchanged at 36 / 3.
select (select count(*) from public.payments) as payments,
       (select count(*) from public.refunds)  as refunds;


-- ─── Rollback ────────────────────────────────────────────────────────────────
--
-- Steps 2-4 are reversible with ordinary updates. Step 1 is NOT worth
-- reversing: it restores a number that was never backed by a payment. If you
-- must, it needs the same set_config wrapper.
--
-- The original values, for the record:
--   registrations  4 rows, entry_fee_paid_cents 7500 each, status 'registered'
--   reservations   d0ad4bec / 584a3c34 / 6ddef3cf / fb2b8a44 / 29d3707c, all
--                  'confirmed', cancelled_at null
--   tournaments    Summer Slam Showdown spots_filled 82
--                  Test payments        spots_filled 5
--                  Lakewood Ranch Classic spots_filled 5
