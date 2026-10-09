-- The island's second pass: three courses, two more garages and a café there, and things to find
-- counted world by world, which now includes each world's airstrip and the valley's four
-- easter eggs. See docs/decisions/0016-the-islands-second-pass.md.

-- The island's courses, all driven alone. complete_mission pays them like any other.
-- Must match apps/web/src/app/island.ts (shop.test.ts checks).
insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew) values
  ('beach-run', 2, 0.6, 600, 46, 1),
  ('dune-dash', 2.5, 0.8, 600, 56, 1),
  ('jungle-loop', 3, 1, 600, 145, 1);

-- Every place is in one world, and there are two more kinds: an airstrip, found by
-- coming within sight of it like a garage, and an easter egg, found by looking inside.
-- Must match apps/web/src/app/places.ts (places.test.ts checks).
alter table public.places add column world text not null default 'valley' references public.worlds;
alter table public.places drop constraint places_kind_check;
alter table public.places add constraint places_kind_check check (kind in ('garage', 'cafe', 'airport', 'egg'));

insert into public.places (key, kind, world) values
  ('garage:shack', 'garage', 'island'), ('garage:outpost', 'garage', 'island'), ('garage:lodge', 'garage', 'island'),
  ('cafe:beach', 'cafe', 'island'),
  ('airport:valley', 'airport', 'valley'), ('airport:island', 'airport', 'island'),
  ('egg:bank', 'egg', 'valley'), ('egg:church', 'egg', 'valley'), ('egg:school', 'egg', 'valley'), ('egg:casino', 'egg', 'valley');

-- The leaderboard counts what each of you has found in one world: the one asked for, or
-- the one the caller is in. Still you and your friends only, still in order of miles, and
-- finding still pays nothing. A page loaded before this calls it with no world and reads
-- the columns it knows.
drop function public.leaderboard();
create function public.leaderboard(p_world text default null)
  returns table (id uuid, name text, lifetime numeric, is_me boolean, garages int, cafes int, airports int, eggs int, goals text[])
language sql security definer set search_path = '' stable as $$
  with w as (
    select coalesce(p_world, (select me.world from public.profiles me where me.id = (select auth.uid()))) as world
  )
  select p.id, coalesce(p.name, 'Driver'), p.lifetime, p.id = (select auth.uid()),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'garage' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'cafe' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'airport' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl, w where pl.world = w.world and pl.kind = 'egg' and pl.key = any (p.discovered)),
    p.goals
  from public.profiles p
  where p.id = (select auth.uid())
     or exists (
       select 1 from public.friendships f
       where (f.a = (select auth.uid()) and f.b = p.id) or (f.b = (select auth.uid()) and f.a = p.id)
     )
  order by p.lifetime desc;
$$;

revoke all on function public.leaderboard(text) from public, anon;
grant execute on function public.leaderboard(text) to authenticated;
