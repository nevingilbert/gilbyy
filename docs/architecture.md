# Architecture

This document captures the technical decisions and the constraints that drove them. When you make a non-obvious decision later, write it as a short ADR in `docs/decisions/`.

## Stack at a glance

- **Frontend & SSR:** Next.js (App Router) + TypeScript.
- **Styling:** Tailwind CSS.
- **Auth:** Supabase Auth (email magic links by default; anonymous-with-handle as a per-level override). All free.
- **Database:** Supabase Postgres with Row Level Security on every table. One project, schema-per-level (`bets.*`, `meals.*`, `karts.*`).
- **Realtime:** Supabase Realtime (WebSockets), used by Bets and possibly Karts.
- **Object storage:** Supabase Storage (e.g., Karts screenshots, optional photo evidence in Bets).
- **Hosting:** Vercel free tier (Hobby).
- **Domain:** gilbyy.com — the only paid line item.
- **CI:** GitHub Actions (free tier).

This stack is chosen specifically because every piece has a free tier that covers a hobby project, and because the pieces compose into one mental model (Postgres + Next.js + RLS) instead of three.

## Why monorepo, why one Next.js app

Multi-repo and one-deployment-per-level adds operational cost (separate CI, separate envs, cross-origin auth, separate dashboards) that a solo dev does not need. A single Next.js app with route groups is the smallest setup that keeps levels isolated:

```
apps/web/app/
  (marketing)/page.tsx     — the Overcooked map (home)
  (bets)/...
  (meals)/...
  (karts)/...
  api/.../route.ts         — server endpoints, also grouped by level
```

If a level ever needs its own runtime (e.g., a long-lived listener process), promote it to `apps/<name>` then.

## Repository layout

```
gilbyy/
├── apps/
│   └── web/                  # the Next.js app
├── packages/
│   ├── auth/                 # supabase client + RLS helpers (when shared)
│   ├── ui/                   # shared components / theme tokens
│   ├── db/                   # supabase types, generated from schema
│   └── config/               # eslint, tsconfig, tailwind preset
├── docs/                     # design docs (this folder)
├── .claude/                  # slash commands and project Claude setup
└── pnpm-workspace.yaml
```

Packages start empty. Don't create one until two places need the same thing.

## Auth

Supabase Auth, magic-link email by default. The gilbyy account is the same across levels. Per-level "membership" or "role" data lives in the level's own schema (e.g., `bets.party_members` for who's the host of a given party).

**Auth options that are free** and that levels can choose between:

- **Magic-link email** (Supabase Auth default) — most secure, requires user to have email handy.
- **Anonymous-with-handle** — Supabase supports anonymous sign-in. User picks a display name, gets a real auth row, can later upgrade to a full account. Best for low-friction party flows like Bets.
- **OAuth providers** (Google, GitHub, Discord) — free at Supabase's tier, requires per-provider OAuth app setup.
- **Self-hosted SMS gateway** (Android phone running an SMS-relay app) — works, fragile, only worth doing if a level really needs phone-number identity. Not the default.

Each level chooses its login method based on what fits the product. This decision is documented in the level's doc.

## Database design

One Supabase project. Inside it:

- `auth.*` — managed by Supabase, holds users.
- `public.*` — only for cross-level metadata (e.g., a `users_profile` table joining `auth.users` with display name, avatar). Keep tiny.
- `bets.*`, `meals.*`, `karts.*` — one schema per level, fully owned by that level.

Every table has RLS on. Default policy is "deny," then add per-table policies that allow what each level actually needs. Schema-per-level lets us reason about each level's data in isolation and makes it harder to accidentally couple them.

Migrations live next to the level: `apps/web/app/(bets)/migrations/0001_init.sql`. Run with the Supabase CLI.

## Hosting and deploys

Vercel Hobby plan: 100 GB bandwidth, 100 GB-hr serverless function execution / month. Plenty for this.

Production deploys from `main`. Preview deploys from every PR (free). Environment variables stored in Vercel project settings; nothing real in the repo.

If we outgrow Vercel free, Cloudflare Pages is the fallback (Workers free tier is 100k requests/day).

## CI

GitHub Actions. The repo is **public** — see `docs/decisions/0001-public-repo.md`. This gives unlimited Actions minutes and unlimited CodeRabbit reviews, and it doubles as a portfolio piece.

Pipeline on PR: install → typecheck → lint → unit tests → build. Add Playwright e2e once any level is past MVP.

CodeRabbit free tier handles AI PR review (their quota, not ours). Sentry free for error tracking and BetterStack free for uptime get wired up after the first deploy.

## What requires API spend (deferred)

- Anthropic API for autonomous agents (Telegram-controlled feature requests, AI generating code in CI, scheduled AI jobs). The codebase is designed so adding this later is config-only — every level exposes a clean server contract.
- OpenAI / Anthropic vision APIs for OCR. Karts may try Cloudflare Workers AI free vision instead.
- Twilio or any commercial SMS provider.

## Free-tier limits to watch

- **Supabase free:** 500 MB DB, 1 GB storage, 50k MAU. Project pauses after 1 week of inactivity (revivable in one click). Touch the project at least weekly.
- **Vercel Hobby:** 100 GB bandwidth/month, 100 GB-hr serverless. Realistic for hobby; watch images.
- **Supabase Realtime:** 200 concurrent connections, 2M messages/month. Fine for parties under 50 guests.
- **Sentry free:** 5k errors/month.
- **GitHub Actions:** 2k minutes/month on private; unlimited on public.
- **CodeRabbit:** unlimited reviews on public repos; limited on private.
- **USDA FoodData Central:** 1k requests/hour per key — never an issue at hobby scale.
- **Cloudflare Workers AI:** generous free request quota for vision models, subject to which models stay on the free plan over time.

## How to add a new level

1. Write `docs/levels/<name>.md` first. Don't skip this.
2. Create the route group: `apps/web/app/(<name>)/page.tsx` and friends.
3. Create the schema: `apps/web/app/(<name>)/migrations/0001_init.sql` with RLS policies.
4. Add a node to the map in `apps/web/app/(marketing)/page.tsx`.
5. Add `apps/web/app/(<name>)/CLAUDE.md` only if there are quirks worth pinning.
