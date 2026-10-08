-- An allowance on banked miles, so a script or an agent that drives (or only claims to
-- drive) around the clock earns no more than a keen player. The server can't tell a
-- person from a program: anything holding a player's sign-in can call add_miles and
-- complete_mission, and the repo is public, so it can claim exactly what the game
-- would. Rather than try to prove someone is at the wheel, this bounds what any
-- account can bank. See docs/decisions/0010-a-daily-allowance-of-miles.md.
--
-- Each account may bank up to 100 miles at a stretch, refilling at 50 a day. Driving
-- and repeat mission rewards spend it. A mission's first finish doesn't, because it
-- pays once per account, ever. With the allowance spent the truck still drives; its
-- miles bank again as the allowance refills.

alter table public.profiles
  add column allowance numeric(8, 3) not null default 100 check (allowance >= 0),
  add column allowance_at timestamptz not null default now();

-- How many miles an account can still bank right now. Must match ALLOWANCE in
-- apps/web/src/app/store.ts (shop.test.ts checks).
create function public.allowance_now(p public.profiles) returns numeric
language sql stable set search_path = '' as $$
  select least(100, p.allowance + extract(epoch from now() - p.allowance_at) * 50 / 86400);
$$;

-- Only the functions below use it. Taking a profile row, it would otherwise also show
-- up in the API as a column of profiles.
revoke all on function public.allowance_now(public.profiles) from public, anon, authenticated;

-- Banks miles driven since the last call, no faster than any rig can go (with slack),
-- and no more than the allowance has left.
create or replace function public.add_miles(p_miles numeric) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  spare numeric;
  allowed numeric;
begin
  select * into p from public.me();
  spare := public.allowance_now(p);
  allowed := greatest(0, least(p_miles, extract(epoch from now() - p.last_drive_at) * 0.02, 5, spare));
  update public.profiles
    set lifetime = lifetime + allowed, balance = balance + allowed, last_drive_at = now(),
      allowance = spare - allowed, allowance_at = now()
    where id = p.id returning * into p;
  return p;
end;
$$;

-- Pays out a finished mission: the full reward the first time, less after, and not too
-- often. Repeat rewards come out of the allowance, so they can pay less than listed, or
-- nothing; the run is still recorded.
create or replace function public.complete_mission(p_mission text, p_seconds numeric) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  m public.missions;
  last_run timestamptz;
  spare numeric;
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
  spare := public.allowance_now(p);
  paid := case when last_run is null then m.reward else least(m.repeat_reward, spare) end;
  insert into public.mission_runs (user_id, mission, seconds, reward) values (p.id, m.id, p_seconds, paid);
  update public.profiles
    set lifetime = lifetime + paid, balance = balance + paid,
      allowance = spare - case when last_run is null then 0 else paid end, allowance_at = now()
    where id = p.id returning * into p;
  return p;
end;
$$;
