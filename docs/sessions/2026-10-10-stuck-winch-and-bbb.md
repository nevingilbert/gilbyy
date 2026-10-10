# 2026-10-10 — Getting stuck on a boulder, a winch for a friend, and BBB's tow truck

## Topic

Two days' work in one worktree, committed at the end of the second. On 2026-10-09: make it possible to be
truly stuck (rocks, not water) and sell a winch that pulls a friend off. On 2026-10-10:
bring that up to date with a `main` that had moved thirty commits, and add the third
way out the owner asked for, BBB, a tow truck you ring for miles. ADR
`docs/decisions/0021-stuck-and-the-winch.md`. This replaces the checkpoint
`2026-10-09-stuck-and-the-winch.md`, which was never committed.

## Decisions made

- **Nothing could trap a truck before this.** A stock truck dropped at 2,100 spots in
  the valley drove out of every one.
- **The rule: hung up on a boulder.** A boulder taller than the rig's `clearance` by up
  to `HANG` (0.5 m) is a wall at low speed. Hit nose first at `RAM` (8.94 m/s, 20 mph)
  or more, with its centre within half the track of the truck's centre line, and
  `collide()` in `physics.ts` sets `car.stuck` (`perchOn()`); `step()` then hands over
  to `perched()`. Never by reversing, never where the perch would be wet or through
  something solid.
- **Only boulders.** `main` gained fence posts and ramp boards with finite heights, which
  the first version would have treated as rocks (`ramp.test.ts` caught it). Rocks are
  now marked `boulder: true` on their `Obstacle` in `world.ts` and `island.ts`, and
  `collide()` asks for that.
- **Three ways out, the owner's list:** reload back to the tent; a friend's winch; or
  BBB. No others.
- **The winch** (`winch.ts`, `WINCHES` in `shop.ts`): 10 mi, a sixth loadout slot, drawn
  on the bumper. Stopped within `WINCH_REACH` (22 m) of a stuck truck, E hooks on; the
  stuck driver's own game does the pulling (`car.stuck.pull`). Anyone with a winch can
  pull anyone; friends are told and get the compass mark.
- **BBB** (`tow.ts`): 5 mi (`TOW_FEE`), taken by `call_tow()` through `Store.tow()`.
  `callTow()` in `Game.tsx` picks the nearest garage and plans the way in
  (`approachLine()`), then:
  - mode `calling`: `TOW_LEAVE` (4.4 s) of film, `towLeaving()`, watched from a fixed
    camera (`Shot`, the seventh argument of `view.render`), the garage door driven by
    `view.setDoor`, a caption under it;
  - phase `coming`: back on the stuck truck, the prompt reads "BBB is on its way · 0.14
    mi away" from `towAway()`. Nothing is driven: the distance closes at `TOW_SPEED`
    (22 m/s), clamped to 8–75 s by `towWait()`;
  - phase `here`: `towVisit()` places the truck along its line (in at 14 m/s, braking to
    a stop `TOW_STOP` 11 m short), `view.face()` turns the chase camera to watch, and on
    arrival `car.stuck.pull` is set with `pulledBy = BBB`. Once free it backs away and
    fades over `TOW_GONE` (5 s).
- **Other players see the same tow truck.** One broadcast, `tow {from, x, z, heading,
  length}`, as it comes into sight (`Net.tow`, `NetHandlers.towed`); each client runs
  `towVisit()` on it (`visits` in `Game.tsx`). The film of it leaving is the caller's
  alone.
- **The tow truck is placed, not driven.** `standTow()` sets height and tilt from the
  ground under four wheels. It can't get stuck. Where no clear line exists it appears
  where it pulls up.
- **Single player still can't get stuck** (`loose`, `hang: 0`). Mine, flagged twice, not
  answered.
