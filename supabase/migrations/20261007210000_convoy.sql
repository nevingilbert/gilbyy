-- Convoys: a course driven by two to four friends together, which pays each of them when
-- everyone is through the finish. See docs/decisions/0009-convoys.md.

-- How many drivers a mission takes. The four courses so far are driven alone.
alter table public.missions add column crew int not null default 1 check (crew between 1 and 4);

-- Must match apps/web/src/app/missions.ts (shop.test.ts checks).
insert into public.missions (id, reward, repeat_reward, cooldown_seconds, min_seconds, crew) values
  ('convoy', 4, 1.2, 600, 66, 2);

-- Courses driven alone, as before. A convoy is claimed with complete_convoy, which needs
-- to know who else set off.
create or replace function public.complete_mission(p_mission text, p_seconds numeric) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  m public.missions;
  last_run timestamptz;
  paid numeric;
begin
  select * into p from public.me();
  select * into m from public.missions where id = p_mission;
  if m.id is null then raise exception 'no such mission: %', p_mission; end if;
  if m.crew > 1 then raise exception 'drive this one with friends'; end if;
  if p_seconds < m.min_seconds then raise exception 'too fast to be true'; end if;
  select max(finished_at) into last_run from public.mission_runs where user_id = p.id and mission = m.id;
  if last_run is not null and last_run > now() - make_interval(secs => m.cooldown_seconds) then
    raise exception 'come back later';
  end if;
  paid := case when last_run is null then m.reward else m.repeat_reward end;
  insert into public.mission_runs (user_id, mission, seconds, reward) values (p.id, m.id, p_seconds, paid);
  update public.profiles set lifetime = lifetime + paid, balance = balance + paid where id = p.id returning * into p;
  return p;
end;
$$;

-- Pays a finished convoy. Each driver claims their own, naming the others who set off; at
-- least one of them has to be a friend. The server can't see where trucks are, so like
-- complete_mission it takes the client's word for the run and checks only what it can:
-- the friendship, the crew's size, the time and the cooldown.
create function public.complete_convoy(p_mission text, p_seconds numeric, p_crew uuid[]) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  m public.missions;
  others uuid[];
  last_run timestamptz;
  paid numeric;
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
  if p_seconds < m.min_seconds then raise exception 'too fast to be true'; end if;
  select max(finished_at) into last_run from public.mission_runs where user_id = p.id and mission = m.id;
  if last_run is not null and last_run > now() - make_interval(secs => m.cooldown_seconds) then
    raise exception 'come back later';
  end if;
  paid := case when last_run is null then m.reward else m.repeat_reward end;
  insert into public.mission_runs (user_id, mission, seconds, reward) values (p.id, m.id, p_seconds, paid);
  update public.profiles set lifetime = lifetime + paid, balance = balance + paid where id = p.id returning * into p;
  return p;
end;
$$;

revoke all on function public.complete_convoy(text, numeric, uuid[]) from public, anon;
grant execute on function public.complete_convoy(text, numeric, uuid[]) to authenticated;
