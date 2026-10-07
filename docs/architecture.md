# Architecture

This document captures the technical decisions and the constraints that drove them. When you make a non-obvious decision later, write it as a short ADR in `docs/decisions/`.

## Stack at a glance

- **Frontend & SSR:** Next.js (App Router) + TypeScript.
- **Styling:** Tailwind CSS.
- **Hosting:** Vercel free tier (Hobby), one project per app.
- **Domain:** gilbyy.com — the only paid line item. The landing page is the apex;
  each level gets a subdomain.
- **CI:** GitHub Actions (free tier).

This repo builds **gilbyy.com**, which is a driving game and nothing else — no
database, no auth, no backend, no links to any other app. See
`decisions/0004-gilbyy-is-just-a-driving-game.md`.

This stack is chosen specifically because every piece has a free tier that covers a
hobby project.

## Why separate apps, not one app with route groups

This reverses the original decision. See `decisions/0003-levels-as-standalone-apps.md`
for the full reasoning and the costs.

Short version: all three levels were built as standalone repos with their own Vercel
projects and their own backends, while the route groups in this repo never got past
"coming soon" stubs. The docs were describing a plan that reality had already
overtaken, so the docs changed rather than the reality.

The trade we accepted: independent deploys and independent schemas, at the price of
losing a single shared login. There is no one gilbyy account.

## Repository layout

```
gilbyy/
├── apps/
│   └── web/                  # the landing page (Next.js)
├── packages/                 # shared code, still empty
├── docs/                     # design docs (this folder)
├── .claude/                  # slash commands and project Claude setup
└── pnpm-workspace.yaml
```

Packages start empty. Don't create one until two places need the same thing — and note
that with levels in their own repos, "two places" now means two directories inside
*this* repo, which is a high bar. A shared UI kit across levels would have to be a
published package, and that is not worth it at this scale.

The game lives under `apps/web/src/app/` (3D since 2026-10-06, see
`decisions/0005-go-3d-with-threejs.md` and `0006-garages-and-quiet-progression.md`).

Pure modules, no three.js, all unit-tested:

- `terrain.ts`: the valley as fields on a 400×400 grid over 4 km (heights, water surface
  height, forest, distance to the railway, rivers, roads and garage yards). It lays the
  railway loop with graded earthworks, runs two rivers downhill into the big lake, finds
  bridges and level crossings, floods the grid from the spawn at stock and snorkel
  wading depths to find the snorkel-only ground, and places six garage sites.
  `sampleGrid()` interpolates any field with the same triangulation as the mesh.
- `world.ts`: trees, rocks and bushes scattered over that, a bucketed obstacle lookup
  (each obstacle has a height, so tyres can decide what to climb), and the `Ground`
  interface the physics reads.
- `physics.ts`: `step(car, input, dt, ground, spec)`. Springs for height, pitch and roll
  chasing the four wheels; rocks under the tyres' clearance are bumps under the wheels.
  `CarSpec` (wade depth, grip, lift, clearance) comes from the fitted upgrades.
- `track.ts`: train positions and crossing state as pure functions of time.
- `daylight.ts`: hour of day from elapsed time, and the sky at each hour from keyframes
  in `palette.ts`.
- `upgrades.ts`: the parts catalogue, mileage tiers, and `localStorage` progress.

Rendering and UI:

- `scene.ts` assembles the world and runs the chase camera; `terrain-mesh.ts` (chunked
  terrain, lakes and rivers as one water mesh, grass near the car), `scenery.ts`
  (instanced trees, bushes, rocks in culling tiles), `sky.ts`, `railway.ts`,
  `car-model.ts`, `garages.ts`, `train-model.ts`, `crossing-model.ts`, `showroom.ts`.
- `map.ts`: a parchment topo map drawn once at load, under a fog layer cleared as you
  drive (in memory only, so it resets every visit).
- `Game.tsx`: a fixed 120 Hz physics loop, the modes (driving, entering, garage,
  leaving, map), the HUD. `GarageMenu.tsx`: the upgrade menu.

three.js is the only runtime dependency beyond React (MIT, ~144 KB gzipped). There are
no asset files: the whole world is generated at load (~0.5 s).

The other apps (`friendlybets`, `wellness-planner`, `beeriokart-dashboard`) share the
domain via subdomains and share nothing else. This repo does not reference them.

## Auth

There is none, and there should never be one. gilbyy.com is a public page with nothing
behind it to protect. No `@supabase/*` dependency, no middleware, no server-rendered
route — one static page at `/`.

The other apps each handle their own login in their own repo. That is their business.

## Database design

There is no database, and the game needs no server state. The old shared Supabase
project (`dcxqaooehisluvdjniyb`) has been deleted.

## Hosting and deploys

Vercel Hobby, **one project per app**:

| Vercel project | Repo | Domain |
| --- | --- | --- |
| `gilbyy-web` | `gilbyy` | `gilbyy.com`, `www.gilbyy.com` |
| `friendlybets` | `friendlybets` | `bets.gilbyy.com` |
| `wellness-planner` | `wellness-planner` | `meals.gilbyy.com` |
| `beeriokart-dashboard` | `beeriokart-dashboard` | `karts.gilbyy.com` |
| `times-tables` | `times-tables` | `times.gilbyy.com` |

Subdomains need no code changes — no `basePath`, no rewrites. Point gilbyy.com's
nameservers at Vercel (or buy the domain through Vercel), then add the hostname in each
project's Settings → Domains and the DNS is written automatically. If DNS stays
elsewhere, each subdomain is a `CNAME` to `cname.vercel-dns.com`.

Production deploys from `main`. Preview deploys from every PR (free). Environment
variables live in Vercel project settings; nothing real in the repo.

If we outgrow Vercel free, Cloudflare Pages is the fallback.

## CI

GitHub Actions. The repo is **public** — see `docs/decisions/0001-public-repo.md`. This gives unlimited Actions minutes and unlimited CodeRabbit reviews, and it doubles as a portfolio piece.

Pipeline on PR: install → typecheck → lint → unit tests → build. Add Playwright e2e once any level is past MVP.

CodeRabbit free tier handles AI PR review (their quota, not ours). Sentry free for error tracking and BetterStack free for uptime get wired up after the first deploy.

## What requires API spend (deferred)

- Anthropic API for autonomous agents (Telegram-controlled feature requests, AI
  generating code in CI, scheduled AI jobs).
- Twilio or any commercial SMS provider.

Anything level-specific (vision APIs for Karts' OCR, USDA lookups for Meals) is now
that repo's problem, not this one's.

## Free-tier limits to watch

- **Supabase free:** 500 MB DB, 1 GB storage, 50k MAU per project, and **a cap on how
  many free projects one org may have** — a reason not to spin up a Supabase project
  per level without thinking. Projects pause after 1 week of inactivity (revivable in
  one click). This repo has no Supabase project; the limits apply per level repo.
- **Vercel Hobby:** 100 GB bandwidth/month, 100 GB-hr serverless. Realistic for hobby; watch images.
- **Sentry free:** 5k errors/month.
- **GitHub Actions:** 2k minutes/month on private; unlimited on public.
- **CodeRabbit:** unlimited reviews on public repos; limited on private.

## How to add a new app under gilbyy.com

1. Create a **new repo** for it. It is its own app, not a folder in this one.
2. Build it, with whatever stack suits it. It does not have to match this one.
3. Deploy it as its own Vercel project.
4. Add `<name>.gilbyy.com` in that project's Settings → Domains.
5. Add a row to the hosting table above.

Do **not** add it to the game. gilbyy.com is not a menu — see
`decisions/0004-gilbyy-is-just-a-driving-game.md`.
