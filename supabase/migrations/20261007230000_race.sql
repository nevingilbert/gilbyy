-- A race: two to four friends against each other on a loop by the camp. It's gathered and
-- set off like a convoy, and paid the same way, by complete_convoy, which pays any course
-- that takes a crew as long as a friend is in it. Every finisher is paid the same; the
-- winner gets nothing extra. See docs/decisions/0011-races.md.

-- Must match apps/web/src/app/missions.ts (shop.test.ts checks).
insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew) values
  ('race', 3, 1, 600, 102, 2);
