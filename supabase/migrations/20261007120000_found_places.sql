-- Places worth finding: the garages and the café. Once a player has driven up to one it
-- stays on their map, and how many they've found shows beside their miles on the
-- friends leaderboard. See docs/decisions/0008-found-places.md.

-- Must match apps/web/src/app/places.ts (places.test.ts checks).
create table public.places (
  key text primary key,
  kind text not null check (kind in ('garage', 'cafe'))
);

insert into public.places (key, kind) values
  ('garage:workshop', 'garage'), ('garage:barn', 'garage'), ('garage:quonset', 'garage'),
  ('garage:hangar', 'garage'), ('garage:ranch', 'garage'), ('garage:cabin', 'garage'),
  ('garage:bunker', 'garage'), ('garage:container', 'garage'),
  ('cafe:camp', 'cafe');

alter table public.places enable row level security;
create policy "anyone can read places" on public.places for select to anon, authenticated using (true);

-- Named `discovered`, not `found`: inside a function `found` is whether the last
-- statement touched a row.
alter table public.profiles add column discovered text[] not null default '{}';

-- Records a place as found. The server can't see where a truck is, so like mark_goal
-- this takes the client's word that it got there. It only checks the place exists.
create function public.discover(p_key text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  select * into p from public.me();
  if not exists (select 1 from public.places where key = p_key) then
    raise exception 'no such place: %', p_key;
  end if;
  update public.profiles set discovered = array_append(discovered, p_key)
    where id = p.id and not (p_key = any (discovered));
  select * into p from public.profiles where id = p.id;
  return p;
end;
$$;

-- The leaderboard also says how many places each of you has found. Still you and your
-- friends only, and still in order of miles.
drop function public.leaderboard();
create function public.leaderboard()
  returns table (id uuid, name text, lifetime numeric, is_me boolean, garages int, cafes int)
language sql security definer set search_path = '' stable as $$
  select p.id, coalesce(p.name, 'Driver'), p.lifetime, p.id = (select auth.uid()),
    (select count(*)::int from public.places pl where pl.kind = 'garage' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl where pl.kind = 'cafe' and pl.key = any (p.discovered))
  from public.profiles p
  where p.id = (select auth.uid())
     or exists (
       select 1 from public.friendships f
       where (f.a = (select auth.uid()) and f.b = p.id) or (f.b = (select auth.uid()) and f.a = p.id)
     )
  order by p.lifetime desc;
$$;

revoke all on function public.discover(text), public.leaderboard() from public, anon;
grant execute on function public.discover(text), public.leaderboard() to authenticated;
