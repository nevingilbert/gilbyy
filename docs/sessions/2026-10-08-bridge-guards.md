# 2026-10-08 — Bridge guards: trucks no longer fall through the railway bridges

## Topic

Trucks could drive along the rails onto a trestle bridge and seemed to fall through it.
They must stay off the bridges (the rivers are gated by the snorkel), and they shouldn't
fall through. A second task in the same session fixed the inside-out railway geometry
found along the way.

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
- **The railway's strips were inside-out, and are now fixed (second task, owner asked
  for it).**
  - `ribbon()` (ballast, rails, deck, bridge guard rails) and the road strips in
    `buildRoads()` had every top facing down, so three.js culled them from above. You saw
    sleepers on bare ground, the river through the bridges, and no dirt roads at the camp
    or the crossings at all. Nobody had relied on that.
  - The winding is flipped. `ribbon()` also gained a bottom face: three.js draws *back*
    faces into the shadow map, so without one the fixed deck would stop casting its
    shadow, and it would look see-through from under a bridge.
  - The guard pyramids now stand on the deck (rail − 0.28) instead of on the sleepers,
    which left them floating over the gaps. They are taller (0.43 and 0.53 m) so their
    peaks stay where they were, and the train still clears them.
  - `apps/web/src/app/railway.test.ts` checks that the strips face up. It fails on the
    old winding.

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/track.ts` | New: `DECK_UNDERSIDE`, `HEADROOM`, `ABUTMENT_HALF`, `GUARD_LENGTH`, `POST_SIDE`, `POST_SET`, `LEG_OFFSET`, `trackFrame`, `BridgeEnd`, `bridgeEnds`, `Leg`, `trestleLegs`, `bridgeObstacles`. `trainObstacles` takes an optional `height` |
| `apps/web/src/app/world.ts` | `buildWorld` adds `bridgeObstacles(terrain.track, ground)` |
| `apps/web/src/app/railway.ts` | `bridgeEnd()` draws the abutment, guard pyramids, posts and signs. Legs come from `trestleLegs`. `ribbon()` keep is per segment. Module-level `lambert` |
| `apps/web/src/app/Game.tsx` | `trainObstacles(view.trainCars(), world.height)` |
| `apps/web/src/app/systems.test.ts` | New `describe("the bridges")`, five tests, below. Shared `when(s)` helper |
| `CLAUDE.md`, `docs/architecture.md` | `track.ts` description mentions the bridges' solid parts |
| `apps/web/src/app/railway.ts` (2nd task) | `ribbon()` and `buildRoads()` wound outward; `ribbon()` closed with a bottom; pyramids stand on the deck |
| `apps/web/src/app/railway.test.ts` | **Created**: the hand-built strips face up |

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

Commits on branch `claude/friendly-newton-5j6ib5`, none merged to `main` and no PR:

- `2028d16 fix(railway): keep trucks off the bridges instead of falling through`;
- `44607c6`, a merge of `origin/main` (convoy and race). The only conflict was the
  `CLAUDE.md` layout list, and both sides were kept;
- `1d4bce0 fix(railway): face the ballast, deck and dirt roads outward`.

After the second task: typecheck, lint, 100 vitest tests, `pnpm build`. Headless
before/after screenshots show a grey ballast strip, a brown deck, and dirt roads at the
camp (default spawn) and at the crossing at `?at=-412.8,2077.4,-3.135&hour=13`. The
deck's shadow shows on the slope at `?at=1743.4,1225.7,-2.276&hour=13`.

## Open questions

- **Grass grows on the crossing roads in places**, now that the roads are visible. The
  grass in `terrain-mesh.ts` skips `sampleGrid(world.roadDist, …) < 3.5`, but a distance
  field interpolated over 10 m cells overestimates near a road that runs diagonally
  across them. It reads as a grassy two-track, so it was left alone. A real fix would
  measure the exact distance to the nearby road segments (the crossing roads aren't in
  `world.roads`; `buildRoads()` derives them from `track.crossings`).
- The train rolling over a guard hasn't been seen in a browser. The clearances were
  checked against `train-model.ts` by hand: the lowest parts are the loco fuel tank at
  0.325 m and the axles at 0.38 m.
- If a train arrives while a truck sits at a guard, the truck is squeezed between the
  train's circles and the guard's. Same behaviour as at level-crossing posts. Untested.

## Exact next step

Ask the owner whether to open a PR from `claude/friendly-newton-5j6ib5` to `main` (the
bridge guards plus the visible ballast, deck and roads). Once merged, play it on
gilbyy.com and check three things:

1. Drive along the rails to a bridge and stop at the guard.
2. Watch the train roll over a guard. This hasn't been seen yet.
3. Look at the new grey ballast strip and the dirt roads at the camp on a real screen.

## Tokens advisory

Natural break: both fixes are built, tested, committed and pushed. No token limit was
hit.
