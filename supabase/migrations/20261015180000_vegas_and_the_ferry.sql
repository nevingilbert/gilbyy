-- A fourth world, Las Vegas and the Grand Canyon, and the car ferry to it from a new dock
-- on the island. See docs/decisions/0023-las-vegas-and-the-ferry.md.
--
-- The ferry goes between the island and the marina on Lake Mead, both ways, for the same
-- fare as every trip. Vegas has a rig of its own, the Slipstream, a racing car; eight
-- courses; three garages and a diner; and both docks are places to find, counted on the
-- leaderboard like the airstrips and the stations.
--
-- The Slipstream is quicker on tarmac than anything before it, so the speed no honest run
-- beats went from 27 m/s to 34 (TOO_QUICK in missions.ts), and every course's quickest
-- believable time is redone to match: otherwise an honest lap in it would be refused.
--
-- Must match apps/web/src/app/worlds.ts, vehicles.ts, vegas.ts, missions.ts and places.ts:
-- flight.test.ts, shop.test.ts and places.test.ts check.

insert into public.worlds (id, fare) values ('vegas', 150);

-- The ferry is a third way between worlds.
alter table public.routes drop constraint routes_way_check;
alter table public.routes add constraint routes_way_check check (way in ('plane', 'train', 'boat'));

insert into public.routes (origin, destination, way) values
  ('island', 'vegas', 'boat'), ('vegas', 'island', 'boat');

-- The Slipstream is sold in Vegas only. Once bought it's yours anywhere.
insert into public.shop_items (key, price, world) values ('vehicle:slipstream', 400, 'vegas');

-- Vegas's courses: four to drive alone, two convoys and two races for friends.
insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew, min_miles, world) values
  ('grand-prix', 30, 10, 600, 59, 1, 0.75, 'vegas'),
  ('grand-prix-race', 40, 14, 600, 117, 2, 1.48, 'vegas'),
  ('the-strip', 20, 7, 600, 58, 1, 0.73, 'vegas'),
  ('canyon-descent', 35, 12, 600, 37, 1, 0.47, 'vegas'),
  ('desert-run', 25, 8, 600, 61, 1, 0.78, 'vegas'),
  ('rim-to-river', 50, 16, 600, 84, 2, 1.06, 'vegas'),
  ('lakeshore', 35, 12, 600, 48, 2, 0.61, 'vegas'),
  ('red-rock-race', 35, 12, 600, 108, 2, 1.37, 'vegas');

-- Every other course's quickest believable time, at the new limit. Nothing else about them changes.
insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew, min_miles, world) values
  ('forest-slalom', 12, 4, 600, 12, 1, 0.15, 'valley'),
  ('ridge-run', 15, 5, 600, 10, 1, 0.13, 'valley'),
  ('lakeshore-loop', 20, 7, 600, 56, 1, 0.71, 'valley'),
  ('ice-drift', 25, 8, 600, 24, 1, 0.3, 'valley'),
  ('convoy', 30, 10, 600, 45, 2, 0.57, 'valley'),
  ('race', 25, 8, 600, 69, 2, 0.87, 'valley'),
  ('grand-tour', 40, 12, 600, 67, 2, 0.85, 'valley'),
  ('hill-race', 30, 10, 600, 58, 2, 0.74, 'valley'),
  ('deep-woods', 15, 5, 600, 14, 1, 0.18, 'valley'),
  ('southern-shore', 20, 7, 600, 52, 1, 0.66, 'valley'),
  ('high-ridge', 18, 6, 600, 10, 1, 0.13, 'valley'),
  ('snowfield', 25, 8, 600, 16, 1, 0.21, 'valley'),
  ('far-bank', 30, 10, 600, 7, 1, 0.09, 'valley'),
  ('big-air', 15, 5, 600, 7, 1, 0.09, 'valley'),
  ('barn-round', 30, 10, 600, 43, 2, 0.55, 'valley'),
  ('lakehead-race', 30, 10, 600, 48, 2, 0.61, 'valley'),
  ('snowline', 30, 10, 600, 44, 2, 0.56, 'valley'),
  ('two-lakes-race', 30, 10, 600, 49, 2, 0.62, 'valley'),
  ('trackside', 25, 8, 600, 14, 2, 0.17, 'valley'),
  ('flat-out', 25, 8, 600, 14, 2, 0.18, 'valley'),
  ('beach-run', 15, 5, 600, 31, 1, 0.4, 'island'),
  ('dune-dash', 20, 6, 600, 38, 1, 0.48, 'island'),
  ('jungle-loop', 35, 12, 600, 98, 1, 1.25, 'island'),
  ('hilltop', 25, 8, 600, 30, 1, 0.38, 'island'),
  ('coast-convoy', 40, 12, 600, 66, 2, 0.84, 'island'),
  ('sand-race', 25, 8, 600, 46, 2, 0.58, 'island'),
  ('tideline', 30, 10, 600, 27, 2, 0.34, 'island'),
  ('dune-derby', 30, 10, 600, 44, 2, 0.56, 'island'),
  ('sandbar', 25, 8, 600, 19, 1, 0.24, 'island'),
  ('lombard', 20, 7, 600, 8, 1, 0.11, 'city'),
  ('hill-chase', 25, 8, 600, 29, 1, 0.37, 'city'),
  ('golden-gate', 30, 10, 600, 63, 1, 0.8, 'city'),
  ('twin-peaks', 25, 8, 600, 18, 1, 0.23, 'city'),
  ('bay-to-beach', 40, 12, 600, 133, 2, 1.69, 'city'),
  ('great-highway', 25, 8, 600, 36, 2, 0.46, 'city'),
  ('embarcadero', 30, 10, 600, 49, 2, 0.62, 'city'),
  ('presidio', 30, 10, 600, 48, 2, 0.6, 'city')
on conflict (id) do update set min_seconds = excluded.min_seconds;

-- Docks are a kind of place now: the island's and the marina's. Vegas's garages and diner
-- are places in it.
alter table public.places drop constraint places_kind_check;
alter table public.places add constraint places_kind_check check (kind in ('garage', 'cafe', 'airport', 'station', 'dock', 'egg'));

insert into public.places (key, kind, world) values
  ('garage:speedshop', 'garage', 'vegas'), ('garage:pitgarage', 'garage', 'vegas'), ('garage:tradingpost', 'garage', 'vegas'),
  ('cafe:diner', 'cafe', 'vegas'),
  ('dock:island', 'dock', 'island'), ('dock:vegas', 'dock', 'vegas');

-- The leaderboard counts docks found too. As before: one world, the one asked for or the
-- one the caller is in; you and your friends only; in order of miles; finding pays nothing.
drop function public.leaderboard(text);
create function public.leaderboard(p_world text default null)
  returns table (id uuid, name text, lifetime numeric, is_me boolean, garages int, cafes int, airports int, stations int, docks int, eggs int, goals text[])
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
