# 0008 — Found garages and cafés stay on the map, and are counted

Date: 2026-10-07
Status: Accepted. Adds to `0007`; changes nothing in it.

## Context

The map's fog resets on every visit, and with it the garages you had found. The café
was marked from the start. After playing signed in for the first time, the owner asked
for three things: garages and cafés should stay on the map once found, you should see
how many you've found ("1/8 garages"), and that should show on the leaderboard.
Friends as dots on the map, which already existed, are enough as they are.

## Decision

- **A place is one of the eight garages or the café** (`places.ts`). It is found when
  the truck comes within the map's sight of it, the same rule garages already used.
  The café is no longer marked before you've found it. The camp still is.
- **Found places are drawn on the map whatever the fog is doing.** The fog itself is
  still forgotten each visit.
- **Signed in, they are saved.** `profiles.discovered` holds the keys, written only by
  `discover(p_key)`, which checks the key against the `places` table. The server can't
  see where a truck is, so like `mark_goal` it takes the client's word that it got
  there. Single player keeps them for the visit, like everything else.
- **The count shows in two quiet places:** under the full map, and under each name on
  the leaderboard ("3/8 garages · 1/1 café found").
- **The leaderboard is otherwise unchanged:** you and your friends, in order of miles.
  Finding places pays nothing and unlocks nothing.

## Consequences

- A modified client could claim all nine places. It gains a number beside its name
  among its own friends and nothing else, which is the same trust the café rule and
  the onboarding goals already rest on.
- The place list lives in `places.ts` and in the migration
  (`20261007120000_found_places.sql`); `places.test.ts` fails if they differ, or if
  the valley stops having exactly one garage of each style, since the style is the key.
  Adding a garage or a second café means a new migration row.
- Miles are still the only currency (`CLAUDE.md`, "don't add pressure"). If the counts
  ever start to feel like a score to chase, the leaderboard line is the part to drop.
