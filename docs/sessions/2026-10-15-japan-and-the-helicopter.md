# 2026-10-15 — Japan, and the helicopter

## Topic

The last of the three worlds the owner asked for (ADR 0024): a helipad on the canyon's rim
in Vegas and a heavy-lift helicopter from it to Japan, with a kei truck, garages, a
teahouse and courses, and the helicopter trip as a film.

## Decisions made

- **One island, Japan's famous views together** (`japan.ts`), drawn, not from a map: the
  mountain in the north-west (`JAPAN.fuji`: a concave cone, peak 430 m, gullies, a crater,
  snow above 270 m that's as slippery as the valley's), the lake at its foot (level 22),
  the camp on its south shore at (−330, 40) facing north across it, the gate standing in
  the shallows (0.7 m deep, so a truck can wade to it: every leg has a collider), the
  teahouse by the water, the pagoda's hill in the south-west, the ridge to the east with
  the pass's hairpins, the harbour town on the east coast (218 houses in the city's wall
  field), the rice terraces in the south (shelves 2.4 m apart in a ragged oval, flooded
  0.12 m), the bamboo in the south-west and the hot spring up the north-east valley.
- **Roads** (`roads.ts`, moved out of vegas.ts, which now uses it too): `gradeRoad` with a
  `wide` bench (half + 5, blend half + 26) so roads stay level across slopes on the 10 m
  grid; `levelBends` keeps the hairpins level round their bends. The Mountain Road winds
  round the cone's south-west flank (it went straight up and cut 20 m deep); Harbour Road
  winds down the ridge at grade 0.16. Country roads aren't paved underfoot, only the town's
  streets: the street paint lays the road on the meadow.
- **Ground colours**: Japan's own surfaces (meadow, paddy, cedar, ash, crag, shingle,
  gravel). `crag` is dark mossy rock: the valley's lavender rock read as ghostly patches
  against green. Grass tufts on meadow and cedar floor, young rice in the paddies.
- **Paddies are their own water** (`buildWaterMesh`): each cell laid flat at its lowest
  water, so every terrace is a level mirror and none runs down the bank, and thinner and
  greener than the lake (`PALETTE.japan.paddyWater`). The hot spring is too small for the
  10 m grid: its water is a disc in `japan-model.ts` and its cells are left out of the mesh.
- **The helicopter** (`heli.ts`, `heli-model.ts`): a crane helicopter after the Skycrane,
  orange and white, six blades and a tail rotor that spin up and down, a blur disc when
  fast. A pad (`Pad`, `PAD`: circle radius 14, stand 34 m to its left, 46 m levelled) with
  the helicopter standing beside it. Out (26 s): spin up, rise, slide over the truck, hook
  down, slings on to the roof corners, climb winding in (the truck hangs `SLUNG` 4.6 m
  under the hook), away into the haze. In (28 s): out of the haze with the truck slung,
  down onto the pad at `padLeave` (11 m forward, past `PAD_REACH`), let go, wind in, land
  on the stand. The cable and slings are lines in world space (`rig`). `Way` gains `"heli"`;
  the Film union `"heli"`; `?pad` parks you on the pad. A hanging truck isn't grounded, so
  its wheels droop and don't turn.
- **Pads**: Vegas (1235, 320) on the rim heading east out over the canyon; Japan (−150, 210)
  heading 0.6, on open ground well away from the roads (by the Farm Road the pad wasn't
  level). `markNear(siteDist, pad, stand, 30, 5)` keeps scatter off the paving and from
  under the rotor; the pad's paving is a surface of its own so no grass comes through.
- **The Kei Truck**: 200 mi, only in Japan, 3.4 × 1.48 m, top 17.5 m/s, grip 1.14.
- **Courses** (4 + 4): the-pass, paddy-dykes, bamboo-grove, lake-round; mountain-road
  (convoy, starts 56 m up its road so friends line up on it; 25/8), harbour-run (race,
  starts 40 m down the Harbour Road for the same reason), south-coast (convoy),
  pagoda-race (race).
- **Garages**: the Pass Workshop, the Harbour Shed, the Kura. **Café**: the teahouse
  (`buildTeahouse`), benches under red parasols.
- **Animals**: sika (stags with short antlers), macaques within 420 m of the hot spring,
  red-crowned cranes in the paddies. `passable()` reckons Japan's lake and paddies as water.
- **Places**: a `helipad` kind (`helipad:vegas`, `helipad:japan`), on the map as a ringed
  H, counted on the leaderboard (`helipads`).
- **Air**: `JAPAN_AIR` 0.6, the city's far plane, so the mountain stands over the lake.

## Files changed

- New: `japan.ts`, `japan-model.ts`, `heli.ts`, `heli-model.ts`, `roads.ts`,
  `japan.test.ts`, `heli.test.ts`,
  `supabase/migrations/20261015200000_japan_and_the_helicopter.sql`,
  `docs/decisions/0024-japan-and-the-helicopter.md`, this file.
- Changed: `Game.tsx` (the heli way, `?pad`, the hanging truck), `scene.ts` (the
  helicopter, pads, Japan's stage, air, café, camp and bushes), `terrain-mesh.ts` (Japan's
  surfaces, pads' paving, paddies' water), `terrain.ts` (`markNear`), `vegas.ts` (its pad,
  roads from `roads.ts`), `world.ts`, `island.ts`, `city.ts`, `vehicles.ts`,
  `vehicle-models.ts`, `garages.ts`, `showroom.ts`, `scenery.ts`, `wildlife.ts`,
  `animal-models.ts`, `coffee-shop-model.ts`, `airport-model.ts`, `palette.ts`,
  `places.ts`, `store.ts`, `worlds.ts`, `map.ts`, `Panels.tsx`; tests `flight`, `places`,
  `shop`; `supabase/tests/game.test.sql`; `CLAUDE.md`, `docs/architecture.md`,
  `docs/art-direction.md`, `docs/roadmap.md`.

## Checked in the browser

The camp and the kei truck; the mountain over the lake from the camp; the gate; the
pagoda; the harbour town by day and by night; the teahouse; the terraces; the hot spring;
both pads; the whole trip from Japan to the rim in Vegas (the fare taken, the truck set
down past the pad's offer, the welcome said).

## Open questions

- Both migrations are on the live project (2026-10-15, with the owner's go-ahead): a
  rolled-back dry run of Vegas's and Japan's with `game.test.sql` passed (once the count of
  worlds in it was raised from 3 to 5; nobody had raised it for Vegas), then each was run
  with `db query`, recorded with `migration repair`, and the checks pass against the
  migrated project. Neither world has been played signed in.
- Not built: lanterns over the town's doors at night, a bullet train, falling blossom.
- Real-device frame rate in Japan is unmeasured (18,855 trees, 218 houses).

## Exact next step

The owner merges the stack from the top down, so nothing needs retargeting: pull request
26 into `feat/game-vegas`, then 25 into `feat/game-city-and-train`, then 24 into `main`,
which deploys all three worlds at once. Then play the trips signed in.
