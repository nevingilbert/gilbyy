-- Exercises the game migration as three players, on a plain Postgres with
-- local-stubs.sql standing in for Supabase. Any failed check raises and stops the run.
-- See supabase/tests/README.md for how to run it.
\set ON_ERROR_STOP on

-- Supabase grants table access to these roles by default; RLS is what stops them.
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end;
$$;

create function pg_temp.fails(sql text, what text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAILED (should have been refused): %', what;
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: % (%)', what, sqlerrm;
end;
$$;

-- Refused, and for the reason given.
create function pg_temp.refused(sql text, why text, what text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAILED (should have been refused): %', what;
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
  if sqlerrm not like '%' || why || '%' then raise exception 'FAILED (refused, but for "%"): %', sqlerrm, what; end if;
  raise notice 'ok: % (%)', what, sqlerrm;
end;
$$;

-- How much running `sql` added to the current player's balance.
create function pg_temp.pays(sql text) returns numeric language plpgsql as $$
declare
  before numeric;
begin
  select balance into before from public.profiles where id = auth.uid();
  execute sql;
  return (select balance from public.profiles where id = auth.uid()) - before;
end;
$$;

-- Moves a player fifteen minutes on: their runs are over and out of their cooldowns,
-- the miles they banked are too old to count for the next run, and there's time to
-- bank more. Run as the database owner, not as the player.
create function pg_temp.rewind(who text) returns void language plpgsql as $$
declare
  me uuid := ('00000000-0000-0000-0000-00000000000' || who)::uuid;
begin
  update public.mission_runs set finished_at = finished_at - interval '15 minutes' where user_id = me;
  update private.drive_log set at = at - interval '15 minutes' where user_id = me;
  update public.profiles set last_drive_at = last_drive_at - interval '15 minutes' where id = me;
end;
$$;

-- Become a player: the JWT subject Supabase would set, and the authenticated role.
create function pg_temp.as_player(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000' || who, false);
end;
$$;

-- Counting only these three, so the file also runs against a project that has real players.
select pg_temp.check((select count(*) from public.profiles where id::text like '00000000-0000-0000-0000-00000000000_') = 3, 'every new account gets a profile');

-- Miles: banked no faster than a truck could have driven them.
update public.profiles set last_drive_at = now() - interval '100 seconds' where id::text like '%00000000000a';
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select lifetime from public.add_miles(1)) = 1, 'miles bank when the time allows');
select pg_temp.refused($$ select public.add_miles(10) $$, 'one breath', 'banking twice in a breath is refused');
reset role;
update public.profiles set last_drive_at = now() - interval '100 seconds' where id::text like '%00000000000a';
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select lifetime from public.add_miles(10)) = 3, 'miles do not bank faster than driving');
update public.profiles set balance = 9999;
reset role;
select pg_temp.check((select balance from public.profiles where id::text like '%00000000000a') = 3, 'players cannot write their own balance');
select pg_temp.check((select count(*) = 2 and sum(asked) = 11 and sum(paid) = 3 from private.drive_log where user_id::text like '%00000000000a'),
  'every bank is logged with what was claimed and what was paid, and a refused one not at all');
update public.profiles set last_drive_at = now() - interval '100 seconds' where id::text like '%00000000000a';
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select lifetime from public.add_miles(null)) = 3, 'claiming nothing banks nothing');
reset role;

-- Shop.
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.fails($$ select public.buy('tyres:mud') $$, 'cannot buy without the miles');
select pg_temp.fails($$ select public.buy('tyres:gold') $$, 'cannot buy what the shop does not sell');
reset role;
update public.profiles set balance = 250 where id::text like '%00000000000a';
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select balance from public.buy('vehicle:summit')) = 50, 'buying takes the price');
select pg_temp.check((select balance from public.buy('vehicle:summit')) = 50, 'buying twice charges once');
select pg_temp.check((select balance from public.buy('tyres:road')) = 50, 'free things cost nothing');
select pg_temp.fails($$ select public.equip('summit', '{"paint":"factory","tyres":"mud","lights":"stock","snorkel":"none","winter":"none"}') $$, 'cannot fit unbought tyres');
select pg_temp.fails($$ select public.equip('duneclaw', '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none"}') $$, 'cannot drive an unbought rig');
select pg_temp.fails($$ select public.equip('summit', '{"engine":"v12"}') $$, 'cannot fit a made-up part');
select pg_temp.check((select vehicle from public.equip('summit', '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none"}')) = 'summit', 'can fit what is owned');
select pg_temp.check((select vehicle from public.equip('bluff', '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none"}')) = 'bluff', 'starters are free to drive');

