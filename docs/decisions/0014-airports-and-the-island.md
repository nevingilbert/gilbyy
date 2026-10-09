# 0014 — Airstrips, and an island to fly to

Date: 2026-10-09
Status: Accepted, except that an airstrip is now a counted place and the island has
three garages and three courses (`0016`). There is now a second map, which `docs/art-direction.md` listed under
"what we don't (yet)". Changes one line of `0008` (the places that are counted are the
valley's) and one of `0013` (the fog is kept per world). The fare was lowered to 150
miles each way later on 2026-10-09, the owner's call (`20261009233000_cheaper_flights.sql`).

## Context

The owner asked for a small airport hidden on the side of the river that needs the
snorkel. Paying 300 miles there boards a plane: its back lowers, the truck goes in, a
short flight, a landing, and the truck comes out somewhere entirely new. The graphic
style stays; the place changes: where the valley is ringed by mountains, this is ringed
by water, with a beach inside the water, dunes behind the beach, and jungle in the
middle. The tents there are on the beach. A reload stays there. Flying back costs 300
miles too, so it has an airport of its own. And each new world is to have a rig that
is only sold there; this one's is a dune buggy.

## Decision

- **A world is one ground on the same grid.** `WorldId` is `valley` or `island`.
  `buildWorld()` is still the valley; `buildIsland()` (`island.ts`) builds the other as
  the same `World` shape, so the physics, the renderer and the map read both alike. Only
  one is built and drawn at a time. `scene.ts` keeps what belongs to a world in a stage
  it can take down and put up again (`setWorld`).
- **Every world has one airstrip** (`airport.ts`): a 260 m runway and an apron behind
  its threshold. The plane stands on the threshold with its tail to the apron. It
  leaves and returns over the far end, so only that end has to be open.
- **The valley's is hidden.** `valleyAirfield()` looks only at ground the snorkel is
  needed for, at least 420 m from the two garages over there, prefers a hollow, and
  turns the open end toward the mountains. It is placed after everything else, from the
  ground as it already lies, so nothing that was in the valley moved. Then the field is
  levelled, a bank is raised round its sides and closed end, and the bank is planted
  thick with dark pines. It is not on the compass and is not a counted place. It is on
  the map only as part of the sheet, so it shows where the fog has cleared.
- **The island** is about 3 km across: sea, beach, dunes, then jungle on a hill in the
  middle. Thirty pitches stand in a row on the beach on the side the afternoon sun goes
  down on, each facing the sea. There is an airstrip along the back of the beach on the
  far side, and one garage, a beach shack. There is no railway, river, course or easter
  egg there yet.
- **The flight is a film, not flying** (`flight.ts`). Every frame is a pure function of
  the airstrip and the time: the ramp, the truck's path up it, the take-off, and on the
  other side the cruise, the landing and the truck's way out. The picture is lost in
  cloud at the end of the way out and found again at the start of the way in, and the
  other world is built in between. It runs about 37 seconds and can't be skipped.
- **A flight costs 300 miles each way** (150 since later that day), the owner's number. It goes through `fly()`,
  a checked function like every other spend. The fares are in `public.worlds` and
  `worlds.ts`, and `flight.test.ts` fails if they differ. A card asks first, because it
  is a lot of miles and the way back costs the same.
- **Where you are is on your profile** (`profiles.world`), so a reload is where the
  last flight left you, at your tent on that world's camp. Signed out, flying works and
  nothing is kept: the next visit starts in the valley, and the card says so.
- **Each world keeps its own company.** The valley's Realtime channel is still `world`;
  the island's is `world:island`, with its own thirty tents, and only players whose
  profile says they are there may use it. Players in different worlds never hear each
  other, which also means their poses cost nothing across worlds.
- **Each world keeps its own fog.** `fog` has a row per player per world. `explore()`
  names the world and `explored()` answers for one.
- **Some things are sold in one world only** (`shop_items.world`, `Vehicle.only`). The
  Sandfly, a dune buggy, is sold at the island's garage for 30 miles. `buy()` checks
  where you are; once bought it is yours anywhere.
- **The valley's counts stay the valley's.** The leaderboard still says how many of the
  valley's eight garages and one café you have found. The island's garage is on its map
  once the fog is off it and is counted nowhere. First-time guidance is about the
  valley and is not shown on the island.
- **This browser remembers which world it last saw a signed-in player in**
  (`localStorage`, `gilbyy:world`), only so a reload builds that one first. The profile
  decides; a wrong guess is swapped before anything is shown.

## Consequences

- At today's earning, 300 miles is six to eight hours of driving. On 2026-10-09 the most
  any player had to spend was 17.8 miles and the most anyone had ever earned was 127.6,
  so for now nobody can afford the flight. It is one number in `worlds.ts` and one row
  in `public.worlds` if that turns out to be too far.
- Once on the island you need 300 more to come back. Everything a garage sells is sold
  there too, so the miles driven there still have somewhere to go.
- The server can't see where a truck is, so like a mission claim, `fly()` takes the
  client's word that it is at the airstrip. What it checks is the fare. A modified
  client could fly from anywhere by paying.
- A page loaded before this keeps working: `explore()` without a world means the
  valley, and `explored()` without one means the world you're in.
- The code can ship before the migration or after it. Before, the card answers "the
  plane isn't flying yet"; nothing else changes.
- Putting up the other world takes a third of a second to a second, in the cloud where
  it can't be seen.
- Other players don't see a flight. The truck that boarded just leaves their world.
- For a second pass, as the owner said: more garages on the island, and courses there.
  Also unbuilt: a convoy or race on the island, any sound, and a way to skip the film.
