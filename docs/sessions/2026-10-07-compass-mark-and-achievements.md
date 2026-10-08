# 2026-10-07 — Compass mark fix, garage-then-café guidance, achievements

## Topic

A new player (Kiki) saw the yellow guidance mark stuck mid-screen; fixed that, then
reworked first-time guidance and added two achievements shown on the leaderboard.

## Decisions made

- **The compass mark is moved with `style.translate`, never `style.transform`.** In
  Tailwind v4, `rotate-45` compiles to the CSS `rotate` property, which applies *before*
  `transform`. So `transform: translateX(...)` slid the diamond along its rotated axis:
  diagonally down into the sky, where it pinned at its clamp (±122 px). The CSS
  `translate` property applies before `rotate`, so the mark now slides flat under the
  compass. Fix is in `aim()` in `apps/web/src/app/Game.tsx`. Live since commit `0b3b60e`.
- **Guidance order is garage → café → (text only) buy → mission** (`GOALS` in
  `apps/web/src/app/goals.ts`). Only the first two put a mark on the compass
  (`target: "garage" | "cafe"`); `buy` and `mission` have `target: null`, so the mark
  goes away after the café, as the owner asked. The `"mission"` target and its branch in
  `aim()` were removed as dead code.
- **The café step now applies in single player too.** `Goal.online` is gone; instead a
  goal can carry `solo` text, and `currentGoal(done, online)` swaps it in when not
  online. Café: "Now find the café by camp. Meet friends there to add them." / solo
  "Now find the café by camp." The café goal still completes only while it is the
  current goal (in `aim()`), so the mark always leads there after the first garage.
- **Achievements are first-time goals** (`apps/web/src/app/achievements.ts`,
  `ACHIEVEMENTS`): `garage` → "First garage" (driving into a garage), `cafe` → "First
  café" (reaching the café after that). Tied to goals, not to found places (ADR 0008),
  because "found" triggers at 136 m and would toast while the guidance still says "Find
  a garage". Nothing new is stored: goals are already saved by `mark_goal`.
- **Toast is deferred until back on the road.** `goal(id)` in `Game.tsx` sets `cheer`;
  the drive branch of the frame loop says "Achievement: …" and clears it. Needed because
  the toast only renders while driving, and the garage achievement is earned at the end
  of the drive-in animation, right before the garage menu opens.
- **Leaderboard shows the achievements themselves, not a count**: yellow chips
  (`rgba(255,211,107,…)`, the compass mark's colour) under each name in `Leaderboard`
  in `Panels.tsx`, from `achievementsOf(r.goals)`. `Standing` gained `goals: string[]`.
  `SupabaseStore.leaderboard()` reads `r.goals ?? []`, so the client works (no chips)
  against the old server function.
- **Server: `leaderboard()` also returns `goals text[]`** —
  `supabase/migrations/20261007200000_achievements.sql` drops and recreates the function
  (Postgres can't change a function's result columns in place), same filters, same
  grants (authenticated only). Recorded as ADR 0009
  (`docs/decisions/0009-achievements.md`): achievements pay nothing and unlock nothing;
  a future achievement that isn't a goal needs a server-side source of truth first.

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/Game.tsx` | mark uses `style.translate`; `goal()` + `cheer` toast; dropped mission target |
| `apps/web/src/app/goals.ts` | new order, `solo` text, `target` only garage/café |
| `apps/web/src/app/achievements.ts` | **Created**: `ACHIEVEMENTS`, `achievementFor`, `achievementsOf` |
| `apps/web/src/app/Panels.tsx` | achievement chips on leaderboard rows |
| `apps/web/src/app/store.ts` | `Standing.goals`; both stores fill it |
| `apps/web/src/app/play.test.ts` | guidance order, solo wording, achievements tests (70 total pass) |
| `supabase/migrations/20261007200000_achievements.sql` | **Created**: `leaderboard()` returns `goals` |
| `supabase/tests/game.test.sql` | two checks: your goals and your friend's on the leaderboard |
| `docs/decisions/0009-achievements.md` | **Created** |
| `CLAUDE.md`, `docs/architecture.md`, `docs/roadmap.md` | mention achievements / ADR 0009 |

All of the above is on `main` (commits `0b3b60e`, `fc3d4e2`, `48fc30c`) and deployed to
gilbyy.com. Verified: typecheck, lint, 70 vitest tests, `pnpm build`; SQL tests on a
local Postgres ("all checks passed"); headless Chromium for the mark sliding level, the
café line after leaving a garage, the "Achievement: First garage" toast, and the chip on
the leaderboard (`?net=local`). The café arrival itself was not driven to in headless.

## Open questions

- **The migration is NOT applied to the live Supabase project `gilbyy`
  (`apqlumghzqkklmpwizex`).** `apply_migration` via the cloud session's Supabase MCP
  timed out at 60 s three times; each time the function was unchanged, no migration was
  recorded, and `pg_stat_activity` showed nothing waiting, so the SQL never reached the
  database (probably the MCP's confirmation for the destructive `drop function` expiring
  unanswered). Until it is applied, the live leaderboard shows no chips; everything else
  works.
- **Name tags are offset twice** (not fixed, owner not yet asked to): in `Game.tsx` the
  tag element has classes `-translate-x-1/2 -translate-y-full` (the CSS `translate`
  property) *and* an inline `transform: translate(x, y) translate(-50%, -100%)`, so tags
  sit half their width left and one height higher than intended. Fix: drop the two
  Tailwind classes. Unverified with two players.
- Arriving at the café → "First café" toast → mark gone has unit coverage but has not
  been seen in a browser.

## Exact next step

Apply `supabase/migrations/20261007200000_achievements.sql` to the live project
`apqlumghzqkklmpwizex` exactly as written (Supabase MCP `apply_migration` with name
`achievements`, approving the destructive-statement prompt; or `supabase db push` if the
CLI is linked; or the dashboard SQL editor). Then verify with:

```sql
select pg_get_function_result('public.leaderboard()'::regprocedure),
       has_function_privilege('anon', 'public.leaderboard()', 'execute') as anon_exec;
```

expecting a result that ends in `goals text[]` and `anon_exec = false`. Make sure
`supabase_migrations.schema_migrations` records it as version `20261007200000` (name
`achievements`) so it matches the repo like the previous four. Then run the rollback-only
SQL check from `supabase/tests/README.md` against the linked project, and finally sign in
on gilbyy.com and open the leaderboard (L) to see the chips.

## Tokens advisory

Stopped at a natural break: the code is live, and only the database migration (blocked
in the cloud session) remains.
