-- Facility slugs drop every capital letter (2026-11-25).
--
-- fn_generate_facility_slug() ran regexp_replace('[^a-z0-9]+') BEFORE lower(),
-- so uppercase letters were treated as separators and deleted:
--   "Camp Creek Golf Course Pickleball Courts, Inlet Beach FL"
--   -> amp-reek-olf-ourse-ickleball-ourts-nlet-each
-- 1,527 of 2,024 slugs are mangled this way.
--
-- Slugs are about to become public URLs (/courts/<state>/<city>/<slug>).
-- Nothing links to them yet — not the apps, not the sitemap, not shares (which
-- use /facility/<id>) — so every slug is regenerated now, before any URL can be
-- indexed. Format kept: name-city-state, lowercase, unaccented, -2/-3 on
-- collision.

create or replace function public.fn_generate_facility_slug()
returns trigger
language plpgsql
as $function$
declare
  v_base    text;
  v_slug    text;
  v_counter integer := 1;
begin
  if new.slug is not null then
    return new;
  end if;
  -- lower() FIRST, then strip — the order was the bug.
  v_base := trim(both '-' from regexp_replace(
    lower(unaccent(coalesce(new.name, '') || ' ' || coalesce(new.city, '') || ' ' || coalesce(new.state, ''))),
    '[^a-z0-9]+', '-', 'g'
  ));
  if v_base = '' then
    v_base := 'facility';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.facilities where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug    := v_base || '-' || v_counter;
  end loop;
  new.slug := v_slug;
  return new;
end;
$function$;

-- Two passes so no row's new slug can collide with another row's old one
-- while the unique index is checked row by row.
update public.facilities set slug = 'tmp-' || id::text;

with b as (
  select id, created_at,
         coalesce(nullif(trim(both '-' from regexp_replace(
           lower(unaccent(coalesce(name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(state, ''))),
           '[^a-z0-9]+', '-', 'g')), ''), 'facility') as base
    from public.facilities
),
r as (
  select id, base, row_number() over (partition by base order by created_at, id) as rn
    from b
)
update public.facilities f
   set slug = case when r.rn = 1 then r.base else r.base || '-' || r.rn end
  from r
 where r.id = f.id;
