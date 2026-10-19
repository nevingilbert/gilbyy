-- Convoy messages go through the server now, which says who sent each one.
-- See docs/decisions/0025-convoy-messages-through-the-server.md.
--
-- Convoys and races are agreed among the drivers' pages (apps/web/src/app/convoy.ts, ADR
-- 0010, 0011, 0019), in five messages: a call while one gathers, a friend's ask to join,
-- the word to set off, each truck's flag count, and leaving. Until now they were broadcasts
-- on the world's channel. Realtime decides who may send on a channel when they join it,
-- not message by message, and everyone in a world may send on its channel, so the sender a
-- convoy message named was whatever its page wrote. A modified page could count flags or
-- leave in another driver's name, or call a convoy out or set it off for whoever was
-- gathering it. The server pays every course (private.pay_run), so none of that paid
-- anyone, but it could stop a convoy coming home, spoil a friend's claim, or wreck a race.
--
-- Now a page hands each convoy message to say_convoy(). That writes in the caller's own id
-- as the message's sender, whatever the page put there, checks the rest is a message the
-- game sends, and broadcasts it with realtime.send() on a channel of its own for the world
-- the caller's profile says they're in, "convoy:<world>". A world's players may listen on
-- its convoy channel as on its world channel (the valley's is anyone's who is signed in),
-- and nobody may send on one: there is no policy for that. So a convoy message heard there
-- is from whoever it says.
--
-- Each message realtime.send() sends is a row of realtime.messages until Realtime drops it,
-- three days on, and it reaches everyone in the world, the sender too. So a player may say
-- thirty at once, and one a second after that. The game never says more: a truck counts
-- each flag it passes, which is less than one a second even flat out round the Grand Prix,
-- and otherwise says something every few seconds.

-- What each player may still say at once, as of the last time they said anything. The game
-- never reads it.
create table private.convoy_allowance (
  user_id uuid primary key references public.profiles on delete cascade,
  spare numeric not null,
  at timestamptz not null
);
alter table private.convoy_allowance enable row level security;

-- Sends one convoy message (ConvoyMsg in convoy.ts) to everyone in the caller's world, in
-- the caller's name. The checks are readConvoy()'s, tighter where only the game's own
-- messages need to pass: the drivers in a crew are players, and a call or the word to set
-- off is the gatherer's own, first in its crew, for a convoy whose id begins with theirs
-- (Convoys.gather) and a course for friends in the world they're in. The limits must match
-- apps/web/src/app/convoy.ts (convoy.test.ts checks).
create function public.say_convoy(p_message jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  here text;
  said text;
  fields text[];
  left_over numeric;
  burst constant int := 30;
  per_second constant numeric := 1;
begin
  if me is null then raise exception 'not signed in'; end if;
  select p.world into here from public.profiles p where p.id = me;
  if here is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_message) is distinct from 'object' then raise exception 'not a convoy message'; end if;
  -- The longest the game sends, a call with ten in the crew, is under 600 bytes.
  if octet_length(p_message::text) > 1024 then raise exception 'too long for a convoy message'; end if;
  -- What each kind may carry. "from" is the page's word, and is written over.
  said := p_message->>'kind';
  fields := case said
    when 'open' then array['kind', 'id', 'from', 'mission', 'crew']
    when 'join' then array['kind', 'id', 'from']
    when 'go' then array['kind', 'id', 'from', 'mission', 'crew']
    when 'pass' then array['kind', 'id', 'from', 'passed', 'seconds']
    when 'leave' then array['kind', 'id', 'from']
  end;
  -- Each step below only looks at what the one before has found to be there.
  if fields is null
    or exists (select 1 from jsonb_object_keys(p_message) as k where k <> all (fields))
    or jsonb_typeof(p_message->'id') is distinct from 'string'
    or length(p_message->>'id') not between 1 and 80 then
    raise exception 'not a convoy message';
  end if;
  if said in ('open', 'go') then
    if jsonb_typeof(p_message->'mission') is distinct from 'string' or jsonb_typeof(p_message->'crew') is distinct from 'array' then
      raise exception 'not a convoy message';
    end if;
    if jsonb_array_length(p_message->'crew') not between 1 and 10
      or exists (select 1 from jsonb_array_elements_text(p_message->'crew') as c
                 where c is null or c !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'not a convoy message';
    end if;
    if p_message->'crew'->>0 <> me::text or not starts_with(p_message->>'id', me::text || ':') then
      raise exception 'only the one gathering a convoy calls it out or sets it off';
    end if;
    if not exists (select 1 from public.missions m where m.id = p_message->>'mission' and m.crew > 1 and m.world = here) then
      raise exception 'no course for friends here: %', p_message->>'mission';
    end if;
  elsif said = 'pass' then
    if jsonb_typeof(p_message->'passed') is distinct from 'number'
      or (p_message ? 'seconds' and jsonb_typeof(p_message->'seconds') is distinct from 'number') then
      raise exception 'not a convoy message';
    end if;
    if (p_message->>'passed')::numeric not between 0 and 100 or (p_message->>'passed')::numeric % 1 <> 0
      or coalesce((p_message->>'seconds')::numeric not between 0 and 36000, false) then
      raise exception 'not a convoy message';
    end if;
  end if;
  -- Thirty at once, and one more for every second since the last. One refused here rolls
  -- back with everything else, so it spends nothing.
  insert into private.convoy_allowance as a (user_id, spare, at) values (me, burst - 1, now())
    on conflict (user_id) do update
    set spare = least(burst, a.spare + greatest(0, extract(epoch from now() - a.at)) * per_second) - 1, at = now()
    returning spare into left_over;
  if left_over < 0 then raise exception 'too many convoy messages at once'; end if;
  -- realtime.send() keeps a message's own "id" (the convoy's), and gives one only to a
  -- message without.
  perform realtime.send(p_message || jsonb_build_object('from', me), 'convoy', 'convoy:' || here, true);
end;
$$;

revoke all on function public.say_convoy(jsonb) from public, anon;
grant execute on function public.say_convoy(jsonb) to authenticated;

-- Who may listen on a convoy channel. The valley's, "convoy:valley", is anyone's who is
-- signed in, like the valley's own channel "world"; any other world's is for the players
-- whose profile says they're there, like "world:<id>" (is_in_world() in
-- 20261009180000_island.sql). No channel before these was called "convoy:" anything, so no
-- older policy lets anyone listen or send on one, and this lets nobody onto any other
-- (game.test.sql checks both). Exists for the policy below, which runs as the player.
create function public.hears_convoys(p_topic text) returns boolean
language sql security definer set search_path = '' stable as $$
  select p_topic = 'convoy:valley' or exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p_topic = 'convoy:' || p.world
  );
$$;

revoke all on function public.hears_convoys(text) from public, anon;
grant execute on function public.hears_convoys(text) to authenticated;

-- Listening only. With no policy to send on a convoy channel, only say_convoy() can.
create policy "players in a world hear its convoys" on realtime.messages for select to authenticated
  using (public.hears_convoys((select realtime.topic())) and realtime.messages.extension = 'broadcast');
