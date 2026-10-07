# 2026-10-07 — A convoy: the multiplayer mission

## Topic

The owner asked for "a multiplayer mission you can do with your friends". Built a convoy
course for two to four friends, on `feat/convoy-mission`.

## Decisions made

- **A convoy, not a race** (`docs/decisions/0009-convoys.md`). A race has a loser and a
  timer that matters, which `CLAUDE.md` ("don't add pressure") rules out. Each driver
  drives the course; the convoy is home when everyone still in it is through the finish,
  and then each is paid (4 mi first time, 1.2 mi after, once per 10 minutes).
- **The course** is planned at load by `convoy()` in `missions.ts`: a 1.5 km loop of 14
  flags (15 gates, the last back at the first), 14 m wide, starting 116 m from the café
  at (-613, -89), heading east, at least 50 m from every other course. `Mission.crew`
  is 2 for it and 1 for the solo courses. The valley is bumpy everywhere, so the loop
  line is scored by how much of it is steep and rejected only for a wall (3+ samples
  steeper than 0.7 in a row), rather than held to a slope limit.
- **Gathering:** at the arch (within `GATHER_REACH`, 30 m, and slow), E gathers if a
  friend is in the valley. Friends get a toast and a compass mark. A friend at the arch
  presses E to join; the gatherer presses E to set off; everyone lines up two abreast
  behind the arch (`lineUp()`) and counts down. Esc leaves; driving 60 m from the arch
  while gathering leaves too.
- **The agreement is `convoy.ts`**, pure: messages `open`/`join`/`go`/`pass`/`leave`
  over the `world` channel as the `convoy` broadcast event (`net.ts`), validated by
  `readConvoy()`. Calls repeat every 3 s, flag counts every 5 s, silence for 15 s drops a
  driver; a joiner who missed `go` starts on hearing the gatherer's first count. Only
  the gatherer's friends act on a call. Nothing goes in presence.
- **Paying:** `Store.completeMission(m, seconds, crew)`; signed in it calls the new
  `complete_convoy(p_mission, p_seconds, p_crew)` (migration
  `20261007210000_convoy.sql`), which needs one to three others with at least one friend
  among them. `complete_mission` now refuses `crew > 1` courses. `missions.crew` column
  added; `shop.test.ts` now reads every migration's inserts by column name.
- **Start lines no longer reverse the truck.** `HELD` in `Game.tsx` held the brake, which
  at a standstill reverses: every countdown (solo courses too) rolled the truck back
  11–14 m. Now nothing is pressed and speed is zeroed each step while held.
- **Convoy-mates are put straight into their line-up spots** (`remotes.jump()` in
  `remote.ts`). Eased there, each other's trucks slid through the line and the
  collisions shoved both trucks into a heap.
- Course lines (`courseDistOf` in `missions.ts`) now clear trees and rocks from 25 m
  behind each start arch too. This, and the new course, shift the tree scatter.

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/convoy.ts` | **Created**: `Convoys`, `readConvoy`, `lineUp`, constants |
| `apps/web/src/app/convoy.test.ts` | **Created**: 17 tests, including lost messages, drop-outs and the course itself |
| `apps/web/src/app/missions.ts` | `crew` on `Mission`; `convoy()` planner; `courseDistOf()` |
| `apps/web/src/app/net.ts` | `convoy` broadcast event on `Net`/`NetHandlers`, both transports |
| `apps/web/src/app/store.ts` | `completeMission(m, seconds, crew)`; `complete_convoy` RPC; local friend check |
| `apps/web/src/app/remote.ts` | `jump()` |
| `apps/web/src/app/Game.tsx` | Convoy prompts, `setOff`, `onConvoy`, run HUD with the crew, compass, `HELD` fix |
| `apps/web/src/app/play.test.ts`, `shop.test.ts` | Convoy payout in `LocalStore`; parity across all migrations |
| `supabase/migrations/20261007210000_convoy.sql` | **Created**: `missions.crew`, the row, `complete_convoy`, `complete_mission` refuses crews |
| `supabase/tests/game.test.sql` | Eleven convoy checks; `complete_convoy` added to the signed-out privilege check |
| `docs/decisions/0009-convoys.md` | **Created** |
| `CLAUDE.md`, `docs/vision.md`, `docs/art-direction.md`, `docs/architecture.md`, `docs/roadmap.md` | Convoy mentions, migration, message cost |

## How it was checked

- `pnpm test` (87 tests), `pnpm typecheck`, `pnpm lint` all clean.
- The SQL tests pass on a local Postgres 16 with `local-stubs.sql` and all five
  migrations (`supabase/tests/README.md`), including every earlier check.
- Two tabs over `?net=local` in headless Chromium (Playwright): friend at the café,
  drive to the arch, gather, join, set off, line up side by side, count down, drive all
  15 gates (an autopilot steering by the compass mark), the first one through waits with
  "through · Ben 14/15", and both get "Convoy home together … +4.0 mi". To make that run
  at 60 fps the test skipped WebGL draw calls except for screenshots; the script is not
  in the repo.

## Open questions

- **The migration is not on the live project.** Apply it with `supabase db push` before
  or with the merge. Until then a signed-in convoy finishes but its payout is refused,
  and a preview deploy (which uses the same project) would show that.
- **Not played over Supabase**, only over `?net=local`. Worth one real two-account run:
  gather, join, finish, and check both `mission_runs` rows.
- Feel is the owner's call: 4 mi reward, 14 m flags, the loop's route, whether the
  "gathering a convoy" toast reaching friends anywhere in the valley is welcome or noise.
- `leave` isn't sent when a tab is closed abruptly (no `pagehide`); the others drop that
  driver after 15 s of silence instead.

## Exact next step

Ask the owner to try the convoy, then apply `supabase/migrations/20261007210000_convoy.sql`
to the `gilbyy` project (`supabase db push`), run `supabase/tests/game.test.sql` against
it as `supabase/tests/README.md` describes, and merge `feat/convoy-mission`. Then play
one convoy signed in from two Google accounts and confirm both payouts persist.

## Tokens advisory

Stopped at a natural break: the feature is built, tested and pushed; only the live
migration and a real two-account run remain.
