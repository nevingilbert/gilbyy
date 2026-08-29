# CLAUDE.md

This file orients Claude Code (and Cowork) when working in this repo. Read this before doing anything else in the repo.

## What this project is

Gilbyy is the **landing page** at gilbyy.com for a collection of small apps ("levels"). The landing page is becoming a rudimentary cartoon open-world driving game; each destination in it navigates to a level.

**The levels are not in this repo.** Each is its own repo, its own Vercel project, and its own subdomain:

| Level | Subdomain | Repo |
| --- | --- | --- |
| Bets | `bets.gilbyy.com` | `nevingilbert/friendlybets` |
| Meals | `meals.gilbyy.com` | `nevingilbert/wellness-planner` |
| Karts | `karts.gilbyy.com` | `nevingilbert/beeriokart-dashboard` |

If a request is about one of those apps, you are in the wrong repo. See `docs/vision.md` for the pitch and `docs/decisions/0003-levels-as-standalone-apps.md` for why this changed.

## Layout

- `apps/web/` — the Next.js app that is the landing page. Nothing else lives here.
- `packages/` — empty. Add a package only when two directories *in this repo* need the same thing, which is now a high bar.
- `docs/` — design docs.
  - `vision.md` — the why
  - `roadmap.md` — phased plan from skeleton to live site, with a "you are here" marker
  - `architecture.md` — the how (stack, hosting, subdomains, deploy, free-tier rules)
  - `decisions/` — short ADRs for non-obvious choices ("why X over Y")
  - `sessions/` — checkpoint files written at the end of each session
- `.claude/commands/` — project-scoped slash commands

## Stack

Next.js (App Router) + TypeScript + Tailwind, on Vercel free tier. **No database, no auth, no middleware.** The whole app is one static page at `src/app/page.tsx`. Each level owns its own backend in its own repo. See `docs/architecture.md`.

## Commands

- `pnpm dev` — run the web app locally
- `pnpm build` — production build
- `pnpm lint` — eslint
- `pnpm typecheck` — tsc --noEmit
- `pnpm test` — vitest

## Conventions

- Commits: conventional commits (`feat(map): add destination markers`, `fix(game): correct collision`).
- Branch names: `feat/game-physics`, `chore/drop-supabase`.
- Add new dependencies to the package that needs them, not to root.

## Free-tier rule

This project has a hard "no spending money" constraint except for the gilbyy.com domain. Before introducing a service or library:

1. Check that its free tier covers our expected use.
2. If a decision is constrained by free-tier limits, note it in `docs/architecture.md`.
3. If a paid service would be a meaningful upgrade, write it as an ADR in `docs/decisions/` and ask before adopting.

## Don't

- Don't commit `.env` or any secret. Use `.env.local` (gitignored).
- Don't add a paid service without explicit confirmation.
- Don't add a level to this repo. Levels are separate repos — see `docs/architecture.md`, "How to add a new level."
- Don't add auth or a database to this repo. gilbyy.com is a public front door; logins belong to the individual levels.
- Don't run autonomous agents that hit the Anthropic API without confirming first — currently we're staying in interactive Claude Code sessions only.

## Sessions and the token budget

The user is on Claude Pro and is intentionally avoiding API costs. To survive token limits across days:

1. **Scope each session narrowly.** "Today we get the car driving and colliding" is good. "Today we work on the whole repo" is bad.
2. **Run `/checkpoint` before context gets heavy** or at the end of any working session. It writes `docs/sessions/YYYY-MM-DD-{topic}.md` capturing decisions made, files changed, open questions, and the exact next step.
3. **The first thing a new session does** is read the latest file in `docs/sessions/`.

## When to use what

- **CLAUDE.md (this file)** — project-wide orientation. Read first.
- **Skills** — for a workflow you've done twice and want one keystroke for. Candidates: checkpoint-session, scaffold-a-new-level-repo.
- **MCPs** — for live data access. The Vercel and Supabase MCPs are wired up; note that Supabase is irrelevant to this repo and only reaches the *level* projects.
- **Subagents (Task tool)** — for parallel/isolated work in one session. Examples: "write tests for X while I keep iterating on Y," verify a finished change against acceptance criteria.
- **New session** — different concern, or context cluttered, or picking up the next day from a checkpoint.

## Status

The app is scaffolded and deployed; the levels have been retired from it (2026-08-28). Auth, middleware and the Supabase client are gone; the app is one static page. A first pass at the driving game is in (`src/app/Game.tsx`, physics in `src/app/physics.ts`). Next up: buy gilbyy.com and attach the subdomains. See `docs/roadmap.md`, and always check `docs/sessions/` for the most recent checkpoint before starting.
