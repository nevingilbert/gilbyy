# 2026-10-18 — A full review of the game, and thirty fixes

## Topic

With the dev panel letting everything be tested without signing in, a review of the
whole game by ten agents: five reviewers (driving and trips, the worlds, the game loop and
UI, online play and the database, rendering) and a skeptic for each, who tried to refute
every finding, mostly by reproducing it in a probe. 33 findings, three found twice: 30
distinct bugs, none refuted. All 30 fixed, by five agents working in parallel on files
that didn't overlap, then put together and checked here.

## Decisions made

- **Cliffs capped at 40 degrees** (the owner's call). `MAX_CLIMB` in `physics.ts`: gravity
  and progress use the true slope, and no rig makes headway up ground steeper than the cap.
  Off road the ground's full slope counts; on paved ground only the grade along the truck,
  so city streets that cross a hillside at a gentle grade stay drivable. A handful of real
  city streets are steeper than 40 degrees along themselves (Telegraph Hill's, a stretch of
  Union St) and now have to be driven round uphill. The dev sweep's `standable()` uses the
  same cap.
- **Profiles are readable by the player and their friends only** (the owner's call), and
  **a convoy claim needs a friend among the crew who drove**. Both in
  `20261017120000_crews_and_profiles.sql`, applied on 2026-10-18 after a rolled-back dry
  run; the checks pass against the migrated project. The client reads profiles directly
  only for its friends' names, so the order of deploy and migration didn't matter.
- **Gates face the way in where the line turns more than 90 degrees** (`gatesAlong`), and a
  course whose last point repeated an earlier one finishes the right way. No gate moved, so
  no limits changed. A loop that comes home to its own start arch finishes under it.
- **San Francisco's landmarks clear the streets**; Pier 39 stands over the water.
- **The valley's roads**: the station road goes round the workshop, and it and the café
  road are graded, so a stock truck drives both both ways.
- **Lights**: the count of real lights (and so the shaders) stays the same all session. Your
  own truck has its beams; three more (`createBeamPool` in `car-model.ts`) are lent each
  night frame to the three other trucks nearest the camera, friends' or BBB's, and further
  off a truck's lamps only glow. The pool is made the first time another truck is drawn,
  so single player never pays for it. (The owner asked for nearby trucks to light the road
  again after the first version took all other trucks' beams away.)

## Open questions

- Realtime broadcasts carry no sender the server vouches for, so a forged convoy count or
  leave in another crew member's name is still believed. Closing it needs a server-checked
  sender (per-pair channels, or a function that relays).
- A player whose truck is in San Francisco, on a browser too old to open its map, sees a
  message on the opening shot but has no way to sign out from there.
- The final bank on pagehide is an ordinary fetch, which a browser may cancel; banking on
  hiding the tab covers most of it.
- Some city houses stand over alleys (Cooper Aly, Kimball Pl, Chatham Pl, Tenny Pl):
  `layBuildings` checks only a lot's corners.
- The dev panel's "Check this world" wasn't run in the browser this time: the preview tool
  served the shared checkout after the session resumed. The vitest sweep covers every world.

## Next step

Merge the pull request, then play the moved courses, a convoy and a tow signed in.
