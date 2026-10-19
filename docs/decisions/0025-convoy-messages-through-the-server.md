# 0025 — Convoy messages through the server

Date: 2026-10-18
Status: Accepted. Changes how the messages of `0010` and `0011` (convoys and races, with
`0019`'s crews of ten) travel. Their rules stand: friends only, every finisher paid the
same, and results kept nowhere.

## Context

Convoys and races are agreed among the drivers' pages (`convoy.ts`) in five messages:
`open` (the gatherer's call), `join`, `go`, `pass` (a truck's flag count, and its time once
through the finish) and `leave`. They were broadcasts on the world's channel, `world` or
`world:<id>`, which every player in that world may send on. Realtime decides who may send
on a channel when they join it, not message by message, so the `from` in a convoy message
was whatever the sender's page wrote. A modified page could:

- count flags in another driver's name: bring a convoy home before a friend had driven it,
  so the claim was refused for want of a friend who drove (`0018`), or give a race a time
  nobody drove;
- leave in another driver's name, taking them out of the others' convoy;
- call off a convoy, or set it off, for whoever was gathering it: its joiners were sent
  away, or set off on their own.

The server pays every course (`pay_run`), so none of this paid anyone. But it could stop a
convoy coming home, spoil a claim, or wreck a race. The full review on 2026-10-18 closed
what a page could on its own: a count in my own name, a count from outside the crew that
set off, and a call or a go for a convoy I'm gathering. What was left needed a sender the
server vouches for, and the owner asked for it.

## Decision

- **The server says who sent each convoy message.** A page hands each one to
  `say_convoy(message)` (`20261018120000_convoy_relay.sql`). It writes the caller's own id
  in as `from`, over whatever the page put there, and every kind now carries one. It checks
  the message is one the game sends: `readConvoy()`'s checks, tighter where only the game's
  own need to pass. The crew are players' ids, and a call or a go is the gatherer's own:
  first in its crew, for a convoy whose id begins with theirs (as `Convoys.gather` has always
  made it), on a course for friends in the world they're in. Anything else is refused, and
  so is anything over 1 KB; the game's longest, a call for ten, is under 600 bytes. Then
  `realtime.send()` broadcasts it on `convoy:<world>`, the world taken from the caller's
  profile, not from the page.
- **A channel nobody can send on.** A `convoy:<world>` channel has a policy for listening
  (`hears_convoys()`) that mirrors the world channels': the valley's is anyone's who is
  signed in, and every other world's is for the players whose profile says they're there.
  It has none for sending, so only the database can put a message on one. No older policy
  matches a `convoy:` topic, and the new one matches none of theirs; `game.test.sql` checks
  both ways.
- **The page.** `SupabaseNet` sends convoy messages by `rpc`, one at a time, each waiting up
  to five seconds for the one before to be answered, so they're heard in the order they were
  said, as they were over the socket. It hears them only on the convoy channel, opened and
  closed with the world's, and no longer listens for them on the world's channel at all, so
  a forged one there reaches nobody. `LocalNet` (`?net=local`) is unchanged: between tabs of
  one browser, `from` is still the tab's word.
- **`convoy.ts` keeps its guards**, and with a true `from` they now hold. Two things are new.
  A message comes back to the one who said it, since a broadcast from the database goes to
  everyone on the topic; the guard against messages in my own name drops it. And a call or
  a go is believed only from the convoy's gatherer: the first in its crew, and the one known
  for it. A count from anyone else no longer takes a friend's call off the list either.
- **A throttle.** A player may say thirty at once, and one a second after that
  (`private.convoy_allowance`, a row per player). Every relayed message is a row of
  `realtime.messages` until Realtime drops it three days on, and a delivery to everyone in
  the world. Without a cap, a script calling the function in a loop would spend both as
  fast as the API answered, where until now Realtime's own limits held a sender back. The
  game needs much less: a truck counts each flag it passes, under one a second even flat out
  round the Grand Prix, and ten friends asking to join at once cost the gatherer ten calls.
  `convoy.test.ts` plays both against the migration's numbers.

## Cost

- Each message is an API request, a row of `realtime.messages` for three days, and a
  delivery to each player in the world, the sender now among them: one more than before.
  The game says what it always did, as often, so a convoy costs about what
  `architecture.md` says it did.
- One more private channel per player in each world, and one more check of the policies
  when it's joined.
- A little more latency, through the API and the database's replication instead of
  straight over the socket. The messages are few and repeated, and nothing hangs on one.
- Rows: a two-minute convoy of four leaves a couple of hundred. A script held to the
  throttle leaves at most 86,400 a day, each gone three days later.

## What it doesn't cover

Only convoy messages are vouched for. Everything else on the world's channel still goes
straight from page to page, and anyone in a world can send it in anyone's name:

- **Poses** name the truck they're for. A forger could draw another player's truck where it
  isn't, or stuck on a rock, so friends are told about someone stuck who isn't. A winch or a
  tow is believed from where the poses put the trucks (`0021`), so a forger could also have
  a stuck truck pulled free.
- **Presence** is filed under whatever id the page gives. A forger could turn up under
  another player's name and rig, or take a tent in their name.
- **`where`, `ask`, `friended`, `winch` and `tow`** could have everyone resend their pose,
  put a friend request's line on someone's screen (becoming friends still takes both
  players asking, through `request_friend()`), or draw a cable or a tow truck that isn't
  there.

None of that pays anyone or touches what's saved, and none of it can now stop a convoy or a
race. Closing it the same way would put every pose through the database, far past what the
free tier allows. That is the honest limit.

## Mixed versions

A page loaded before this sends and hears convoy messages on the world's channel; one loaded
after, only through the server. Pages don't reload themselves after a deploy, so for a while
both are about. Two players on different versions don't hear each other's convoys at all: a
friend gathering on the other version gets no line on screen and no compass mark, the arch
offers to gather afresh, and either call waits for joiners who never come. Two on the same
version play as before, and a reload puts anyone on the new one.

Nothing bridges the two. Listening on the world's channel again would let forgeries back
in, and saying everything twice would double every convoy message's cost for as long as
any old tab stays open. Convoys are rare. Apply the migration before the page goes out: a
page with no `say_convoy()` to call has no convoys at all.

## Consequences

- `ConvoyMsg` gained `from` on `open` and `go`, and `readConvoy()` refuses any message
  without one.
- A convoy's id now means something to the server: it must begin with its gatherer's id
  and a colon. `convoy.test.ts` holds `Convoys.gather` and `say_convoy()` together, along
  with the limits `readConvoy()` and the function share and the fields each kind may carry.
- The advisors will list `say_convoy` and `hears_convoys` among the `security definer`
  functions anyone signed in can call. That is the design, as for `is_in_world`.
