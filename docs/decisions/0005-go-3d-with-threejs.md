# 0005 — Go 3D, with three.js as the one rendering dependency

Date: 2026-10-06
Status: Accepted. Reverses the "stay 2D, no 3D library" rule in `CLAUDE.md`,
`vision.md` and `art-direction.md`. Leaves `0004` untouched: it is still only a
driving game.

## Context

The visual target has been "a lightweight _Over the Hill_" since 2026-08-28, but the
game was a flat top-down canvas, and the docs ruled out 3D to keep it dependency-free.

Looking at the actual footage (both Steam trailers, frame by frame, plus the 14 store
screenshots) showed the two goals could not both hold. Nearly every frame of Over the
Hill is carried by things a top-down plane cannot have: a horizon, distance haze
dissolving the hills into the sky colour, a low sun raking across terrain relief, long
shadows. The top-down build could borrow the colours and the calm, and that was its
ceiling.

The footage also showed its gameplay camera is a high chase cam looking steeply down at
the car — so a 3D version does not need a cinematic camera or a huge view distance to
feel right. Fog hides the far distance, which also keeps rendering cheap.

What is actually wanted, in the owner's words: open-world driving, no multiplayer, "not
even a game really", but it should feel like Over the Hill. Dropping 2D was approved
explicitly.

## Decision

Rebuild the game in 3D on **three.js** (MIT, free, ~144 KB gzipped in the bundle),
rendering with plain `WebGLRenderer`.

- **three.js is the only new runtime dependency.** No game engine, no physics engine,
  no react-three-fiber, no post-processing stack. The car physics stays a hand-written
  pure `step()` over a heightfield, unit-tested like before.
- **One valley, generated deterministically at load.** Rolling hills from seeded
  simplex noise, rocky outcrops, two lakes, and a ring of mountains that is both the
  horizon and the edge of the world. No asset files, no streaming.
- **Look:** low-poly, smooth-shaded terrain with flat-shaded rocks and trees, heavy warm
  exponential fog matched to a gradient sky, a low golden-hour sun with shadows that
  follow the car, wind-swayed grass tufts near the car.
- **Feel:** slopes slow you and roll you back, the body sways and leans on springs,
  crests can put you briefly in the air, trees and big boulders stop you, shallow water
  can be forded and deep water can't be entered.

## What we still don't take from Over the Hill

Co-op, winch, planks, mud and snow deformation, the photo compendium, day/night cycle,
multiple maps and vehicles. Some of these (day/night especially) are good candidates
later; none is needed for "drive around and enjoy it".

## Consequences

- `CLAUDE.md`'s "don't reach for a 3D library" rule now reads "don't reach for a game
  engine or a physics engine". three.js is allowed; anything beyond it needs its own
  ADR.
- Free-tier rule unaffected: three.js is free, and the app is still one static page.
- Performance is now a real constraint, especially on phones. The scene is roughly 0.8M
  triangles before culling: trees, bushes and rocks are instanced in 400 m tiles so
  off-screen tiles cull, grass exists only within ~60 m of the car, and terrain does not
  cast shadows. If phones struggle, the first levers are grass radius, tree count and
  pixel ratio.
- Verification by screenshot needs a WebGL-capable browser. In headless Chromium,
  SwiftShader works but renders at ~3 fps, so screenshots are fine and frame-rate
  judgements are not.
