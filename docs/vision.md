# Vision

Gilbyy is a driving game at gilbyy.com. You load the site and drive a car around a small
cartoon world. That is the whole thing.

It is deliberately not a menu, a portfolio, or a launcher. Earlier versions of this
document tried to make the landing page navigate somewhere — an Overcooked-style map of
"levels," then a game whose buildings you drove into to reach another app. That framing
is gone; see `decisions/0004-gilbyy-is-just-a-driving-game.md`.

## The feel we're after

A lightweight version of **_Over the Hill_**, the indie driving game — its look and
feel, not its scope. Muted earthy palette, unhurried pace, a HUD that stays out of the
way, atmosphere doing more work than detail. We are not copying its 3D terrain or its
offroad simulation; we are copying the calm.

`docs/art-direction.md` is the standing brief and says what transfers and what doesn't.

## What it is

- A top-down world with roads, houses, trees and water.
- A car with arcade handling — accelerate, brake, reverse, steering that scales with
  speed.
- A camera that follows you, a minimap, a speedo.
- Keyboard on desktop, touch controls on phones.

## The feel we're after

A lightweight version of **_Over the Hill_**, the indie driving game — its look and
feel, not its scope. Muted earthy palette, unhurried pace, a HUD that stays out of the
way, atmosphere doing more work than detail. We are not copying its 3D terrain or its
offroad simulation; we are copying the calm.

`docs/art-direction.md` is the standing brief and says what transfers and what doesn't.

## What it is not

- Not a hub. It contains no links to any other app.
- Not gated. It is public; there is no login and no database.
- Not a real game engine. Everything is 2D canvas with no dependencies, and it stays
  that way — the Over the Hill reference is about mood, not 3D.

## Where it goes

It gets better as a game, incrementally, whenever there's an appetite for it. Rough
order of appeal:

- Collision with buildings and trees, so the world feels solid.
- Tyre marks, dust, an engine note.
- More to look at: a coastline, hills, level crossings, traffic.
- Something to do: a delivery, a time trial, a thing to collect.

None of that is committed. The only rule is that it stays free to run and stays fun to
drive.

## The other apps

`friendlybets`, `wellness-planner` and `beeriokart-dashboard` are separate repos and
separate Vercel projects. They get `bets.gilbyy.com`, `meals.gilbyy.com` and
`karts.gilbyy.com` because a shared domain is tidy and costs nothing extra.

That is a DNS arrangement and nothing more. **gilbyy.com does not link to them and does
not know they exist.** Do not reintroduce a relationship between them.
