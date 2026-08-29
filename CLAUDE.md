# CLAUDE.md

This file orients Claude Code (and Cowork) when working in this repo. Read this before doing anything else in the repo.

## What this project is

Gilbyy is a **driving game** at gilbyy.com. You load the site and drive a car around a
small cartoon world. That is the entire product.

It is not a hub, a menu, or a launcher, and it **must not link to any other app**. See
`docs/vision.md` and `docs/decisions/0004-gilbyy-is-just-a-driving-game.md` — this has
been misunderstood repeatedly, so treat it as a hard constraint rather than a
preference.

**The look and feel to aim for is a lightweight version of _Over the Hill_**, the indie
driving game: muted naturalistic palette, calm and unhurried, a very quiet HUD,
atmosphere over detail. Read `docs/art-direction.md` before changing anything visual —
it covers what we borrow from it and what we deliberately don't (we are 2D, and staying
2D).

`friendlybets`, `wellness-planner` and `beeriokart-dashboard` are separate repos that
happen to share the gilbyy.com domain via subdomains. If a request is about one of those
apps, you are in the wrong repo.

## Layout

- `apps/web/` — the Next.js app. The game is `src/app/world.ts` (data),
  `src/app/physics.ts` (pure `step()`, unit-tested), `src/app/palette.ts` (every colour,
  in one place) and `src/app/Game.tsx` (canvas, input, render loop).
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

Next.js (App Router) + TypeScript + Tailwind, on Vercel free tier. **No database, no auth, no middleware, no runtime dependencies beyond React.** The whole app is one static page rendering a 2D canvas. See `docs/architecture.md`.

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
- Don't add auth or a database. There is nothing here to protect and nothing to persist.
- Don't reach for a game engine or a 3D library. It is plain 2D canvas, and staying dependency-free is part of the point — "like Over the Hill" means its palette and mood, not its geometry.
- Don't put hex literals in render code. Colours go in `src/app/palette.ts`.
- Don't add timers, scores or achievements. The game is meant to be calm; see `docs/art-direction.md`.
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

The app is scaffolded and deployed; the levels have been retired from it (2026-08-28). Auth, middleware and the Supabase client are gone; the app is one static page. The game is in and drivable. Biggest gap: nothing collides, so you drive through houses and trees. Next up: buy gilbyy.com and attach the subdomains, and keep improving the game. See `docs/roadmap.md`. See `docs/roadmap.md`, and always check `docs/sessions/` for the most recent checkpoint before starting.
