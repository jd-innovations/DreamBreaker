-- partner_matches: created automatically when two users mutually like each other
create table if not exists public.partner_matches (
  id         uuid        primary key default gen_random_uuid(),
  user_a     uuid        not null references public.profiles(id) on delete cascade,
  user_b     uuid        not null references public.profiles(id) on delete cascade,
  matched_at timestamptz not null default now(),
  -- normalise pair so user_a < user_b, preventing duplicate rows
  unique (user_a, user_b),
  constraint user_a_lt_user_b check (user_a < user_b)
);

alter table public.partner_matches enable row level security;

create policy "participants_read" on public.partner_matches
  for select using (auth.uid() = user_a or auth.uid() = user_b);

-- trigger: after a 'like' is inserted, check for a reciprocal like and create a match
create or replace function public.create_partner_match_on_mutual_like()
returns trigger language plpgsql security definer as $$
declare
  v_a uuid;
  v_b uuid;
begin
  -- only act on 'like' kind
  if new.kind <> 'like' then
    return new;
  end if;

  -- check whether the recipient already liked the sender
  if not exists (
    select 1 from public.partner_likes
    where from_user_id = new.to_user_id
      and to_user_id   = new.from_user_id
      and kind         = 'like'
  ) then
    return new;
  end if;

  -- normalise pair
  if new.from_user_id < new.to_user_id then
    v_a := new.from_user_id;
    v_b := new.to_user_id;
  else
    v_a := new.to_user_id;
    v_b := new.from_user_id;
  end if;

  insert into public.partner_matches (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do nothing;

  return new;
end;
$$;

create trigger partner_like_mutual_check
  after insert on public.partner_likes
  for each row execute function public.create_partner_match_on_mutual_like();
