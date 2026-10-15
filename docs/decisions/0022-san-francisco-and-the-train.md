# 0022 — San Francisco, and the train to it

Date: 2026-10-15
Status: Accepted. Adds a third world after `0014`'s two, a counted kind of place to
`0016`'s, and four species to `0015`'s. The next two worlds the owner asked for
(Vegas and the Grand Canyon by boat from the island, Japan by helicopter from Vegas) are
still to come and will want ADRs of their own.

## Context

The owner asked for a station in the valley where the train stops for a while. While it
stands there you can board, and in the film of the trip the track switches to a branch,
heads for the mountains that ring the map, goes into a tunnel and comes out in a new
world: San Francisco, "as true to San Francisco as possible". It has its own rig, a
Robotaxi, and like every world courses, garages and a café. They chose the real map
over one drawn from memory, and 150 miles each way, the same as the plane.

## Decision

- **The whole city, from the real map, at 1:2.5 across and 1:1.7 up.** A truck and a
  street stay their usual size, so the city is drawn smaller than life and its hills a
  little steeper than they are: about 5.8 km square, the same 6 km grid as the other
  worlds. North is −z. The edge is a square (`Ground.square`), the bay and the ocean on
  three sides and the county line on the fourth.
- **The data is public and baked in.** Streets and water are the Census Bureau's TIGER/Line
  files for San Francisco County (2024); the ground is a USGS 3DEP elevation grid. Both
  are public domain. `scripts/bake-city.mjs` (Node, no dependencies) turns them into
  `city-data.ts`: heights in quarter metres, a water code per grid point, and 3,721
  streets with their names and five widths. Alleys, courts, places and terraces are
  alleys whatever TIGER calls them; stairways and paths are left out; of the freeways
  only the two bridges and the Presidio's approach stay. It is about 415 KB, fetched
  only when the city is wanted (`loadCityData`), so the valley never pays for it.
- **Streets are painted, buildings are boxes.** A 2048-square distance-to-the-kerb map is
  painted by the terrain's shader as asphalt, kerb and pavement. About 30,000 buildings
  stand along the street fronts in lots by district: Victorian rows, the avenues'
  stucco, the Marina, SoMa's brick lofts, Chinatown, downtown's towers. They're instanced,
  with windows drawn on in the shader and some lit at night. Their walls are one 2 m
  distance field the physics reads, not a collider each. Between the camera and the
  truck a soft hole is cut through whatever is in the way.
- **The bridges are decks you drive on** at their own heights over the ground and the
  water (`height(x, z, above)` asks which surface a truck is on). The Bay Bridge runs on
  past the edge of the world, toward Oakland, and is closed with barriers where it does.
- **Landmarks where they are**, each its own model: Coit Tower, the Transamerica Pyramid,
  Salesforce Tower, 555 California, the Ferry Building, City Hall, Grace Cathedral, the
  Palace of Fine Arts, Sutro Tower, the Painted Ladies, Alcatraz, Ghirardelli, Pier 39,
  the ballpark, the Chinatown gate, the Castro Theatre, Mission Dolores, both Golden Gate
  Park windmills, the Conservatory, the Cliff House, the Legion of Honor, Fort Point,
  Twin Peaks and the Mount Davidson cross. Lombard's crooked block is its own brick lane
  of eight hairpins among flower beds, since the street map is too coarse to draw it.
  None of them link anywhere or count as found: they're scenery (`0012` is about the
  valley's four).
- **The city lives.** Cable cars run up Powell and over Russian Hill on Hyde on a
  timetable, as solid as the train. Bison graze in their paddock in Golden Gate Park,
  sea lions swim off Pier 39, pelicans fly along the shore and the wild parrots over
  Telegraph Hill (as `0015`: scenery, never counted). Fog comes in through the Golden
  Gate in the late afternoon, lies all night and burns off by late morning, the
  bridge's towers standing out of it. The haze is a third of the valley's and the camera
  sees further there, so the skyline carries across the city from Twin Peaks.
- **The valley's train now stops.** It runs its loop as before but brakes into a station
  on the west side and stands there a minute each time round (`trainMotion`,
  `atStation`, `DWELL`). The platform says when it's next in. A branch leaves the loop
  past the platform, through a cutting in a foothill, out to the mountains and into a
  tunnel.
- **The trip is a film, like the flight** (`rail-trip.ts`): the truck goes round behind
  the flat wagon at the back of the train and up its ramp, the ramp folds, the train
  pulls out over the points and into the tunnel, and the picture goes dark. In the city
  the train comes out under Potrero Hill, down the east side of Pennsylvania Avenue,
  over Sixteenth Street and into Fourth and King, where the truck backs off. Going home
  is the same the other way: out of Fourth and King backwards, as Caltrain's trains
  leave. Every frame is a pure function of the station and the time.
- **Where a truck can go next is a table** (`public.routes`, `worlds.ts`'s `ROUTES`): the
  plane between the valley and the island, the train between the valley and the city.
  `fly()` takes the destination's fare as before and now refuses a trip nothing makes.
- **The city has the Robotaxi** (sold only there, 200 miles), three garages (a Mission
  Victorian on Valencia, a pier shed on the Embarcadero, a hangar on Crissy Field), a
  café in North Beach on Washington Square, a campground on Rob Hill in the Presidio,
  and eight courses: Lombard, a hill chase over Russian Hill, the Golden Gate there and
  back, Twin Peaks; and for friends a convoy from the bay to the beach, races down the
  Great Highway and along the Embarcadero, and a convoy through the Presidio.
- **Stations are found places** (`station:valley`, `station:city`), counted on the
  leaderboard like the airstrips, and pay nothing.

## Consequences

- The city takes about a second to build after its data arrives. The opening and a trip
  hold in the dark until it's ready.
- It is the heaviest world to draw: near buildings in 400 m tiles, the tall ones always.
  Real-device frame rate is still unmeasured, as for the other worlds.
- Not there yet: Marin's roads past the Golden Gate (outside the county's data), the
  hills south of the county line, and the Bay Bridge's ramps down to Treasure Island.
- Prices, payouts and fares must match between `vehicles.ts`, `city.ts`, `worlds.ts` and
  `places.ts` and the migration `20261015120000_city_and_train.sql`; `shop.test.ts`,
  `flight.test.ts` and `places.test.ts` fail if they don't.
