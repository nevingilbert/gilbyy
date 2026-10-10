-- More courses in both worlds, as many for friends as to drive alone, and crews of up to
-- ten. See docs/decisions/0019-more-courses-and-crews-of-ten.md.
--
-- Twelve new courses: in the valley a jump (Big Air) to drive alone and six for friends;
-- on the island one to drive alone and four for friends, its first. That makes ten of
-- each in the valley and four of each on the island.
--
-- Every course's shortest believable time comes down a little as well. The limit was
-- 23 m/s round a course, and the island's own Sandfly does 24.5: flat out along the
-- beach it was being refused as too fast to be true. It is 27 m/s now.
--
-- Builds on 20261010080000_honest_crews.sql, which gave each course its world and has
-- pay_run() refuse one claimed from another, and check that a crew drove.
--
-- Rewards and limits must match apps/web/src/app/missions.ts and island.ts; shop.test.ts
-- checks, the world and the size of a crew included.

insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew, min_miles, world) values
  ('forest-slalom', 12, 4, 600, 15, 1, 0.15, 'valley'),
  ('ridge-run', 15, 5, 600, 13, 1, 0.13, 'valley'),
  ('lakeshore-loop', 20, 7, 600, 71, 1, 0.71, 'valley'),
  ('ice-drift', 25, 8, 600, 30, 1, 0.3, 'valley'),
  ('convoy', 30, 10, 600, 56, 2, 0.57, 'valley'),
  ('race', 25, 8, 600, 87, 2, 0.87, 'valley'),
  ('grand-tour', 40, 12, 600, 85, 2, 0.85, 'valley'),
  ('hill-race', 30, 10, 600, 74, 2, 0.74, 'valley'),
  ('deep-woods', 15, 5, 600, 18, 1, 0.18, 'valley'),
  ('southern-shore', 20, 7, 600, 66, 1, 0.66, 'valley'),
  ('high-ridge', 18, 6, 600, 13, 1, 0.13, 'valley'),
  ('snowfield', 25, 8, 600, 21, 1, 0.21, 'valley'),
  ('far-bank', 30, 10, 600, 9, 1, 0.09, 'valley'),
  ('big-air', 15, 5, 600, 9, 1, 0.09, 'valley'),
  ('barn-round', 30, 10, 600, 55, 2, 0.55, 'valley'),
  ('lakehead-race', 30, 10, 600, 60, 2, 0.61, 'valley'),
  ('snowline', 30, 10, 600, 55, 2, 0.56, 'valley'),
  ('two-lakes-race', 30, 10, 600, 61, 2, 0.62, 'valley'),
  ('trackside', 25, 8, 600, 17, 2, 0.17, 'valley'),
  ('flat-out', 25, 8, 600, 18, 2, 0.18, 'valley'),
  ('beach-run', 15, 5, 600, 39, 1, 0.4, 'island'),
  ('dune-dash', 20, 6, 600, 48, 1, 0.48, 'island'),
  ('jungle-loop', 35, 12, 600, 124, 1, 1.25, 'island'),
  ('hilltop', 25, 8, 600, 38, 1, 0.38, 'island'),
  ('coast-convoy', 40, 12, 600, 83, 2, 0.84, 'island'),
  ('sand-race', 25, 8, 600, 58, 2, 0.58, 'island'),
  ('tideline', 30, 10, 600, 34, 2, 0.34, 'island'),
  ('dune-derby', 30, 10, 600, 56, 2, 0.56, 'island')
on conflict (id) do update set reward = excluded.reward, repeat_reward = excluded.repeat_reward,
  cooldown_seconds = excluded.cooldown_seconds, min_seconds = excluded.min_seconds, crew = excluded.crew,
  min_miles = excluded.min_miles, world = excluded.world;

-- Convoys and races, for two to ten now. As before, each driver claims their own, naming
-- the others who set off; at least one of them has to be a friend, and the crew goes to
-- pay_run to be checked and kept.
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
  if cardinality(others) < m.crew - 1 or cardinality(others) > 9 then
    raise exception 'a convoy is two to ten drivers';
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
