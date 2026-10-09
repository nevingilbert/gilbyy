-- The flight to the island, and back, costs 150 miles each way instead of 300: the
-- owner's call on 2026-10-09, so that someone actually gets there. See
-- docs/decisions/0014-airports-and-the-island.md.
--
-- Must match apps/web/src/app/worlds.ts (flight.test.ts checks).
insert into public.worlds (id, fare) values ('valley', 150), ('island', 150)
on conflict (id) do update set fare = excluded.fare;
