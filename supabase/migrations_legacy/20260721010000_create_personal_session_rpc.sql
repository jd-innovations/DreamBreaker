-- DreamBreaker PB - Personal session creation RPC
-- Keeps personal session ownership server-side so RLS never depends on a client-supplied created_by value.

create or replace function public.create_personal_session(
  p_format text,
  p_facility_id uuid default null,
  p_played_at timestamptz default null,
  p_indoor_outdoor text default null,
  p_notes text default null
)
returns public.personal_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.personal_sessions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_format not in ('singles', 'doubles') then
    raise exception 'invalid_session_format' using errcode = 'P0001';
  end if;

  if p_indoor_outdoor is not null and p_indoor_outdoor not in ('indoor', 'outdoor', 'mixed', 'unknown') then
    raise exception 'invalid_indoor_outdoor' using errcode = 'P0001';
  end if;

  insert into public.personal_sessions (
    created_by,
    facility_id,
    played_at,
    format,
    indoor_outdoor,
    notes
  ) values (
    auth.uid(),
    p_facility_id,
    coalesce(p_played_at, now()),
    p_format,
    p_indoor_outdoor,
    p_notes
  )
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function public.create_personal_session(text, uuid, timestamptz, text, text) to authenticated;
