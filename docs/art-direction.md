# Art direction

**The target: a lightweight take on _Over the Hill_, the indie driving game — its look
and feel, not its scope.**

Read this before changing anything visual. It is the standing brief, not a suggestion.

## What we are borrowing

_Over the Hill_ is a low-poly 3D offroad driving game about unhurried exploration —
driving a 4x4 over rolling terrain because the driving itself is pleasant. What makes it
worth copying is the **mood**, and the mood comes from a few specific choices:

- **A muted, naturalistic palette.** Soft, desaturated, earthy. Sage and olive greens,
  dust and clay browns, slate blues. Nothing neon; nothing that reads as "default CSS
  colour."
- **Calm over stimulation.** No score, no timer, no pressure, no nagging. The game does
  not want anything from you.
- **A very quiet HUD.** Minimal, unobtrusive, out of the way. The world is the thing you
  look at, not the interface on top of it.
- **Atmosphere doing the heavy lifting.** Light, haze, depth and softness matter more
  than polygon count or detail. Simple shapes look good when the light is right.

## What we are not borrowing

- **3D.** This is a 2D top-down canvas, and there are no plans to change that. Going 3D
  would mean a real engine and a real dependency; the whole point here is that it stays
  tiny and free.
- **Terrain, suspension, and offroad simulation.** Our car drives on a flat plane.
- **Scope.** It is a shipped commercial game and this is a hobby page. We are after the
  feeling of it, at a fraction of the effort.

So "like _Over the Hill_" means **palette, calm, and restraint** — the parts that
translate to a flat 2D world — and explicitly not the geometry or the physics.

## Where the current build sits

`palette.ts` holds every colour in one place. Tune there rather than scattering hex
literals through the render code.

The first palette pass (2026-08-28) moved off the initial saturated greens and primary
colours toward muted earth tones, and added a soft vignette for depth. It is closer, not
close. Honest assessment of the remaining gap:

- Lighting is flat. Everything is drawn with the same brightness at every point; there
  is no sense of a sun direction beyond the fixed drop shadows.
- No haze, depth cue, or falloff toward the edges of the world.
- Shapes are geometric — circles for trees, rounded rectangles for houses. Softer,
  less regular silhouettes would read as far more hand-made.
- Nothing moves except the car. Even slight motion — grass shifting, water rippling,
  shadows drifting — would do a lot for atmosphere.

## Rules of thumb

1. **When in doubt, desaturate.** A colour that feels slightly too dull in isolation is
   usually right in context.
2. **Never add a pure primary.** No `#f00`, no `#00f`, no default blue links.
3. **Keep the HUD quiet.** If a new element competes with the world for attention, it is
   wrong. Low contrast, small, cornered.
4. **Prefer softness to detail.** Blur, gradient and shadow buy more atmosphere than
   more objects do.
5. **No pressure mechanics.** No timers, no scores, no achievements. If a feature makes
   the player feel behind, it does not belong.
