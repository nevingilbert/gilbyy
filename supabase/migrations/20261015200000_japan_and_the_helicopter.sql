-- A fifth world, Japan, and the helicopter to it from a new pad on the Grand Canyon's rim
-- in Las Vegas. See docs/decisions/0024-japan-and-the-helicopter.md.
--
-- The helicopter goes between Vegas and Japan, both ways, for the same fare as every trip,
-- the truck slung under it on a cable. Japan has a rig of its own, the Kei Truck; eight
-- courses; three garages and a teahouse; and both pads are places to find, counted on the
-- leaderboard like the airstrips, the stations and the docks.
--
-- Must match apps/web/src/app/worlds.ts, vehicles.ts, japan.ts, missions.ts and places.ts:
-- flight.test.ts, shop.test.ts and places.test.ts check.

insert into public.worlds (id, fare) values ('japan', 150);

-- The helicopter is a fourth way between worlds.
alter table public.routes drop constraint routes_way_check;
alter table public.routes add constraint routes_way_check check (way in ('plane', 'train', 'boat', 'heli'));

insert into public.routes (origin, destination, way) values
  ('vegas', 'japan', 'heli'), ('japan', 'vegas', 'heli');

-- The Kei Truck is sold in Japan only. Once bought it's yours anywhere.
insert into public.shop_items (key, price, world) values ('vehicle:kei', 200, 'japan');

-- Japan's courses: four to drive alone, two convoys and two races for friends.
insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew, min_miles, world) values
  ('the-pass', 30, 10, 600, 51, 1, 0.65, 'japan'),
  ('paddy-dykes', 25, 8, 600, 60, 1, 0.76, 'japan'),
  ('bamboo-grove', 25, 8, 600, 37, 1, 0.46, 'japan'),
  ('lake-round', 30, 10, 600, 71, 1, 0.89, 'japan'),
  ('mountain-road', 25, 8, 600, 29, 2, 0.37, 'japan'),
  ('harbour-run', 30, 10, 600, 27, 2, 0.35, 'japan'),
  ('south-coast', 35, 12, 600, 34, 2, 0.44, 'japan'),
  ('pagoda-race', 30, 10, 600, 63, 2, 0.8, 'japan');

-- Helipads are a kind of place now: the rim's and Japan's. Japan's garages and teahouse
-- are places in it.
alter table public.places drop constraint places_kind_check;
alter table public.places add constraint places_kind_check check (kind in ('garage', 'cafe', 'airport', 'station', 'dock', 'helipad', 'egg'));

insert into public.places (key, kind, world) values
  ('garage:passworks', 'garage', 'japan'), ('garage:harbour', 'garage', 'japan'), ('garage:kura', 'garage', 'japan'),
  ('cafe:teahouse', 'cafe', 'japan'),
  ('helipad:vegas', 'helipad', 'vegas'), ('helipad:japan', 'helipad', 'japan');

-- The leaderboard counts helipads found too. As before: one world, the one asked for or the
-- one the caller is in; you and your friends only; in order of miles; finding pays nothing.
drop function public.leaderboard(text);
create function public.leaderboard(p_world text default null)
  returns table (id uuid, name text, lifetime numeric, is_me boolean, garages int, cafes int, airports int, stations int, docks int, helipads int, eggs int, goals text[])
language sql security definer set search_path = '' stable as $$
  with w as (
    select coalesce(p_world, (select me.world from public.profiles me where me.id = (select auth.uid()))) as world
  )
  select p.id, coalesce(p.name, 'Driver'), p.lifetime, p.id = (select auth.uid()),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'garage' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'cafe' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'airport' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'station' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'dock' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'helipad' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'egg' and pl.key = any (p.discovered)),
    p.goals
  from public.profiles p
  where p.id = (select auth.uid())
     or exists (
       select 1 from public.friendships f
       where (f.a = (select auth.uid()) and f.b = p.id) or (f.b = (select auth.uid()) and f.a = p.id)
     )
  order by p.lifetime desc;
$$;

revoke all on function public.leaderboard(text) from public, anon;
grant execute on function public.leaderboard(text) to authenticated;
