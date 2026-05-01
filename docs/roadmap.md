# Roadmap

End-to-end path from "empty repo with design docs" to "gilbyy.com live with multiple levels." Update the **You are here** marker as you progress.

> **You are here:** between Phase 0 and Phase 1.

## Phase 0 — Push the skeleton to GitHub

Run `git init`, make the first commit, create a public repo at [github.com/new](https://github.com/new) (or via `gh repo create gilbyy --public --source=. --remote=origin --push`). No external services yet.

## Phase 1 — Get the Next.js app running locally

Open Claude Code (`claude` in the `gilbyy` folder). First thing it should do is read the latest file in `docs/sessions/`. Then have Claude run `pnpm dlx create-next-app` against `apps/web`, scaffold the route groups (`(marketing)`, `(bets)`, `(meals)`, `(karts)`), and build the Overcooked map landing in `(marketing)/page.tsx`. Smoke-test with `pnpm dev`. End each session with `/checkpoint`.

No accounts in this phase. Pure local dev. Roughly one week of casual sessions.

## Phase 2 — First public deploy

Create a Vercel account (free, sign in with GitHub, no credit card). Import the `gilbyy` repo. Vercel auto-detects Next.js; in ~90 seconds you have a live URL like `gilbyy-abc123.vercel.app`. Every PR from this point on gets its own preview URL automatically.

Still no database, still no auth. The map landing is publicly browsable.

## Phase 3 — Wire up gilbyy.com

Buy the domain. **Cloudflare Registrar** is the cheapest place — at-cost pricing, ~$10/year for `.com` with no markup. In Vercel: Settings → Domains → Add `gilbyy.com`. Vercel shows you DNS records to set at your registrar (an A record and a CNAME for `www`). Propagation takes well under an hour. `https://gilbyy.com` now points at your map.

## Phase 4 — First level MVP

Pick one level. Bets is the most fleshed-out and the most fun demo; Meals is the simplest "prove the stack" candidate. Update the level doc with anything that's evolved since the design phase. Open a **fresh** Claude Code session scoped only to that level — narrow scope is what survives Pro token limits. Work through the MVP cut listed in the level's doc. Multiple sessions, each ending with `/checkpoint`.

## Phase 5 — Database + auth

Trigger: the first time Phase 4 needs to persist anything. Create a Supabase account (free, sign in with GitHub). Create one project named `gilbyy`. You'll get three credentials:

- Project URL — public, goes in env.
- `anon` key — public, safe in the browser, RLS enforces access.
- `service_role` key — server-only, never in the repo, only in Vercel env vars.

Put all three in Vercel env vars and in a local `.env.local` (gitignored). Run the level's first migration via the Supabase CLI. Wire up auth (anonymous-with-handle for Bets, magic-link for Meals/Karts). Generate TypeScript types from the schema. From here, each new level adds one schema and a migration.

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
- Phases 2 + 3 combined: ~1 evening
- Phases 4 + 5 (one full level shipped end-to-end): ~2–4 weeks
- Phase 6: ~1 evening
- Each additional level: ~1–2 weeks (faster because the stack is proven)
