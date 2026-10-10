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
- **A course is paid only in its own world**, but that is not this change's doing. I had
  written it into this migration; the same night another session's `honest_crews`
  migration (pull request 15, ADR `0018-honest-crews.md`) put `missions.world` and the
  check on the live project. This migration was rebuilt on top of it: it adds the rows,
  lowers `min_seconds`, and replaces only `complete_convoy()`.
- **This is ADR 0019**, not 0018: photo mode (pull request 14) took 0018 on `main` while
  this was being built. Honest crews is also numbered 0018; that was left alone.
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
| `supabase/migrations/20261010120000_more_courses.sql` | **New, not applied.** 28 rows with their worlds and new `min_seconds`; `complete_convoy()` for up to nine others |
| `supabase/tests/game.test.sql` | Checks for ten drivers and the split, on top of honest crews' checks. Passed a rolled-back dry run on the live project |
| `docs/decisions/0019-…`, `0010`, `0011`, `CLAUDE.md`, `docs/architecture.md`, `roadmap.md`, `vision.md` | The ADR; the rest brought up to date |

Verified: lint, typecheck, 245 vitest tests (with photo mode's), `pnpm build`. In the
browser: a full run of Big Air (1.07 s, paid 15 mi in single player), the ramp from the
side, Hilltop's corridor, and Dune Derby's prompt. On 2026-10-10 the migration and every
check in `game.test.sql` passed a dry run against the live project, in one transaction
that rolled back and left nothing. It is pull request 16
(https://github.com/nevingilbert/gilbyy/pull/16), branch `feat/game-more-courses`, in
the worktree `.claude/worktrees/more-missions`, with `main` (photo mode and honest
crews) merged in.

## Open questions

- **The migration is not applied and the pull request is not merged.** Changing the
  live database was refused to the session by the app's permission check, so it is the
  owner's to run or allow. Merging first would put twelve courses on the live site that
  finish with "no such mission".
- Whether "even" meant the totals (built) or only the new courses.
- Nothing for friends has been played with real accounts, and never with more than two
  trucks. Ten is tested only in `convoy.test.ts`.
- Lakehead Race passes 520 m from the hidden airstrip, on the near bank.
- Snowline is about a quarter on snow. A starter on road tyres gets round on autopilot.
- The phone-width canvas wasn't looked at: the Browser pane was hidden, so only the
  first frames drew. Only the run line's text changed there.
- The jump is for one. For friends it would need air times to travel with flag counts.

## Exact next step

Apply the migration, then merge pull request 16. From the repo root, linked to the
`gilbyy` project: the live migration history records honest crews as version `20261010065902` while its file is `20261010080000` (the text is identical; checked
by hash). So, in order:

1. `supabase migration repair --status reverted 20261010065902 --linked`
2. `supabase migration repair --status applied 20261010080000 --linked`
3. `supabase db push --linked --dry-run`, which should list only
   `20261010120000_more_courses.sql`, then `supabase db push --linked`
4. Check: `select count(*) from public.missions` is 28.
5. Merge pull request 16; Vercel deploys `main`. Then change the "not merged" lines in
   `CLAUDE.md` and `docs/roadmap.md` to say it is live.

## Tokens advisory

Long session; no token limit was hit. Stopped where the session's permissions end:
built, tested, dry-run and in a pull request, waiting on the live database.
