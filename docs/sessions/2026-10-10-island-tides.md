# 2026-10-10 — A tide on the island, and the sandbar

## Topic

The owner asked: "add tides to the island so some section gets hidden when the tide is
high", and then "make that section have a mission in it". ADR
`docs/decisions/0020-tides-and-the-sandbar.md`.

Built in a worktree, `.claude/worktrees/island-tides` (branch `feat/game-island-tides`,
from `origin/main` at `b27baeb`), because the shared checkout was eleven commits behind.
The owner then said "yes, apply the migration and open a PR": the migration is on the
live project and the branch is open as pull request 23, not merged.

## Decisions made

- **The tide** (`tide.ts`, pure): ten minutes round. 110 s ebbing, 270 s out, 110 s
  flooding, 110 s in, eased with a cosine at each turn. It falls 1.6 m (`TIDE.fall`).
  `ebbAt(time)` is metres below high water; `untilEbb(time, least)` is seconds until
  it's next at least that far out. Game time in, so the shared clock gives everyone the
  same tide. A tide that began ebbing at time 0.
- **High water is the old sea level** (`WORLD.water`). The tide only uncovers. That is
  why nothing on the beach had to move and no existing test changed its numbers.
- **`World.setTide(ebb)`**: the island's `waterAt` returns `WORLD.water - ebb`; the
  valley's is a no-op. `Game.tsx` calls it every frame outside the garage, the map and
  photo mode, with `heldTide ?? ebbAt(time)`.
- **The sandbar** (`SANDBAR`, `sandbarOf`, `raiseSandbar` in `island.ts`): leaves the
  beach 16° round the shore from the camp's middle (237 m past the last tent), 190 m
  out, a quarter turn of radius 100 m, 280 m along. Half-width 23 m, a round bank of
  radius 42 m at the end. Top at −0.7 m ± 0.07 of ripple. Banks: `0.08e + 0.004e²` below
  the top, `e` metres outside the edge. Only ever raises the seabed.
- **Raised after the scatter**, and the flood (`zone`) moved to after it. The top is
  below −0.5, where the rock scatter stops before it draws a random number, but grid
  interpolation near the root could still have tipped a candidate over, so the bar goes
  in once every `rand()` has been drawn. Anything within 7 m of the new course's line is
  then filtered out (nothing was: rocks and bushes are still at their caps).
- **The course** (`sandbarCourse`): `sandbar`, "Sandbar", crew 1, thirteen gates (twelve
  flags 50 m apart, 8 m either side of the middle line, and a finish 20 m short of the
  end), start arch 36 m up the beach. `minSeconds` 24, `minMiles` 0.24, 25 / 8 miles.
  `ebb` 0.95: the lowest sand on its line, plus 0.15 m, rounded up to 0.05.
- **`Mission.ebb`** gates the start only. `tideWait(m)` in `Game.tsx`; the prompt is
  `{ kind: "mission", mission, wait }`, and with `wait > 0` the card says "The sand's
  under the sea for now. The tide's out again in about N min." (or "nearly out" under
  50 s), with no E and the button disabled. E does nothing then.
- **`physics.ts`**: the deep-end rule now also requires the next spot to be deeper than
  where the truck is, so a truck the tide rose round can drive out.
- **`wildlife.ts`**: `passable()` reckons a sea world's water at `WORLD.water`, so
  animals behave exactly as before; `swimAt()` takes the sea's level so dolphins ride it.
- **`terrain-mesh.ts`**: `buildTerrainMesh` returns `{ object, setSea }`; on a sea world
  its material's shader mixes bared seabed (below −0.3 … −0.6, above the sea) to
  `PALETTE.wetSand`. `buildWaterMesh` gained `setSea`, which moves the sheet.
  `scene.ts` calls both each frame from `world.waterAt(0, 0)`.
