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

## Then the intent got clearer: it is *only* a driving game

The first pass still treated the game as a hub — buildings you drove into to enter Bets,
Meals or Karts, plus a fallback list of links. That was wrong. gilbyy.com is a driving
game and nothing else; it does not link to the other apps and does not know they exist.
Written up as `docs/decisions/0004-gilbyy-is-just-a-driving-game.md`.

Rebuilt accordingly:

| Path | Change |
| --- | --- |
| `src/app/levels.ts` | **Deleted** — replaced by `world.ts`, which describes terrain, not destinations |
| `src/app/world.ts` | **Created** — 3200×2400 world, a six-segment road grid, and a deterministic generator for 34 houses, 3 ponds and 220 trees that rejects anything overlapping a road, a pond or another building |
| `src/app/physics.ts` | Dropped `levelAt()`; `step()` unchanged |
| `src/app/Game.tsx` | Rewritten — no level buildings, no enter prompts. Static world painted once to an offscreen canvas, then each frame is a blit plus the car. Added a minimap, a speedo, a proper car (shadow, wheels, windscreen), grass mottling, and shadows on houses and trees |
| `src/app/page.tsx` | Now just `<Game />` — the fallback link list is gone |
| `src/app/page.test.tsx` | **Deleted** — it asserted the level links existed |
| `src/app/layout.tsx` | Description no longer mentions levels |

Docs rewritten again: `vision.md` is now about a game, and `architecture.md`,
`roadmap.md`, `CLAUDE.md` and `README.md` all state the no-links rule. CLAUDE.md calls
it a hard constraint, because this is the third time the "it's a hub" reading has crept
back in.

Verified: `build`, `typecheck`, `lint`, `test` (6) all pass. Drove it in the browser —
speed climbed 10 → 44 km/h over successive frames, the car tracked along the road and
the minimap dot followed.

## Art direction pinned down

Recorded the visual target so it stops being tacit: **a lightweight version of _Over the
Hill_**, the indie driving game — its palette and calm, explicitly not its 3D terrain or
scope. Written as `docs/art-direction.md`, and pointed at from `CLAUDE.md` (in the
"what this project is" section a fresh session reads first), `vision.md` and
`roadmap.md`.

Backed it with a first palette pass, since a brief that the code ignores is worthless:

- Added `src/app/palette.ts` — every colour in one place, so nobody scatters hex
  literals through render code again.
- Moved off saturated greens and primary colours: sage/olive grass, dirt tracks instead
  of asphalt, weathered house tones, slate water, a warm-but-not-neon car.
- Softened the grass mottling to translucent, near-value patches — the first attempt at
  it read as camouflage.
- Quietened the HUD to low-contrast bone-white, and added a soft vignette for depth.

The doc is honest that this is closer, not close: lighting is still flat, there is no
haze or depth falloff, silhouettes are still geometric, and nothing moves but the car.
Those are listed as the named gaps.

## Next step

Phase B in `docs/roadmap.md`: buy gilbyy.com and attach the subdomains. Or Phase C —
collision is the biggest functional gap (you drive straight through houses and trees),
and lighting/haze is the biggest gap against the Over the Hill look.
