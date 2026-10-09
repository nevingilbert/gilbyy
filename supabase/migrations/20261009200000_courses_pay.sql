-- Courses pay; driving around is the slow way. See docs/decisions/0015-courses-pay.md.
--
-- Everything in the shop costs five times what it did, every course pays eight to ten
-- times more, and there are seven new courses: five to drive alone and two for friends.
-- Leaving a truck to circle on its own still banks miles, but a few courses now earn
-- more than an hour of that.
--
-- Because a course is worth more, its claim is checked harder: a run is paid only if
-- the miles banked while it was on add up to most of the course, and only one run at a
-- time. The server still can't see trucks, but a client can no longer claim a course it
-- never drove.
--
-- The island's Sandfly is priced like every other rig. The fares (public.worlds) are
-- the owner's own number and stay as they are.
--
-- Prices must match apps/web/src/app/shop.ts and vehicles.ts, and courses
-- apps/web/src/app/missions.ts; shop.test.ts checks both.

-- The miles a run must show for itself: three fifths of the line through its flags.
alter table public.missions add column min_miles numeric(6, 2) not null default 0;

insert into public.shop_items (key, price) values
  ('vehicle:overlander', 40), ('vehicle:prairie', 90), ('vehicle:highland', 140), ('vehicle:summit', 200),
  ('vehicle:duneclaw', 275), ('vehicle:sandfly', 150),
  ('paint:forestGreen', 5), ('paint:desertCream', 2.5), ('paint:rustRed', 2.5), ('paint:oliveDrab', 5),
  ('paint:skyBlue', 5), ('paint:mustard', 7.5), ('paint:lagoonTeal', 7.5), ('paint:chocolate', 10),
  ('paint:pearlWhite', 10), ('paint:sunsetOrange', 15), ('paint:midnight', 15),
  ('tyres:allTerrain', 10), ('tyres:mud', 20), ('tyres:studded', 25), ('tyres:big33', 45), ('tyres:crawler37', 75),
  ('lights:halogen', 5), ('lights:driving', 15), ('lights:bar', 30), ('lights:fullRig', 50),
  ('snorkel:snorkel', 45), ('winter:chains', 30)
on conflict (key) do update set price = excluded.price;

insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew, min_miles) values
  ('forest-slalom', 12, 4, 600, 18, 1, 0.15),
  ('ridge-run', 15, 5, 600, 15, 1, 0.13),
  ('lakeshore-loop', 20, 7, 600, 83, 1, 0.71),
  ('ice-drift', 25, 8, 600, 35, 1, 0.3),
  ('convoy', 30, 10, 600, 66, 2, 0.57),
  ('race', 25, 8, 600, 102, 2, 0.87),
  ('grand-tour', 40, 12, 600, 99, 2, 0.85),
  ('hill-race', 30, 10, 600, 87, 2, 0.74),
  ('deep-woods', 15, 5, 600, 22, 1, 0.18),
  ('southern-shore', 20, 7, 600, 78, 1, 0.66),
  ('high-ridge', 18, 6, 600, 15, 1, 0.13),
  ('snowfield', 25, 8, 600, 24, 1, 0.21),
  ('far-bank', 30, 10, 600, 11, 1, 0.09)
on conflict (id) do update set reward = excluded.reward, repeat_reward = excluded.repeat_reward,
  cooldown_seconds = excluded.cooldown_seconds, min_seconds = excluded.min_seconds, crew = excluded.crew,
  min_miles = excluded.min_miles;

-- Pays a finished run of `m`, if it holds up. The caller has already locked the player's
-- row (me()), so two claims sent at once take turns.
create function private.pay_run(p public.profiles, m public.missions, p_seconds numeric) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  last_run timestamptz;
  last_any timestamptz;
  banked numeric;
  payout numeric;
begin
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
  payout := case when last_run is null then m.reward else m.repeat_reward end;
  insert into public.mission_runs (user_id, mission, seconds, reward) values (p.id, m.id, p_seconds, payout);
  update public.profiles set lifetime = lifetime + payout, balance = balance + payout where id = p.id returning * into p;
  return p;
end;
$$;

revoke all on function private.pay_run(public.profiles, public.missions, numeric) from public, anon, authenticated;

-- Courses driven alone.
create or replace function public.complete_mission(p_mission text, p_seconds numeric) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  m public.missions;
begin
  select * into p from public.me();
  select * into m from public.missions where id = p_mission;
  if m.id is null then raise exception 'no such mission: %', p_mission; end if;
  if m.crew > 1 then raise exception 'drive this one with friends'; end if;
  return private.pay_run(p, m, p_seconds);
end;
$$;

-- Convoys and races. Each driver claims their own, naming the others who set off; at
-- least one of them has to be a friend.
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
  return private.pay_run(p, m, p_seconds);
end;
$$;
