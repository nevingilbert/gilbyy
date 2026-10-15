# 2026-10-15 — San Francisco and the train

## Topic

A station in the valley where the train stops, and a train trip through a tunnel to a
third world, San Francisco, built from real map data (ADR 0022). The first of three new
worlds the owner asked for; Vegas (by boat from the island) and Japan (by helicopter
from Vegas) are still to do.

## Decisions made

- **SF from public data, baked.** TIGER/Line 2024 roads and area water for San Francisco
  County (Census Bureau) and a USGS 3DEP elevation grid, both public domain, approved by
  the owner to download. `apps/web/scripts/bake-city.mjs` (Node only) writes
  `city-data.ts` (~415 KB), fetched with `import()` only when the city is wanted.
  Re-run: `node apps/web/scripts/bake-city.mjs <dem.tif> <roads.shp> <roads.dbf>
  <water.shp> <water.dbf> apps/web/src/app/city-data.ts`. The inputs were in the
  session scratchpad; they're the three files named in ADR 0022.
- **Scale 1:2.5 across, 1:1.7 up** (`CITY_FRAME`, `VSCALE`), so the whole city fits the
  6 km grid with streets at truck size; a square edge at ±2880 (`Ground.square`).
- **Alleys by name.** Names ending Aly, Ct, Pl, Ln, Ter, Row, Plz, Mall are alleys
  (6 m, no pavement); Stairway, Steps, Path, Pathway, Trl, Walk are dropped.
- **The valley's train stops** a minute a lap at `VALLEY_STOP` (`trainMotion`,
  `atStation`, `DWELL` in `track.ts`); the branch leaves past the platform, cuts through
  a foothill and goes in at the mountains: the portal is where the hill stands 9 m over
  the rails *and stays so* (`station.ts`), then `mouthAt` (rail.ts) moves it back to
  where the dug floor ends so its face stands on the level.
- **Cuttings on a 10 m grid**: `BED` (7.5 m half-width, 0.55 under the rail tops),
  `besideBed` (walls at 1.4), and `clearBed`, which lowers whichever corner of the
  ground's triangle still pokes over the bed under each metre of the line. Nothing is
  cut past a tunnel's face (`pastEnd`). Applied to the valley's branch too.
- **The city's line runs east of Pennsylvania Avenue** (the real alignment, off the
  street grid), not down Mississippi St, so no street runs into the cutting; the
  tunnel's mouth is just north of 18th St.
- **Platforms stop short of the flat wagon** at both ends (`WAGON_ROOM`), so the
  truck's path round behind it to the ramp never crosses the platform. The valley's
  yard is levelled from the train's length, not the platform's.
- **Films**: the truck's path is paced by distance (`along` in `rail-trip.ts`); every
  film camera is lifted 1.5 m clear of the ground (`clear`); the city's braking shot is
  across the track from the platform. `OUT` is now load 0.3–5.6, ramp up 5.7–6.6,
  roll 7; `outEnd` 22 (city) / 28.5 (valley). A dark curtain inside each tunnel mouth.
- **Routes table**: `public.routes` and `ROUTES` in `worlds.ts`; `fly()` refuses a trip
  nothing makes. Fares stay per destination (city 150).
- **Robotaxi**: 200 mi, `only: "city"`, wade 0.95 (the island's sandbar must be wadeable
  by every rig, `courses.test.ts`), a roof scanner that turns (`BodyParts.spinner`).
- **Look**: city haze is 0.32 of the valley's and the camera's far plane 3800 there
  (`CITY_AIR`, `CITY_FAR` in `scene.ts`); buildings ≥ 20 m tall are one always-drawn
  skyline set; Monterey cypress and blue gum (`TreeKind`s) instead of autumn trees; a
  deep seabed plane beyond the grid; a dithered see-through cone round the truck.
- **SF pieces**: Lombard's crooked block is a brick mesh lane (8 hairpins, flower beds,
  `buildCrookedLane`), the street shader leaves that block unpainted; Painted Ladies
  face west across Alamo Square from Steiner's east side (they were turned 90° and in
  the street); City Hall's dome and lantern re-proportioned; a barrier closes the Bay
  Bridge at the world's edge; garages stand on paved aprons.
