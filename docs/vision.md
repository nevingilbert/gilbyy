# Vision

Gilbyy is a driving game at gilbyy.com. You load the site and drive a car around a small
cartoon world. That is the whole thing.

It is deliberately not a menu, a portfolio, or a launcher. Earlier versions of this
document tried to make the landing page navigate somewhere — an Overcooked-style map of
"levels," then a game whose buildings you drove into to reach another app. That framing
is gone; see `decisions/0004-gilbyy-is-just-a-driving-game.md`.

## The feel we're after

A lightweight version of **_Over the Hill_**, the indie driving game: its look and
feel, not its scope. Open-world driving with no multiplayer and no objectives, "not
even a game really". A few saturated colours held together by warm haze, a low sun,
an unhurried pace, a HUD that is nearly absent.

`docs/art-direction.md` is the standing brief and says what transfers and what doesn't.

## What it is

- One 3D valley of rolling hills, pine forest, boulders and two lakes, ringed by
  mountains that are both the horizon and the edge of the world.
- A boxy 4x4 on springy suspension: hills slow you and roll you back, the body leans
  in corners, crests can put you briefly in the air, trees stop you, shallow water can
  be forded.
- A high chase camera, a compass strip, nothing else on screen.
- Keyboard on desktop, touch controls on phones.

## What it is not

- Not a hub. It contains no links to any other app.
- Not gated. It is public; there is no login and no database.
- Not built on a game engine. It is three.js for rendering plus a few hundred lines of
  our own physics, and that is the whole stack. See
  `decisions/0005-go-3d-with-threejs.md`.

## Where it goes

It gets better as a place to drive, incrementally, whenever there's an appetite for it.
Rough order of appeal:

- Time of day: dusk, night with headlights, maybe weather.
- Dust, tyre tracks, an engine note.
- Water that looks like water: shoreline foam, ripples.
- More ground variety: streams, wildflowers, dirt trails.

None of that is committed. The only rule is that it stays free to run and stays
pleasant to drive.

## The other apps

`friendlybets`, `wellness-planner` and `beeriokart-dashboard` are separate repos and
separate Vercel projects. They get `bets.gilbyy.com`, `meals.gilbyy.com` and
`karts.gilbyy.com` because a shared domain is tidy and costs nothing extra.

That is a DNS arrangement and nothing more. **gilbyy.com does not link to them and does
not know they exist.** Do not reintroduce a relationship between them.
