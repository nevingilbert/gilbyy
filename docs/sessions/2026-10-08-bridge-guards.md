# 2026-10-08 — Bridge guards: trucks no longer fall through the railway bridges

## Topic

Trucks could drive along the rails onto a trestle bridge and seemed to fall through it.
They must stay off the bridges (the rivers are gated by the snorkel), and they shouldn't
fall through.

## Decisions made

- **What was actually happening.** Each bridge end (`track.bridges` in `terrain.ts`)
  sits where the river valley falls away at about 22°. Driving along the track bed, the
  truck just rolled down that slope under the deck, so it looked like it sank through.
  From the side, a truck could also drive in under the low ends of the deck (1.2–2.3 m of
  headroom) and clip through it. Trestle legs had no colliders, and the train's colliders
  shoved trucks passing under a bridge even though the train was 12–27 m overhead.
- **The owner's two ideas, and why neither was built.**
  - *"Not wide enough for a car but wide enough for the train"* can't work on width: a
    train car is 3.0–3.16 m wide and the rigs are 1.7–2.2 m.
  - *A gate that opens as the train approaches* can be tailgated. A truck following the
    train onto the bridge would then be stranded in front of the far gate until the next
    train came round (about 15 minutes) and hit it.
  - The owner said to use my own approach if I saw problems with theirs, so I did.
- **The discriminator is height, not width.** The train runs on rails and needs no
  deck, so a **trespass guard** (a real railway fixture) goes across each approach. It is
  rows of low square pyramids between and beside the rails, which the train rolls over.
  - In the physics it is a wall (`h: Infinity`), so even the Duneclaw on 37" crawlers
    (clearance 1.8 m) can't climb it.
  - Pyramids are 0.3 m tall between the rails, under the axles (0.38 m up). Outside the
    rails they are 0.4 m tall, apex at rail top + 0.25, under the loco's fuel tank
    (0.33 m), which is the train's lowest part.
  - Colour is `PALETTE.rail` (mid-dark grey). `doorDark` read too much like a spike strip
    for a calm game.
- **Concrete abutments fill the low ends.** From the bank, each abutment runs out until
  the deck underside is `HEADROOM` (4.5 m) above the highest ground across its width.
  Under the high middle of a trestle, trucks can still drive (and snorkel trucks ford the
  river), between solid legs. The four abutments come out at 12, 17.5, 13.5 and 32.5 m.
- **Posts with no-vehicles signs** (a red-ringed white disc, `barrierRed`/`barrierWhite`)
  stand either side at the head of each abutment. The guard alone is small from the chase
  camera; the signs make "you can't drive on this" obvious. No new palette entries.
- **Colliders live in pure code, so physics tests see them.** `bridgeObstacles(track,
  height)` in `track.ts` is added in `buildWorld()` (`world.ts`), the same way trees and
  rocks are, not in `railway.ts` like the crossing posts. It adds:
  - a row of five r=0.6 circles at the guard's near edge;
  - post circles;
  - two rows of r=1.3 circles filling each abutment;
  - r=0.3 circles on every trestle leg.
- **The train no longer shoves trucks under a bridge.** `trainObstacles(cars, height?)`
  leaves out circles where the rail is more than `HEADROOM` above the ground.
  `Game.tsx` passes `world.height`.
