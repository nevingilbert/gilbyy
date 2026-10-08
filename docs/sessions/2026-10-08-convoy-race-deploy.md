# 2026-10-08 — The convoy and the race are merged and live

## Topic

Finished the deployment that `2026-10-07-convoy-mission.md` left parked: merged
`feat/convoy-mission` to `main`, ran the database tests against the live project, and
confirmed gilbyy.com serves the new client.

## Decisions made

- **`origin/main` was merged into `feat/convoy-mission` once more** (commit `327c77d`).
  Main had gained PR #2 (floating fences: `mission-models.ts`, `scene.ts`,
  `campground-model.ts`, `Game.tsx`) and the name-tag fix (`5e1cdbb`). It merged with no
  conflicts; only `Game.tsx` needed an automatic merge.
- **All four checks pass on the merged commit:** `pnpm typecheck`, `pnpm lint`,
  `pnpm test` (94 tests in 7 files) and `pnpm build`.
- **No migration was applied, re-run or edited.** `supabase migration list` shows all
  seven migrations, `20261007000000` through `20261007230000`, with matching local and
  remote versions, and `supabase db push --dry-run` reports "Remote database is up to
  date" with nothing to push. So the renamed `schema_migrations` rows from the cloud
  session line up with the files.
- **The live database tests pass.** `supabase/tests/game.test.sql`, wrapped as
  `supabase/tests/README.md` describes and run with `supabase db query --linked -f`,
  ended in `ALL CHECKS PASSED, rolling back` after about 1.5 s. The 60 s timeout the
  cloud session hit through the Supabase MCP did not happen from the CLI. Afterwards the
  live project had no test users (`auth.users`), test profiles or test `mission_runs`,
  no `convoy` or `race` runs at all, and `public.missions` has `convoy` and `race` at
  crew 2. The wrapped file was written to a scratch directory rather than `/tmp`; the
  command is otherwise the README's.
- **`main` was fast-forwarded to `327c77d` and both branches pushed, no force.**
  Vercel's production deployment of that commit for `gilbyy-web`
  (`dpl_3r7cmASM9bmYJR6aZ6VhfBQzhKPH`) went READY and is aliased to `gilbyy.com` and
  `www.gilbyy.com`.
- **gilbyy.com was checked by fetching it, not by playing it.** Before the deploy none
  of the page's seven script chunks contained the new client's text; afterwards the
  page's etag had changed, one chunk had been replaced, and that chunk contains
  "Convoy home together", "is gathering a" and "Race over". The page was not opened in
  a browser this session (the built-in browser's site permissions block gilbyy.com), so
  there was no look at the console or the canvas on the live site.
- **The docs now say it is merged and live** (commit `0298ff2` on `main`), and each
  says plainly that neither course has been played from two accounts over Supabase.

## Files changed

| Path | Change |
| --- | --- |
| `CLAUDE.md` | Status: the convoy and the race are merged and live since 2026-10-08, not yet played from two accounts |
| `docs/roadmap.md` | "You are here": merged and live; **Next** is one convoy and one race from two Google accounts |
| `docs/architecture.md` | Online setup: merged and deployed 2026-10-08 after the live database tests passed |
| `docs/sessions/2026-10-07-convoy-mission.md` | One line under the parked deployment pointing here |
| `docs/sessions/2026-10-08-convoy-race-deploy.md` | **Created**: this file |

No code changed this session beyond the merge itself.

## Open questions

- **Neither course has been played over Supabase.** Everything seen in a browser so far
  was over `?net=local`. The server side is covered by the SQL tests, but `complete_convoy`
  has never been called by the real client with a real friend's id.
- **A race has never been played to the finish in a browser**, even locally: joining,
  the line-up, the place display, the finish toast and the results line share the
  convoy's code but were not seen (see `2026-10-07-convoy-mission.md`).
- **The live site wasn't opened after the deploy**, only fetched (see above).
- Carried over, all the owner's call: race tuning (equal pay of 3 mi vs a winner's
  bonus, the course by the camp, four-truck line-ups starting the back row 9 m behind),
  the convoy's feel (4 mi, 14 m flags, the route, whether the "gathering a convoy" toast
  reaching friends anywhere in the valley is welcome).
- `leave` isn't sent when a tab closes abruptly; the others drop that driver after 15 s
  of silence.
- Real-device frame rate is still unmeasured.

## Exact next step

Play it by hand on https://gilbyy.com, signed in from two Google accounts in two
browsers (or one normal and one private window). The accounts must be friends; if they
aren't, meet at the café first.

1. **Convoy.** Both drive to the convoy arch, 116 m from the café at (-613, -89). One
   stops at the arch and presses E to gather; the other should get a toast and a compass
   mark, then presses E at the arch to join; the gatherer presses E to set off. Expect
   the two trucks lined up side by side behind the arch, a countdown with no rolling
   back, 15 gates, the first one through waiting with "through · … 14/15", and both
   getting "Convoy home together … +4.0 mi".
2. **Race.** Same at the race arch, at (-751, -326), about 175 m from the campground
   gate. Expect your place on the top line while racing, 3.0 mi for each finisher, and a
   results toast like "Race over: 1st you 1:32 · 2nd Ben 1:44" with the right order and
   times on both screens.
3. **Check the payouts persisted**: reload both browsers and confirm the miles are still
   there, then look at the rows (two per course, one per account, rewards 4.00 and 3.00):

   ```sh
   supabase db query --linked "select user_id, mission, seconds, reward, finished_at from public.mission_runs where mission in ('convoy','race') order by finished_at desc"
   ```

A second run of either course inside 10 minutes should pay nothing; after that the
convoy pays 1.2 mi and the race 1 mi.

If anything is off, the agreement between clients is `apps/web/src/app/convoy.ts`
(`Convoys`, `readConvoy`, `lineUp`), the prompts and toasts are in
`apps/web/src/app/Game.tsx` (`crewCourses`, `setOff`, `onConvoy`, `raceOver`), and the
payout is `complete_convoy` in `supabase/migrations/20261007210000_convoy.sql`. A fix to
the database goes in a new migration, never an edit to an applied one.

## Tokens advisory

Stopped at a natural break: the deployment is finished and what remains needs two people
(or two accounts) at the wheel.