- **Cable cars** (`cable-car.ts`, `cable-car-model.ts`): 4 cars on the Powell–Hyde line,
  a pure timetable, right-hand lanes coming in to the middle on the turntables, solid
  to trucks via `cableObstacles` in `moving`.
- **Fog** (`buildFogBank`, `fogAt` in `city-model.ts`): soft lit puffs off Ocean Beach
  and through the Gate, in from 15:00, full 18:00–08:00, gone 11:00–15:00.
- **Animals**: bison (Golden Gate Park paddock), sea lions (in the water off Pier 39),
  pelicans (over the water near the shore), parrots (over Telegraph Hill, cruise 13 m),
  with `HOMES` sampling discs; `soarAt` flies over the water surface, not the seabed.
- **Photo mode** in the city only culls buildings (`town.cull`), so cars and sails don't
  jump to time 0.
- **Debug spots** (`?at=`, `?station`, `?garage=`, `?airport`) now also work after the
  city loads (`placeAsAsked`).

## Files changed

- New: `city.ts`, `city-streets.ts`, `city-places.ts`, `city-buildings.ts`,
  `city-bridges.ts`, `city-data.ts` (generated), `city-model.ts`, `city-landmarks.ts`,
  `cable-car.ts`, `cable-car-model.ts`, `rail.ts`, `station.ts`, `rail-trip.ts`,
  `station-model.ts`, `city.test.ts`, `station.test.ts`, `apps/web/scripts/bake-city.mjs`,
  `supabase/migrations/20261015120000_city_and_train.sql`,
  `docs/decisions/0022-san-francisco-and-the-train.md`, this file.
- Changed: `Game.tsx` (trips by way, boarding the train, waiting for it, city loading,
  `placeAsAsked`, cable car obstacles), `scene.ts` (stations, the film's train, the city
  stage, view distance and air, fog and cable cars, photo-mode cull), `world.ts` (the
  valley's station, branch earthworks, `TreeKind`s), `track.ts` (timetable),
  `terrain.ts`, `terrain-mesh.ts` (street shader, crooked block, deep seabed, city
  surfaces), `scenery.ts` (cypress, blue gum), `wildlife.ts`, `animal-models.ts`,
  `vehicles.ts`, `vehicle-models.ts`, `car-model.ts`, `palette.ts`, `places.ts`,
  `worlds.ts`, `store.ts`, `map.ts`, `Panels.tsx`, `garages.ts`, `showroom.ts`,
  `coffee-shop-model.ts`, `railway.ts`, `train-model.ts`, `physics.ts`, `island.ts`;
  tests `flight`, `places`, `shop`, `systems`, `airport`, `wildlife`;
  `supabase/tests/game.test.sql`; `CLAUDE.md`, `docs/architecture.md`,
  `docs/art-direction.md`, `docs/roadmap.md`.

## Open questions

- Done later the same day, with the owner's yes: the rolled-back dry run passed, the
  migration was applied (`db query`, then `migration repair --status applied
  20261015120000`), and every check passes against the live project.
- Real-device frame rate in the city is unmeasured; it's the heaviest world to draw.
- Not built: Marin's roads past the bridge, the hills south of the county line, the Bay
  Bridge's ramps to Treasure Island, Saints Peter and Paul on Washington Square.
- Telegraph Hill reads as a lot of asphalt: small steep blocks get no buildings.

## Exact next step

Start Vegas, on a branch from this one: a boat dock on the island (`island.ts`), a car
ferry film like `flight.ts`/`rail-trip.ts` (`Way` gets `"boat"`, a `public.routes` row
island↔vegas), and a new `vegas.ts` world. Pull request 24 can be merged whenever the
owner likes: its migration is already on the live project.

## Tokens advisory

Long session across two contexts; stopped at a natural break with everything green
(typecheck, lint, 318 tests, build).
