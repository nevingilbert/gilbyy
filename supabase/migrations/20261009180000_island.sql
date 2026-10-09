-- A second world: the island, a flight away from the valley.
-- See docs/decisions/0014-airports-and-the-island.md.
--
-- A player's truck is in one world at a time. fly() moves it to another for a fare in
-- miles, priced and checked here like everything else. The map's fog is kept per world,
-- each world past the valley has a channel only the players in it may use, and one rig
-- is sold only on the island.

-- The worlds, and what the flight to each costs. Must match apps/web/src/app/worlds.ts
-- (flight.test.ts checks).
create table public.worlds (
  id text primary key,
  fare numeric(8, 2) not null check (fare >= 0)
);

insert into public.worlds (id, fare) values ('valley', 300), ('island', 300);

alter table public.worlds enable row level security;
create policy "anyone can read worlds" on public.worlds for select to anon, authenticated using (true);

-- Where each player's truck is. Everyone starts in the valley, and until now has been there.
alter table public.profiles add column world text not null default 'valley' references public.worlds;

-- Every flight, for the owner to look at. Like private.drive_log, the game never reads it.
create table private.flight_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  at timestamptz not null default now(),
  origin text not null,
  destination text not null,
  fare numeric(8, 2) not null
);
create index flight_log_user_at on private.flight_log (user_id, at desc);
alter table private.flight_log enable row level security;

-- Pays the fare and moves the caller to another world. The server can't see where a truck
-- is, so like complete_mission it takes the client's word that it is at the airstrip;
-- what it checks is the fare. Asking for the world you're already in changes nothing, so
-- a call sent twice charges once.
create function public.fly(p_to text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  cost numeric;
begin
  select * into p from public.me();
  select fare into cost from public.worlds where id = p_to;
  if cost is null then raise exception 'no such world: %', p_to; end if;
  if p_to = p.world then return p; end if;
  if p.balance < cost then raise exception 'not enough miles'; end if;
  insert into private.flight_log (user_id, origin, destination, fare) values (p.id, p.world, p_to, cost);
  update public.profiles set balance = balance - cost, world = p_to where id = p.id returning * into p;
  return p;
end;
$$;

-- Some things are sold in one world only: the Sandfly is the island's. Once bought, a
-- thing is yours anywhere, so equip() doesn't care where you are.
-- Must match apps/web/src/app/vehicles.ts (shop.test.ts checks).
alter table public.shop_items add column world text references public.worlds;

insert into public.shop_items (key, price, world) values ('vehicle:sandfly', 30, 'island');

create or replace function public.buy(p_key text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  item public.shop_items;
begin
  select * into p from public.me();
  select * into item from public.shop_items where key = p_key;
  if item.key is null then raise exception 'no such item: %', p_key; end if;
  if item.price = 0 or p_key = any (p.owned) then return p; end if;
  if item.world is not null and item.world <> p.world then raise exception 'only sold in %', item.world; end if;
  if p.balance < item.price then raise exception 'not enough miles'; end if;
  update public.profiles
    set balance = balance - item.price, owned = array_append(owned, p_key)
    where id = p.id returning * into p;
  return p;
end;
$$;

-- The map's fog, per world: a row for each world a player has driven in. What was saved
-- before this is the valley's.
alter table public.fog add column world text not null default 'valley' references public.worlds;
alter table public.fog drop constraint fog_pkey;
alter table public.fog add primary key (id, world);

-- Both take the world now. Left out, explore() means the valley and explored() means the
-- world the caller is in, so a page loaded before this still works.
drop function public.explore(int[]);
drop function public.explored();

-- The sizes must match apps/web/src/app/fog.ts (fog.test.ts checks). The server still
-- takes the client's word for where the truck has been, and so for which world.
create function public.explore(p_cells int[], p_world text default 'valley') returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select id from public.me());
  b bytea;
  c int;
begin
  if coalesce(cardinality(p_cells), 0) = 0 then return; end if;
  if cardinality(p_cells) > 512 then raise exception 'too many cells at once'; end if;
  if exists (select 1 from unnest(p_cells) as u(cell) where cell is null or cell < 0 or cell >= 16384) then
    raise exception 'no such cell';
  end if;
  if not exists (select 1 from public.worlds where id = p_world) then raise exception 'no such world: %', p_world; end if;
  insert into public.fog (id, world, cells) values (uid, p_world, decode(repeat('00', 2048), 'hex')) on conflict do nothing;
  select cells into b from public.fog where id = uid and world = p_world for update;
  foreach c in array p_cells loop
    b := set_bit(b, c, 1);
  end loop;
  update public.fog set cells = b where id = uid and world = p_world;
end;
$$;

-- The caller's explored cells in a world as hex, or null if they have none there yet.
create function public.explored(p_world text default null) returns text
language sql security definer set search_path = '' stable as $$
  select encode(f.cells, 'hex') from public.fog f
  where f.id = (select auth.uid())
    and f.world = coalesce(p_world, (select p.world from public.profiles p where p.id = (select auth.uid())));
$$;

revoke all on function public.fly(text), public.explore(int[], text), public.explored(text) from public, anon;
grant execute on function public.fly(text), public.explore(int[], text), public.explored(text) to authenticated;

-- Realtime. The valley's channel is "world", open to everyone signed in, as it was. Each
-- other world's is "world:<id>" (net.ts, worldTopic), and only the players whose profile
-- says they are there may listen or send on it.
create function public.is_in_world(p_topic text) returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.world <> 'valley' and p_topic = 'world:' || p.world
  );
$$;

revoke all on function public.is_in_world(text) from public, anon;
grant execute on function public.is_in_world(text) to authenticated;

create policy "players in a world share it" on realtime.messages for select to authenticated
  using (public.is_in_world((select realtime.topic())) and realtime.messages.extension in ('broadcast', 'presence'));
create policy "players in a world move in it" on realtime.messages for insert to authenticated
  with check (public.is_in_world((select realtime.topic())) and realtime.messages.extension in ('broadcast', 'presence'));
