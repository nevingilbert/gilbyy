# 0010 — Convoys: a mission you drive with friends

Date: 2026-10-07
Status: Accepted. Adds to `0007`; changes nothing in it. Amended by `0011`: at the
owner's request there is now a race too, built on the same agreement.

## Context

The owner asked for a multiplayer mission to do with friends. The four courses so far
are driven alone. Two shapes were on the table: a race, or something driven together.
A race is the obvious multiplayer mission, but it is a pressure mechanic: someone loses,
and a timer matters. `CLAUDE.md` ("don't add pressure") and `art-direction.md` (calm,
co-op driving like Over the Hill's trailer) both point the other way.

## Decision

- **A convoy, not a race.** One course, "Convoy", for two to four friends: a 1.5 km loop
  that starts a short drive from the café (where friends are made) and comes back to
  it, with flags 14 m wide so two trucks fit abreast. Everyone drives it for themselves;
  the convoy is home when everyone still in it is through the finish, and then each
  driver is paid. Whoever is through first waits; there is no winner, and the time shown
  is only your own.
- **Gathering is by consent.** One friend drives up to the start arch and presses E to
  gather. Their friends in the valley hear about it (a line on screen and a mark on the
  compass). A friend who drives up presses E to join. The one who gathered presses E to
  set off once anyone has joined. Everyone lines up two abreast behind the arch and
  counts down together. Esc leaves at any point; leaving before setting off calls it off
  if you gathered it. Nothing fails: if the others leave, you can still bring it home.
- **Friends only.** Only the gatherer's friends hear the call, and the gatherer only
  takes friends. A crew can include two people who are each the gatherer's friend but
  not each other's.
- **The drivers agree among themselves, over the `world` channel.** There is no game
  server, so `convoy.ts` is a small agreement over broadcast messages (`open`, `join`,
  `go`, `pass`, `leave`). Broadcasts can be lost, so every message is safe to hear twice
  and each side repeats itself until it hears back; a driver silent for 15 s is left
  behind. It is pure and tested with message loss (`convoy.test.ts`). Nothing about a
  convoy goes in presence, which is rationed (`architecture.md`).
- **Paid by a checked function.** `complete_convoy(mission, seconds, crew)` in
  `20261007210000_convoy.sql` pays like `complete_mission` (first finish 4 mi, then 1.2
  mi, at most once per 10 minutes, and no faster than 23 m/s), and also requires one to
  three others in the crew, at least one of them the caller's friend.
  `complete_mission` now refuses the convoy, so it can't be claimed as a solo run.
  `missions.crew` says how many drivers a course takes; `shop.test.ts` keeps it in step
  with `missions.ts`.

## Consequences

- Like every mission, the server can't see trucks, so a modified client could claim a
  convoy it never drove, once per cooldown, as long as it names a real friend. That is
  the same trust the other missions, the café rule and found places rest on (`0007`,
  `0008`), and it pays no more than driving the course would.
- A convoy costs Realtime messages that every player in the valley receives: while
  gathering, a call every 3 s from the gatherer and a "still here" every 3 s from each
  joiner; while running, each driver's flag count on every flag and every 5 s. Two
  friends on a two-minute run with four players in the valley come to a few hundred
  messages. Poses cost more.
- Holding a truck at any start line no longer holds the brake: at a standstill the brake
  reverses, so every countdown used to roll the truck back 11 to 14 m. The truck is now
  held where it was put. That changes the solo courses too.
- Adding the course clears trees and rocks along it, which shifts the random scatter, so
  trees elsewhere in the valley are not where they were. Nothing saved depends on them.
- A race was built on the same agreement the same day, at the owner's request; see
  `0011` for how it keeps the payout equal and the result unrecorded.
