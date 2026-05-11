# Roadmap

End-to-end path from "empty repo with design docs" to "gilbyy.com live with multiple levels." Update the **You are here** marker as you progress.

> **You are here:** Phase 2 complete (2026-04-30, smoke test passed end-to-end). Supabase Auth wired with magic-link only; site is gated via `src/proxy.ts`. Login at `/`, interactive map at `/map`, hub-click logout all verified working. Latest checkpoint: `docs/sessions/2026-04-30-supabase-auth-gate.md`. Next: **Phase 3 — first public deploy on Vercel**. Still outstanding: Google OAuth (deferred from Phase 2), CI workflow at `.github/workflows/ci.yml`, Vitest setup in `apps/web` — none of these block Phase 3.

> **First-level priority:** Meals (changed from Bets, 2026-04-30).

## Phase 0 — Push the skeleton to GitHub

Run `git init`, make the first commit, create a public repo at [github.com/new](https://github.com/new) (or via `gh repo create gilbyy --public --source=. --remote=origin --push`). No external services yet.

## Phase 1 — Local Next.js scaffold

Open Claude Code (`claude` in the `gilbyy` folder). First thing it should do is read the latest file in `docs/sessions/`. Then have Claude run `pnpm dlx create-next-app` against `apps/web`, scaffold the route groups (`(marketing)`, `(bets)`, `(meals)`, `(karts)`), and stub a placeholder Overcooked map landing in `(marketing)/page.tsx`. Smoke-test with `pnpm dev`. End each session with `/checkpoint`.

No external accounts yet. Pure local dev. Roughly one week of casual sessions.

## Phase 2 — Supabase + the auth gate

Because the map itself is gated, we set up Supabase Auth before the map is "real."

Create a Supabase account (free, sign in with GitHub). Create one project named `gilbyy`. You'll get three credentials:

- Project URL — public, goes in env.
- `anon` key — public, safe in the browser, RLS enforces access.
- `service_role` key — server-only, never in the repo, only in Vercel env vars.

Put all three in a local `.env.local` (gitignored). Wire up Supabase Auth with magic-link email. Add a Next.js middleware that requires a session on every route except the public landing, and redirects to `/` when missing. Build the login screen at `/`. Behind the gate, build the actual interactive map (home spot in the middle, three roads, three placeholder level entry points). Returning to the home spot prompts a logout confirmation.

By the end of Phase 2, an authenticated user lands on a login screen, signs in, sees the map, can drive between empty levels, and can log out by re-entering the home spot.

## Phase 3 — First public deploy

Create a Vercel account (free, sign in with GitHub, no credit card). Import the `gilbyy` repo. Add the Supabase env vars to the Vercel project. Vercel auto-detects Next.js; in ~90 seconds you have a live URL like `gilbyy-abc123.vercel.app` with the gated map working in production. Every PR from this point on gets its own preview URL automatically.

## Phase 4 — Wire up gilbyy.com

Buy the domain. **Cloudflare Registrar** is the cheapest place — at-cost pricing, ~$10/year for `.com` with no markup. In Vercel: Settings → Domains → Add `gilbyy.com`. Vercel shows you DNS records to set at your registrar (an A record and a CNAME for `www`). Propagation takes well under an hour. `https://gilbyy.com` now points at your gated map.

Don't forget to add `https://gilbyy.com` to the Supabase Auth "Site URL" and redirect-allowlist so magic-link callbacks work.

## Phase 5 — Meals MVP

Meals is the first level (priority confirmed 2026-04-30 — short-term real-life need).

Update `docs/levels/meals.md` with anything that's evolved since the design phase. Open a **fresh** Claude Code session scoped only to Meals. Run the level's first migration in `apps/web/app/(meals)/migrations/0001_init.sql`. Generate TS types. Build through the MVP cut: JSON upload, USDA macro lookup with `user_foods` fallback, per-meal/per-day macro report, interactive grocery list. Multiple sessions, each ending with `/checkpoint`.

## Phase 6 — Free monitoring and AI review

After the first level ships:

- Install the **CodeRabbit** GitHub app on the repo — every PR gets free AI review.
- Create a **Sentry** account, add the Next.js SDK, paste DSN into Vercel env. 5k errors/month free.
- Sign up for **BetterStack**, add gilbyy.com as an uptime monitor.
- Add `.github/workflows/ci.yml` running typecheck + lint + tests on every PR.

## Phase 7 — Add the next level

Same loop, faster the second time around: update the level doc → scaffold the route group → write the migration → build → ship → add a node to the map. Repeat for level three. The map becomes more populated each time.

## Cross-cutting habits

- Read the latest file in `docs/sessions/` at the start of every session.
- Run `/checkpoint` at the end of every session.
- When mid-session context feels heavy, run `/compact` before continuing.
- Use **subagents** (Claude Code's Task tool) for parallel work in one session — e.g., "write tests for X while I iterate on Y."
- Spin up a **new session** when context is cluttered or you're picking up the next day.
- Wire up MCPs (Supabase, GitHub, Vercel) at the start of Phase 5 — they make Claude Code dramatically more useful once there's real data and infrastructure to query.

## Rough timeline

Casual pace, a few sessions per week:

- Phase 1: ~1 week
- Phase 2 (Supabase + auth gate + interactive map): ~1 week
- Phases 3 + 4 combined (deploy + domain): ~1 evening
- Phase 5 (Meals MVP shipped end-to-end): ~2–4 weeks
- Phase 6: ~1 evening
- Each additional level: ~1–2 weeks (faster because the stack is proven)