- **Prices are mine:** winch 10 (was 5 before `main`'s prices went up five times), tow 5.
- **Worktree.** The owner asked for worktrees. Everything is in
  `.claude/worktrees/game-stuck-winch` on `feat/game-stuck-winch`, fast-forwarded to
  `origin/main` at `b27baeb` with the work re-applied on top. It sat uncommitted for two
  days and was committed and pushed on 2026-10-10 when the owner asked, with a pull
  request into `main`.
- **Renumbered, twice.** The ADR is 0021: 0015–0019 went to wildlife, the island's
  second pass, courses pay, honest crews, photo mode and more courses, and then 0020
  went to the tides while this was in review. The migration is
  `20261010200000_winch.sql`, after the sandbar's, which went live first.

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/physics.ts` | `Stuck`, `Car.stuck`, `CarSpec.hang`, `HANG`, `RAM`, `perchOn()`, `perched()`; only a `boulder` hangs a truck |
| `apps/web/src/app/world.ts`, `island.ts` | `Obstacle.boulder`, set on rocks |
| `apps/web/src/app/winch.ts` | **New.** Reach, who can winch, `cableEnds`, `stuckHelp` |
| `apps/web/src/app/tow.ts` | **New.** `TOW_FEE`, `TOW_SPEC`, `towWait`, `towAway`, `approachLine`, `towDrive`, `towBack`, `standTow`, `towVisit`, `towArrived`, `towLeaving`, `fmtAway` |
| `apps/web/src/app/stuck.test.ts`, `tow.test.ts` | **New.** 18 and 14 tests |
| `apps/web/src/app/shop.ts`, `store.ts` | Winch slot at 10 mi; `Store.tow()`; `equip()` omits an empty winch slot |
| `apps/web/src/app/net.ts` | Pose `stuck`/`hooked` (a tenth number); `winch` and `tow` broadcasts |
| `apps/web/src/app/remote.ts` | `stuck`/`hooked` in `positions()` and `tags()`; `truck(id)` |
| `apps/web/src/app/scene.ts` | `Rope`, `TowDrawn`, `Shot`; `drawTows`, `drawCables`, `setRopes`, `setTows`, `face`; `render(..., watch)` |
| `apps/web/src/app/car-model.ts`, `palette.ts` | The bumper winch; `buildTowTruck()` with its boom, lamp and fade |
| `apps/web/src/app/Game.tsx` | Mode `calling`; prompts `stuck` and `winch`; `callTow`, `towOn`, `winchOff`, `onStuck`, `onFree`, `tendRopes`; `?winch` |
| `apps/web/src/app/GarageMenu.tsx`, `map.ts` | Winch tab (tabs in four columns); a ring round a stuck player's dot |
| `apps/web/src/app/shop.test.ts`, `play.test.ts` | Crew-size check no longer assumes the newest migration; a pose literal |
| `supabase/migrations/20261010200000_winch.sql` | **New, not applied.** Winch rows, `equip()` with a sixth slot, `call_tow()` |
| `supabase/tests/game.test.sql`, `README.md` | Winch and tow checks |
| `docs/decisions/0021-stuck-and-the-winch.md` | **New.** |
| `CLAUDE.md`, `docs/architecture.md`, `art-direction.md`, `roadmap.md`, `vision.md` | Brought up to date |

Verified in the worktree: typecheck, lint, 278 vitest tests, `next build`. Played across
two `?net=local` tabs on 2026-10-10: stuck, the BBB prompt, the fee (20 to 15 mi), the
film, the countdown (0.20 down to 0.06 mi), the camera turning, the hook-up, the haul,
the truck backing off, and the second tab drawing the same tow truck. The friend's-winch
loop was played the same way on 2026-10-09, before the merge, and not again since.

## Open questions

- **The owner hasn't ruled on:** single player being exempt, strangers being able to
  winch, 20 mph, the winch at 10 mi and the tow at 5.
- **The SQL checks passed a dry run on the live project** on 2026-10-10, with the
  owner's go-ahead: `begin;`, the migration, every check, and a raise that rolled it all
  back (`supabase --workdir <shared checkout> db query --linked -f`, since the link
  lives in the shared checkout). Afterwards there was still no `winch:` row and no
  `call_tow()`. It was run again after `main` gained the sandbar's migration, and
  passed again.
- **The migration is on the live project** since 2026-10-10, when the owner said to
  apply it: run as one transaction with `supabase db query --linked -f`, recorded with
  `supabase migration repair --status applied 20261010200000 --linked`, and then every
  check run against the migrated project, which passed. The security advisors show
  `call_tow()` only where every other game function is listed (callable signed in, by
  design) and nothing new.
- **The live project has no `20261010090000_cartier_chains` in its migration list**,
  though its rows are there (`winter:cartier` is in `shop_items`): it was applied by
  hand and not recorded. `supabase db push` may want that sorted before it takes this
  one.
- **Not played signed in.** Untested over real Realtime: the `winch` and `tow`
  broadcasts, and the pose flags when many players stretch the pose interval.
- The tow pauses while the map is open (its clock runs only in the driving loop).
- It backs away further than its line was checked, so it may pass through a tree as it
  fades. From a garage close by, or in thick trees, it has little or no run-in.
- The winch model was raised 6 cm on 2026-10-09 and not looked at since. The map's ring
  round a stuck dot has never been looked at.
- No dust or sound. A stuck driver can't call a friend from further than 90 m.
- The preview tool starts the dev server from the shared checkout, not the worktree.
  To look at this work: `pnpm --dir .claude/worktrees/game-stuck-winch/apps/web exec
  next dev -p 3001`.

## Exact next step

Work in `.claude/worktrees/game-stuck-winch`: the changes exist only there.

This is pull request 21 into `main`, and its migration is on the live project. If it
hasn't merged, the merge is the owner's to click
(`gh pr merge 21 --repo nevingilbert/gilbyy --merge`). Once it's live: play it signed
in from two accounts (the dev account `Devin` has the miles): ram a boulder, ring BBB,
and have the other account buy a winch and pull the first off. Then ask the owner
which of the open choices to change.

To try it, two tabs of one browser on the worktree's dev server:

- `http://localhost:3001/?net=local&rig=bluff&miles=20&at=-982.9,-355.7,0`: hold the
  gas for five seconds, then press E to ring BBB.
- `http://localhost:3001/?net=local&rig=overlander&miles=20&winch&at=-957,-312,4.4`: a
  second truck beside the rock, with a winch, to press E instead.

## Tokens advisory

Natural break: built, tested, played, dry-run against the database, committed and in a
pull request. A long session over two days; the
merge with `main` was nine conflicted files and one real catch (posts and boards). No
token limit was hit.
