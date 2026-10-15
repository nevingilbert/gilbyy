# 2026-10-15 — Las Vegas and the Grand Canyon, and the ferry

## Topic

The second of the three worlds the owner asked for (ADR 0023): a dock on the island and a
car ferry from it to Las Vegas and the Grand Canyon, with an F1 car and an F1 race round
the city, garages, a café and courses. Japan, by helicopter from Vegas, is next.

## Decisions made

- **One world for the Strip and the canyon**, drawn, not from a map (`vegas.ts`): a basin
  ringed by mountains, the Strip at x = −250 from the Welcome sign (z ≈ 1010) to the tower
  (z ≈ −1010) and downtown on Fremont Street (z = −1450); Lake Mead in the north-east; Red
  Rock's stepped mesas in the west; the rise to the plateau in long steps any rig can climb
  (risers under 30°); the canyon from a slot in the south-east mountains (so its head
  hides the world's edge) to the lake, terraced river → beaches → inner gorge → bench with
  temples → red cliff → slopes → rim, coloured by height. One side canyon from the rim
  village (the trading post, the lookout) falls the whole way to the west beach; both
  beaches run on downstream to the lake, so nothing is trapped at the bottom. The river is
  4 m deep: nothing fords it.
- **Roads are graded** (`gradeRoad`: smoothed profile, grade cap) and painted from a kerb
  map (`kerbMapOf` in city.ts, generalised). The terrain shader's street painting now
  runs for any world with a kerb map, not only sea worlds (`terrain-mesh.ts`).
- **The Strip's resorts** are boxes in the city's `Walls` field, drawn by `vegas-model.ts`
  after the famous ones and named for none: pyramid, castle, skyline, glass towers,
  fountains (a pool with its own water level and jets), palace, volcano, big top, green
  tower with a lion, half an Eiffel tower, wheel, Venetian bell tower, bronze tower, the
  north tower, the Sphere (a shader: an eye, then the earth), downtown blocks under
  Fremont's canopy (a shader of moving colour) and the waving cowboy. At night their walls
  glow in their own colours (`lit()` materials, not the kit's shared ones), neon bands and
  marquees come up, the pyramid's beam shows. `VEGAS_AIR` 0.45; far plane as the city's.
- **The F1 circuit**: up Koval, along Sands, down the Strip, back by Harmon, corners of
  radius 18 so their middles stay on the tarmac, flags at the start, middle and end of
  every corner (`lapFrom`). Kerbs, grid boxes and a start gantry are drawn.
- **Courses** (4 + 4): grand-prix, the-strip, canyon-descent, desert-run; grand-prix-race,
  rim-to-river, lakeshore, red-rock-race. The desert ones are found by `routeAcross` (a
  grid A* over drivable ground, flags placed as far apart as a straight line stays on it).
- **Docks** (`dock.ts`): a 72 m causeway, its road 2.4 m over high water, a quay wall at
  its end, the berth dredged 6.5 m. Its top is exact for the physics (`causewayTop`,
  overlaid in `World.height` on the island and in Vegas) and drawn as its own stone solid
  (`ferry-model.ts`), because the 10 m grid can't square its end. The island's dock is the
  shore bearing nearest the camp that's clear of courses, garages, the airstrip funnel and
  the sandbar (it came out at ~305°, just past the camp's end), built in last, removing
  only scatter.
- **The ferry** (`ferry.ts`, `ferry-model.ts`): double-ended, 36 m, ramps 7 m at both
  ends, 3 m off the quay. Out: ramp down, truck along the causeway and up the deck, ramp
  up, backs away into the haze (20 s). In: comes out of the haze, ties up, ramp down,
  truck off and back to the shore (29 s). The hull rakes up at its ends (`FERRY.body`).
  `Way` is `"plane" | "train" | "boat"`; the Film union has `"boat"`; `?dock` parks you at
  the waiting box.
- **The Slipstream**: 400 mi, only in Vegas, top 31 m/s, accel 9.6; `CarSpec.road` 1 and
  `Ground.pavedAt` (streets, airstrips, causeways, aprons): off tarmac 40% push, 35% top
  speed (`OFF_ROAD`). It's barely a jump for it on the valley's grass (ramp tests skip
  it). **`TOO_QUICK` 27 → 34**, so every course's `min_seconds` changed; the migration
  redoes them all (the tests compare). `add_miles`' 0.02 mi/s is already enough.
- **Animals**: bighorn, jackrabbit, roadrunner, condor; condors fly at a fixed height
  (`Species.level`, 172 m) over the canyon. `vegasGround` reads `World.vegas.ground`.
- **A diner** (`buildDiner` in coffee-shop-model.ts) instead of the coffee shop in Vegas.
- **Places**: a `dock` kind (`dock:island`, `dock:vegas`), on the map as a little boat,
  counted on the leaderboard (`docks`).

## Files changed

- New: `vegas.ts`, `vegas-model.ts`, `dock.ts`, `ferry.ts`, `ferry-model.ts`,
  `vegas.test.ts`, `ferry.test.ts`,
  `supabase/migrations/20261015180000_vegas_and_the_ferry.sql`,
  `docs/decisions/0023-las-vegas-and-the-ferry.md`, this file.
- Changed: `Game.tsx` (the boat way, `?dock`, the ground's `pavedAt`), `scene.ts` (the
  ferry, docks, Vegas's stage, air and far plane, the diner), `terrain-mesh.ts` (Vegas's
  surfaces, causeways, streets without a sea), `terrain.ts`, `world.ts`, `island.ts`,
  `city.ts`, `city-model.ts`, `physics.ts`, `shop.ts`, `missions.ts`, `vehicles.ts`,
  `vehicle-models.ts`, `garages.ts`, `showroom.ts`, `scenery.ts`, `wildlife.ts`,
  `animal-models.ts`, `coffee-shop-model.ts`, `palette.ts`, `places.ts`, `store.ts`,
  `worlds.ts`, `map.ts`, `Panels.tsx`; tests `courses`, `flight`, `places`, `shop`,
  `ramp`, `pin`, `tow`; `supabase/tests/game.test.sql`; `CLAUDE.md`,
  `docs/architecture.md`, `docs/art-direction.md`, `docs/roadmap.md`.

## Open questions

- The migration isn't on the live project and `game.test.sql` hasn't run against it:
  both need the owner's go-ahead (a rolled-back dry run first, as before).
- Not built: Hoover Dam, a rim road, Japan's helipad.
- Real-device frame rate in Vegas is unmeasured.

## Exact next step

Japan, on a branch from this one: a helipad on the canyon's rim by the trading post
(`World.helipad`, or a dock-like `Pad`), a heavy-lift helicopter carrying the truck on a
sling as a film like `ferry.ts`, `Way` `"heli"` with `public.routes` vegas↔japan, and a
new `japan.ts` world (cherry blossom, rice terraces, bamboo, a red gate, a switchback
pass; a kei truck; a workshop, a harbour shed, a farm barn; a teahouse; courses down the
pass, along the paddy dykes and a bamboo loop).

## Tokens advisory

A long session; stopped at a natural break with everything green (typecheck, lint, 339
tests, build).
