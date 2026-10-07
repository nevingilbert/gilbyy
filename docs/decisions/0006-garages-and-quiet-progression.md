# 0006 — Garages, upgrades unlocked by miles, and a map you uncover

Date: 2026-10-06
Status: Accepted, partly superseded by `0007`: miles are now spent in a shop rather than
unlocking tiers, and progress is kept on the server when signed in (or not at all in
single player) rather than in `localStorage`. Narrowed the "no scores, timers or
achievements" rule in `CLAUDE.md` and `art-direction.md`, and the "nothing to persist"
line. Builds on `0005`.

## Context

With the 3D valley in place, the owner asked for more to do while still keeping it "not
even a game really":

- a bigger valley;
- a map that shows unexplored ground greyed out, reset on every visit;
- garages in different styles around the map (a roadside workshop, a barn, an
  underground bunker with a trap door and a ramp, and so on), entered with a key press;
- upgrades in the garages (paint, tyres, lights, snorkel) in tiers, each needing more
  miles driven;
- bigger tyres that can climb over rocks;
- a river that needs the snorkel;
- day and night, where stock headlights are weak and better lights help;
- a train looping the valley, with level crossings whose barriers drop as it passes.

Three of those brush against standing rules: tiers gated by miles is progression,
remembering upgrades needs storage, and a future idea (buildings that take you to other
gilbyy.com pages) contradicts `0004`.

## Decision

- **Miles are the only progress, and nothing is ever lost.** An odometer counts real
  distance driven. Each tier unlocks at 1, 3, 6 and 12 miles; once unlocked, a part can
  be fitted or removed freely at any garage, at no cost. There are still no scores,
  timers, objectives, failure states or currencies. This is the one sanctioned exception
  to "no achievements", and it should stay this quiet.
- **Persistence is `localStorage` only:** miles and the fitted loadout, under
  `gilbyy.progress.v1`, read defensively (a garbled or locked store means a fresh
  start, and a part above your unlocked tier is dropped). No server, no account. This
  narrows "nothing to persist" to "nothing that leaves the browser".
- **The map's fog of war is deliberately not persisted.** Every visit starts
  unexplored, as asked.
- **Upgrades change the driving, not just the look.** Tyres raise clearance (rocks
  under it become bumps the suspension rides over), grip on climbs, and ride height.
  Lights set the headlight beams' reach, spread and power at night. The snorkel raises
  wading depth from 1.3 m to 2.6 m. The rivers are 2.2 m deep in their channels, so they
  gate the east side of the valley until you have it.
- **Buildings that link to other gilbyy.com pages are not built.** That would reverse
  `0004` ("gilbyy.com does not link to the other apps"). When the owner wants it, it
  needs its own ADR superseding `0004`, not a quiet exception.

## Consequences

- The valley is now 4 km square (about 3.2 km of drivable bowl), generated in ~0.5 s,
  with two rivers, a railway loop with two trestle bridges and four level crossings,
  and six garages: four on the near side, two (the bunker and the log cabin) across the
  river.
- `terrain.ts` floods the grid from the spawn point twice, at stock and snorkel wading
  depths, to know which ground needs the snorkel. Tests assert the river really cuts
  off part of the valley and that two garages are on the far side.
- Each garage interior is a separate small scene (`showroom.ts`) rendered instead of
  the world while the menu is open; the world pauses.
- Time of day runs on its own clock: ~15 minutes per day, opening at 16:00, nights
  quicker than days.
