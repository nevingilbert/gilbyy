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

-- Become a player: the JWT subject Supabase would set, and the authenticated role.
create function pg_temp.as_player(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000' || who, false);
end;
$$;

-- Counting only these three, so the file also runs against a project that has real players.
select pg_temp.check((select count(*) from public.profiles where id::text like '00000000-0000-0000-0000-00000000000_') = 3, 'every new account gets a profile');

-- Miles: banked no faster than a truck could have driven them.
update public.profiles set last_drive_at = now() - interval '100 seconds' where id::text like '%a';
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select lifetime from public.add_miles(1)) = 1, 'miles bank when the time allows');
select pg_temp.check((select lifetime from public.add_miles(10)) = 1, 'miles do not bank faster than driving');
update public.profiles set balance = 9999;
reset role;
select pg_temp.check((select balance from public.profiles where id::text like '%a') = 1, 'players cannot write their own balance');

-- Shop.
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.fails($$ select public.buy('tyres:mud') $$, 'cannot buy without the miles');
select pg_temp.fails($$ select public.buy('tyres:gold') $$, 'cannot buy what the shop does not sell');
reset role;
update public.profiles set balance = 50 where id::text like '%a';
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select balance from public.buy('vehicle:summit')) = 10, 'buying takes the price');
select pg_temp.check((select balance from public.buy('vehicle:summit')) = 10, 'buying twice charges once');
select pg_temp.check((select balance from public.buy('tyres:road')) = 10, 'free things cost nothing');
select pg_temp.fails($$ select public.equip('summit', '{"paint":"factory","tyres":"mud","lights":"stock","snorkel":"none","winter":"none"}') $$, 'cannot fit unbought tyres');
select pg_temp.fails($$ select public.equip('duneclaw', '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none"}') $$, 'cannot drive an unbought rig');
select pg_temp.fails($$ select public.equip('summit', '{"engine":"v12"}') $$, 'cannot fit a made-up part');
select pg_temp.check((select vehicle from public.equip('summit', '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none"}')) = 'summit', 'can fit what is owned');
select pg_temp.check((select vehicle from public.equip('bluff', '{"paint":"factory","tyres":"road","lights":"stock","snorkel":"none","winter":"none"}')) = 'bluff', 'starters are free to drive');

-- Missions.
select pg_temp.fails($$ select public.complete_mission('forest-slalom', 5) $$, 'impossibly fast runs pay nothing');
select pg_temp.check((select balance from public.complete_mission('forest-slalom', 60)) = 11.5, 'first finish pays the full reward');
select pg_temp.fails($$ select public.complete_mission('forest-slalom', 60) $$, 'repeats wait for the cooldown');
reset role;
update public.mission_runs set finished_at = now() - interval '11 minutes';
select pg_temp.as_player('a');
set role authenticated;
select pg_temp.check((select balance from public.complete_mission('forest-slalom', 60)) = 12, 'later finishes pay the repeat reward');

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
select pg_temp.fails($$ select public.complete_convoy('convoy', 120, '{00000000-0000-0000-0000-00000000000b,00000000-0000-0000-0000-00000000000c,00000000-0000-0000-0000-00000000000d,00000000-0000-0000-0000-00000000000e}') $$, 'a convoy is four drivers at most');
select pg_temp.fails($$ select public.complete_convoy('convoy', 10, '{00000000-0000-0000-0000-00000000000b}') $$, 'impossibly fast convoys pay nothing');
select pg_temp.check((select balance from public.complete_convoy('convoy', 120, '{00000000-0000-0000-0000-00000000000b,00000000-0000-0000-0000-00000000000c}')) = 16, 'a convoy with a friend in it pays the full reward');
select pg_temp.fails($$ select public.complete_convoy('convoy', 120, '{00000000-0000-0000-0000-00000000000b}') $$, 'convoys wait for the cooldown too');
select pg_temp.fails($$ select public.complete_mission('race', 200) $$, 'a race cannot be claimed as a solo run');
select pg_temp.fails($$ select public.complete_convoy('race', 200, '{00000000-0000-0000-0000-00000000000c}') $$, 'a race against strangers pays nothing');
select pg_temp.check((select balance from public.complete_convoy('race', 200, '{00000000-0000-0000-0000-00000000000b}')) = 19, 'a race against a friend pays the finisher');
reset role;
select pg_temp.as_player('b');
set role authenticated;
select pg_temp.check((select balance from public.complete_convoy('convoy', 125, '{00000000-0000-0000-0000-00000000000a}')) = 4, 'the friend claims their own');
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
select pg_temp.check((select cardinality(discovered) from public.profiles where id::text like '%a') = 2, 'players cannot write what they have found');

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

-- Realtime channels.
insert into realtime.messages (topic, extension, payload) values
  ('world', 'broadcast', '{}'),
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

-- Only the game's own functions can be called, and only when signed in.
select pg_temp.check(not has_function_privilege('anon', 'public.me()', 'execute'), 'signed-out visitors cannot call the game''s functions');
select pg_temp.check(not has_function_privilege('anon', 'public.discover(text)', 'execute') and not has_function_privilege('anon', 'public.leaderboard()', 'execute')
  and not has_function_privilege('anon', 'public.complete_convoy(text, numeric, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.explore(int[])', 'execute') and not has_function_privilege('anon', 'public.explored()', 'execute'), 'nor the ones added since');
select pg_temp.check(not has_function_privilege('anon', 'public.is_chat_member(text)', 'execute'), 'signed-out visitors cannot probe chat membership');
select pg_temp.check(has_function_privilege('authenticated', 'public.is_chat_member(text)', 'execute'), 'the chat policies can still check membership');
select pg_temp.check(not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'), 'the new-account trigger cannot be called directly');

select 'all checks passed' as result;