-- Missions: paid for a believable run that banked most of the course's miles, one at a time.
select pg_temp.refused($$ select public.complete_mission('forest-slalom', 5) $$, 'too fast', 'impossibly fast runs pay nothing');
reset role;
select pg_temp.rewind('a');
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.refused($$ select public.complete_mission('forest-slalom', 60) $$, 'drive the whole course', 'a run that banked no miles pays nothing');
select public.add_miles(0.1);
select pg_temp.refused($$ select public.complete_mission('forest-slalom', 60) $$, 'drive the whole course', 'nor one that banked too few');
reset role;
update public.profiles set last_drive_at = now() - interval '1 minute' where id::text like '%00000000000a';
select pg_temp.as_player('a');
set role authenticated;
select public.add_miles(1);
select pg_temp.check(pg_temp.pays($$ select public.complete_mission('forest-slalom', 60) $$) = 12, 'first finish pays the full reward');
select pg_temp.refused($$ select public.complete_mission('forest-slalom', 60) $$, 'come back later', 'repeats wait for the cooldown');
select pg_temp.refused($$ select public.complete_mission('ridge-run', 60) $$, 'one course at a time', 'a run cannot overlap the last one');
reset role;
select pg_temp.rewind('a');
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.refused($$ select public.complete_mission('ridge-run', 60) $$, 'drive the whole course', 'miles banked before the last run do not count again');
select public.add_miles(1);
select pg_temp.check(pg_temp.pays($$ select public.complete_mission('forest-slalom', 60) $$) = 4, 'later finishes pay the repeat reward');
select pg_temp.refused($$ select public.complete_mission('jungle-loop', 200) $$, 'another world', 'an island course cannot be claimed from the valley');

-- Names and goals.
select pg_temp.check((select name from public.set_name('  Nevin  ')) = 'Nevin', 'names are trimmed and saved');
select pg_temp.fails($$ select public.set_name('x') $$, 'names must be 2 to 20 characters');
select pg_temp.check((select cardinality(goals) from public.mark_goal('found-garage')) = 1, 'goals are recorded');
select pg_temp.check((select cardinality(goals) from public.mark_goal('found-garage')) = 1, 'goals are recorded once');
reset role;
select pg_temp.as_player('b');
set role authenticated;
select pg_temp.fails($$ select public.set_name('Nevin') $$, 'names are unique');
select pg_temp.check((select name from public.set_name('Z_')) = 'Z_', 'two characters are enough for a name');

-- Friends: both have to ask.
select pg_temp.check(public.request_friend('00000000-0000-0000-0000-00000000000a') = 'pending', 'asking once is pending');
select pg_temp.check((select count(*) from public.friendships) = 0, 'not friends yet');
reset role;
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check(public.request_friend('00000000-0000-0000-0000-00000000000b') = 'friends', 'asking back makes friends');
select pg_temp.check((select count(*) from public.friendships) = 1, 'one friendship row');
select pg_temp.check((select count(*) from public.friend_requests) = 0, 'requests are cleared');
select pg_temp.check((select count(*) from public.leaderboard()) = 2, 'leaderboard shows me and my friend');
select pg_temp.check((select bool_or(is_me) from public.leaderboard()), 'leaderboard marks me');
reset role;
select pg_temp.as_player('c');
set role authenticated;
select pg_temp.check((select count(*) from public.leaderboard()) = 1, 'a stranger sees only themselves');
select pg_temp.check((select count(*) from public.friendships) = 0, 'strangers cannot see others'' friendships');
reset role;

-- Convoys: driven with friends, and each driver claims their own, naming the others.
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.fails($$ select public.complete_mission('convoy', 120) $$, 'a convoy cannot be claimed as a solo run');
select pg_temp.fails($$ select public.complete_convoy('forest-slalom', 120, '{00000000-0000-0000-0000-00000000000b}') $$, 'a solo course is not a convoy');
select pg_temp.fails($$ select public.complete_convoy('convoy', 120, '{}') $$, 'a convoy needs someone else in it');
select pg_temp.fails($$ select public.complete_convoy('convoy', 120, '{00000000-0000-0000-0000-00000000000a}') $$, 'you are not your own convoy');
select pg_temp.fails($$ select public.complete_convoy('convoy', 120, '{00000000-0000-0000-0000-00000000000c}') $$, 'a convoy of strangers pays nothing');
select pg_temp.refused($$ select public.complete_convoy('convoy', 120, '{00000000-0000-0000-0000-00000000000b,00000000-0000-0000-0000-00000000000c,00000000-0000-0000-0000-00000000000d,00000000-0000-0000-0000-00000000000e,00000000-0000-0000-0000-000000000011,00000000-0000-0000-0000-000000000012,00000000-0000-0000-0000-000000000013,00000000-0000-0000-0000-000000000014,00000000-0000-0000-0000-000000000015,00000000-0000-0000-0000-000000000016}') $$,
  'two to ten drivers', 'a convoy is ten drivers at most');