- **The deck now starts one track point (5 m) before each bridge.** Before this, the
  stretch just before a bridge had neither ballast nor deck. `ribbon()` in `railway.ts`
  now takes a per-segment predicate: ballast where neither end is bridged, deck where
  either is, guard rails where both are. The abutment starts under that stretch.

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/track.ts` | New: `DECK_UNDERSIDE`, `HEADROOM`, `ABUTMENT_HALF`, `GUARD_LENGTH`, `POST_SIDE`, `POST_SET`, `LEG_OFFSET`, `trackFrame`, `BridgeEnd`, `bridgeEnds`, `Leg`, `trestleLegs`, `bridgeObstacles`. `trainObstacles` takes an optional `height` |
| `apps/web/src/app/world.ts` | `buildWorld` adds `bridgeObstacles(terrain.track, ground)` |
| `apps/web/src/app/railway.ts` | `bridgeEnd()` draws the abutment, guard pyramids, posts and signs. Legs come from `trestleLegs`. `ribbon()` keep is per segment. Module-level `lambert` |
| `apps/web/src/app/Game.tsx` | `trainObstacles(view.trainCars(), world.height)` |
| `apps/web/src/app/systems.test.ts` | New `describe("the bridges")`, five tests, below. Shared `when(s)` helper |
| `CLAUDE.md`, `docs/architecture.md` | `track.ts` description mentions the bridges' solid parts |

The five tests drive the widest rig on 37" crawlers with a snorkel:

- every bridge has two abutments;
- driving along the rails, it stops before each guard;
- driving in from either side, it never gets under a deck with less than 3 m of
  headroom, and it does reach the abutment;
- every trestle leg is solid;
- the train overhead is not solid, while on level ground it is as solid as ever.

A control run without the new colliders went 50–90 m past each bank, which is the old
bug.

Verified: typecheck, lint, 78 vitest tests, `pnpm build`. In headless Chromium
(`?at=1736.3,1199.9,-0.702&hour=13`, then hold ArrowUp) the truck stops at the guard at
0 mph. I also looked at side and far-end views
(`?at=1743.4,1225.7,-2.276`, `?at=1604.6,-1337.2,-2.601&hour=9`).

Code commit: `2028d16 fix(railway): keep trucks off the bridges instead of falling
through` on branch `claude/friendly-newton-5j6ib5`. It is not merged to `main` and has
no PR.

## Open questions

- **Pre-existing, not fixed: `ribbon()` in `railway.ts` is wound inside-out.**
  - The top faces point down and the side faces inward, so from the chase camera the
    ballast strip and the timber bridge deck are culled. You see sleepers on bare ground,
    and the river through the bridge.
  - A temporary flip (top: `al, ar, bl, ar, br, bl`; left side: `alb, al, blb, al, bl,
    blb`; right side: `ar, arb, br, arb, brb, br`) made both appear, as the code
    intends. It was reverted because it changes the look of the whole railway.
  - An open-deck look arguably suits "trucks can't use this", so it's the owner's call.
    Over the abutments, the concrete cap shows between the sleepers for now.
- The train rolling over a guard hasn't been seen in a browser. The clearances were
  checked against `train-model.ts` by hand: the lowest parts are the loco fuel tank at
  0.325 m and the axles at 0.38 m.
- If a train arrives while a truck sits at a guard, the truck is squeezed between the
  train's circles and the guard's. Same behaviour as at level-crossing posts. Untested.
- Still open from 2026-10-07: `supabase/migrations/20261007200000_achievements.sql` is not
  applied to the live project `apqlumghzqkklmpwizex`. See
  `docs/sessions/2026-10-07-compass-mark-and-achievements.md`.

## Exact next step

Ask the owner whether to merge `claude/friendly-newton-5j6ib5` (commit `2028d16`) to
`main`, and whether they want the ballast and timber deck visible.

If they want them visible, in `apps/web/src/app/railway.ts` `ribbon()`, swap the
triangle order of all three `pos.push(...)` lines as listed under Open questions, so the
faces point out. Then check by headless screenshot at
`?at=1736.3,1199.9,-0.702&hour=13`:

- a grey ballast strip along the track;
- a brown deck on the bridges;
- no z-fighting between the deck and the abutment cap (cap top is at rail − 0.7, deck
  top at rail − 0.28).

If they prefer the open look, delete the ballast and deck ribbons instead, and keep the
abutments.

## Tokens advisory

Natural break: the fix is built, tested and committed. No token limit was hit.
