# 0016 — The island's second pass: courses, garages, and counts for the world you're in

Date: 2026-10-09
Status: Accepted. Reverses one line of `0012` (the easter eggs are now counted) and one
of `0014` (an airstrip is now a counted place). Changes `0008` (counts are per world).
Numbered 0016 because 0015 is the stuck-and-winch decision, built the same day on
another branch.

## Context

The island shipped with one garage, no courses, and nothing counted. The owner asked
for courses and more garages there, and for the found-counts to say there is an airport
to look for ("0/1 airport found"). The counts shown should be for the world you're in.
The bank, church, schoolhouse and casino are to be called easter eggs and counted too,
and the same counts go on the leaderboard.

## Decision

- **Three garages on the island, one in each ring.** The Beach Shack stays. The Dune
  Outpost stands among the dunes on the far side from the camp, and the Jungle Lodge up
  in the trees. Both are the shack's hut in other materials (`hut()` in `garages.ts`).
  All three sell the Sandfly.
- **A café on the island's beach**, a short drive past the last tent toward the shack.
  It is the valley's café again, and friends are made there the same way.
- **Three courses on the island, one in each ring, all driven alone** (`planCourses()` in
  `island.ts`): Beach Run, Dune Dash and Jungle Loop. They pay on the valley's scale and
  through the same `complete_mission`.
- **Two tracks are cut through the jungle**, straight out to the dunes: one from the
  lodge's door and one from the jungle course's start. The trees are otherwise too thick
  to find a way in.
- **Every place is in one world** (`public.places.world`, `PLACES` in `places.ts`), and
  there are two more kinds. An **airport** is found by coming within sight of it, like
  a garage, and then stays on the map. An **easter egg** is found by looking inside (E
  at the door). Easter eggs still never go on the map or the compass.
- **The line shown is for the world you're in**, and only names the kinds that world
  has: "3/8 garages · 1/1 café · 0/1 airport · 2/4 easter eggs" in the valley,
  "1/3 garages · 0/1 café · 0/1 airport" on the island.
- **The leaderboard shows the same line for each friend**, counted for the world the
  viewer is in (`leaderboard(p_world)`).
- **Finding still pays nothing.**
- The map marks only what has been found in the world it shows. Before this, the
  valley's café was drawn on the island's map at the valley's coordinates.

## Consequences

- "0/1 airport" tells every valley player there is an airstrip to find. That is the
  point. It is still not on the compass, and still behind the river.
- The island's garages and both airstrips used to show wherever the fog had cleared.
  Now they show once found, so anyone who had already driven past one must pass it
  again.
- A page loaded before the migration calls `leaderboard()` with no world and still
  works. The new page against an old database falls back to that call, and counts the
  valley's garages and café only.
- The code can ship before the migration: until then the island's courses can be driven
  but `complete_mission` refuses to pay them, and `discover` refuses the new keys, so
  airports and easter eggs are counted only for the visit.
- Still unbuilt on the island: a convoy or race. First-time guidance is still about the
  valley only.
