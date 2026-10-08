# 2026-10-08 — A daily allowance of miles, so agents can't farm them

## Topic

The owner asked that people not be able to use their agents to pile up miles. Built a
server-side allowance on banked miles, on branch `feat/miles-allowance`.

## Decisions made

- **The hole, as found.** The server can't tell a player from a program, and the repo
  is public, so anything holding a player's sign-in can make the game's calls:
  - `add_miles` banked 0.02 mi per second since the last call (72 mph, around the
    clock, no game needed): 1,728 mi/day.
  - `complete_mission` paid each mission's repeat reward every 600 s to any run no
    faster than `min_seconds`: 417.6 mi/day.
  - The whole shop costs 236 mi. The fastest rig really peaks at 51.5 mph (measured
    with `physics.step` on the real terrain); starters top out at about 36.
- **Fix: bound what any account banks, rather than try to prove a person is driving**
  (ADR 0010, `docs/decisions/0010-a-daily-allowance-of-miles.md`):
  - Each account has an allowance of up to **100 miles**, refilling at **50 a day**,
    continuously. There is no midnight reset, and it can't build up past 100, so there
    is no streak or login pressure.
  - `add_miles` and **repeat** mission rewards spend it. A mission's **first** finish
    always pays in full, because it pays once per account, ever (9 mi total).
  - With nothing left the truck drives on, and miles bank as the allowance refills
    (about 2 an hour).
  - The 72 mph check (`0.02`, `5` per call) was deliberately left as is.
  - **Single player has no allowance** (`LocalStore.allowance()` returns `Infinity`):
    nothing is kept, so there is nothing to farm, and `?miles=` still works.
