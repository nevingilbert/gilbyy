# CLAUDE.md

This file orients Claude Code (and Cowork) when working in this repo. Read this before doing anything else in the repo.

## What this project is

Gilbyy is a single Next.js app at gilbyy.com that hosts multiple small apps as "levels," accessed from an Overcooked-inspired map landing page. Each level is independent in product and data, but shares auth, layout, and UI primitives. See `docs/vision.md` for the pitch.

## Layout

- `apps/web/` — the single Next.js app. Each level lives in its own route group: `app/(bets)`, `app/(meals)`, `app/(karts)`.
- `packages/` — shared code (auth, ui, db, config). Add a package only when something is genuinely shared by two or more apps.
- `docs/` — design docs. **Read the relevant level doc before writing code for that level.**
  - `vision.md` — the why
  - `roadmap.md` — phased plan from skeleton to live site, with a "you are here" marker
  - `architecture.md` — the how (stack, schemas, hosting, deploy, free-tier rules)
  - `levels/{bets,meals,karts}.md` — one per level: problem, data model, MVP, future ideas
  - `decisions/` — short ADRs for non-obvious choices ("why X over Y")
  - `sessions/` — checkpoint files written at the end of each session
- `.claude/commands/` — project-scoped slash commands

## Stack (planned, not yet initialized)

Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres, auth, realtime, storage). Hosted on Vercel free tier. Per-level Postgres schemas (`bets`, `meals`, `karts`) referencing a shared `auth.users`. See `docs/architecture.md`.

## Commands

These don't work until `apps/web` is initialized:

- `pnpm dev` — run the web app locally
- `pnpm build` — production build
- `pnpm lint` — eslint
- `pnpm typecheck` — tsc --noEmit
- `pnpm test` — vitest

## Conventions

- Commits: conventional commits (`feat(bets): add comments`, `fix(meals): correct USDA fallback`).
- Branch names: `feat/bets-comments`, `fix/meals-grocery`.
- One level per PR when possible. Cross-level PRs are fine for shared packages.
- Add new dependencies to the package that needs them, not to root.
- Per-level `CLAUDE.md` files inside `app/(level)/` should hold quirks specific to that level only — don't duplicate this file.

## Free-tier rule

This project has a hard "no spending money" constraint except for the gilbyy.com domain. Before introducing a service or library:

1. Check that its free tier covers our expected use.
2. If a decision is constrained by free-tier limits, note it in `docs/architecture.md` or the relevant level doc.
3. If a paid service would be a meaningful upgrade, write it as an ADR in `docs/decisions/` and ask before adopting.

## Don't

- Don't commit `.env` or any secret. Use `.env.local` (gitignored).
- Don't bypass Supabase Row Level Security. If RLS gets in the way, fix the policy, don't disable it.
- Don't add a paid service without explicit confirmation.
- Don't merge cross-level concerns into a single route or schema. Keep levels isolated.
- Don't run autonomous agents that hit the Anthropic API without confirming first — currently we're staying in interactive Claude Code sessions only.

## Sessions and the token budget

The user is on Claude Pro and is intentionally avoiding API costs. To survive token limits across days:

1. **Scope each session narrowly.** "Today we work on `levels/bets.md` and the bets schema migration" is good. "Today we work on the whole repo" is bad.
2. **Run `/checkpoint` before context gets heavy** or at the end of any working session. It writes `docs/sessions/YYYY-MM-DD-{topic}.md` capturing decisions made, files changed, open questions, and the exact next step.
3. **The first thing a new session does** is read the latest file in `docs/sessions/`.

## When to use what

- **CLAUDE.md (this file)** — project-wide orientation. Read first.
- **Per-level CLAUDE.md** (inside `app/(level)/`) — only the quirks of that level.
- **Skills** — for a workflow you've done twice and want one keystroke for. Candidates: scaffold-new-level, new-supabase-migration, checkpoint-session.
- **MCPs** — for live data access. Plan: wire up Supabase MCP, GitHub MCP, and Vercel MCP after the first level is shipped.
- **Subagents (Task tool)** — for parallel/isolated work in one session. Examples: "write tests for X while I keep iterating on Y," verify a finished change against acceptance criteria.
- **New session** — different concern, or context cluttered, or picking up the next day from a checkpoint.

## Status

We're pre-code. Repo skeleton and design docs only. Next step: initialize `apps/web` with `create-next-app`, then build the Overcooked map landing in `app/(marketing)/page.tsx`. Always check `docs/sessions/` for the most recent checkpoint before starting.
