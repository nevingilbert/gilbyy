# 2026-10-09 — More courses, half of them for friends, a jump, and crews of ten

## Topic

Twelve new courses across both worlds, one of them a jump told for its time in the air,
as many courses for friends as to drive alone, and convoys and races for up to ten.
ADR `docs/decisions/0019-more-courses-and-crews-of-ten.md`.

## Decisions made

- **The owner's three asks, in his words:** "both worlds need more missions", "make one
  of the air time of a jump", and "make sure there is an even distribution on multiplayer
  missions and single player - also make it so multiplayer missions can take up to 10
  people".
- **"Even" was read as the totals in each world, not just the new ones** (my reading, not
  confirmed): the valley has 10 to drive alone and 10 for friends, the island 4 and 4.
  Of those for friends half are convoys and half races.
- **New in the valley:** Big Air (alone, the jump); Barn Round, Snowline, Trackside
  (convoys); Lakehead Race, Two Lakes Race, Flat Out (races). **New on the island:**
  Hilltop (alone); Coast Convoy, Tideline (convoys); Sand Race, Dune Derby (races).
- **The jump pays the same however long it was.** The air time is shown in place of the
  clock and in the finish line ("Big Air: 1.07 s in the air", plus your longest since
  the page loaded, kept in memory only). No bar to clear: a course still can't be
  failed. The server can't see a truck in the air, so it can't pay by air time.
- **The ramp is a function, not terrain** (`ramp.ts`): the height grid is 10 m.
  `World.height` adds its deck; `ramp-model.ts` builds boards from the same surface.
  It is 18 m long, 4 m high, 7 m wide, on a pad levelled in `buildWorld()`. Fence posts
  down the sides and boards under the lip are obstacles; `Obstacle.top` (new) lets a
  truck above the boards pass over. Sized by simulation: 1.1 s for a starter, 1.4 s for
  the Sandfly.
- **Nothing already in the valley moved.** `planMissions()` now returns only the first
  thirteen; `buildWorld()` then chooses the easter eggs and the airstrip from those, and
  `planMore()` lays out the new seven round all of it. `courses.test.ts` pins the old
  positions. (Trees do shift: one random stream.)
- **A course for friends needn't be a loop** (Trackside, Flat Out, Tideline aren't).
- **`CONVOY_MAX` is 10.** Line-up rows are 6.5 m apart (were 9), five rows. Past four in
  a crew, each truck broadcasts its flag count less often (`flagGap`, `countEvery` in
  `convoy.ts`) so ten through one flag stay under Realtime's 100 messages a second. The
  HUD names up to three others, then counts ("4 of 9 others through").
- **The too-quick limit is 27 m/s, was 23** (`TOO_QUICK`). Found by driving: the Sandfly
  (24.5 m/s) finished Beach Run in 45 s against a limit of 46 and would have been
  refused. A bug on `main` today, though nobody owns a Sandfly yet.
- **A course is paid only in its own world** (`missions.world`, checked in `pay_run()`).
  Not asked for; added because a valley client could claim island courses without the
  fare, which eight island courses makes worth doing.
- **Dropped:** a downhill race (no room for ten to line up on a summit) and a course
  fording a river back and forth (no free stretch of either river).

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/ramp.ts`, `ramp-model.ts`, `ramp.test.ts` | **New.** The ramp's shape, pad, fence and boards; its model; 8 tests |
| `apps/web/src/app/missions.ts` | `Mission.ramp`, `TOO_QUICK`, `bigAir`, `trackside`, `flatOut`, `crewLine`, `friendsLoop`, `FRIENDS_LOOPS`, `planMore`; `planMissions` returns the first thirteen; `courseDistOf(…, lineUps)` |
| `apps/web/src/app/island.ts` | Five more in `planCourses()`; `dry()` checks lines, not just flags; the summit kept bald |
| `apps/web/src/app/world.ts`, `physics.ts` | The new planning order, the ramp's pad, lift and obstacles; `Obstacle.top` |
| `apps/web/src/app/convoy.ts` | `CONVOY_MAX` 10, `LINE_UP_BACK`, `flagGap`, `countEvery`, longer silence for big crews |
| `apps/web/src/app/mission-run.ts` | `Run.aloft`/`air`, `tick(…, grounded)`, `fmtAir` |
| `apps/web/src/app/Game.tsx` | Air time in the run line and the finish; big crews in the run line, prompt and race result |
| `apps/web/src/app/scene.ts`, `terrain-mesh.ts`, `airport.ts` | The ramp placed; no grass through its boards; a comment |
| `apps/web/src/app/courses.test.ts`, `convoy.test.ts`, `airport.test.ts`, `play.test.ts`, `shop.test.ts` | New and changed tests (203 → 239) |
| `supabase/migrations/20261010120000_more_courses.sql` | **New, not applied.** `missions.world`, 28 rows, `pay_run()` and `complete_convoy()` replaced |
| `supabase/tests/game.test.sql` | Checks for ten drivers, the split, and courses in the wrong world. **Never run** |
| `docs/decisions/0019-…`, `0010`, `0011`, `CLAUDE.md`, `docs/architecture.md`, `roadmap.md`, `vision.md` | The ADR; the rest brought up to date |

Verified: lint, typecheck, 239 vitest tests, `pnpm build`. In the browser: a full run
of Big Air (1.07 s, paid 15 mi in single player), the ramp from the side, Hilltop's
corridor, and Dune Derby's prompt. Everything is in the worktree
`.claude/worktrees/more-missions` on branch `worktree-more-missions`, **uncommitted**.

## Open questions

- **The migration's SQL checks have not been run anywhere.** There is no Postgres or
  Docker on this machine. The edits to `game.test.sql` were reasoned through, not run.
- Whether "even" meant the totals (built) or only the new courses.
- Nothing for friends has been played with real accounts, and never with more than two
  trucks. Ten is tested only in `convoy.test.ts`.
- Lakehead Race passes 520 m from the hidden airstrip, on the near bank.
- Snowline is about a quarter on snow. A starter on road tyres gets round on autopilot.
- The phone-width canvas wasn't looked at: the Browser pane was hidden, so only the
  first frames drew. Only the run line's text changed there.
- The jump is for one. For friends it would need air times to travel with flag counts.

## Exact next step

Get the owner's go-ahead, then dry-run the migration against the live project as
`supabase/tests/README.md` describes: `begin;`, then
`supabase/migrations/20261010120000_more_courses.sql`, then `game.test.sql` without its
`\set` and last line, then a `raise` to roll back. Expect `ALL CHECKS PASSED`. If a
check fails, the likeliest are the ones added this session (search `game.test.sql` for
`two to ten`, `in another world`, `ten courses to drive alone`). Then commit on a
branch named `feat/game-more-courses`, open a pull request, apply the migration with
`supabase db push`, and merge.

## Tokens advisory

Long session; no token limit was hit. Stopped at a natural break: built, tested and
documented, waiting on the owner for the database and the merge.
