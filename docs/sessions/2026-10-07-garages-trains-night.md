# 2026-10-07 — Bigger valley, garages, train, day and night

## Topic

Second pass on the 3D game: a much bigger valley plus the owner's feature list. That
means a fog-of-war map, garages with tiered upgrades, rock-crawling tyres, a river that
needs the snorkel, day and night with headlights, and a train with level crossings.

## Decisions made

- **Miles unlock garage parts, and that is the only progression.** Tiers unlock at
  `TIER_MILES = [0, 1, 3, 6, 12]` (`upgrades.ts`). Unlocked parts are free and can be
  swapped any time. There are still no scores, timers or currencies. Recorded in
  `docs/decisions/0006-garages-and-quiet-progression.md`; `CLAUDE.md`'s "Don't" list
  is updated to match.
- **Persistence is `localStorage` only:** miles and loadout, under
  `gilbyy.progress.v1`. The read is defensive, and locked parts are dropped on load.
  The map's fog of war is in memory only, so it resets every visit, as the owner asked.
- **Buildings linking to other gilbyy.com pages are NOT built.** The owner floated them
  for later. They would reverse ADR 0004 and need their own ADR first.
- **Valley:** 4000 m square, 400 segments (10 m cells), the wall rising from
  `wallStart = 1450`, hard `limit = 1880`. Lakes are carved explicitly
  (`LAKES` in `terrain.ts`), not left to noise. The noise filled the big lake's middle
  and let the stock truck around the rivers.
- **Rivers:** `runRiver()` runs from beyond the limit, 60% toward lake 0 and 40%
  downhill. The water surface is forced monotonic. The channel is 2.2 m deep
  (`RIVER_DEPTH`), above `STOCK_WADE = 1.3` and below `SNORKEL_WADE = 2.6`.
  `flood()` marks `zone` 1 (stock-reachable) and 2 (snorkel-only); tests assert at
  least 1 km² of zone 2. Most of each river sits at lake level (surface 0), because the
  valley floor dips low near the rim.
- **Railway:** a loop at radius about 1300 m. Heights are smoothed and limited to a 2%
  grade. Earthworks have 0.4 side slopes, so you can always drive over the line.
  Bridges sit wherever the ground falls more than 2.2 m below the rails (two, over the
  rivers). There are four level crossings. Train timing is a pure function of time
  (`track.ts`). The train is a set of moving obstacles merged into `Ground` in
  `Game.tsx`.
- **Physics** takes `CarSpec { wade, grip, lift, clearance }` from the loadout:
  - Obstacles carry `h`. Rocks with `h <= clearance` become bumps under the wheels
    (`bump()` in `physics.ts`); taller rocks block.
  - Grip only helps on climbs.
- **Day/night:** ~15.4-minute day (`DAY_LENGTH`). Day hours last 50 s and night hours
  25 s. The clock opens at 16:00. Sky keyframes live in `PALETTE.sky`. The car has two
  spotlights (low and high beam), set by the light tier.
- **Garages:** six sites, four in zone 1 and two (bunker and cabin) in zone 2. Entering
  is scripted: the door opens, the truck drives in (or sinks into the bunker), then a
  fade. The interior is a separate small scene (`showroom.ts`). Leaving reverses the
  truck out, so the chase camera stays outside.
