# 2026-10-16 — Vegas's walls, water, bubbles, the dev panel and a sweep of every world

## Topic

Bugs reported from playing: Vegas's buildings stopped trucks well short of their walls,
water was a crawl, and nothing showed a snorkel working. Then a way to test everything
without signing in, and a sweep of all five worlds with it, fixing what it found.

## Decisions made

- **Vegas's walls are the buildings' own** (`resortMasses` in `vegas.ts`): boxes and
  rounds for what each resort is built of, a little in from what's drawn; the lots are
  kept for planning courses, scatter and the map. `vegas-walls.test.ts` slices every
  resort's model at bumper height and holds the two together both ways.
- **Water**: `WATER` in `physics.ts` (push 0.4, drag 0.6, top 0.45): half a rig's wading
  depth leaves it over 60% of its top speed, full depth over 30%.
- **Bubbles** (`bubbles.ts`): up from just behind the back bumper while a snorkelled truck
  is deeper than it could go without the snorkel.
- **The dev panel** (`DevPanel.tsx`, `dev.ts`, `colliders-view.ts`; see `docs/dev-panel.md`):
  development builds only (`DEV` in `Game.tsx` is `process.env.NODE_ENV !== "production"`),
  single player only. `LocalStore.ownEverything()` is its one hook into progress.
- **The sweep** (`dev.ts`, `sweep.test.ts`): every place the game puts a truck down has
  room for every rig; a bot drives every course with a 2 m grid search (`wayThrough`)
  that follows the surface it's on; every course keeps out of the campground. In the
  panel the same sweep runs on the world as built, with the models' colliders.
- **Gates stand on what their course runs on** (`courseGround` in `missions.ts`): under a
  bridge, the road beneath, not the deck.
- **What the sweep found and fixed**: in San Francisco, trees in tents 6 and 13's bays and
  a boulder in the Great Highway's line-up (the scatter now gives way to every bay and
  line-up), the Embarcadero's line-up running into a building, the Great Highway starting
  on a thirty-degree camber by the Cliff House (a line-up now needs gentle ground as well
  as room), and the Presidio's line running through the Rob Hill camp's tents (it starts
  at the camp's way out and routes round the pitches); in Japan, Round the Lake starting
  in the camp's third row of tents (it starts on the shore below the camp and keeps out of
  it). The valley, the island and Las Vegas were clean.
- **`20261016120000_course_starts.sql`**: those four courses are a little shorter, so
  their `min_seconds` and `min_miles` follow. Written, not applied: the live values are a
  touch stricter, never looser, so honest runs pass either way.

## Files changed

`physics.ts`, `vegas.ts`, `vegas-model.ts`, `vegas-walls.test.ts`, `bubbles.ts`,
`palette.ts`, `scene.ts`, `dev.ts`, `DevPanel.tsx`, `colliders-view.ts`, `Game.tsx`,
`store.ts`, `city.ts`, `city-streets.ts`, `japan.ts`, `missions.ts`, `mission-run.ts`,
`convoy.ts`, `sweep.test.ts`, `supabase/migrations/20261016120000_course_starts.sql`,
`docs/dev-panel.md`.

## Open questions

- The migration needs the usual rolled-back dry run against the live project, then applying.
- Real-device frame rate is still unmeasured.

## Next step

Apply `20261016120000_course_starts.sql` after a dry run, with the owner's go-ahead.