select pg_temp.fails($$ select public.complete_convoy('convoy', 10, '{00000000-0000-0000-0000-00000000000b}') $$, 'impossibly fast convoys pay nothing');
reset role;
select pg_temp.rewind('a');
select pg_temp.as_player('a');
set role authenticated;
select public.add_miles(2);
select pg_temp.refused($$ select public.complete_convoy('convoy', 120, '{00000000-0000-0000-0000-00000000000b}') $$, 'drivers who drove', 'a convoy whose crew never drove pays nothing');
reset role;
-- The friend drove the course too; the third who set off went quiet early, and doesn't
-- block the ones who drove.
update public.profiles set last_drive_at = now() - interval '100 seconds' where id::text like '%00000000000b';
select pg_temp.as_player('b');
set role authenticated;
select public.add_miles(2);
reset role;
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check(pg_temp.pays($$ select public.complete_convoy('convoy', 120, '{00000000-0000-0000-0000-00000000000b,00000000-0000-0000-0000-00000000000c,00000000-0000-0000-0000-00000000000d,00000000-0000-0000-0000-00000000000e,00000000-0000-0000-0000-000000000011,00000000-0000-0000-0000-000000000012,00000000-0000-0000-0000-000000000013,00000000-0000-0000-0000-000000000014,00000000-0000-0000-0000-000000000015}') $$) = 30,
  'a convoy of ten with a friend in it pays the full reward');
select pg_temp.check((select cardinality(crew) = 9 and crew @> '{00000000-0000-0000-0000-00000000000b}'
  from public.mission_runs where user_id::text like '%00000000000a' and mission = 'convoy'), 'and the claim keeps who it set off with');
select pg_temp.refused($$ select public.complete_convoy('convoy', 120, '{00000000-0000-0000-0000-00000000000b}') $$, 'come back later', 'convoys wait for the cooldown too');
select pg_temp.fails($$ select public.complete_mission('race', 200) $$, 'a race cannot be claimed as a solo run');
select pg_temp.fails($$ select public.complete_convoy('race', 200, '{00000000-0000-0000-0000-00000000000c}') $$, 'a race against strangers pays nothing');
reset role;
select pg_temp.rewind('a');
select pg_temp.as_player('a');
set role authenticated;
select public.add_miles(2);
select pg_temp.check(pg_temp.pays($$ select public.complete_convoy('race', 200, '{00000000-0000-0000-0000-00000000000b}') $$) = 25, 'a race against a friend pays the finisher');
reset role;
-- The friend banked their miles on the way round, then waited five minutes at the finish
-- for the others: a convoy is claimed when everyone is home.
select pg_temp.rewind('b');
select pg_temp.as_player('b');
set role authenticated;
select public.add_miles(2);
reset role;
update private.drive_log set at = at - interval '5 minutes' where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.as_player('b');
set role authenticated;
select pg_temp.check(pg_temp.pays($$ select public.complete_convoy('convoy', 125, '{00000000-0000-0000-0000-00000000000a}') $$) = 30,
  'the friend claims their own, after waiting for the rest');
reset role;
select pg_temp.as_player('c');
set role authenticated;
select pg_temp.fails($$ select public.complete_convoy('convoy', 125, '{00000000-0000-0000-0000-00000000000a,00000000-0000-0000-0000-00000000000b}') $$, 'riding along with strangers pays nothing');
reset role;