- **Server**: one row in `missions`. The tide isn't checked there (ADR 0020 says why).
- **`?tide=low|high`** holds the tide, for screenshots.

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/tide.ts` | **New.** `TIDE`, `TIDE_LENGTH`, `ebbAt`, `untilEbb` |
| `apps/web/src/app/tide.test.ts` | **New.** 6 tests: range, period, no jumps, out longer than in, `untilEbb` against `ebbAt`, longest wait |
| `apps/web/src/app/island.ts` | `SANDBAR`, `sandbarOf`, `raiseSandbar`, `sandbarCourse`; the bar and course go in after the scatter; `setTide`; `waterAt` follows the tide |
| `apps/web/src/app/missions.ts` | `Mission.ebb` |
| `apps/web/src/app/world.ts` | `World.setTide`; the valley's is a no-op |
| `apps/web/src/app/physics.ts` | A truck can always go where it's no deeper |
| `apps/web/src/app/wildlife.ts` | Animals reckon by high water; dolphins swim at the sea's level |
| `apps/web/src/app/terrain-mesh.ts` | `setSea` on the terrain (wet-sand shader) and on the water (the sheet's height) |
| `apps/web/src/app/scene.ts` | Keeps the terrain's handle; sets the sea each frame |
| `apps/web/src/app/Game.tsx` | `setTide` each frame, `?tide=`, `tideWait`, `tideLine`, the waiting card |
| `apps/web/src/app/courses.test.ts` | `drive()` puts the tide out for a tidal course; "the sandbar", 6 tests; the list and the split |
| `apps/web/src/app/physics.test.ts` | 1 test: out of water that rose, never further in |
| `apps/web/src/app/airport.test.ts`, `convoy.test.ts` | The ninth island course; the dry-line check skips it |
| `apps/web/src/app/shop.test.ts` | The convoy wording is looked for in the newest migration that defines `complete_convoy`, not the newest migration |
| `supabase/migrations/20261010180000_sandbar.sql` | **New.** The `sandbar` row |
| `supabase/tests/game.test.sql` | The island has five courses to drive alone, four for friends |
| `docs/decisions/0020-tides-and-the-sandbar.md` | **New.** The ADR |
| `CLAUDE.md`, `docs/roadmap.md`, `docs/architecture.md`, `docs/art-direction.md`, `docs/vision.md` | Product line, layout, "Don't add pressure", status; the rest brought up to date |

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (260 passing: 247 + 13),
`pnpm build`. In the browser, single player with `?world=island`: low water and high
water from behind the arch and from the camp's fire at sunset; the card at the arch
through a whole tide ("about 4 min" down to "nearly out", then "Start Sandbar"); a run
started at low water through its first flags; the clock jumped to high water mid-run
(the truck waded on at 6 mph, the run still live); the full map (the bar shows as
shallows inside the sheet's edge); the waiting card at 375 px. No console errors.
The Browser pane was hidden, so frames were stepped by hand through a temporary hook
that has been removed. Frame rate not judged.

## Open questions

- **The migration is live (2026-10-10).** It and every check in `game.test.sql` passed
  a dry run on the live project, in one transaction that rolled back and left nothing
  (no `sandbar` row, no test players). `supabase db push` refused: Cartier chains' file
  (`20261010090000`) went on by hand and isn't in the project's migration history, and
  it sorts before the newest one that is. So the sandbar file's SQL was run with
  `supabase db query --linked -f`, and `supabase migration repair --status applied
  20261010180000` recorded it. Every check passes against the migrated project. The
  Cartier chains gap is as it was; `supabase db push --include-all` would close it.
- The worktree isn't linked to the Supabase project. For the CLI, `supabase/.temp` and
  `supabase/.env` were copied in from the shared checkout and removed again afterwards.
- **Not played signed in**, so not seen from two browsers at once. The tide is a pure
  function of the shared clock, so two players should agree to within their clocks'
  difference.
- How visible the bar should be at high water. It reads as a pale shoal with flags in
  it. Lowering `SANDBAR.top` hides it more, but 0.95 m is the Sandfly's wading depth, so
  there is about 0.15 m to spare.
- Wading the bar at high water is slow (about 6 mph for a starter). A run begun just
  before the tide turns takes minutes to finish. It never fails, but it may want the
  start closing a little before the sea arrives.
- The island now has five courses to drive alone and four for friends (ADR 0019 had
  made them even).
- The 10 m grid shows as a stepped edge along the bar's banks at low water.

## Exact next step

Merge pull request 23 (the owner's to do: merging is refused to the session). Then fly to the island signed in, wait at the arch past the
last tent for the tide, and drive Sandbar: the finish should pay 25 miles. Seen from a
second browser, the sea should stand at the same height.

## Tokens advisory

Natural break: built, tested and looked at; no token limit was hit.
