# Architecture

This document captures the technical decisions and the constraints that drove them. When you make a non-obvious decision later, write it as a short ADR in `docs/decisions/`.

## Stack at a glance

- **Frontend & SSR:** Next.js (App Router) + TypeScript.
- **Styling:** Tailwind CSS.
- **Hosting:** Vercel free tier (Hobby), one project per app.
- **Domain:** gilbyy.com — the only paid line item. The landing page is the apex;
  each level gets a subdomain.
- **CI:** GitHub Actions (free tier).

This repo builds **gilbyy.com itself** — the landing page. It has no database of its
own and no levels in it. Each level is a separate repo with its own stack; go read that
repo's docs, not this file.

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

Levels are **not** in this repo:

| Level | Subdomain | Repo | Backend |
| --- | --- | --- | --- |
| Bets | `bets.gilbyy.com` | `nevingilbert/friendlybets` | Supabase `ickmpbuxgzxznalzjbdz` |
| Meals | `meals.gilbyy.com` | `nevingilbert/wellness-planner` | Supabase `xtlmhsapegfmafbpzdoz` |
| Karts | `karts.gilbyy.com` | `nevingilbert/beeriokart-dashboard` | plain Postgres |

## Auth

**gilbyy.com is public.** The landing page is a driving game; there is nothing behind
it to protect, because the levels live elsewhere. Anyone can load it.

Each level handles its own authentication, on its own terms, against its own backend.
They do not share a session — see the known gap in `vision.md`.

The magic-link login, the `/map` gate, the middleware and the Supabase client are all
**gone** (removed 2026-08-28). There is no `@supabase/ssr` dependency, no middleware,
and no server-rendered route — the landing page is a single static page at `/`.

Do not reintroduce auth here. If a level needs a login, it belongs in that level's repo.

## Database design

This repo has no database. Each level owns its own outright.

The original design called for one Supabase project with `bets.*`, `meals.*` and
`karts.*` schemas sharing `auth.users`. That project (`dcxqaooehisluvdjniyb`) held only
the retired Meals schema and is to be deleted from the Supabase dashboard.

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

## How to add a new level

1. Create a **new repo** for it. It is its own app, not a folder in this one.
2. Build it, with whatever stack suits it. It does not have to match this one.
3. Deploy it as its own Vercel project.
4. Add `<name>.gilbyy.com` in that project's Settings → Domains.
5. Add it as a destination in the landing page's map/game.
6. Add a row to the tables in this file and in `vision.md`.