- **Screenshot-only URL params** in `Game.tsx`: `?hour=22`, `?garage=N`,
  `?at=x,z,heading`. Nothing links to them.

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/terrain.ts` | **Created**: grid fields, lakes, railway earthworks, rivers, bridges, crossings, zone flood fill, garage sites |
| `apps/web/src/app/world.ts` | **Rewritten** on top of terrain.ts; `Obstacle.h`; `Ground.waterAt`; `addObstacles` |
| `apps/web/src/app/physics.ts` | `CarSpec`, `STOCK`, rock bumps, water field, `distance` odometer |
| `apps/web/src/app/upgrades.ts` | **Created**: catalogue, tiers, `specFor`, `loadProgress`/`saveProgress` |
| `apps/web/src/app/track.ts` | **Created**: `trainCars`, `trainObstacles`, `crossingClosed` |
| `apps/web/src/app/daylight.ts` | **Created**: `hourAt`, `secondsUntil`, `skyAt` |
| `apps/web/src/app/terrain-mesh.ts` | **Created** (moved from scene.ts): chunked terrain, water mesh with ripple, grass |
| `apps/web/src/app/scenery.ts` | **Created** (moved from scene.ts): trees, bushes, rocks, `tiled()` |
| `apps/web/src/app/sky.ts` | **Created**: sky dome with moon and stars; `apply()` drives fog and lights |
| `apps/web/src/app/railway.ts` | **Created**: rails, sleepers, ballast, trestles, roads, crossings, train |
| `apps/web/src/app/map.ts` | **Created**: topo map, fog of war, minimap and full map |
| `apps/web/src/app/showroom.ts`, `GarageMenu.tsx` | **Created**: garage interior and upgrade menu |
| `apps/web/src/app/garages.ts`, `train-model.ts`, `crossing-model.ts` | **Created** by a helper agent to a spec: six garage styles with doors, four rail vehicles, crossing barriers |
| `apps/web/src/app/car-model.ts` | Loadout: paint, tyre sets with lugs, fog lamps, light bar, ditch lights, snorkel, two spotlights; `park()` |
| `apps/web/src/app/scene.ts` | **Rewritten** as the assembler: day/night, garages, railway, showroom |
| `apps/web/src/app/Game.tsx` | **Rewritten**: modes (drive, entering, garage, leaving, map), minimap, odometer, prompts, toasts |
| `apps/web/src/app/palette.ts` | Sky keyframes, paints, buildings, railway, map, dirt |
| `apps/web/src/app/*.test.ts` | world.test.ts and physics.test.ts updated; systems.test.ts new. 40 tests in total |
| `docs/decisions/0006-...md` | **Created** |
| `CLAUDE.md`, `docs/{vision,art-direction,architecture,roadmap}.md` | Updated for all of the above |

Verified:
- `pnpm typecheck`, `lint`, `test` (40) and `build` all pass.
- Headless screenshots: each garage, driving into the barn and the bunker, the interior
  with a paint change, reversing out, night with stock lights versus the full rig,
  noon, dusk, the map, the train at a crossing with the barrier down, the river, and
  the phone layout.
- A 300 s physics soak on stock and on crawler tyres with the snorkel: no NaNs, tilt at
  most 40°, the stock truck never deeper than 1.3 m, the snorkel truck reached 2.4 m.

## Open questions

- **Frame rate on real devices is unknown, and the scene is much heavier**:
  - 64 terrain chunks;
  - ~14k trees, 6.5k bushes and 4.2k rocks in tiles;
  - 8.3k sleepers;
  - 3 spotlights.

  Nothing has been timed on a GPU.
- Night is a warm dark brown rather than blue. Is that the right mood?
- Is the river too wide? It reads as a broad lake arm, because most of it sits at lake
  level.
- Tier pacing (1/3/6/12 miles) is a guess. 12 miles is roughly 30 minutes of driving.

## Exact next step

Drive the preview on a phone and a laptop:
`https://gilbyy-web-git-feat-game-3d-nevin-gilbert-s-projects.vercel.app`. Note the frame
rate in the open and in a forest.

If a phone struggles, first try these, in this order:
1. Cap the pixel ratio lower on touch devices (`renderer.setPixelRatio` in `scene.ts`).
2. Shrink `RADIUS` in `buildGrass` (`terrain-mesh.ts`).
3. Halve tree density (`forest * 0.7` in `world.ts`).
4. Drop the shadow map to 1024 (`scene.ts`).

## Tokens advisory

Natural break: everything asked for is built and verified by screenshot. No token limit was hit.
