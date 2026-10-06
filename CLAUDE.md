# CLAUDE.md

This file orients Claude Code (and Cowork) when working in this repo. Read this before doing anything else in the repo.

## What this project is

Gilbyy is a **driving game** at gilbyy.com. You load the site and drive a 4x4 around a
low-poly 3D valley: rivers, a railway, day and night, garages where miles driven unlock
upgrades, and a map you uncover as you go. That is the entire product.

It is not a hub, a menu, or a launcher, and it **must not link to any other app**. See
`docs/vision.md` and `docs/decisions/0004-gilbyy-is-just-a-driving-game.md` — this has
been misunderstood repeatedly, so treat it as a hard constraint rather than a
preference.

**The look and feel to aim for is a lightweight version of _Over the Hill_**, the indie
driving game: a few saturated colours held together by warm haze, a low sun, calm and
unhurried, a nearly absent HUD. Read `docs/art-direction.md` before changing anything
visual. It was written from the actual footage and covers what we borrow and what we
deliberately don't. The game went 3D on 2026-10-06; see
`docs/decisions/0005-go-3d-with-threejs.md`.

`friendlybets`, `wellness-planner` and `beeriokart-dashboard` are separate repos that
happen to share the gilbyy.com domain via subdomains. If a request is about one of those
apps, you are in the wrong repo.

## Layout

- `apps/web/` — the Next.js app. The game lives in `src/app/`:
  - Pure, no three.js, unit-tested:
    - `terrain.ts`: the valley as grid fields (heights, water, distances), the railway's
      earthworks, the rivers, garage sites, and which ground needs the snorkel.
    - `world.ts`: scatter (trees, rocks, bushes), obstacles, and the `Ground` the physics reads.
    - `physics.ts`: a pure `step(car, input, dt, ground, spec)`.
    - `track.ts` (train and crossings), `daylight.ts` (time of day), `upgrades.ts`
      (catalogue, tiers, `localStorage` progress), `noise.ts`.
  - `palette.ts`: every colour, in one place, including the sky keyframes.
  - three.js: `scene.ts` (assembles everything), `terrain-mesh.ts`, `scenery.ts`,
    `sky.ts`, `railway.ts`, `car-model.ts`, `garages.ts`, `train-model.ts`,
    `crossing-model.ts`, `showroom.ts` (garage interior).
  - `map.ts`: the 2D map and its fog of war.
  - React: `Game.tsx` (loop, modes, HUD), `GarageMenu.tsx`.
- `packages/` — empty. Add a package only when two directories *in this repo* need the same thing, which is now a high bar.
- `docs/` — design docs.
  - `vision.md` — the why
  - `art-direction.md` — **the visual brief: a lightweight Over the Hill. Read before any visual change.**
  - `roadmap.md` — phased plan from skeleton to live site, with a "you are here" marker
  - `architecture.md` — the how (stack, hosting, subdomains, deploy, free-tier rules)
  - `decisions/` — short ADRs for non-obvious choices ("why X over Y")
  - `sessions/` — checkpoint files written at the end of each session
- `.claude/commands/` — project-scoped slash commands

## Stack

Next.js (App Router) + TypeScript + Tailwind, on Vercel free tier. **No database, no auth, no middleware, no runtime dependencies beyond React and three.js.** The whole app is one static page rendering a WebGL canvas. See `docs/architecture.md`.

## Commands

- `pnpm dev` — run the web app locally
- `pnpm build` — production build
- `pnpm lint` — eslint
- `pnpm typecheck` — tsc --noEmit
- `pnpm test` — vitest

## Conventions

- Commits: conventional commits (`feat(game): add building collision`, `fix(world): stop trees spawning on roads`).
- Branch names: `feat/game-collision`, `fix/world-gen`.
- Add new dependencies to the package that needs them, not to root.

## Free-tier rule

This project has a hard "no spending money" constraint except for the gilbyy.com domain. Before introducing a service or library:

1. Check that its free tier covers our expected use.
2. If a decision is constrained by free-tier limits, note it in `docs/architecture.md`.
3. If a paid service would be a meaningful upgrade, write it as an ADR in `docs/decisions/` and ask before adopting.

## Don't

- Don't commit `.env` or any secret. Use `.env.local` (gitignored).
- Don't add a paid service without explicit confirmation.
- Don't add links, menus, or navigation to the other apps. gilbyy.com is a game, not a launcher.
- Don't add auth or a database. There is nothing here to protect. The only thing persisted is miles and the truck's loadout, in `localStorage` (ADR 0006).
- Don't reach for a game engine, a physics engine, react-three-fiber or a post-processing stack. three.js is the one rendering dependency (ADR 0005); the physics is ours and stays a pure, tested function. Anything more needs its own ADR.
- Don't put hex literals in render code. Colours go in `src/app/palette.ts`.
- Don't add timers, scores, objectives or currencies. The game is meant to be calm; see `docs/art-direction.md`. The one sanctioned progression is miles unlocking garage parts (ADR 0006); keep it that quiet.
- Don't add buildings that link to the other gilbyy.com apps without a new ADR superseding 0004. The owner has floated it for later; it is not built.
- Don't judge frame rate from headless screenshots. Headless Chromium renders WebGL in software at ~3 fps; screenshots are fine for looks, nothing else.
- Don't run autonomous agents that hit the Anthropic API without confirming first — currently we're staying in interactive Claude Code sessions only.

## Sessions and the token budget

The user is on Claude Pro and is intentionally avoiding API costs. To survive token limits across days:

1. **Scope each session narrowly.** "Today we add collision with buildings" is good. "Today we work on the whole repo" is bad.
2. **Run `/checkpoint` before context gets heavy** or at the end of any working session. It writes `docs/sessions/YYYY-MM-DD-{topic}.md` capturing decisions made, files changed, open questions, and the exact next step.
3. **The first thing a new session does** is read the latest file in `docs/sessions/`.

## When to use what

- **CLAUDE.md (this file)** — project-wide orientation. Read first.
- **Skills** — for a workflow you've done twice and want one keystroke for. Candidates: checkpoint-session, scaffold-a-new-level-repo.
- **MCPs** — for live data access. The Vercel and Supabase MCPs are wired up; note that Supabase is irrelevant to this repo and only reaches the *level* projects.
- **Subagents (Task tool)** — for parallel/isolated work in one session. Examples: "write tests for X while I keep iterating on Y," verify a finished change against acceptance criteria.
- **New session** — different concern, or context cluttered, or picking up the next day from a checkpoint.

## Status

The app is one static page with no auth or database. The game is 3D on three.js (since 2026-10-06): a 4 km valley with lakes, two rivers that need the snorkel, a railway loop with a train and level crossings, day and night, six garages with tiered upgrades unlocked by miles driven, and a map with fog of war. Real-device frame rate is still unmeasured, and the scene got heavier. See `docs/roadmap.md`, and always check `docs/sessions/` for the most recent checkpoint before starting.