-- Places: found once, real ones only, and counted beside your miles.
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select cardinality(discovered) from public.discover('garage:barn')) = 1, 'finding a garage is recorded');
select pg_temp.check((select cardinality(discovered) from public.discover('garage:barn')) = 1, 'finding it again changes nothing');
select pg_temp.check((select cardinality(discovered) from public.discover('cafe:camp')) = 2, 'the café counts too');
select pg_temp.fails($$ select public.discover('garage:castle') $$, 'made-up places are refused');
select pg_temp.check((select garages = 1 and cafes = 1 from public.leaderboard() where is_me), 'the leaderboard counts what you have found');
select pg_temp.check((select garages = 0 and cafes = 0 from public.leaderboard() where not is_me), 'and what your friend has not');
select pg_temp.check((select goals = '{found-garage}' from public.leaderboard() where is_me), 'the leaderboard shows your goals, for achievements');
select pg_temp.check((select goals = '{}' from public.leaderboard() where not is_me), 'and your friend''s');
update public.profiles set discovered = '{garage:workshop,garage:barn,garage:quonset}';
reset role;
select pg_temp.check((select cardinality(discovered) from public.profiles where id::text like '%00000000000a') = 2, 'players cannot write what they have found');

-- Places are counted world by world, and an airstrip and an easter egg are places too (ADR 0016).
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select cardinality(discovered) from public.discover('airport:valley')) = 3, 'finding the airstrip is recorded');
select pg_temp.check((select cardinality(discovered) from public.discover('egg:bank')) = 4, 'and so is looking inside an easter egg');
select pg_temp.check((select cardinality(discovered) from public.discover('garage:shack')) = 5, 'and a garage on the island');
select pg_temp.check((select cardinality(discovered) from public.discover('cafe:beach')) = 6, 'and the island''s café');
select pg_temp.check((select garages = 1 and cafes = 1 and airports = 1 and eggs = 1 from public.leaderboard() where is_me),
  'with no world named, the leaderboard counts the world you are in');
select pg_temp.check((select garages = 1 and cafes = 1 and airports = 0 and eggs = 0 from public.leaderboard('island') where is_me),
  'asked for the island, it counts only what is there');
select pg_temp.check((select garages = 0 and cafes = 0 and airports = 0 and eggs = 0 from public.leaderboard('island') where not is_me), 'for your friend too');
select pg_temp.check((select count(*) from public.leaderboard('island')) = 2, 'and is still you and your friends only');
select pg_temp.check((select balance from public.profiles where id = (select auth.uid())) = (select balance from public.discover('egg:church')), 'finding pays nothing');
reset role;
select pg_temp.check((select count(*) from public.missions where id in ('beach-run', 'dune-dash', 'jungle-loop') and world = 'island') = 3, 'the island has its first three courses');
select pg_temp.check((select count(*) filter (where crew = 1) = 10 and count(*) filter (where crew > 1) = 10 from public.missions where world = 'valley'),
  'the valley has ten courses to drive alone and ten for friends');
select pg_temp.check((select count(*) filter (where crew = 1) = 4 and count(*) filter (where crew > 1) = 4 from public.missions where world = 'island'),
  'and the island four of each');

-- The map's fog: cells are only ever added, each player has their own, and nobody reads the table.
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check(public.explored() is null, 'a new player has explored nothing');
select public.explore('{0,30}');
select pg_temp.check(public.explored() = '01000040' || repeat('00', 2044), 'explored cells are kept, a bit each');
select public.explore('{30,16383}');
select pg_temp.check(public.explored() = '01000040' || repeat('00', 2043) || '80', 'more are added to what was there');
select public.explore('{}');
select pg_temp.fails($$ select public.explore('{16384}') $$, 'cells off the map are refused');
select pg_temp.fails($$ select public.explore('{-1}') $$, 'and ones before it');
select pg_temp.fails($$ select public.explore('{1,null}') $$, 'and ones that are nothing');
select pg_temp.fails($$ select public.explore(array(select generate_series(0, 512))) $$, 'too many at once are refused');
select pg_temp.check((select count(*) from public.fog) = 0, 'the fog table cannot be read directly');
select pg_temp.fails($$ insert into public.fog (id, cells) values ((select auth.uid()), decode(repeat('ff', 2048), 'hex')) $$, 'nor written');
reset role;
select pg_temp.as_player('b');
set role authenticated;
select pg_temp.check(public.explored() is null, 'one player''s map is not another''s');
reset role;

