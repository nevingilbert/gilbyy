-- Where miles come from, and one call at a time.
--
-- Mission, convoy and race payouts were already one row each in mission_runs, but miles
-- banked from driving only ever added to profiles.lifetime, so there was no way to see
-- how someone earned theirs. Now every add_miles call leaves a row in private.drive_log:
-- what the client claimed, what the server paid, how long since the last bank, and the
-- rig. private.miles_hourly sums both kinds per player per hour.
--
-- Both live in a schema of their own that the API doesn't expose and nobody but the
-- owner can read: the game never reads them, and they're no one else's business. Look at
-- them from the SQL editor or the Supabase MCP.
--
-- This also closes a hole. Every function below read the caller's profile with a plain
-- select before changing it, so calls sent at once each saw the same row: twenty add_miles
-- calls in flight together paid 20 miles where one should, and the same went for mission
-- cooldowns. me() now locks the row, so a player's calls take turns, each seeing the one
-- before it.

create schema private;
revoke all on schema private from public, anon, authenticated;

create table private.drive_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  at timestamptz not null default now(),
  asked numeric not null,
  paid numeric(10, 3) not null,
  seconds numeric(12, 3) not null,
  vehicle text
);
create index drive_log_user_at on private.drive_log (user_id, at desc);
alter table private.drive_log enable row level security;

-- One row per player per hour: miles from driving and from courses, the average speed
-- while banking, and how much the server refused. A truck held at its top speed for an
-- hour (nobody at the wheel) shows as a high avg_mph with a spread near zero.
create view private.miles_hourly as
with drive as (
  select user_id, date_trunc('hour', at) as hour, count(*) as banks, sum(paid) as drive_miles,
    sum(asked) - sum(paid) as refused, count(*) filter (where asked > paid + 0.001) as clipped,
    round(avg(paid / nullif(seconds, 0)) * 3600, 1) as avg_mph,
    round(stddev_samp(paid / nullif(seconds, 0)) * 3600, 2) as mph_spread,
    string_agg(distinct vehicle, ', ') as rigs
  from private.drive_log group by 1, 2
), courses as (
  select user_id, date_trunc('hour', finished_at) as hour, count(*) as runs, sum(reward) as course_miles
  from public.mission_runs group by 1, 2
)
select coalesce(p.name, 'Driver') as name, coalesce(d.hour, c.hour) as hour,
  coalesce(d.drive_miles, 0) + coalesce(c.course_miles, 0) as miles,
  coalesce(d.drive_miles, 0) as drive_miles, coalesce(c.course_miles, 0) as course_miles,
  coalesce(d.banks, 0) as banks, coalesce(c.runs, 0) as runs,
  d.avg_mph, d.mph_spread, coalesce(d.refused, 0) as refused, coalesce(d.clipped, 0) as clipped,
  d.rigs, coalesce(d.user_id, c.user_id) as user_id
from drive d
full join courses c on c.user_id = d.user_id and c.hour = d.hour
join public.profiles p on p.id = coalesce(d.user_id, c.user_id);

-- The caller's profile, created if it is somehow missing, and locked until the call ends.
create or replace function public.me() returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  insert into public.profiles (id) values ((select auth.uid())) on conflict do nothing;
  select * into p from public.profiles where id = (select auth.uid()) for update;
  return p;
end;
$$;

-- Banks miles driven since the last call, no faster than any rig can go (with slack), and
-- notes the call in private.drive_log.
create or replace function public.add_miles(p_miles numeric) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  since numeric;
  allowed numeric;
begin
  select * into p from public.me();
  since := extract(epoch from now() - p.last_drive_at);
  -- least() skips a null, which would have paid the whole allowance for nothing claimed.
  allowed := greatest(0, least(coalesce(p_miles, 0), since * 0.02, 5));
  update public.profiles
    set lifetime = lifetime + allowed, balance = balance + allowed,
      last_drive_at = greatest(last_drive_at, now())
    where id = p.id returning * into p;
  insert into private.drive_log (user_id, asked, paid, seconds, vehicle)
    values (p.id, coalesce(p_miles, 0), allowed, greatest(since, 0), p.vehicle);
  return p;
end;
$$;
