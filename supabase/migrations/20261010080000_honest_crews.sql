-- A convoy pays the drivers who drove, a course pays only in its world, and the bank
-- takes a breath between deposits. See docs/decisions/0018-honest-crews.md.
--
-- On 2026-10-10 two signed-in players ran scripts straight at the API. One called
-- add_miles(10000) up to forty times a second: the clamp paid pennies, but every call
-- wrote a drive_log row and burned free-tier requests. Both claimed courses with round
-- made-up times, and one claimed a convoy naming a friend who was never in one. The
-- three holes close here. Nobody's miles are touched: what was banked stays banked
-- (the same call as 0017 — a clawback would punish the ledger, not the player).

-- Which world each course is in. A claim from anywhere else is refused, like
-- shop_items.world for what's sold. Must match apps/web/src/app/missions.ts and
-- island.ts (shop.test.ts checks).
alter table public.missions add column world text not null default 'valley' references public.worlds;

insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew, min_miles, world) values
  ('forest-slalom', 12, 4, 600, 18, 1, 0.15, 'valley'),
  ('ridge-run', 15, 5, 600, 15, 1, 0.13, 'valley'),
  ('lakeshore-loop', 20, 7, 600, 83, 1, 0.71, 'valley'),
  ('ice-drift', 25, 8, 600, 35, 1, 0.3, 'valley'),
  ('convoy', 30, 10, 600, 66, 2, 0.57, 'valley'),
  ('race', 25, 8, 600, 102, 2, 0.87, 'valley'),
  ('grand-tour', 40, 12, 600, 99, 2, 0.85, 'valley'),
  ('hill-race', 30, 10, 600, 87, 2, 0.74, 'valley'),
  ('deep-woods', 15, 5, 600, 22, 1, 0.18, 'valley'),
  ('southern-shore', 20, 7, 600, 78, 1, 0.66, 'valley'),
  ('high-ridge', 18, 6, 600, 15, 1, 0.13, 'valley'),
  ('snowfield', 25, 8, 600, 24, 1, 0.21, 'valley'),
  ('far-bank', 30, 10, 600, 11, 1, 0.09, 'valley'),
  ('beach-run', 15, 5, 600, 46, 1, 0.4, 'island'),
  ('dune-dash', 20, 6, 600, 56, 1, 0.48, 'island'),
  ('jungle-loop', 35, 12, 600, 145, 1, 1.25, 'island')
on conflict (id) do update set reward = excluded.reward, repeat_reward = excluded.repeat_reward,
  cooldown_seconds = excluded.cooldown_seconds, min_seconds = excluded.min_seconds, crew = excluded.crew,
  min_miles = excluded.min_miles, world = excluded.world;

-- Who a crew claim said it set off with, for reading the ledger later. Null for a
-- course driven alone.
alter table public.mission_runs add column crew uuid[];

-- Pays a finished run of `m`, if it holds up. The caller has already locked the player's
-- row (me()), so two claims sent at once take turns. A crew claim passes who it set off
-- with: they are checked and kept with the run.
drop function private.pay_run(public.profiles, public.missions, numeric);
create function private.pay_run(p public.profiles, m public.missions, p_seconds numeric, p_crew uuid[] default null) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  last_run timestamptz;
  last_any timestamptz;
  banked numeric;
  payout numeric;
  drove int;
