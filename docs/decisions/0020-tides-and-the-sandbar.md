# 0020 — A tide on the island, and a sandbar that only shows when it's out

Date: 2026-10-10
Status: Accepted. Built and tested; its migration has been on the live project since 2026-10-10.

## Context

The owner asked: "add tides to the island so some section gets hidden when the tide is
high", and then, "make that section have a mission in it."

The island's sea was one sheet of water at one height, for good. Everything on the
beach was laid out against that waterline: the tents 72 m up from it, the fire 36 m, the
café, and four courses that run along the sand, one of them (Tideline) within 32 m of it.

## Decision

- **The sea goes out and comes back every ten minutes** (`tide.ts`, pure and tested).
  It ebbs for 110 seconds, stays out for 270, floods for 110 and stays in for 110, easing
  at each turn so the sheet creeps and never jumps. It falls 1.6 m. Where it stands
  follows from the game clock alone, so signed in, where everyone shares a clock,
  everyone sees the same tide. It keeps its own time, not the sun's: a day is 925
  seconds, so low water comes round at a different hour each day, and sooner or later at
  sunset.
- **High water is where the sea has always stood.** The tide only ever takes the sea
  away. Nothing on the beach is flooded, no course that was there has changed, and every
  animal lives where it did. At low water there's about 35 m more beach all the way
  round.
- **The section that gets hidden is a sandbar off the camp** (`SANDBAR` in `island.ts`).
  It leaves the beach about 200 m past the last tent, runs 190 m straight out to sea,
  turns a quarter circle, and lies along the shore for 280 m in front of the tents,
  ending in a round bank. From the fire, that bank is under the setting sun. Its top is
  0.7 m under the sea at high water and 0.9 m clear of it at low. Its banks fall away
  into deep water, so it is a spit and not a shelf.
- **At high water it is a pale shoal with flags standing in the sea**, and a finish
  arch out beyond them. That is how anyone finds out it's there.
- **It is never deeper than any rig can wade.** The Sandfly wades least, 0.95 m, and
  the bar is under 0.77 m at most. Nobody is cut off out there: the drive home at high
  water is slow, not impossible. An islet you could be stranded on was the other design,
  and stranding is pressure.
- **A truck in deeper water than it can wade can always drive to where it's no
  deeper** (`physics.ts`). The sea could never rise round a truck before. Now a truck
  parked at the water's edge at low tide is in 1.6 m more of it ten minutes later, and
  the rule that stops you driving into the deep end would have stopped it driving out.
- **The course is Sandbar**: one to drive alone, from an arch up the beach above high
  water, twelve flags out along the spit and round the hook, to a finish on the bank at
  its end. It pays 25 miles the first time and 8 after, a little over what its length
  earns elsewhere, for the wait.
- **It can only be started while the tide has all of it dry** (`Mission.ebb`, 0.95 m
  below high water): about six minutes in every ten, and never more than four minutes
  away. Until then the arch says so, and roughly how long, in minutes. There is no
  countdown anywhere.
- **Once started, the tide can't end it.** If the sea comes back during a run, the
  truck wades the rest. Slower, and still a finish.
- **The server learns only that there is one more course**
  (`20261010180000_sandbar.sql`). It isn't told the tide and doesn't check it. A claim
  made at high water still needs the seconds and the banked miles of a run that was
  driven, and is paid no more than one at low. Checking would tie the database to the
  browser's clock for nothing.
- **Bared seabed is wet sand.** The ground's colours are baked into its vertices, so a
  few lines in the terrain's shader paint what the tide has uncovered the colour of the
  wet strip above it. At high water the island is exactly the picture it was.
- **Animals reckon by high water.** Crabs and gulls keep to the sand they had, so
  nothing follows the sea out to be caught when it comes back. Dolphins swim at
  whatever level the sea is.
- **Nothing was moved to make room.** The bar is raised and its course added after the
  trees, rocks and bushes are scattered, and the scatter never reached below the tide
  line, so every one of them is where it was. So are the eight older courses.
- **The map doesn't change with the tide.** It is a chart of the island at high water,
  and the bar shows on it as shallows once the fog over it has cleared.
- **`?tide=low` or `?tide=high`** holds the tide there, for checking by screenshot, like
  `?hour=`.

## What we didn't do

- A tide in the valley. Lakes don't have one.
- A tide table, a clock, or anything on the HUD. The sea is on screen.
- A second course for friends to keep the island's halves even (ADR 0019). The island
  now has five to drive alone and four for friends. A convoy that has to wait for the
  sea is a harder thing to gather, and one course was what was asked for.
- Surf, foam or a moving waterline. The sheet is flat and the shore is where it meets
  the sand.

## Consequences

- The beach is wider or narrower each time you look, and there is a place that is
  sometimes there. Both are reasons to come back to the camp that aren't a timer.
- Sandbar is the one course that isn't always open. It pays the same whenever it's
  driven, and nothing is lost by missing a low tide: there's another in ten minutes.
- A truck can now be in water deeper than it could have driven into. It can leave
  toward the shallows and no other way, and it crawls while it's in there.
- Photo mode stops the tide with the rest of the world. Signed in, the shared clock
  carries on, and the sea catches up when the camera is put away.
- Single player, the tide follows the page's own clock: the sea starts to ebb as the
  page loads.
- The server has to know the course before the game offers it: without its row a
  signed-in finish on the sandbar is refused ("no such mission"). So the migration went
  onto the live project before this was merged.