-- The island: a flight costs its fare, takes you there and is logged, and the way home costs the same.
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select world from public.me()) = 'valley', 'everyone starts in the valley');
select pg_temp.refused($$ select public.complete_convoy('coast-convoy', 200, '{00000000-0000-0000-0000-00000000000b}') $$, 'in another world', 'an island convoy cannot be claimed from the valley either');
select pg_temp.refused($$ select public.fly('island') $$, 'not enough miles', 'cannot fly without the fare');
select pg_temp.refused($$ select public.fly('moon') $$, 'no such world', 'cannot fly somewhere that is not there');
select pg_temp.refused($$ select public.fly(null) $$, 'no such world', 'nor to nowhere');
reset role;
update public.profiles set balance = 340 where id::text like '%00000000000a';
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.refused($$ select public.buy('vehicle:sandfly') $$, 'only sold in island', 'the Sandfly is not sold in the valley');
select pg_temp.check((select balance = 340 and world = 'valley' from public.fly('valley')), 'flying to where you already are costs nothing');
select pg_temp.check((select balance = 190 and world = 'island' from public.fly('island')), 'a flight takes the fare and takes you there');
select pg_temp.check((select balance = 190 and world = 'island' from public.fly('island')), 'asking twice charges once');
select pg_temp.check((select balance from public.buy('vehicle:sandfly')) = 40, 'the Sandfly is sold on the island');
select pg_temp.refused($$ select public.fly('valley') $$, 'not enough miles', 'the way home costs the same');
select pg_temp.check((select vehicle from public.equip('sandfly', '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none"}')) = 'sandfly', 'and can be driven once bought');
select pg_temp.check((select balance from public.buy('tyres:allTerrain')) = 38, 'everything else is sold there too');
select pg_temp.refused($$ select public.complete_mission('forest-slalom', 60) $$, 'another world', 'a valley course cannot be claimed from the island');
reset role;
select pg_temp.rewind('a');
select pg_temp.as_player('a');
set role authenticated;
select public.add_miles(1);
select pg_temp.check(pg_temp.pays($$ select public.complete_mission('beach-run', 60) $$) = 15, 'the island pays its own courses');
update public.profiles set world = 'valley';
reset role;
select pg_temp.check((select world from public.profiles where id::text like '%00000000000a') = 'island', 'players cannot write where they are');
select pg_temp.check((select count(*) = 1 and min(origin) = 'valley' and min(destination) = 'island' and sum(fare) = 150 from private.flight_log where user_id::text like '%00000000000a'),
  'every flight is logged');

-- The fog is kept for each world.
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check(public.explored() is null, 'a world you have just landed in is all fog');
select pg_temp.check(public.explored('valley') = '01000040' || repeat('00', 2043) || '80', 'the valley''s map is as you left it');
select public.explore('{9}', 'island');
select pg_temp.check(public.explored() = '0002' || repeat('00', 2046), 'the island''s fog clears on the island''s map');
select pg_temp.check(public.explored('valley') = '01000040' || repeat('00', 2043) || '80', 'and not on the valley''s');
select pg_temp.refused($$ select public.explore('{1}', 'moon') $$, 'no such world', 'there is no map of nowhere');
select pg_temp.check((select count(*) from public.worlds) = 2, 'anyone can read what the flights cost');
reset role;

-- Realtime channels.
insert into realtime.messages (topic, extension, payload) values
  ('world', 'broadcast', '{}'),
  ('world:island', 'broadcast', '{}'),
  ('chat:00000000-0000-0000-0000-00000000000a:00000000-0000-0000-0000-00000000000b', 'broadcast', '{}');
select set_config('realtime.topic', 'world', false);
select pg_temp.as_player('c');
set role authenticated;
select pg_temp.check((select count(*) from realtime.messages where topic = 'world') = 1, 'any signed-in player hears the world');
reset role;
set role anon;
select pg_temp.check((select count(*) from realtime.messages) = 0, 'signed-out visitors hear nothing');
reset role;
select set_config('realtime.topic', 'chat:00000000-0000-0000-0000-00000000000a:00000000-0000-0000-0000-00000000000b', false);
select pg_temp.as_player('b');
set role authenticated;
select pg_temp.check((select count(*) from realtime.messages where topic like 'chat:%') = 1, 'friends hear their chat');
insert into realtime.messages (topic, extension, payload) values (current_setting('realtime.topic'), 'broadcast', '{"text":"hi"}');
select pg_temp.check(true, 'friends can send in their chat');
reset role;
select pg_temp.as_player('c');
set role authenticated;
select pg_temp.check((select count(*) from realtime.messages where topic like 'chat:%') = 0, 'others cannot listen in');
select pg_temp.fails($$ insert into realtime.messages (topic, extension, payload) values (current_setting('realtime.topic'), 'broadcast', '{}') $$, 'others cannot post into a friends chat');
reset role;
select pg_temp.check(not public.is_chat_member('chat:not-a-uuid:also-not'), 'garbled chat topics are refused');

