-- Achievements: the leaderboard also returns each player's goals, so friends can see
-- which achievements they have. An achievement is a first-time goal (driving into a
-- garage, reaching the café), already saved by mark_goal; which goals count is decided
-- in apps/web/src/app/achievements.ts. See docs/decisions/0009-achievements.md.
drop function public.leaderboard();
create function public.leaderboard()
  returns table (id uuid, name text, lifetime numeric, is_me boolean, garages int, cafes int, goals text[])
language sql security definer set search_path = '' stable as $$
  select p.id, coalesce(p.name, 'Driver'), p.lifetime, p.id = (select auth.uid()),
    (select count(*)::int from public.places pl where pl.kind = 'garage' and pl.key = any (p.discovered)),
    (select count(*)::int from public.places pl where pl.kind = 'cafe' and pl.key = any (p.discovered)),
    p.goals
  from public.profiles p
  where p.id = (select auth.uid())
     or exists (
       select 1 from public.friendships f
       where (f.a = (select auth.uid()) and f.b = p.id) or (f.b = (select auth.uid()) and f.a = p.id)
     )
  order by p.lifetime desc;
$$;

revoke all on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;
