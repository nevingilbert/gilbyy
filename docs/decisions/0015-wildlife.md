# 0015 — Animals roam both worlds, as scenery that notices you

Date: 2026-10-09
Status: Accepted.

## Context

The owner asked for "biome appropriate animals roaming around in both worlds". The
valley had trees, grass, a train and other players, but nothing alive of its own; the
island the same. Animals are the cheapest way to make a place feel lived in, and the
calm, unhurried brief (`art-direction.md`) suits watching a herd graze.

Animals in a driving game usually come with one of two things this game doesn't want:
something to hit (roadkill, a penalty, a crash) or something to collect (a count, a
photo list, a reward). Both are pressure, and rule 5 of the art direction says no.

## Decision

Nine species, each where it belongs (`wildlife.ts`):

| World | Where | Animal | How it behaves |
|---|---|---|---|
| Valley | Meadows along the forest edges | Red deer, herds of 3–6, stags with antlers | Graze, follow the herd about, gallop off |
| Valley | Open grass | Hares, alone or in pairs | Nibble, bound away |
| Valley | The snow plateau | Reindeer, herds of 4–8 | Graze, trot off |
| Valley | The lakes, near the shore | Mallards, 3–6 | Paddle, fly off together, circle, settle again |
| Island | The wet sand | Land crabs | Scuttle sideways; dig in when a truck comes over them |
| Island | The beach, including in front of the tents | Gulls, 5–10 | Stand about, fly off together, circle, settle again |
| Island | Where the dunes meet the jungle | Wild boar | Root about, trot off |
| Island | Along the jungle's edge | Scarlet macaws, pairs | Always flying, on a low loop |
| Island | Out at sea, in view of the beach | Dolphins, pods of 2–4 | Swim a loop, leaping every few seconds |

The rules that keep them calm:

- **They get out of the way.** An animal runs from a truck or the train when it comes
  within a distance that grows with its speed: a parked truck can sit about 14 m from
  a deer and watch it graze, one at speed sends it off from about 48 m. If the truck is
  coming at it, it runs off to the side of its path as well as away, so even a truck
  faster than the animal goes by. A crab can't outrun anything, so it digs in instead.
  A herd runs together.
- **Nothing hits them and they hit nothing.** They aren't obstacles for the physics and
  the physics isn't theirs: they keep out of deep water, off cliffs, off the camps, the
  garage yards and the runways, and round tree trunks by themselves.
- **They count for nothing.** No miles, no count, no list, no map marker, no
  achievement. They're not on the map or the compass.
- **They aren't shared.** Every browser places the same herds in the same places, from
  a fixed seed; after that each simulates its own. Sending animals over Realtime would
  spend the free-tier budget (`architecture.md`) on scenery. Two friends parked side by
  side may see a herd run slightly differently; nothing depends on it. Macaws and
  dolphins go where the clock says, and signed-in players share the clock, so friends
  do see those in the same places.
- **Birds fly low.** The chase camera is about 8.5 m over the truck looking down, so
  anything higher is never on screen. Gulls and ducks circle at 6–7 m and the macaws at
  3–7 m.

How it's built:

- `wildlife.ts` is pure and tested like the rest of the game: species, habitats,
  `placeHerds()` and `stepWildlife()`. Only herds within about 320 m of the truck are
  moved; the rest wait where they are. Macaws and dolphins are a function of the time
  alone. The first herds placed are in front of the camp, so the opening shot has deer
  in it in the valley, and gulls and dolphins on the island.
- `animal-models.ts` builds each species from faceted lumps and sticks in palette
  colours, cut into the parts that move (head, legs, wings), one instanced mesh per
  part. A whole species is a handful of draw calls, and only animals within sight of
  the truck are drawn.
- `scene.ts` steps them each frame from the truck, other players' trucks and the train.

## Consequences

- About 700 animals per world, a few dozen moving at once. Placing them adds about
  0.1 s to building a world. The frame cost on real devices is unmeasured, like
  everything else's.
- Animals are now part of the "don't add pressure" rule in `CLAUDE.md`: no hitting,
  hunting, counting or collecting them without a new ADR.
- A new species is a row in `SPECIES`, a habitat case and a body in
  `animal-models.ts`, and needs no ADR as long as it keeps to the rules above.
