-- A tide on the island, and a course along the sandbar it uncovers. See
-- docs/decisions/0020-tides-and-the-sandbar.md.
--
-- The tide itself is the browser's: where the sea stands follows from the clock everyone
-- shares (apps/web/src/app/tide.ts), and it is drawn and driven on there. All the server
-- learns is that the island has one more course to pay for. It is checked like any other:
-- no quicker than is believable, with the miles banked, claimed from the island, and not
-- again within the cooldown. Whether the tide was out is not checked; a run claimed at
-- high water still had to be driven, and is paid no more than one at low.
--
-- Builds on 20261010120000_more_courses.sql. Rewards and limits must match
-- apps/web/src/app/island.ts; shop.test.ts checks.

insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew, min_miles, world) values
  ('sandbar', 25, 8, 600, 24, 1, 0.24, 'island')
on conflict (id) do update set reward = excluded.reward, repeat_reward = excluded.repeat_reward,
  cooldown_seconds = excluded.cooldown_seconds, min_seconds = excluded.min_seconds, crew = excluded.crew,
  min_miles = excluded.min_miles, world = excluded.world;
