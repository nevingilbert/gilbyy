-- gilbyy.com: accounts, the garage shop, missions, friends, and who may use which
-- realtime channel. See docs/decisions/0007-accounts-multiplayer-and-a-shop.md.
--
-- Clients never write tables directly. Every change goes through a security-definer
-- function below that checks it: miles can only grow as fast as a truck can drive,
-- purchases are priced from shop_items, missions pay from missions. Tables are
-- readable as far as each game screen needs, and no further.

-- The price list. Must match apps/web/src/app/shop.ts (shop.test.ts checks).
create table public.shop_items (
  key text primary key,
  price numeric(8, 2) not null check (price >= 0)
);

insert into public.shop_items (key, price) values
  ('vehicle:ridgeback', 0), ('vehicle:bluff', 0), ('vehicle:mule', 0),
  ('vehicle:overlander', 8), ('vehicle:prairie', 18), ('vehicle:highland', 28),
  ('vehicle:summit', 40), ('vehicle:duneclaw', 55),
  ('paint:factory', 0), ('paint:forestGreen', 1), ('paint:desertCream', 0.5), ('paint:rustRed', 0.5),
  ('paint:oliveDrab', 1), ('paint:skyBlue', 1), ('paint:mustard', 1.5), ('paint:lagoonTeal', 1.5),
  ('paint:chocolate', 2), ('paint:pearlWhite', 2), ('paint:sunsetOrange', 3), ('paint:midnight', 3),
  ('tyres:road', 0), ('tyres:allTerrain', 2), ('tyres:mud', 4), ('tyres:studded', 5),
  ('tyres:big33', 9), ('tyres:crawler37', 15),
  ('lights:stock', 0), ('lights:halogen', 1), ('lights:driving', 3), ('lights:bar', 6), ('lights:fullRig', 10),
  ('snorkel:none', 0), ('snorkel:snorkel', 9),
  ('winter:none', 0), ('winter:chains', 6);

-- Mission payouts and believability limits. Must match apps/web/src/app/missions.ts.
create table public.missions (
  id text primary key,
  reward numeric(6, 2) not null,
  repeat_reward numeric(6, 2) not null,
  cooldown_seconds int not null,
  min_seconds int not null
);

insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds) values
  ('forest-slalom', 1.5, 0.5, 600, 18),
  ('ridge-run', 2, 0.6, 600, 15),
  ('lakeshore-loop', 2.5, 0.8, 600, 83),
  ('ice-drift', 3, 1, 600, 35);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text unique check (name ~ '^[A-Za-z0-9 _-]{3,20}$'),
  lifetime numeric(10, 3) not null default 0 check (lifetime >= 0),
  balance numeric(10, 3) not null default 0 check (balance >= 0),
  owned text[] not null default '{}',
  vehicle text,
  loadout jsonb not null default '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none"}',
  goals text[] not null default '{}',
  last_drive_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.mission_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  mission text not null references public.missions,
  seconds numeric(8, 2) not null,
  reward numeric(6, 2) not null,
  finished_at timestamptz not null default now()
);
create index mission_runs_user_mission on public.mission_runs (user_id, mission, finished_at desc);

-- Friendship needs both players to ask, face to face at the coffee shop.
create table public.friend_requests (
  from_id uuid not null references public.profiles on delete cascade,
  to_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);

-- Stored once per pair, smaller id first.
create table public.friendships (
  a uuid not null references public.profiles on delete cascade,
  b uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);

alter table public.shop_items enable row level security;
alter table public.missions enable row level security;
alter table public.profiles enable row level security;
alter table public.mission_runs enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

create policy "anyone can read prices" on public.shop_items for select to anon, authenticated using (true);
create policy "anyone can read missions" on public.missions for select to anon, authenticated using (true);
-- Names, miles and rigs are what other players see on the road and the leaderboard.
create policy "players can see players" on public.profiles for select to authenticated using (true);
create policy "own mission runs" on public.mission_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "own friend requests" on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));
create policy "own friendships" on public.friendships for select to authenticated
  using ((select auth.uid()) in (a, b));

-- A profile for every new account.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The caller's profile, created if it is somehow missing.
create function public.me() returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  insert into public.profiles (id) values ((select auth.uid())) on conflict do nothing;
  select * into p from public.profiles where id = (select auth.uid());
  return p;
end;
$$;