begin
  if m.world <> p.world then raise exception 'this course is in another world'; end if;
  if p_seconds is null or p_seconds = 'NaN' or p_seconds < m.min_seconds or p_seconds > 86400 then
    raise exception 'too fast to be true';
  end if;
  select max(finished_at) into last_run from public.mission_runs where user_id = p.id and mission = m.id;
  if last_run is not null and last_run > now() - make_interval(secs => m.cooldown_seconds) then
    raise exception 'come back later';
  end if;
  -- One course at a time: no other run can have finished while this one was on.
  select max(finished_at) into last_any from public.mission_runs where user_id = p.id;
  if last_any is not null and last_any > now() - make_interval(secs => p_seconds) then
    raise exception 'one course at a time';
  end if;
  -- The miles banked while the run was on. The client banks every 15 s and once more just
  -- before it claims. It looks back twice the run's time: on a struggling device the game
  -- clock runs slower than the wall's. A convoy is claimed when the last friend is home,
  -- which can be a while after this driver finished, so a crew run looks further still.
  -- Miles banked before the last paid run never count twice.
  select coalesce(sum(paid), 0) into banked from private.drive_log
    where user_id = p.id
      and at > greatest(last_any, now() - make_interval(secs => p_seconds * 2 + case when m.crew > 1 then 600 else 30 end));
  if banked < m.min_miles then raise exception 'drive the whole course to be paid'; end if;
  -- A crew claim is only as good as its crew: enough of the drivers it names must have
  -- banked the course's miles too, over the same look-back. One who set off and went
  -- quiet early doesn't block the rest, but a crew of names that never drove pays
  -- nothing. (A scripter naming a friend who happens to be out driving still gains
  -- nothing over driving the course: their own miles above are spent on the claim.)
  if p_crew is not null then
    select count(*) into drove from unnest(p_crew) as c
      where (select coalesce(sum(d.paid), 0) from private.drive_log d
             where d.user_id = c and d.at > now() - make_interval(secs => p_seconds * 2 + 600)) >= m.min_miles;
    if drove < m.crew - 1 then raise exception 'a convoy pays the drivers who drove'; end if;
  end if;
  payout := case when last_run is null then m.reward else m.repeat_reward end;
  insert into public.mission_runs (user_id, mission, seconds, reward, crew) values (p.id, m.id, p_seconds, payout, p_crew);
  update public.profiles set lifetime = lifetime + payout, balance = balance + payout where id = p.id returning * into p;
  return p;
end;
$$;

revoke all on function private.pay_run(public.profiles, public.missions, numeric, uuid[]) from public, anon, authenticated;

-- Convoys and races, as before, but the crew goes to pay_run to be checked and kept.
create or replace function public.complete_convoy(p_mission text, p_seconds numeric, p_crew uuid[]) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  m public.missions;
  others uuid[];
begin
  select * into p from public.me();
  select * into m from public.missions where id = p_mission;
  if m.id is null then raise exception 'no such mission: %', p_mission; end if;
  if m.crew < 2 then raise exception 'not a convoy: %', p_mission; end if;
  others := array(select distinct c from unnest(coalesce(p_crew, '{}')) as c where c is not null and c <> p.id);
  if cardinality(others) < m.crew - 1 or cardinality(others) > 3 then
    raise exception 'a convoy is two to four drivers';
  end if;
  if not exists (
    select 1 from unnest(others) as c
    join public.friendships f on f.a = least(p.id, c) and f.b = greatest(p.id, c)
  ) then
    raise exception 'a convoy needs a friend in it';
  end if;
  return private.pay_run(p, m, p_seconds, others);
end;
$$;

-- Banks miles driven since the last call, as before, but never twice in a breath. The
-- client banks every 15 s and once more as it claims a course; refused, it keeps the
-- miles and sends them with the next bank (store.ts puts them back on any error). Forty
-- calls a second now buy a scripter nothing at all: no row, no payout, and the clamp's
-- allowance waits for a call that comes politely.
create or replace function public.add_miles(p_miles numeric) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  since numeric;
  allowed numeric;
begin
  select * into p from public.me();
  since := extract(epoch from now() - p.last_drive_at);
  if since < 2 then raise exception 'one breath between banks'; end if;
  -- least() skips a null, which would have paid the whole allowance for nothing claimed.
  allowed := greatest(0, least(coalesce(p_miles, 0), since * 0.02, 5));
  update public.profiles
    set lifetime = lifetime + allowed, balance = balance + allowed,
      last_drive_at = greatest(last_drive_at, now())
    where id = p.id returning * into p;
  insert into private.drive_log (user_id, asked, paid, seconds, vehicle)
    values (p.id, coalesce(p_miles, 0), allowed, greatest(since, 0), p.vehicle);
  return p;
end;
$$;
