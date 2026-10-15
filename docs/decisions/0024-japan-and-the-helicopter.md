# 0024 — Japan, and the helicopter to it

Date: 2026-10-15
Status: Accepted. Adds a fifth world after `0023`'s fourth, a fourth way between worlds
after the plane (`0014`), the train (`0022`) and the ferry (`0023`), a counted kind of place
to `0016`'s, three species to `0015`'s, and a rig sold only there.

## Context

The owner asked, with Vegas, for a helicopter from Vegas to another new island, and chose
Japan from the ideas offered. Like every world it has courses, new garages and a café,
and the helicopter trip is a film. It comes after San Francisco and Vegas, as agreed, and
costs 150 miles each way, like the others.

## Decision

- **One island, Japan's famous views together, not from a map.** On the same 6 km grid,
  the sea all round: in the north-west the mountain, a snow-capped cone over everything;
  at its foot a lake, the camp on its south shore looking across it to the mountain, a
  red gate standing in the shallows and a teahouse by the water; on a hill to the
  south-west a five-storey pagoda among cherry trees; to the east a ridge the road crosses
  by a pass, up a flight of hairpins, down to a harbour town on the coast; in the south,
  rice terraces stepping down a hillside to the sea; in the south-west a bamboo forest;
  and up a valley in the north-east mountains, a hot spring (`japan.ts`).
- **Spring.** Cherry trees in blossom round the lake, the pagoda, the camp's road and the
  town; cedar and pine on the slopes with maples among them; bamboo thick in the south-
  west; azaleas in flower among the bushes. The terraces are flooded and planted: each is
  a level mirror of its own, the young rice standing up through it. The air is clear
  enough to see the mountain across the lake from the camp (`JAPAN_AIR`).
- **The mountain's snow is the valley's snow**: as slippery, and chains help, but no course
  goes up onto it. Its steep ground is dark, mossy rock, not the valley's lavender, which
  turns ghostly against green; its upper slopes bare ash.
- **The roads are laid round the land, not straight at it**, graded into the ground with a
  bench wide enough that a road stays level across a slope on the 10 m grid (`roads.ts`,
  which Vegas's roads now use too). The pass climbs by hairpins, level round each bend;
  the harbour road winds down the ridge's far side; the mountain road winds round the
  mountain's flank to where the cedars give out: straight up, it was cut deep into the cone.
- **The town is two-storey houses**: dark timber with a lattice front and a curtain over
  the door, plaster or timber above with a paper screen that glows at night, grey tiled
  roofs along the street; boats moored off the harbour; stone lanterns along the shore.
- **The helicopter is a heavy-lift crane** that carries the truck slung under it, not
  inside it: it stands beside a pad, a painted circle with an H. A truck stopped on the
  pad is offered the trip. The film (`heli.ts`): the rotors spin up, it lifts, slides
  across over the truck and lets its hook down; slings go on to the truck's roof corners;
  it climbs, winding its cable in, the truck coming off the ground and swinging a little,
  and flies off into the haze. On the other side it comes in out of the haze with the
  truck under it, lets it down onto the pad, lets go, winds in and lands on its stand.
  Every frame is a pure function of the pad, the ground and the time. The truck is set
  down forward of where the trip is offered, so it isn't offered again straight away.
- **The pads**: Vegas's on the canyon's rim south of the lookout, the helicopter leaving
  out over the canyon; Japan's on open ground south-east of the camp, well away from the
  roads. Each is levelled, and nothing grows on its paving or under the rotor.
- **The helicopter is a fourth way between worlds**: `public.routes` and `ROUTES` have Vegas
  and Japan, both ways, by helicopter. `fly()` is unchanged.
- **The Kei Truck**, after Japan's little farm trucks: the cab over the front wheels, a long
  flat bed, a pipe guard over the back window, crates of greens in the bed. Sold only in
  Japan, for 200 miles. The narrowest rig there is, no quicker on top than a starter, and
  sure-footed.
- **Japan has three garages** (a workshop at the foot of the pass, a shed by the harbour, a
  storehouse barn at the top of the terraces), **a teahouse** for its café, by the lake,
  with red parasols over benches out front, and **eight courses**: down the pass's
  hairpins, along the paddies' dykes, a loop through the bamboo, and round the lake; for
  friends, up the mountain road together, a race from the pass down to the harbour, along
  the south coast together, and a race round the pagoda's hill. Paid on the same scale as
  everywhere (`0017`).
- **Helipads are found places** (`helipad:vegas`, `helipad:japan`), counted on the
  leaderboard like the airstrips, the stations and the docks, and pay nothing.
- **Animals** (`0015`): sika deer in the woods and meadows, macaques round the hot spring,
  and red-crowned cranes standing in the paddies, which fly off when a truck comes.
  Scenery, never counted. Japan's animals reckon its lake and paddies as water, where a
  tidal sea world reckons only the sea at high water.

## Consequences

- Japan builds in about a third of a second, like the island: nothing to fetch.
- Vegas has a pad on the rim; nothing else there moved, its courses included.
- Not there yet: lanterns over the town's doors at night, a bullet train, blossom falling.
- Prices, payouts, fares and limits must match between `vehicles.ts`, `japan.ts`,
  `missions.ts`, `worlds.ts` and `places.ts` and the migration
  `20261015200000_japan_and_the_helicopter.sql`; `shop.test.ts`, `flight.test.ts` and
  `places.test.ts` fail if they don't.
