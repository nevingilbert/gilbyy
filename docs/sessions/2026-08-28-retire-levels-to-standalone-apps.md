# 2026-08-28 — Retire levels and auth; gilbyy becomes a static landing page

**Read this before the older checkpoints.** Everything in `docs/sessions/` dated
2026-04-30 and 2026-05-10 describes an architecture this session reversed. Those files
are kept as a record of what happened, not as instructions.

## Decision

Levels are no longer route groups in this repo. Each is its own repo, its own Vercel
project, and its own subdomain. gilbyy.com is just the landing page, and it is becoming
a rudimentary cartoon open-world driving game.

Written up as `docs/decisions/0003-levels-as-standalone-apps.md`.

The reason: all three levels had already been built as standalone apps
(`friendlybets`, `wellness-planner`, `beeriokart-dashboard`) while the route groups in
this repo never got past 12-line "coming soon" stubs. The Meals schema was the only
real work under them, and `wellness-planner` had overtaken it. The docs were describing
a plan reality had abandoned.

## Files changed

| Path | Change |
| --- | --- |
| `apps/web/src/app/(bets,karts,meals)/` | **Deleted** — 3 stub pages + the 512-line meals migration |
| `apps/web/src/lib/meals/types.ts` | **Deleted** — 503 lines of generated meals types |
| `docs/levels/` | **Deleted** — bets.md, karts.md, meals.md |
| `apps/web/src/app/(authed)/map/page.tsx` | `levels` array now links out to the standalone apps |
| `docs/decisions/0003-...md` | **Created** — the ADR |
| `docs/vision.md` | Rewritten: subdomains, public landing, the lost-SSO gap |
| `docs/architecture.md` | Rewritten: separate apps, no database, subdomain hosting table |
| `docs/roadmap.md` | Rewritten around Phases A–E |
| `CLAUDE.md`, `README.md` | Updated; "pre-code" status was months stale |
| `apps/web/src/proxy.ts` | **Deleted** — the auth middleware |
| `apps/web/src/app/(marketing)/` | **Deleted** — the magic-link login page |
| `apps/web/src/app/auth/`, `app/actions/` | **Deleted** — callback route and auth server actions |
| `apps/web/src/lib/supabase/` | **Deleted** — server + browser clients |
| `apps/web/src/app/(authed)/map/` | **Moved** to `src/app/page.tsx`; `HubNode` inlined as plain SVG (it existed only to sign out) |
| `apps/web/package.json` | Dropped `@supabase/ssr` and `@supabase/supabase-js` |

The map still points at `.vercel.app` URLs, deliberately — gilbyy.com is not bought
yet. Swap them to subdomains in Phase B.

## Auth removed too

Confirmed during the session that gilbyy.com needs no Supabase at all — you load the
site and drive around, and each level handles its own login. So the entire auth layer
came out, not just the levels. `/map` was the only page behind the gate, so it moved up
to `/` and the route groups collapsed. The app is now two static routes (`/` and
`/_not-found`) with no middleware and no server-rendered pages.

Verified after the change: `pnpm typecheck`, `lint`, `test` and `build` all pass.

> Note: `pnpm typecheck` fails immediately after deleting a route until `pnpm build`
> regenerates `.next/types/validator.ts`, which still references the old paths. Build
> first, then typecheck.

## Dashboard cleanup — done

Both manual steps were completed in-session:

1. **Supabase project `dcxqaooehisluvdjniyb` ("gilbyy") deleted.** Verified: the org
   now holds only `wellness-planner`, `friendlybets` and `festival-planner-dev`.
   (Supabase exposes no project-deletion API, so this had to be done by hand.)
2. **Stale `NEXT_PUBLIC_SUPABASE_*` env vars removed** from the `gilbyy-web` Vercel
   project.

`festival-planner-dev` (`gjdtoxbwcubrqfwsrvej`) — a paused project with no repo in
`~/projects` — was noticed and **deliberately left alone**. Not part of this cleanup.

**Nothing was deleted on Vercel.** All five projects map to apps being kept.

## First pass at the driving game

With the repo emptied out, built a starter version of what gilbyy.com is actually meant
to be: a canvas driving game. `levels.ts` (data) + `physics.ts` (pure `step()` and
`levelAt()`) + `Game.tsx` (canvas, input, render loop). Drive with arrows/WASD, pull up
to a building, press Enter to go to that level. Touch controls under `sm:`.

The physics is a pure function on purpose — `requestAnimationFrame` is throttled to
nothing in a backgrounded tab, so the game cannot be verified by screenshot in a hidden
preview pane. `physics.test.ts` covers acceleration, coasting, speed clamps, no-turning-
while-parked, inverted reverse steering, world bounds, and proximity detection.

`page.tsx` still renders a real `<a>` per level below the canvas, so crawlers, screen
readers, and no-JS visitors can still reach the apps.

Scope kept deliberately small: no collisions, no sound, 2D top-down, three roads off a
hub rather than a genuinely open world.

## Next step

Phase B in `docs/roadmap.md`: buy gilbyy.com and attach the subdomains.
