-- Four courses start somewhere better. The dev panel's sweep (dev.ts) found each, and each
-- course is a little shorter for it, so its limits follow (missions.ts `courseLimits`).
-- The old ones were a touch stricter than the new lines need, never less, so an honest
-- run passes either way, before this is applied and after.
--
-- San Francisco's Embarcadero: its start arch moves 18 m along the waterfront. Behind
-- where it stood the street bends, and a race of five or more lined its back rows up
-- inside the building on the corner.
--
-- San Francisco's Great Highway: down off the hill by the Cliff House, where the road
-- fell away across the arch at thirty degrees, to the flat beside Ocean Beach.
--
-- San Francisco's Presidio: from the campground's way out on Rob Hill, not tent 1, and
-- round the pitches: its line ran over the old lanes the tents now stand on.
--
-- Japan's Round the Lake: from the shore below the camp, not its third row of tents, and
-- round the camp, not along that row.
--
-- Must match apps/web/src/app/city.ts, japan.ts and missions.ts: shop.test.ts checks.

insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew, min_miles, world) values
  ('great-highway', 25, 8, 600, 34, 2, 0.44, 'city'),
  ('embarcadero', 30, 10, 600, 48, 2, 0.61, 'city'),
  ('presidio', 30, 10, 600, 33, 2, 0.42, 'city'),
  ('lake-round', 30, 10, 600, 70, 1, 0.89, 'japan')
on conflict (id) do update set min_seconds = excluded.min_seconds, min_miles = excluded.min_miles;
