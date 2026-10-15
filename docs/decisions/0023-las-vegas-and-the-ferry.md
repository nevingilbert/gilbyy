# 0023 — Las Vegas and the Grand Canyon, and the ferry to them

Date: 2026-10-15
Status: Accepted. Adds a fourth world after `0022`'s third, a third way between worlds
after the plane (`0014`) and the train (`0022`), a counted kind of place to `0016`'s, four
species to `0015`'s, and a racing car that needs tarmac. Raises `0017`/`0019`'s speed no
honest run beats. Japan, by helicopter from Vegas, is still to come and will want an ADR
of its own.

## Context

The owner asked for a boat dock on the beach island taking you to a new island themed on
Las Vegas and the Grand Canyon. Its special car is an F1 car, and one of its missions an
F1 race round the city. Like every world it has courses, new garages and a café, and the
boat trip is a film. Asked, they chose to build it after San Francisco and before Japan,
and a fare of 150 miles each way, the same as the others.

## Decision

- **One world, the Strip and the canyon both, not from a map.** A desert basin ringed by
  mountains on the same 6 km grid: the Strip down its middle and downtown at its north
  end; Lake Mead to the north-east with the marina on it; Red Rock's stepped mesas to the
  west; and to the south-east the land rising in long steps to a plateau with the Grand
  Canyon cut through it to the Colorado, which runs out into the lake. Each is where it
  makes one world, in roughly the direction it lies from the others (`vegas.ts`).
- **The canyon has its real bands.** The river, deep enough that nothing fords it, its
  beaches either side, the inner gorge, the broad bench with temples standing off it,
  the red cliff, and the slopes up to the rim; coloured band over band by height. Its
  head is a slot in the mountains, so there's no end of the world to see up it. One side
  canyon falls the whole way from the rim village to a beach: the only way down on wheels.
  Both beaches run on downstream to the lake, so nothing that falls in is trapped.
- **The Strip's resorts are its own, after the famous ones, none by name**: a black
  pyramid with a sphinx and a beam at night, a castle of turrets, a skyline with its
  statue, glass towers, a curved hotel behind a lake of fountains that dance, a palace
  with a dome, a volcano that erupts after dark, a big top, a green tower with a gold
  lion, half an Eiffel tower, an observation wheel turning, a bell tower and a canal, a
  curved bronze tower, the tower at the north end with its pod, and the Sphere, whose
  whole skin is a screen: an eye that looks about, then the earth turning. Downtown,
  Fremont Street under its canopy of moving colour, and the waving neon cowboy. The
  Welcome sign stands in the median at the south end. Casinos are scenery, and nothing
  in them links anywhere: `0012`'s four are still the only links out.
- **By night it glows**, the one place in the game that does: the resorts' walls lit from
  below in their own colours, neon bands and marquees, windows, lamps down the Strip.
  The air is clearer than the valley's, so the skyline stands up across the basin from
  the canyon's rim (`VEGAS_AIR`), and the camera sees as far as in the city.
- **Streets are painted** by the same kerb map and shader as the city's (`kerbMapOf`), and
  the roads are laid into the ground on smoothed grades; the resorts are boxes in the same
  wall field the city's buildings use.
- **The ferry is a film, like the flight and the train** (`ferry.ts`): a double-ended car
  ferry, a ramp at each end, so it never turns round. The truck drives out along a stone
  causeway, over the near ramp and up the deck; the ramp comes up, the ferry backs out
  and away into the haze; on the other side it comes in out of it, ties up at the other
  causeway, puts its ramp down, and the truck drives off and back to the shore. Every
  frame is a pure function of the dock, the water and the time.
- **A dock is a causeway** (`dock.ts`), laid into the ground with a quay wall at its end
  and the berth dredged deep; its top is exact for the physics (`causewayTop`, as the
  jump's deck is) and drawn as stone of its own, with bollards and lamps. The island's
  goes where the shore is clear of every course, garage, the camp, the airstrip and the
  sandbar, as near the camp as that allows, and was built in after everything else
  there, taking away only the trees and rocks where it goes. The ferry rides the
  island's tide at its berth.
- **The ferry is a third way between worlds**: `public.routes` and `ROUTES` have the island
  and Vegas, both ways, by boat. `fly()` is unchanged: it takes the fare, and goes only
  where a route does.
- **The Slipstream**, an F1 car, sold only in Vegas for 400 miles. It is the quickest thing
  there is on tarmac, 31 m/s, and hopeless off it: there it has 40% of its push and 35% of
  its top speed (`CarSpec.road`, `OFF_ROAD`, `Ground.pavedAt`). Tarmac is the city's and
  Vegas's streets, the airstrips, the causeways and the garages' aprons. It can't get
  much air off the valley's jump, slow on the grass up to it, and that's left so.
- **The speed no honest run beats went from 27 m/s to 34** (`TOO_QUICK`), a tenth over the
  Slipstream's, and every course's quickest believable time with it, in the database too.
  Otherwise an honest lap in it would be refused. `add_miles`'s own limit (0.02 miles a
  second, 32 m/s) already allows it.
- **Vegas has three garages** (a speed shop at the south end of the Strip, the pit garage
  by the Grand Prix's grid on Koval, an adobe trading post on the canyon's rim), **a
  diner** on the road out to the marina, **a camp at an oasis** of palms by the lake, and
  **eight courses**: the Grand Prix (a lap of the street circuit, up Koval, along Sands,
  down the Strip and back by Harmon, as the real one goes), the Strip end to end, a canyon
  descent down the side canyon to the river, and a desert run to Red Rock; for friends,
  two laps of the Grand Prix as a race, rim to river and down the Colorado together, round
  the lake's shore together, and a race among Red Rock's mesas. Paid on the same scale as
  everywhere (`0017`).
- **Docks are found places** (`dock:island`, `dock:vegas`), counted on the leaderboard like
  the airstrips and the stations, and pay nothing.
- **Animals** (`0015`): bighorn on the canyon's walls and among Red Rock's mesas, jackrabbits
  and roadrunners on the desert, condors circling over the canyon at the height of its rim.
  Scenery, never counted.

## Consequences

- Vegas builds in about a third of a second, like the island: nothing to fetch.
- The island has a new causeway in front of the camp's end, which the sandbar's course and
  every other course stay clear of; nothing else on it moved.
- Not there yet: Hoover Dam, a road along the canyon's rim, and Japan's helicopter pad.
- Prices, payouts, fares and limits must match between `vehicles.ts`, `vegas.ts`,
  `missions.ts`, `worlds.ts` and `places.ts` and the migration
  `20261015180000_vegas_and_the_ferry.sql`; `shop.test.ts`, `flight.test.ts` and
  `places.test.ts` fail if they don't.
