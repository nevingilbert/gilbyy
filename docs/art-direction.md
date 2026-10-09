# Art direction

**The target: a lightweight take on _Over the Hill_, the indie driving game — its look
and feel, not its scope.**

Read this before changing anything visual. It is the standing brief, not a suggestion.

This doc was rewritten on 2026-10-06 after studying the real footage: both Steam
trailers frame by frame and the 14 store screenshots. The previous version described the
game from memory as "muted, desaturated, sage and olive", and that was wrong.

## What the footage actually shows

_Over the Hill_ (Funselektor, Steam, October 2026) is a low-poly 3D off-road game about
unhurried exploration in a classic 4x4.

- **The palette is saturated, but narrow.** Each scene uses a handful of strong hues:
  bright orange-ochre grass, lilac-grey rock, near-black pines, golden larches, a red
  or cream truck. What holds it together is not low saturation but **haze**: distance
  pulls everything toward one warm sky colour, so the far hills go peach and lilac.
- **Light does the work.** A low sun rakes across terrain relief; long shadows; a soft
  glow where the sun sits on the horizon. Shapes are simple; the lighting makes them
  look good.
- **The gameplay camera is high**, looking steeply down at the truck from behind. The
  sky is mostly out of frame while driving.
- **Grass is everywhere and it moves.** Thick, soft, knee-high tufts, lighter at the
  tips, swaying.
- **Smooth ground, faceted things.** Terrain is smooth-shaded; rocks, trees and bushes
  are visibly faceted.
- **The HUD is nearly absent**: a compass strip, a small round topo minimap, tiny gear
  and tilt indicators, contextual button hints.

## What we borrow

- The palette: see `apps/web/src/app/palette.ts`, sampled from the frames.
- Exponential fog in the sky's horizon colour, plus a gradient sky with a soft sun.
- A low golden-hour sun with shadows.
- The high chase camera.
- Swaying grass near the car, bushes breaking up the open ground, pine forests with a
  few golden larches and autumn broadleaves.
- A nearly absent HUD: a compass strip, a small round topo minimap, a speedometer in mph
  and an odometer.
  First-time guidance is one small line under the title and a mark on the compass.
- Calm. Missions are optional, start only when you drive up and press E, and have no
  failure beyond giving up. Their timer shows only while you're on one. Friends can
  drive a convoy that comes home together (ADR 0010) or race (ADR 0011); a race pays
  every finisher the same, and its result is one line on screen, kept nowhere.
- Four buildings that aren't about driving (a bank, a church, a schoolhouse, a casino)
  are easter eggs (ADR 0012). They keep to the palette and add nothing to the HUD but
  the usual prompt at the door.
- A second place under the same sky (ADR 0014): an island of pale beach, golden dunes,
  a turquoise sea and deep green jungle. Its colours are its own (`palette.ts`), but
  the haze, the low sun, the flat shading and the HUD are the valley's, so it reads as
  the same game somewhere else. The flight there is a short film with no HUD at all.
- Animals, each where it belongs (ADR 0015): deer in the meadows, hares on the open
  grass, reindeer on the snow, ducks on the lakes; crabs and gulls on the beach, boar
  and macaws at the jungle's edge, dolphins offshore. Low-poly and faceted like the
  trees, coats a shade cooler and darker than the ground so a herd reads against the
  orange grass, and the macaws the one bright thing. They graze, wander, and get out
  of the way; a parked truck can watch them. Nothing to hit, count or collect.
- Driving together, as in the trailer's co-op shots: other players' trucks share the
  valley, name tags float over them, and chat appears as small speech bubbles.

## What we don't (yet)

- Winching, planks, deformable mud and snow, the photo compendium.
- Weather. Rain, lightning and fog banks are the strongest candidates to add next.
- More than two maps. There is the valley (with a snowy plateau in the north) and,
  since 2026-10-09, an island a flight away (ADR 0014), and nine rigs, each inspired by
  a real off-roader.
- Scope in general. It is a shipped commercial game; this is a hobby page.

## Where the current build sits

As of 2026-10-06 (second pass) it is recognisably in the family: orange grass carpet,
pines, haze, lakes and rivers, a train in the distance, the red overlander under a high
camera. A day passes in about fifteen minutes, so dusk, night with headlights and dawn
all come round. Honest gaps:

- **No weather.**
- **Water is a flat colour with a gentle ripple.** No foam, no flow on the rivers.
- **No dust, tyre tracks or engine sound.** The truck feels quieter than it should.
- **The grass reads more as texture than as tall grass.** It is short, and it only
  exists within ~60 m of the car.
- **Night lighting is untuned on real hardware.** Headlight power was set from headless
  screenshots.

## Rules of thumb

1. **Few hues per scene, let the haze unify them.** Don't make colours duller to make
   them harmonise; pull them toward the fog instead.
2. **Never a pure primary.** No `#f00`, no `#00f`, no default blue links.
3. **Keep the HUD nearly absent.** If a new element competes with the world for
   attention, it is wrong. Low contrast, small, cornered.
4. **Light and haze before detail.** Shadow, fog and sun buy more than more objects do.
5. **No pressure mechanics.** If a feature makes the player feel behind, it does not
   belong. Miles are spent in the shop, but what you buy is never lost. Mission timers
   appear only during a run you chose to start, and a slow run still pays. The
   leaderboard shows only you and your friends (ADR 0007).
6. **Colours go in `palette.ts`.** No hex literals in render code.
