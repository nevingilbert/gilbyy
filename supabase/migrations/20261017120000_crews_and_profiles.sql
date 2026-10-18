-- Who counts as your crew, and who can see your profile.
--
-- A convoy pays when a friend in it drove. Since 20261010080000_honest_crews.sql a crew
-- claim has had to name a friend, and enough of the drivers it names have had to bank the
-- course's miles. But they didn't have to be the same drivers. A claim could name a friend
-- who never drove beside a stranger who was out driving at the time, whose id is easy to
-- come by (the world's presence lists everyone in it), and be paid for a convoy the
-- claimer never drove with anyone. Now the drivers who count as having driven must include
-- a friend of the claimer. A real convoy, with friends who drove, pays as before. ADR 0018
-- set the ceiling at friends "who were actually out driving"; this is what holds it there.
--
-- Profiles are yours and your friends': the owner's call on 2026-10-17. Until now every
-- signed-in player could read every profile, and so everyone's miles, balance, world and
-- last bank. That is a ranking of every player, which the leaderboard is kept from being
-- (ADR 0007), and a live view of who is out driving and where. Now a player reads their
-- own profile and their friends', and nobody else's.
--
-- Nothing the game shows needs more. It reads the table itself in one place, its friends'
-- names (friends() in apps/web/src/app/store.ts), which this still allows. Everything else
-- comes through the functions in these migrations, which run as the owner and aren't held
-- to the policy: your own profile (me(), set_name() and the rest), the leaderboard, a
-- friend request to someone who isn't a friend yet. The names over the trucks on the road
-- come from presence, not from here. So a page loaded before this works the same after it.

-- Pays a finished run of `m`, if it holds up. As in 20261010080000_honest_crews.sql, but of
-- the crew a claim names, the ones who drove must include a friend. The caller has already
-- locked the player's row (me()), so two claims sent at once take turns.
create or replace function private.pay_run(p public.profiles, m public.missions, p_seconds numeric, p_crew uuid[] default null) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  last_run timestamptz;
  last_any timestamptz;
  banked numeric;
  payout numeric;
  drove uuid[];
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
  -- banked the course's miles too, over the same look-back, and a friend must be one of
  -- them. One who set off and went quiet early doesn't block the rest. A crew of names that
  -- never drove pays nothing, and nor does a friend who never drove named beside a stranger
  -- who did. (A scripter naming a friend who is out driving still gains nothing over
  -- driving the course: their own miles above are spent on the claim.)
  if p_crew is not null then
    drove := array(
      select c from unnest(p_crew) as c
      where (select coalesce(sum(d.paid), 0) from private.drive_log d
             where d.user_id = c and d.at > now() - make_interval(secs => p_seconds * 2 + 600)) >= m.min_miles
    );
    if cardinality(drove) < m.crew - 1 then raise exception 'a convoy pays the drivers who drove'; end if;
    if not exists (
      select 1 from unnest(drove) as c
      join public.friendships f on f.a = least(p.id, c) and f.b = greatest(p.id, c)
    ) then
      raise exception 'a convoy needs a friend in it who drove';
    end if;
  end if;
  payout := case when last_run is null then m.reward else m.repeat_reward end;
  insert into public.mission_runs (user_id, mission, seconds, reward, crew) values (p.id, m.id, p_seconds, payout, p_crew);
  update public.profiles set lifetime = lifetime + payout, balance = balance + payout where id = p.id returning * into p;
  return p;
end;
$$;

revoke all on function private.pay_run(public.profiles, public.missions, numeric, uuid[]) from public, anon, authenticated;

-- A player reads their own profile, and their friends'. The friendships looked at are the
-- player's own, which "own friendships" already lets them see.
drop policy "players can see players" on public.profiles;
create policy "players see themselves and their friends" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where f.a = least((select auth.uid()), profiles.id) and f.b = greatest((select auth.uid()), profiles.id)
    )
  );
