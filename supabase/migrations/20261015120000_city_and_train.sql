-- A third world, San Francisco, and the train to it from a new station in the valley.
-- See docs/decisions/0022-san-francisco-and-the-train.md.
--
-- Which worlds connect is a table now: the plane goes between the valley and the island,
-- the train between the valley and the city, and fly() only goes where one of them does.
-- The fare is still the destination's. The city has a rig of its own, the Robotaxi, eight
-- courses, three garages and a café, and both stations are places to find, counted on the
-- leaderboard like the airstrips.
--
-- Must match apps/web/src/app/worlds.ts, vehicles.ts, city.ts and places.ts:
-- flight.test.ts, shop.test.ts and places.test.ts check.

insert into public.worlds (id, fare) values ('city', 150);

-- What carries a truck from one world to another, and back.
create table public.routes (
  origin text not null references public.worlds,
  destination text not null references public.worlds,
  way text not null check (way in ('plane', 'train')),
  primary key (origin, destination),
  check (origin <> destination)
);

insert into public.routes (origin, destination, way) values
  ('valley', 'island', 'plane'), ('island', 'valley', 'plane'),
  ('valley', 'city', 'train'), ('city', 'valley', 'train');

alter table public.routes enable row level security;
create policy "anyone can read routes" on public.routes for select to anon, authenticated using (true);

-- As before, the server takes the client's word that the truck is at the airstrip or on
-- the platform, and checks the fare. Now it also checks that something goes there from
-- where the truck is: there's no train from the island, nor a plane from the city.
create or replace function public.fly(p_to text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  cost numeric;
begin
  select * into p from public.me();
  select fare into cost from public.worlds where id = p_to;
  if cost is null then raise exception 'no such world: %', p_to; end if;
  if p_to = p.world then return p; end if;
  if not exists (select 1 from public.routes r where r.origin = p.world and r.destination = p_to) then
    raise exception 'nothing goes from % to %', p.world, p_to;
  end if;
  if p.balance < cost then raise exception 'not enough miles'; end if;
  insert into private.flight_log (user_id, origin, destination, fare) values (p.id, p.world, p_to, cost);
  update public.profiles set balance = balance - cost, world = p_to where id = p.id returning * into p;
  return p;
end;
$$;

-- The Robotaxi is sold in the city only. Once bought it's yours anywhere.
insert into public.shop_items (key, price, world) values ('vehicle:robotaxi', 200, 'city');

-- The city's courses: four to drive alone, two convoys and two races for friends.
insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew, min_miles, world) values
  ('lombard', 20, 7, 600, 11, 1, 0.11, 'city'),
  ('hill-chase', 25, 8, 600, 37, 1, 0.37, 'city'),
  ('golden-gate', 30, 10, 600, 79, 1, 0.8, 'city'),
  ('twin-peaks', 25, 8, 600, 22, 1, 0.23, 'city'),
  ('bay-to-beach', 40, 12, 600, 168, 2, 1.69, 'city'),
  ('great-highway', 25, 8, 600, 46, 2, 0.46, 'city'),
  ('embarcadero', 30, 10, 600, 62, 2, 0.62, 'city'),
  ('presidio', 30, 10, 600, 60, 2, 0.6, 'city');

-- Stations are a kind of place now: the valley's and Fourth and King. The city's garages
-- and café are places in it.
alter table public.places drop constraint places_kind_check;
alter table public.places add constraint places_kind_check check (kind in ('garage', 'cafe', 'airport', 'station', 'egg'));

insert into public.places (key, kind, world) values
  ('garage:victorian', 'garage', 'city'), ('garage:pier', 'garage', 'city'), ('garage:airfield', 'garage', 'city'),
  ('cafe:northbeach', 'cafe', 'city'),
  ('station:valley', 'station', 'valley'), ('station:city', 'station', 'city');

-- The leaderboard counts stations found too. As before: one world, the one asked for or the
-- one the caller is in; you and your friends only; in order of miles; finding pays nothing.
drop function public.leaderboard(text);
create function public.leaderboard(p_world text default null)
  returns table (id uuid, name text, lifetime numeric, is_me boolean, garages int, cafes int, airports int, stations int, eggs int, goals text[])
language sql security definer set search_path = '' stable as $$
  with w as (
    select coalesce(p_world, (select me.world from public.profiles me where me.id = (select auth.uid()))) as world
  )
  select p.id, coalesce(p.name, 'Driver'), p.lifetime, p.id = (select auth.uid()),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'garage' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'cafe' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'airport' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'station' and pl.key = any (p.discovered)),
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
