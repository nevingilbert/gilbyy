# 2026-10-07 — A convoy: the multiplayer mission

## Topic

The owner asked for "a multiplayer mission you can do with your friends". Built a convoy
course for two to four friends, on `feat/convoy-mission`.

## Decisions made

- **A convoy, not a race** (`docs/decisions/0010-convoys.md`; it was 0009 until main took that number for achievements). A race has a loser and a
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
| `docs/decisions/0010-convoys.md` | **Created** |
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

## Added later the same session: a race

The owner asked for a race too (`docs/decisions/0011-races.md`, amending 0010 and the
"don't add pressure" line in `CLAUDE.md`).

- **Course:** `race()` in `missions.ts`, a 2.35 km loop of 12 flags starting at
  (-751, -326) heading north, about 175 m from `CAMP_GATE`. The convoy planner became
  `loopNear(t, others, plan)` plus `loopCourse()`; both courses use it. A loop's line
  now also has to stay 30 m from other courses (it was only its flags). The convoy course
  didn't move. `Mission.race` marks it; the server doesn't need to know.
- **Times and places:** a `pass` message carries `seconds` once through the finish;
  `Convoys.place()` ranks by time once through, by flags before that; the `home` event
  now has `times` (quickest first) and every event carries its `mission`.
- **Payout:** every finisher gets the same (3 mi, then 1 mi), paid at their own finish
  via `complete_convoy` (row in `20261007230000_race.sql`); winning pays nothing extra.
  Results are a toast ("Race over: 1st you 1:32 · 2nd Ben 1:44"), stored nowhere.
- **Game.tsx:** `crewCourses` replaces the single `convoyCourse`; prompts, toasts and
  Esc messages say "race" or "convoy" (`noun()`); the top line shows your place in a
  race; `raceOver` folds the results into the payout toast when you're last in.
- **Checked:** 90 vitest tests (three new race tests, the course tests now cover both
  courses), typecheck, lint, and the SQL tests with three race checks on local Postgres.
  In the browser (two `?net=local` tabs) the race got as far as the arch prompt
  ("Gather a race here … up to 3.0 mi for everyone who finishes"), gathering, and the
  friend's "Ana is gathering a race" toast. Joining, the line-up, racing, the place
  display, the finish toast and the results were **not seen in a browser**: the test
  driver couldn't get a second truck through the boulders between the café and the race
  arch. They share the convoy's code, which was seen end to end.

## Deployment, 2026-10-08: half done, parked

**Finished later the same day**: merged to `main` and live; see
`2026-10-08-convoy-race-deploy.md`. The rest of this section, and *Exact next step*
below, are kept as written at the time.

The owner asked to apply the migrations and merge. Done so far, from the cloud session:

- **`main` was merged into `feat/convoy-mission`** (commit "Merge main into
  feat/convoy-mission"). Main had moved on: compass mark fix, guidance, achievements
  (ADR 0009, migration `20261007200000_achievements.sql`, already live) and smoother
  remote trucks (`guessPose`, fading offsets in `remote.ts`). Conflicts in `Game.tsx`,
  `CLAUDE.md` and `docs/architecture.md` were resolved. Because main took ADR 0009, **the
  convoy ADR is now `0010-convoys.md` and the race ADR `0011-races.md`**, and every
  reference was renumbered. `remotes.jump()` now also clears the fading offset, so a
  convoy-mate snapped into the line-up stays put. After the merge: 94 vitest tests,
  typecheck, lint and `pnpm build` clean; the SQL tests pass on a local Postgres with all
  seven migrations (68 checks).
- **Both migrations are applied to the live `gilbyy` project** (via the Supabase MCP's
  `apply_migration`). The MCP records its own timestamp as the version, so the two rows
  in `supabase_migrations.schema_migrations` were renamed to match the files:
  `20261007210000` (convoy) and `20261007230000` (race). `supabase db push --dry-run`
  should therefore find nothing to push. Checked live: `public.missions` has `convoy`
  (4, 1.2, 600, 66, crew 2) and `race` (3, 1, 600, 102, crew 2); `complete_convoy` is
  executable by `authenticated` and not by `anon`.
- **The live SQL test run did not finish**: through the MCP it timed out after 60 s. It
  runs as one transaction ending in a deliberate error, and afterwards there were no
  test users, no test profiles and no convoy or race runs, and nothing still running. It
  still needs a clean run, from the CLI.
- **Not merged to `main`, not deployed.** The live site still runs the old client, which
  is unaffected by the new schema (an extra column with a default, two new mission
  rows, and `complete_mission` refusing only the new crew courses).

Parked here because each SQL call from the cloud session needed the owner's approval.
The rest is for a local agent; see *Exact next step*.

## Open questions

- **The live SQL tests haven't completed against the new migrations** (see above).
- **A race hasn't been played to the finish in a browser** (see above).
- **Race tuning is the owner's call:** equal pay for every finisher (vs a winner's
  bonus), 3 mi, the course by the camp, four-truck line-ups that start the back row 9 m
  behind.
- **Not played over Supabase**, only over `?net=local`. Worth one real two-account run:
  gather, join, finish, and check both `mission_runs` rows.
- Feel is the owner's call: 4 mi reward, 14 m flags, the loop's route, whether the
  "gathering a convoy" toast reaching friends anywhere in the valley is welcome or noise.
- `leave` isn't sent when a tab is closed abruptly (no `pagehide`); the others drop that
  driver after 15 s of silence instead.

## Exact next step

Finish the deployment from the owner's machine, where the Supabase CLI is linked:

1. `git fetch origin && git checkout feat/convoy-mission && git pull`. If `origin/main`
   has moved past the merge commit, merge it in again and re-run the checks.
2. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
3. `supabase migration list` and `supabase db push --dry-run`: both migrations should
   show as applied remotely and nothing should be pending. Do not re-apply them.
4. Run the SQL tests against the linked project as `supabase/tests/README.md`
   describes; success reads `ALL CHECKS PASSED, rolling back`.
5. Fast-forward `main` to `feat/convoy-mission` and push it; check the Vercel
   `gilbyy-web` production deploy goes green and gilbyy.com serves it.
6. Update `CLAUDE.md` Status, `docs/roadmap.md` and `docs/architecture.md` to say it's
   merged and live, on `main`.

Then play one convoy and one race signed in from two Google accounts and confirm the
payouts persist and the race's results line is right.

## Tokens advisory

Parked mid-deployment at the owner's request (too many approvals for SQL from the cloud
session). The migrations are live; the live test run, the merge to `main` and the deploy
remain.