create function public.set_name(p_name text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  update public.profiles set name = btrim(p_name) where id = (select auth.uid()) returning * into p;
  return p;
end;
$$;

-- Banks miles driven since the last call, no faster than any rig can go (with slack).
create function public.add_miles(p_miles numeric) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  allowed numeric;
begin
  select * into p from public.me();
  allowed := greatest(0, least(p_miles, extract(epoch from now() - p.last_drive_at) * 0.02, 5));
  update public.profiles
    set lifetime = lifetime + allowed, balance = balance + allowed, last_drive_at = now()
    where id = p.id returning * into p;
  return p;
end;
$$;

create function public.buy(p_key text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  cost numeric;
begin
  select * into p from public.me();
  select price into cost from public.shop_items where key = p_key;
  if cost is null then raise exception 'no such item: %', p_key; end if;
  if cost = 0 or p_key = any (p.owned) then return p; end if;
  if p.balance < cost then raise exception 'not enough miles'; end if;
  update public.profiles
    set balance = balance - cost, owned = array_append(owned, p_key)
    where id = p.id returning * into p;
  return p;
end;
$$;

-- Fits a rig and parts. Everything must be free or already bought.
create function public.equip(p_vehicle text, p_loadout jsonb) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  part record;
  wanted text[];
begin
  select * into p from public.me();
  wanted := array['vehicle:' || p_vehicle];
  for part in select key, value from jsonb_each_text(p_loadout) loop
    if part.key not in ('paint', 'tyres', 'lights', 'snorkel', 'winter') then
      raise exception 'unknown part slot: %', part.key;
    end if;
    wanted := wanted || (part.key || ':' || part.value);
  end loop;
  if exists (
    select 1 from unnest(wanted) as w(key)
    left join public.shop_items s on s.key = w.key
    where s.key is null or (s.price > 0 and not (w.key = any (p.owned)))
  ) then
    raise exception 'not owned';
  end if;
  update public.profiles set vehicle = p_vehicle, loadout = p_loadout where id = p.id returning * into p;
  return p;
end;
$$;

-- Pays out a finished mission: the full reward the first time, less after, and not too often.
create function public.complete_mission(p_mission text, p_seconds numeric) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  m public.missions;
  last_run timestamptz;
  paid numeric;
begin
  select * into p from public.me();
  select * into m from public.missions where id = p_mission;
  if m.id is null then raise exception 'no such mission: %', p_mission; end if;
  if p_seconds < m.min_seconds then raise exception 'too fast to be true'; end if;
  select max(finished_at) into last_run from public.mission_runs where user_id = p.id and mission = m.id;
  if last_run is not null and last_run > now() - make_interval(secs => m.cooldown_seconds) then
    raise exception 'come back later';
  end if;
  paid := case when last_run is null then m.reward else m.repeat_reward end;
  insert into public.mission_runs (user_id, mission, seconds, reward) values (p.id, m.id, p_seconds, paid);
  update public.profiles set lifetime = lifetime + paid, balance = balance + paid where id = p.id returning * into p;
  return p;
end;
$$;

-- Onboarding steps already done, so the hints don't repeat.
create function public.mark_goal(p_goal text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  select * into p from public.me();
  if length(p_goal) > 40 or cardinality(p.goals) >= 50 or p_goal = any (p.goals) then return p; end if;
  update public.profiles set goals = array_append(goals, p_goal) where id = p.id returning * into p;
  return p;
end;
$$;

-- Asks to be friends. When the other player has already asked back, you're friends.
create function public.request_friend(p_other uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_other = me then raise exception 'that is you'; end if;
  if exists (select 1 from public.friendships where a = least(me, p_other) and b = greatest(me, p_other)) then
    return 'friends';
  end if;
  if exists (select 1 from public.friend_requests where from_id = p_other and to_id = me) then
    insert into public.friendships (a, b) values (least(me, p_other), greatest(me, p_other)) on conflict do nothing;
    delete from public.friend_requests where (from_id, to_id) in ((me, p_other), (p_other, me));
    return 'friends';
  end if;
  insert into public.friend_requests (from_id, to_id) values (me, p_other) on conflict do nothing;
  return 'pending';
end;
$$;

-- You and your friends, most miles first.
create function public.leaderboard() returns table (id uuid, name text, lifetime numeric, is_me boolean)
language sql security definer set search_path = '' stable as $$
  select p.id, coalesce(p.name, 'Driver'), p.lifetime, p.id = (select auth.uid())
  from public.profiles p
  where p.id = (select auth.uid())
     or exists (
       select 1 from public.friendships f
       where (f.a = (select auth.uid()) and f.b = p.id) or (f.b = (select auth.uid()) and f.a = p.id)
     )
  order by p.lifetime desc;
$$;

-- Lock everything down to signed-in callers.
revoke all on function public.me, public.set_name, public.add_miles, public.buy, public.equip,
  public.complete_mission, public.mark_goal, public.request_friend, public.leaderboard from public, anon;
grant execute on function public.me, public.set_name, public.add_miles, public.buy, public.equip,
  public.complete_mission, public.mark_goal, public.request_friend, public.leaderboard to authenticated;

-- Realtime. "world" carries everyone's position and presence; "chat:<a>:<b>" carries
-- text between two friends (ids in order). Channels are private: these policies decide
-- who may listen and who may send. Turn off "Allow public access" in Realtime settings.
create function public.is_chat_member(p_topic text) returns boolean
language plpgsql security definer set search_path = '' stable as $$
declare
  parts text[] := string_to_array(p_topic, ':');
  first_id uuid;
  second_id uuid;
begin
  if cardinality(parts) <> 3 or parts[1] <> 'chat' then return false; end if;
  begin
    first_id := parts[2]::uuid;
    second_id := parts[3]::uuid;
  exception when others then
    return false;
  end;
  return (select auth.uid()) in (first_id, second_id)
    and exists (select 1 from public.friendships f where f.a = first_id and f.b = second_id);
end;
$$;

create policy "signed-in players share the world" on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'world' and realtime.messages.extension in ('broadcast', 'presence'));
create policy "signed-in players move in the world" on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'world' and realtime.messages.extension in ('broadcast', 'presence'));
create policy "friends hear each other" on realtime.messages for select to authenticated
  using (public.is_chat_member((select realtime.topic())) and realtime.messages.extension = 'broadcast');
create policy "friends talk to each other" on realtime.messages for insert to authenticated
  with check (public.is_chat_member((select realtime.topic())) and realtime.messages.extension = 'broadcast');
