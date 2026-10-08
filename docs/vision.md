# Vision

Gilbyy is a driving game at gilbyy.com. You load the site and drive a 4x4 around a
low-poly valley, alone or, signed in, alongside everyone else who's on. That is the
whole thing.

It is deliberately not a menu, a portfolio, or a launcher. Earlier versions of this
document tried to make the landing page navigate somewhere — an Overcooked-style map of
"levels," then a game whose buildings you drove into to reach another app. That framing
is gone; see `decisions/0004-gilbyy-is-just-a-driving-game.md`.

## The feel we're after

A lightweight version of **_Over the Hill_**, the indie driving game: its look and
feel, not its scope. Open-world driving first, with a little to do for anyone who wants
it. A few saturated colours held together by warm haze, a low sun, an unhurried pace, a
HUD that is nearly absent.

`docs/art-direction.md` is the standing brief and says what transfers and what doesn't.

## What it is

- One 3D valley about 5 km across: rolling hills, pine forest, boulders, three lakes,
  two rivers and a snowy plateau with a frozen lake, ringed by mountains that are both
  the horizon and the edge of the world.
- A campground of thirty tents where everyone starts, and a café down the road.
- Eight rigs, each inspired by a real off-roader: three free starters (a boxy '80s
  SUV, a retro two-door, a little pickup) and five more to buy, up to a wide desert
  truck. All of them sit on springy suspension: hills slow you and roll you back, the
  body leans in corners, crests can put you briefly in the air, trees stop you, shallow
  water can be forded, and snow and ice slide.
- Day and night on a fifteen-minute clock. Stock headlights are weak.
- A train that loops the valley, with level crossings whose barriers drop as it passes.
- Eight garages in different styles, each a shop. The miles you drive are what you spend
  there, on rigs, paint, tyres, lights, a snorkel and snow chains. Bigger tyres climb
  rocks, the snorkel crosses the rivers, and studded tyres or chains grip the snow.
- Four challenge courses (a forest slalom, a ridge climb, a lake loop and an ice drift)
  that pay out miles; a convoy by the café for two to four friends, who drive it
  together and are paid when everyone is home; and a race by the camp, where every
  finisher is paid the same and the winner gets only the win. None of them is required.
- A first-time guide line, one thing at a time, pointing at the compass.
- A map that starts grey and fills in as you explore, fresh on every visit.
- A high chase camera, a compass, a minimap, a speedometer and an odometer. Little else on
  screen.
- Keyboard on desktop, touch controls on phones.
- With no sign-in, single player, and nothing is kept. Signed in, your miles and garage
  are saved, you share the valley with everyone else signed in, you add friends by
  meeting at the café, you chat with friends nearby, and a leaderboard compares your
  miles with theirs.

## What it is not

- Not a hub. The only links out are four easter eggs: a bank, a church, a school and a
  casino hidden in the valley, each with a card pointing at one of the owner's other
  projects. They are not on the map and count for nothing. See
  `decisions/0012-easter-egg-buildings.md`.
- Not gated. It is public and fully playable with no login. Signing in only adds saving
  and company. See `decisions/0007-accounts-multiplayer-and-a-shop.md`.
- Not built on a game engine. It is three.js for rendering plus a few hundred lines of
  our own physics, and that is the whole stack. See
  `decisions/0005-go-3d-with-threejs.md`.

## Where it goes

It gets better as a place to drive, incrementally, whenever there's an appetite for it.
Rough order of appeal:

- Weather: rain, fog banks, a storm at night.
- Dust, tyre tracks, an engine note.
- Water that looks like water: shoreline foam, rivers that flow.
- More ground variety: wildflowers, dirt trails between the garages.

None of that is committed. The only rule is that it stays free to run and stays
pleasant to drive.

## The other apps

`friendlybets`, `wellness-planner` and `beeriokart-dashboard` are separate repos and
separate Vercel projects. They get `bets.gilbyy.com`, `meals.gilbyy.com` and
`karts.gilbyy.com` because a shared domain is tidy and costs nothing extra.

That is a DNS arrangement and nothing more. The game shares no auth, data or deploys
with any of them. Since 2026-10-08 four hidden buildings each link to one of the owner's
projects (`decisions/0012-easter-egg-buildings.md`); that is a static link on a card and
the whole of the relationship. Do not grow it into a menu.
