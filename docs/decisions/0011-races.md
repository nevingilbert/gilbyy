# 0011 — Races between friends

Date: 2026-10-07
Status: Accepted. Amends `0010`, which built the convoy and left races out, and the
"don't add pressure" line in `CLAUDE.md`.

## Context

The owner asked for a race as well as the convoy. `0010` chose a convoy precisely
because a race has a winner and a clock that matters, which `CLAUDE.md` and
`art-direction.md` steer away from. That was a judgment about tone, not a hard
constraint, and the owner has made the call. This records how the race keeps as much of
the calm as it can.

## Decision

- **One race course, "Race"**: a 2.35 km loop of twelve flags (13 gates, the last back
  at the first), 14 m wide, starting about 175 m from the camp gate. It is planned at
  load by the same loop planner as the convoy (`loopNear()` in `missions.ts`), scored
  for open, gentle ground rather than climbing and trees. Its flags are at least 50 m,
  and its line at least 30 m, from every other course.
- **Gathered and set off exactly like a convoy** (`convoy.ts`): one friend gathers at
  the arch, friends join, the gatherer sets off, everyone lines up and counts down. Two
  to four drivers, friends only.
- **Each driver's time is their own**, from their own "go" to their own finish line,
  and travels with their last flag count. Places are by time once through, by flags
  passed before that, so a driver whose "go" arrived a moment late isn't behind for it.
  The top line shows your place while you race ("Race · 1:12 · 7/13 · 2nd").
- **Every finisher is paid the same**: 3 mi the first time, then 1 mi, at most every 10
  minutes, paid the moment you cross the line by `complete_convoy`, which pays any
  course that takes a crew as long as a friend is in it. Winning pays nothing extra.
  Leaving before the end costs nothing you'd already earned.
- **The result is a line on screen and nothing else**: "Race over: 1st you 1:32 · 2nd
  Ben 1:44". It isn't stored, isn't on the leaderboard, and isn't kept as a record to
  beat.

## Consequences

- There is now a loser in the game. Keeping the payout equal and the result unrecorded
  is what stops it from becoming a score to chase; if a winner's bonus, a best-times
  table or race wins on the leaderboard are wanted later, that is the line to reconsider,
  in a new ADR.
- Times are the client's word, like every mission's. A modified client could claim a
  fast time; it would win a line on its friends' screens and nothing else.
- The race adds the same Realtime messages as a convoy (`0010`), only while one is on.
- The line-up puts two trucks in front and two behind, so with four the back row starts
  9 m behind. Among friends that is left as it is.
- `complete_convoy` keeps its name although it now pays races too; the race's row is in
  `20261007230000_race.sql`.
