# 2026-10-09 — An airstrip hidden over the river, and an island to fly to

## Topic

A hidden airstrip in the valley, a 300-mile flight (a film of the truck being loaded,
flown and unloaded) to a second world, an island of beach, dunes and jungle with its own
camp, airstrip, garage and rig. ADR `docs/decisions/0014-airports-and-the-island.md`.

## Decisions made

- **One island with three rings, not three worlds.** Asked mid-session whether the
  beach, dunes and jungle were three separate worlds, the owner confirmed one island:
  sea, then beach, then dunes, then jungle in the middle.
- **The fare stays 300 miles each way.** The owner was shown that the dearest rig is
  55 mi, the best balance on the live server was 17.8 mi and the most anyone had ever
  earned was 127.6 mi, and kept 300. It is `WORLDS` in `worlds.ts` and the rows of
  `public.worlds`.
- **More garages and courses on the island are a second pass** (the owner's words). For
  now it has one garage and no courses.
- **A world is the same `World` shape on the same grid.** `buildWorld()` is the valley,
  `buildIsland()` (`island.ts`) the island, `buildWorldOf(id)` either. `World` gained
  `id`, `start`, `pitches`, `camp`, `airport`, `sea` and `mapSpan`, and code that read
  `START`, `campPitches()` or `CAMP` now reads those. Only one world is built at a time.
- **`scene.ts` has a stage per world.** `stageFor(world)` holds the ground, scatter,
  buildings and other players' trucks; `setWorld()` takes one down and puts up another.
  `garages`, `cafe` (null on the island), `landmarks` and `remotes` are getters.
- **Airstrips are in field space** (`airport.ts`): origin at the threshold, +z down the
  runway. `findField()` scores sites; `valleyAirfield()` allows only snorkel-only ground
  420 m from the garages over there and prefers a hollow with its open end toward the
  mountains. It lands at threshold (1240, −280), heading 150°. It is placed after
  everything else in `buildWorld()`, so nothing else in the valley moved (all 111 older
  tests still pass). `levelField()`, `raiseBank()` and `screenTrees()` hide it.
- **The island** (`makeIsland()`): waterline about 1500 m out, jungle inside about
  860 m on a hill to ~120 m. Thirty pitches in a row on the WSW beach facing the sea
  (`layCamp()` picks the straightest stretch), airstrip on the east coast at (1386,
  −244), the shack at (−385, 1344). Palms and `canopy` trees are new `TreeKind`s.
- **The flight is a film** (`flight.ts`): `departure(a, from, t)` and `arrival(a, t)`
  return a `Frame` (plane pose, ramp, wheels, truck, camera, cloud). `Game.tsx` runs it
  in mode `flying` (`flyOn()`), calls `enterWorld()` when the way out ends in cloud, and
  `arrive()` hands the truck back. `PLANE` in `flight.ts` is shared with
  `plane-model.ts`. On tall screens `wide` shots stand further back.
- **Boarding asks first.** E on the apron behind the tail opens `FlightCard`
  (`Panels.tsx`); `actions.fly()` banks miles, calls `store.fly(to)`, leaves the
  world's channel and starts the film.
- **Server side** (`supabase/migrations/20261009180000_island.sql`): `worlds`,
  `profiles.world`, `fly()`, `private.flight_log`; `shop_items.world` with `buy()`
  checking it; `fog` keyed by (id, world) with `explore(p_cells, p_world)` and
  `explored(p_world)`; `is_in_world()` and two policies so only players on the island
  use `world:island`. Old pages keep working (defaults), and the code can ship first:
  `fly` then answers "the plane isn't flying yet".
- **The Sandfly** (`vehicles.ts`, `only: "island"`, 30 mi) is listed in `GarageMenu`
  only on the island or once owned. Its factory colour `coral` is not for sale.
- **Not counted, not guided.** The island's garage and both airstrips show on the map
  where the fog has cleared (`seenSites`, `seenAirport` in `map.ts`) and are not
  "places". Guidance and the found line are shown only in the valley.
- **A hint in `localStorage`** (`gilbyy:world`) says which world to build first for a
  signed-in player; `boot()` swaps if the profile disagrees.
- **Database checks were a dry run on the live project**, with the owner's go-ahead:
  `begin;` + the migration + `game.test.sql`, rolled back by the final raise. All 112
  checks passed and the project was confirmed unchanged afterwards. The owner chose
  **not to apply the migration yet**.

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/worlds.ts` | **New.** `WORLDS` (names, fares), `flightFrom`, `isWorld` |
| `apps/web/src/app/airport.ts` | **New.** Field space, `findField`, `valleyAirfield`, `levelField`, `raiseBank`, `screenTrees`, `inFunnel` |
| `apps/web/src/app/island.ts` | **New.** `makeIsland`, `buildIsland`, `islandFire`, `buildWorldOf` |
| `apps/web/src/app/flight.ts` | **New.** `PLANE`, `departure`, `arrival`, `deckAt`, `rideOnDeck`, `boardSpot`, `leaveSpot`, `planeObstacles` |
| `apps/web/src/app/airport-model.ts`, `plane-model.ts` | **New.** Runway, lights, terminal; the jet, its ramp and wheels |
| `apps/web/src/app/airport.test.ts`, `flight.test.ts` | **New.** 22 and 28 tests: both airstrips, the island, the film against both real worlds, fares and island-only goods against the migration |
| `apps/web/src/app/terrain.ts`, `world.ts` | `WorldId`, `Pitch.rot`, `shack` style, exported `flood`; `World` fields, `obstacleIndex`, `reshape`, the valley's airstrip step |
| `apps/web/src/app/scene.ts` | Stage per world, `setWorld`, `Film`, the plane and clouds, `haze()` |
| `apps/web/src/app/Game.tsx` | `enterWorld`, mode `flying`, `flyOn`, `arrive`, the flight prompt, `?world=` and `?airport` |
| `apps/web/src/app/store.ts`, `net.ts`, `shop.ts`, `vehicles.ts` | `Profile.world`, `fly()`, fog per world; `worldTopic`; `soldOnlyIn`; the Sandfly |
| `apps/web/src/app/map.ts`, `remote.ts` | The map of whichever world; runway on the sheet; pitches from the world |
| `apps/web/src/app/terrain-mesh.ts`, `scenery.ts`, `palette.ts` | Island surfaces, the sea as one sheet, marram; palms, canopy trees, clouds; island, airstrip and jet colours |
| `apps/web/src/app/garages.ts`, `showroom.ts`, `vehicle-models.ts`, `campground-model.ts` | The shack; its showroom; the Sandfly body; sand pads for beach pitches |
| `apps/web/src/app/Panels.tsx`, `GarageMenu.tsx`, `fog.test.ts` | `FlightCard`; island-only rig filter; fog sizes checked in the new migration too |
| `supabase/migrations/20261009180000_island.sql` | **New.** As above. Not applied |
| `supabase/tests/game.test.sql`, `README.md` | Island checks and `pg_temp.refused`; how to dry-run an unapplied migration |
| `docs/decisions/0014-airports-and-the-island.md` | **New.** The ADR |
| `CLAUDE.md`, `docs/architecture.md`, `art-direction.md`, `roadmap.md`, `vision.md` | Brought up to date |

Verified: typecheck, lint, 162 vitest tests, `pnpm build`. In the browser, both flights
end to end by day and at night, at 1280×800 and 375×812, the Sandfly in the shack's
showroom, the island's full map, and `?net=local&world=island` taking a tent. Committed
on `feat/game-airport-island` with a pull request into `main`; not merged.

## Open questions

- **Nobody can afford the flight yet**, the owner included. If the island should be
  seen sooner, the fare is one number in two places.
- **Nothing signed-in has been played.** Untested with a real account: `profiles.world`
  surviving a reload, the tent on the island's beach, the `world:island` policy under
  real Realtime, the `gilbyy:world` hint, fog saved per world.
- **Frame rate on real devices** with the island is unmeasured, like the valley's.
- The film can't be skipped, makes no sound, and other players don't see it.
- During the landing shot, grass is laid round the truck's last spot, not the runway.
- `game.test.sql` finds its test players with `like '%a'`. On 2026-10-09 no real
  profile's id ended in `a`; if one ever does, the live dry run breaks. Exact ids would
  fix it.
- Touch buttons stay tappable under `FlightCard`, as they already did under
  `LandmarkCard`.

## Exact next step

Ask the owner whether the pull request from `feat/game-airport-island` is ready to
merge. If so: apply `supabase/migrations/20261009180000_island.sql` to project `gilbyy`
(`apqlumghzqkklmpwizex`) first, run the advisors, merge, then fly once signed in.

After that, the second pass the owner asked for, in `apps/web/src/app/island.ts`:

1. **More garages.** `sites` is `[shack]`. Either add styles to `SiteStyle` and
   `garages.ts`, or allow several shacks (the island's map marks sites, not styles, so
   duplicates draw fine; `GARAGE_NAMES` is per style).
2. **Courses.** `missions` is `[]` and `planMissions()` in `missions.ts` is written for
   the valley. Write an island planner (a beach run, a dune course, a jungle loop), add
   rows to `public.missions` in a new migration with `min_seconds` from the course
   lengths, and make `shop.test.ts` compare both worlds' missions with the server's.

## Tokens advisory

Natural break: built, tested, dry-run against the database, committed and opened as a
pull request. Long session; no token limit was hit.