-- The island's channel is for the players who are on the island (a is; b and c are in the valley).
select set_config('realtime.topic', 'world:island', false);
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select count(*) from realtime.messages where topic = 'world:island') = 1, 'a player on the island hears the island');
insert into realtime.messages (topic, extension, payload) values (current_setting('realtime.topic'), 'presence', '{}');
select pg_temp.check(true, 'and can be seen there');
reset role;
select pg_temp.as_player('c');
set role authenticated;
select pg_temp.check((select count(*) from realtime.messages where topic = 'world:island') = 0, 'a player in the valley does not');
select pg_temp.fails($$ insert into realtime.messages (topic, extension, payload) values (current_setting('realtime.topic'), 'broadcast', '{}') $$, 'nor can they send there');
reset role;
select set_config('realtime.topic', 'world', false);
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select count(*) from realtime.messages where topic = 'world') = 1, 'the valley''s channel stays open to everyone signed in');
select pg_temp.check(not public.is_in_world('world:valley') and not public.is_in_world('world') and not public.is_in_world('world:moon'), 'only the world you are in has a channel for you');
reset role;

-- The winch (ADR 0020): bought and fitted like any other part, and worth nothing but itself.
update public.profiles set balance = 20 where id::text like '%00000000000a';
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.fails($$ select public.equip('bluff', '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none","winch":"winch"}') $$, 'cannot fit an unbought winch');
select pg_temp.fails($$ select public.equip('bluff', '{"winch":"hydraulic"}') $$, 'nor a winch the shop does not sell');
select pg_temp.check((select balance from public.buy('winch:winch')) = 10, 'a winch costs its price');
select pg_temp.check((select loadout->>'winch' from public.equip('bluff', '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none","winch":"winch"}')) = 'winch', 'and fits once bought');
select pg_temp.check((select loadout->>'winch' is null and vehicle = 'bluff' from public.equip('bluff', '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none"}')), 'a loadout that names no winch still fits, as an older page sends it');
-- BBB (ADR 0020): a tow costs its fee each time, and nothing else about it reaches the database.
select pg_temp.check((select balance = 5 and lifetime = (select lifetime from public.me()) from public.call_tow()), 'a tow takes its fee and nothing else');
select pg_temp.check((select balance from public.call_tow()) = 0, 'and takes it again the next time');
select pg_temp.refused($$ select public.call_tow() $$, 'not enough miles', 'a driver without the fee is not towed');
reset role;
select pg_temp.check(not has_function_privilege('anon', 'public.call_tow()', 'execute') and has_function_privilege('authenticated', 'public.call_tow()', 'execute'),
  'only someone signed in can ring BBB');

-- Only the game's own functions can be called, and only when signed in.
select pg_temp.check(not has_function_privilege('anon', 'public.me()', 'execute'), 'signed-out visitors cannot call the game''s functions');
select pg_temp.check(not has_function_privilege('anon', 'public.discover(text)', 'execute') and not has_function_privilege('anon', 'public.leaderboard(text)', 'execute')
  and not has_function_privilege('anon', 'public.complete_convoy(text, numeric, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.explore(int[], text)', 'execute') and not has_function_privilege('anon', 'public.explored(text)', 'execute')
  and not has_function_privilege('anon', 'public.fly(text)', 'execute'), 'nor the ones added since');
select pg_temp.check(not has_function_privilege('anon', 'public.is_chat_member(text)', 'execute'), 'signed-out visitors cannot probe chat membership');
select pg_temp.check(has_function_privilege('authenticated', 'public.is_chat_member(text)', 'execute'), 'the chat policies can still check membership');
select pg_temp.check(not has_function_privilege('anon', 'public.is_in_world(text)', 'execute') and has_function_privilege('authenticated', 'public.is_in_world(text)', 'execute'),
  'and the same goes for which world a player is in');
select pg_temp.check(not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'), 'the new-account trigger cannot be called directly');
select pg_temp.check(not has_schema_privilege('anon', 'private', 'usage') and not has_schema_privilege('authenticated', 'private', 'usage'),
  'nobody can read the drive log, the flight log or the hourly totals from the game');
select pg_temp.check((select sum(miles) from private.miles_hourly where user_id::text like '%00000000000a') = (select lifetime from public.profiles where id::text like '%00000000000a'),
  'the hourly totals add up to the lifetime miles');

select 'all checks passed' as result;
