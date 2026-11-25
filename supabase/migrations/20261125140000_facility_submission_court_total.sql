-- Approved submissions: fill an unknown total from indoor + outdoor (2026-11-25).
--
-- Esplanade's first real mobile edit set outdoor_courts = 4 and left
-- court_count at 0 ("unknown" for imported rows), so the app's Nearby card read
-- "0 courts (4 outdoor)". When an approval leaves the total at 0 but indoor or
-- outdoor courts are known, the total becomes their sum. A known total is never
-- touched (check_court_subtotals already keeps indoor + outdoor <= total).
--
-- An AFTER trigger on the submission rather than a change inside
-- approve_facility_submission(), so the approve path stays as reviewed.

create or replace function public.fn_facility_submission_fill_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.facilities
       set court_count = coalesce(indoor_courts, 0) + coalesce(outdoor_courts, 0)
     where id = coalesce(new.created_facility_id, new.facility_id)
       and coalesce(court_count, 0) = 0
       and coalesce(indoor_courts, 0) + coalesce(outdoor_courts, 0) > 0;
  end if;
  return new;
end;
$fn$;

revoke all on function public.fn_facility_submission_fill_total() from public, anon, authenticated;

drop trigger if exists trg_facility_submission_fill_total on public.facility_submissions;
create trigger trg_facility_submission_fill_total
  after update of status on public.facility_submissions
  for each row execute function public.fn_facility_submission_fill_total();

-- The one row already in this state (Esplanade, approved before this existed).
update public.facilities
   set court_count = coalesce(indoor_courts, 0) + coalesce(outdoor_courts, 0)
 where coalesce(court_count, 0) = 0
   and coalesce(indoor_courts, 0) + coalesce(outdoor_courts, 0) > 0;