- **Considered and rejected** (all recorded in ADR 0010): proof of driving from
  positions (forgeable from the public repo), Turnstile or another CAPTCHA (needs
  server-side verification, adds friction, agents pass them), `navigator.webdriver`
  detection (client-only and trivially removed), and a tighter speed check alone
  (doesn't bound a script that never sleeps).
- **Server** (`supabase/migrations/20261008000000_miles_allowance.sql`):
  - `profiles` gains `allowance numeric(8,3) default 100` and
    `allowance_at timestamptz default now()`.
  - `public.allowance_now(p public.profiles)` computes
    `least(100, p.allowance + extract(epoch from now() - p.allowance_at) * 50 / 86400)`.
    It is revoked from `public`, `anon` and `authenticated`, so only the security-definer
    functions use it. Taking a row type, it would otherwise appear as a PostgREST
    computed column.
  - `add_miles` and `complete_mission` are `create or replace`d (grants kept). A repeat
    run with nothing left is still recorded in `mission_runs`, with `reward = 0`.
- **Client mirror** (`apps/web/src/app/store.ts`):
  - `ALLOWANCE = { cap: 100, perDay: 50 }`, `allowanceAfter(miles, seconds)`.
  - New `Store.allowance()`.
  - `SupabaseStore`: tracks `left` (from each returned row via `allowanceOf`) and
    `sending` (miles in flight), and `addMiles` banks only up to `allowance()`, so the
    HUD counter stops where the server would instead of jumping back after a flush.
  - `allowanceOf` trims Postgres microseconds before `Date.parse` (Safari caution) and
    falls back to "reported just now" on an unparseable timestamp. A row with no
    `allowance` (database not migrated yet) counts as full, so client and migration can
    deploy in either order.
- **UI** (`Game.tsx`): there is no meter.
  - When `store.allowance() < 0.01`, a single toast says "That's a long day's driving.
    Miles bank slowly from here until tomorrow." The `rested` flag stops it repeating
    until the allowance is back above 5.
  - A mission paying under 0.1 mi says "…so this one's just for fun." instead of
    "+0.0 mi".
- **Rule added to `CLAUDE.md`:** anything new that pays miles must spend the allowance.

## Files changed

| Path | Change |
| --- | --- |
| `supabase/migrations/20261008000000_miles_allowance.sql` | **Created**: columns, `allowance_now()`, new `add_miles` and `complete_mission` |
| `supabase/tests/game.test.sql` | 10 new checks (allowance limits, refill, cap, missions, no self-write, privileges) |
| `supabase/tests/README.md` | Mentions the allowance among the rules checked |
| `apps/web/src/app/store.ts` | `ALLOWANCE`, `allowanceAfter`, `Store.allowance()`, `SupabaseStore` mirror |
| `apps/web/src/app/Game.tsx` | Out-of-allowance toast; zero-pay mission message |
| `apps/web/src/app/shop.test.ts` | Parses the migration so `ALLOWANCE` and the column default match the SQL |
| `apps/web/src/app/play.test.ts` | 7 tests: refill maths, odometer stop, in-flight miles, refill on reopen, bad timestamps, unmigrated database, single player |
| `docs/decisions/0010-a-daily-allowance-of-miles.md` | **Created**: the ADR |
| `docs/decisions/0007-accounts-multiplayer-and-a-shop.md` | Amended line pointing to 0010 |
| `docs/architecture.md`, `docs/roadmap.md`, `CLAUDE.md` | Migration note, "you are here" line, Don't rule, layout and status |

## Verification

- SQL: all checks pass on a local Postgres 16 with `local-stubs.sql`.
  - Mutation check: with the old `add_miles` and `complete_mission` kept, "miles bank
    only as far as the allowance goes" fails.
  - The local runner script lived outside the repo. The README's recipe works, but on a
    reused cluster drop roles `anon` and `authenticated` between runs.
- vitest: 81 pass. Mutating out the cap in `addMiles`, or `sending` in `allowance()`,
  each fails one test.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` are clean.
- **Not seen in a browser.** The toast only fires signed in, and this cloud session
  can't sign in. The `say()` path itself is the one every other toast uses.

## Open questions

- **The migration is not applied to the live project** (`gilbyy`, ref
  `apqlumghzqkklmpwizex`). Until it is, the hole is open on gilbyy.com.
  - Earlier sessions applied migrations with `supabase db push` from the owner's Mac
    (the password is in the gitignored `supabase/.env`), so the remote history matches
    the file names.
  - The Supabase MCP's `apply_migration` would record a different version, and a later
    `db push` would then try to re-run the file.
- **The numbers are the owner's call.** 100 and 50/day assume about 25 mph of average
  driving. If real players hit the limit, raise them: the two literals in
  `allowance_now()` and `ALLOWANCE` in `store.ts`, plus the column default (a new
  migration, since this one will have been applied). `shop.test.ts` holds them
  together.
- **Not merged.** `feat/miles-allowance` is pushed; no PR yet.
- Pre-existing quirks, not fixed: `add_miles(null)` banks the per-call maximum, because
  `least()` ignores nulls, and `complete_mission` with `p_seconds = null` skips the
  "too fast" check. Both are now capped by the allowance and gain nothing over a forged
  number.

## Exact next step

Apply `supabase/migrations/20261008000000_miles_allowance.sql` to the live project:

1. On the owner's Mac, from the repo root on `feat/miles-allowance`, run
   `supabase db push`.
2. Run the SQL checks against the linked project with the rollback recipe in
   `supabase/tests/README.md`; it should end with `ALL CHECKS PASSED`.
3. Merge `feat/miles-allowance` to `main` so Vercel deploys the client.
4. Signed in on gilbyy.com, check that miles still bank normally (the balance climbs,
   then survives a reload).
5. Optionally force the toast: in the SQL editor, set your own
   `profiles.allowance = 0.05, allowance_at = now()`, reload and drive. The toast
   should show once, and the balance should stop.

## Tokens advisory

Stopped at a natural break: everything built, tested, documented and pushed to the
branch. Only the production migration and the merge are left, both awaiting the
owner's go-ahead.
