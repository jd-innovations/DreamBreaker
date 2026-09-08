-- A facility manager could not end their own flash deal.
--
-- Confirmed against production: the manager predicate evaluated true, and
--   update flash_deals set discount_percent = 31  -> ok
--   update flash_deals set is_active = false      -> 42501, "new row violates
--                                                    row-level security policy"
--
-- The SELECT policy was `using (is_active = true)`. Setting is_active false
-- makes the row invisible to the very manager updating it, and the update is
-- refused. Deactivation was therefore impossible for anyone but an admin, and
-- ended or switched-off deals never appeared in any manager-side list.
--
-- courts and ball_machines already carry the correct shape:
--
--   using (is_active = true
--          or is_facility_role_at_least(facility_id, auth.uid(), 'staff'))
--
-- flash_deals was the odd one out. This aligns it.
--
-- Players are unaffected: the first clause is unchanged, so a deal that is not
-- active is still invisible to everyone outside the facility. What is added is
-- a facility's staff seeing their OWN venue's inactive deals — which is what
-- makes ending one possible, and what makes deal history legible.

drop policy if exists "flash_deals: public read active" on public.flash_deals;

create policy "flash_deals: public read active"
  on public.flash_deals for select
  using (
    is_active = true
    or public.is_facility_role_at_least(
         public.facility_id_for_owner(owner_type, owner_id),
         (select auth.uid()),
         'staff'::facility_member_role)
  );
